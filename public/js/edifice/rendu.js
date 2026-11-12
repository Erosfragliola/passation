// Moteur de rendu de la maquette : WebGL à fond transparent (la maquette est posée sur la page), studio photo pour
// les reflets, post-traitement sobre (occlusion ambiante N8AO, léger bloom HDR, AgX, SMAA), qualité adaptative,
// compteur ?debug. Pas de vignettage, de grain ni de flou : rien qui fasse « effet ».
import * as THREE from "/vendor/three.module.min.js";
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
  HueSaturationEffect, BrightnessContrastEffect, N8AOPostPass,
} from "/vendor/rendu3d.js";
import { creerCadence } from "/js/edifice/cadence.js";

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

export function creerRendu(scene, camera, { mobile = false, debug = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0); // fond transparent : l'objet est « détouré » sur la section
  // Lecture des journaux de compilation : bloquante, réservée au mode ?debug
  renderer.debug.checkShaderErrors = debug;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2)); // résolution plafonnée sur mobile
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // ombres douces : rayon réglé sur chaque lumière (disque de Vogel)
  renderer.toneMapping = THREE.NoToneMapping;   // AgX appliqué dans la chaîne de post-traitement (après le bloom HDR)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "edifice-toile";

  const pmrem = new THREE.PMREMGenerator(renderer);
  let cibleReflets = null;
  /** Reflets du studio, calculés sur le GPU : à refaire si le contexte WebGL a été perdu puis rendu. */
  function eclairer() {
    cibleReflets?.dispose();
    const decor = studio();
    cibleReflets = pmrem.fromScene(decor, 0.05);
    scene.environment = cibleReflets.texture;
    decor.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
  eclairer();
  scene.environmentIntensity = 0.6;
  renderer.domElement.addEventListener("webglcontextrestored", eclairer);

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (!mobile) {
    ao = new N8AOPostPass(scene, camera, 1, 1);
    Object.assign(ao.configuration, { aoRadius: 0.6, distanceFalloff: 0.9, intensity: 3.2, gammaCorrection: false, halfRes: true, depthAwareUpsampling: true });
    ao.setQualityMode("Medium");
    composer.addPass(ao);
  }

  const bloom = new BloomEffect({ luminanceThreshold: 0.95, luminanceSmoothing: 0.15, intensity: mobile ? 0.3 : 0.4, mipmapBlur: true, radius: 0.5 });
  composer.addPass(new EffectPass(camera, bloom));

  const ton = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const contraste = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 });
  const teinte = new HueSaturationEffect({ hue: 0, saturation: 0.04 });
  composer.addPass(new EffectPass(camera, ton, contraste, teinte));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH })));

  // ---------------------------------------------------------------- Taille
  let tailleW = 0, tailleH = 0;
  function dimensionner(force = false) {
    // Taille réelle du canevas, qui change quand il passe d'une fenêtre de la page à l'autre
    const { clientWidth: w, clientHeight: h } = renderer.domElement;
    if (!w || !h) return false;
    if (!force && w === tailleW && h === tailleH) return true;
    tailleW = w; tailleH = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }

  // ---------------------------------------------------------------- Qualité adaptative
  // Sous 45 i/s pendant 2 s d'activité : on réduit la résolution, puis on coupe l'AO, puis les ombres douces.
  // Cadence mesurée sur les seules images enchaînées (voir cadence.js).
  let palier = 0;
  const cadence = creerCadence({ depart: performance.now() });
  const lumieresOmbres = [];
  const PALIERS = ["complète", "résolution réduite", "sans AO", "ombres simples"];
  function degrader() {
    palier++;
    if (palier === 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.75)); dimensionner(true); }
    if (palier === 2 && ao) ao.enabled = false;
    if (palier === 3) lumieresOmbres.forEach((l) => { l.shadow.radius = 1; l.shadow.mapSize.set(1024, 1024); l.shadow.map?.dispose(); l.shadow.map = null; });
  }
  let compteur = null;
  if (debug) {
    compteur = document.createElement("div");
    compteur.className = "compteur-ips";
    compteur.setAttribute("aria-hidden", "true");
    document.body.append(compteur);
  }
  function tic(maintenant, enchaine) {
    if (cadence.tic(maintenant, enchaine, document.hidden) && palier < 3) degrader();
    if (compteur) compteur.textContent = `${Math.round(cadence.ips)} i/s · qualité ${PALIERS[palier]}`;
  }

  return {
    renderer, composer, ao, bloom,
    dimensionner,
    rendre() { composer.render(); },
    /** À chaque requestAnimationFrame tant que la scène est active (voir la qualité adaptative). */
    tic,
    ombres(lumiere) { lumieresOmbres.push(lumiere); },
    get ips() { return cadence.ips; },
    get palier() { return palier; },
    dispose() { composer.dispose(); cibleReflets?.dispose(); renderer.dispose(); pmrem.dispose(); compteur?.remove(); },
  };
}
