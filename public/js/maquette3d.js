// Maquette d'architecte en 3D (originale, construite en code) pour le hero de Passation.
// Une PME : maison de maître + atelier à sheds, sur un socle en noyer, lumière chaude du soir.
// Le « témoin » (sphère cuivre) passe le seuil de la porte : c'est l'idée de transmission.
// Chargée à la demande par site.js quand la section approche (performance).

import * as THREE from "/vendor/three.module.min.js";

const COULEURS = {
  platre: 0xf3eadb,   // bâtiment crème
  noyer: 0x5a3e2b,    // socle en bois de noyer
  trait: 0x8a7f70,    // arêtes pierre
  vitrage: 0xf0d6a8,  // fenêtres éclairées, lumière chaude
  vert: 0x1e3a2e,     // porte
  cuivre: 0xa8653a,   // le témoin
};

export function monterMaquette(conteneur) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return null;

  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "maquette-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // Lumières douces, ombre portée légère
  scene.add(new THREE.HemisphereLight(0xffe9cc, 0x3a2a1c, 1.25));
  const soleil = new THREE.DirectionalLight(0xffd7a8, 2.6);
  soleil.position.set(-6, 11, 7);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(1024, 1024);
  soleil.shadow.radius = 6;
  soleil.shadow.camera.left = -9; soleil.shadow.camera.right = 9;
  soleil.shadow.camera.top = 9; soleil.shadow.camera.bottom = -9;
  scene.add(soleil);

  const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.45 }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = -0.001;
  sol.receiveShadow = true;
  scene.add(sol);

  const maquette = new THREE.Group();
  scene.add(maquette);

  const platre = new THREE.MeshStandardMaterial({ color: COULEURS.platre, roughness: 0.92 });
  const vitrage = new THREE.MeshStandardMaterial({ color: COULEURS.vitrage, roughness: 0.5, emissive: 0xe8b46a, emissiveIntensity: 0.55 });
  const sapin = new THREE.MeshStandardMaterial({ color: COULEURS.vert, roughness: 0.6 });
  const noyer = new THREE.MeshStandardMaterial({ color: COULEURS.noyer, roughness: 0.7 });
  const trait = new THREE.LineBasicMaterial({ color: COULEURS.trait, transparent: true, opacity: 0.55 });

  /** Ajoute un volume avec ses arêtes dessinées. */
  function volume(geo, mat, x, y, z, parent = maquette) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), trait));
    parent.add(m);
    return m;
  }

  /** Prisme triangulaire (toit) extrudé sur la profondeur. */
  function prisme(points, profondeur) {
    const forme = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
    const geo = new THREE.ExtrudeGeometry(forme, { depth: profondeur, bevelEnabled: false });
    geo.translate(0, 0, -profondeur / 2);
    return geo;
  }

  // Socle
  volume(new THREE.BoxGeometry(12, 0.35, 7.5), noyer, 0, 0.175, 0);
  const base = 0.35;

  // Maison principale
  const mx = -2.6, mw = 4.4, mh = 3.1, md = 3;
  volume(new THREE.BoxGeometry(mw, mh, md), platre, mx, base + mh / 2, 0);
  volume(prisme([[-mw / 2 - 0.15, 0], [mw / 2 + 0.15, 0], [0, 1.5]], md + 0.2), platre, mx, base + mh, 0);
  volume(new THREE.BoxGeometry(0.35, 0.9, 0.35), platre, mx + 1.1, base + mh + 0.95, -0.4);
  // Fenêtres (façade avant)
  const f = new THREE.BoxGeometry(0.55, 0.75, 0.06);
  for (const fx of [-1.4, 0, 1.4]) volume(f, vitrage, mx + fx, base + 2.3, md / 2 + 0.01);
  for (const fx of [-1.4, 1.4]) volume(f, vitrage, mx + fx, base + 0.95, md / 2 + 0.01);
  // Porte en vert sapin
  volume(new THREE.BoxGeometry(0.7, 1.25, 0.06), sapin, mx, base + 0.625, md / 2 + 0.01);
  // Le témoin : sphère laiton devant la porte
  const temoin = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 32, 16),
    new THREE.MeshStandardMaterial({ color: COULEURS.cuivre, roughness: 0.28, metalness: 0.75, emissive: 0x3a1a08 }),
  );
  temoin.castShadow = true;
  temoin.position.set(mx, base + 0.16, md / 2 + 0.7);
  maquette.add(temoin);

  // Atelier à sheds
  const ax = 2.35, aw = 4.6, ah = 2, ad = 3.6;
  volume(new THREE.BoxGeometry(aw, ah, ad), platre, ax, base + ah / 2, -0.3);
  const n = 4, pas = aw / n;
  for (let i = 0; i < n; i++) {
    volume(prisme([[0, 0], [pas, 0], [0, 0.75]], ad), platre, ax - aw / 2 + i * pas, base + ah, -0.3);
  }
  volume(new THREE.BoxGeometry(1.3, 1.5, 0.06), vitrage, ax + 1.2, base + 0.75, -0.3 + ad / 2 + 0.01);
  volume(new THREE.BoxGeometry(1.6, 0.5, 0.06), vitrage, ax - 0.8, base + 1.2, -0.3 + ad / 2 + 0.01);

  // Arbres de maquette
  const tronc = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8);
  const houppier = new THREE.IcosahedronGeometry(0.55, 1);
  for (const [x, z, s] of [[-5.3, 2.3, 1], [-5.5, -2.4, 0.8], [5.3, 2.6, 0.75]]) {
    const arbre = new THREE.Group();
    volume(tronc, platre, 0, 0.35, 0, arbre);
    volume(houppier, platre, 0, 0.95, 0, arbre);
    arbre.scale.setScalar(s);
    arbre.position.set(x, base, z);
    maquette.add(arbre);
  }

  // Chemin du seuil jusqu'au bord du socle
  const chemin = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0xe6d9c3, roughness: 1 }));
  chemin.rotation.x = -Math.PI / 2;
  chemin.position.set(mx, base + 0.002, md / 2 + 1.15);
  chemin.receiveShadow = true;
  maquette.add(chemin);

  maquette.rotation.y = 0.15;

  conteneur.prepend(renderer.domElement);

  // Dimensionnement
  function redimensionner() {
    const { clientWidth: w, clientHeight: h } = conteneur;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Plus de recul quand le cadre est étroit (mobile)
    const etroit = camera.aspect < 0.95;
    const recul = etroit ? 1.9 : 1.32;
    camera.position.set(9 * recul, 8 * recul, 16 * recul);
    camera.lookAt(0, 0.6, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionner).observe(conteneur);
  redimensionner();

  // Interaction : légère parallaxe à la souris et rotation liée au défilement
  let cibleX = 0, cibleY = 0, actuelX = 0, actuelY = 0;
  conteneur.addEventListener("pointermove", (e) => {
    const r = conteneur.getBoundingClientRect();
    cibleX = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
    cibleY = ((e.clientY - r.top) / r.height - 0.5) * 0.12;
  });
  conteneur.addEventListener("pointerleave", () => { cibleX = 0; cibleY = 0; });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) boucle(); }).observe(conteneur);

  const horloge = new THREE.Clock();
  let enCours = false;
  function rendu() {
    const t = horloge.getElapsedTime();
    const r = conteneur.getBoundingClientRect();
    const defil = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (r.top + r.height / 2)) / window.innerHeight));
    actuelX += (cibleX - actuelX) * 0.05;
    actuelY += (cibleY - actuelY) * 0.05;
    maquette.rotation.y = 0.15 + actuelX + (reduit ? 0 : Math.sin(t * 0.18) * 0.12 + defil * 0.4);
    maquette.rotation.x = actuelY;
    // Le témoin flotte doucement
    temoin.position.y = base + 0.16 + (reduit ? 0 : (Math.sin(t * 1.4) + 1) * 0.12);
    renderer.render(scene, camera);
  }
  function boucle() {
    if (enCours) return;
    enCours = true;
    const pas = () => {
      if (!visible) { enCours = false; return; }
      rendu();
      requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }

  rendu();
  conteneur.classList.add("maquette-prete");
  boucle();
  return renderer;
}

const cible = document.querySelector("[data-maquette]");
if (cible) {
  try { monterMaquette(cible); } catch (err) { console.warn("Maquette 3D indisponible :", err); }
}
