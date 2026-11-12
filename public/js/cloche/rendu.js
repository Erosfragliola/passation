// Moteur de rendu de la cloche : WebGL, environnement de studio (RoomEnvironment), chaîne de post-traitement
// (occlusion ambiante N8AO, bloom HDR, tilt-shift, AgX, vignettage, grain, SMAA), qualité adaptative, compteur ?debug.
import * as THREE from "/vendor/three.module.min.js";
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, VignetteEffect, NoiseEffect,
  TiltShiftEffect, ToneMappingEffect, ToneMappingMode, BlendFunction, KernelSize, HueSaturationEffect,
  BrightnessContrastEffect, N8AOPostPass,
} from "/vendor/rendu3d.js";

/**
 * Studio photo pour les reflets (verre, cuivre, vernis) : pièce sombre, grande boîte à lumière chaude en haut à
 * gauche (comme le spot), bande verticale fine à droite, petit réflecteur derrière. Donne les longs reflets nets
 * d'une photographie de produit, sans les taches d'un environnement générique.
 */
function studio() {
  const s = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const salle = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.BackSide }));
  salle.scale.set(40, 24, 40);
  salle.position.y = 8;
  s.add(salle);
  const panneau = (couleur, intensite, l, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(intensite), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 2, 0);
    s.add(m);
  };
  panneau(0xffc48a, 6, 16, 10, -11, 13, 9);    // grande boîte à lumière principale (haut gauche)
  panneau(0xfff1e2, 8, 1.6, 16, 15, 7, 3);     // bande verticale (liseré net sur le verre)
  panneau(0xd8e2ff, 2, 12, 6, 5, 7, -16);      // contre-jour
  panneau(0xffd2a8, 1.4, 22, 7, 0, 3, 18);     // réflecteur de face, doux (vernis du socle)
  panneau(0xffe0bd, 2.2, 26, 9, 0, -4, 15);    // carton réflecteur bas, sous l'objectif (plaque de cuivre)
  return s;
}

export function creerRendu(conteneur, scene, camera, { mobile = false, debug = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0); // fond transparent : l'objet est « détouré » sur la section
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // ombres douces : rayon réglé sur chaque lumière (disque de Vogel)
  renderer.toneMapping = THREE.NoToneMapping;   // AgX appliqué dans la chaîne de post-traitement (après le bloom HDR)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  conteneur.prepend(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const decor = studio();
  scene.environment = pmrem.fromScene(decor, 0.05).texture;
  scene.environmentIntensity = 0.6;
  decor.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (!mobile) {
    ao = new N8AOPostPass(scene, camera, 1, 1);
    Object.assign(ao.configuration, { aoRadius: 0.6, distanceFalloff: 0.9, intensity: 4.2, gammaCorrection: false, halfRes: true, depthAwareUpsampling: true });
    ao.setQualityMode("Medium");
    composer.addPass(ao);
  }

  const bloom = new BloomEffect({ luminanceThreshold: 0.95, luminanceSmoothing: 0.15, intensity: mobile ? 0.35 : 0.45, mipmapBlur: true, radius: 0.55 });
  const tilt = new TiltShiftEffect({ offset: 0, rotation: 0, focusArea: 1.0, feather: 0.55, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
  const passeHdr = new EffectPass(camera, bloom, tilt);
  composer.addPass(passeHdr);

  const ton = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const contraste = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 });
  const teinte = new HueSaturationEffect({ hue: 0, saturation: 0.04 });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.58 });
  const grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
  grain.blendMode.opacity.value = 0.045;
  composer.addPass(new EffectPass(camera, ton, contraste, teinte)); // pas de vignettage ni de grain : pas de « cadre »
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH })));

  // ---------------------------------------------------------------- Taille
  function dimensionner() {
    // Taille réelle du canevas (il déborde de sa colonne pour que la cloche puisse bouger dans la section)
    const { clientWidth: w, clientHeight: h } = renderer.domElement;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }

  // ---------------------------------------------------------------- Qualité adaptative
  // Sous 45 i/s pendant 2 s : on coupe le tilt-shift, puis l'AO, puis les ombres douces (dans cet ordre).
  let palier = 0, images = 0, debutFenetre = performance.now(), sousSeuil = 0, ips = 60;
  const lumieresOmbres = [];
  const PALIERS = ["complète", "sans tilt-shift", "sans AO", "ombres simples"];
  function degrader() {
    palier++;
    if (palier === 1) tilt.blendMode.opacity.value = 0;
    if (palier === 2 && ao) ao.enabled = false;
    if (palier === 3) lumieresOmbres.forEach((l) => { l.shadow.radius = 1; l.shadow.mapSize.set(1024, 1024); l.shadow.map?.dispose(); l.shadow.map = null; });
  }
  let compteur = null;
  if (debug) {
    compteur = document.createElement("div");
    compteur.className = "compteur-ips";
    compteur.setAttribute("aria-hidden", "true");
    conteneur.append(compteur);
  }
  const depart = performance.now();
  function mesurer(maintenant) {
    if (maintenant - depart < 3500 || document.hidden) { debutFenetre = maintenant; images = 0; return; } // échauffement
    images++;
    const ecoule = maintenant - debutFenetre;
    if (ecoule < 500) return;
    ips = (images * 1000) / ecoule;
    images = 0; debutFenetre = maintenant;
    if (ips < 45 && palier < 3) { sousSeuil += ecoule; if (sousSeuil >= 2000) { degrader(); sousSeuil = 0; } } else sousSeuil = 0;
    if (compteur) compteur.textContent = `${Math.round(ips)} i/s · qualité ${PALIERS[palier]}`;
  }

  return {
    renderer, composer, ao, bloom, tilt,
    dimensionner,
    /** mesure : false pendant la chorégraphie (on ne juge la fluidité qu'au repos). */
    rendre(maintenant, mesure = true) { composer.render(); if (maintenant != null && mesure) mesurer(maintenant); else debutFenetre = performance.now(), images = 0; },
    ombres(lumiere) { lumieresOmbres.push(lumiere); },
    get ips() { return ips; },
    get palier() { return palier; },
    dispose() { composer.dispose(); renderer.dispose(); pmrem.dispose(); },
  };
}
