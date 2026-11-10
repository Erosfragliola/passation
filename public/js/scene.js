// Scène 3D de la section « Votre maquette » : rendu, chronologie d'animation, export PNG.
// Chargée à la demande (Three.js ~200 Ko). Expose une API simple à votre-maquette.js.

import * as THREE from "/vendor/three.module.min.js";
import { construireMaquette, EXEMPLE } from "/js/maquette.js";

const DUREE_TOTALE = 6;
const DEFAIRE = 0.6;

export function creerScene(conteneur) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return null;

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  conteneur.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffe9cc, 0x3a2a1c, 1.25));
  const soleil = new THREE.DirectionalLight(0xffd7a8, 2.6);
  soleil.position.set(-7, 13, 9);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  soleil.shadow.radius = mobile ? 2 : 6;
  Object.assign(soleil.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, far: 60 });
  scene.add(soleil);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.45 }));
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  scene.add(sol);

  const pivot = new THREE.Group();
  pivot.rotation.y = 0.15;
  scene.add(pivot);

  // ------------------------------------------------------------------ état
  let actuelle = null;      // maquette affichée
  let ancienne = null;      // maquette en train de se défaire
  let t = DUREE_TOTALE;     // temps de la chronologie
  let enLecture = false;
  let respire = false;
  let hauteurCadre = 6;
  const auxTemps = [];      // rappels (t) pendant la lecture
  let auFini = null;

  function cadrer() {
    const { clientWidth: w, clientHeight: h } = conteneur;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const etroit = camera.aspect < 0.95;
    const recul = (etroit ? 1.9 : 1.32) * Math.max(1, hauteurCadre / 6.5);
    camera.position.set(9 * recul, 8 * recul, 16 * recul);
    camera.lookAt(0, Math.min(3, hauteurCadre * 0.28), 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(cadrer).observe(conteneur);

  function appliquer(m, temps) {
    for (const a of m.animations) {
      const p = temps <= a.debut ? 0 : temps >= a.fin ? 1 : (temps - a.debut) / (a.fin - a.debut);
      a.appliquer(p);
    }
  }

  function installer(params, { defaire = true } = {}) {
    if (ancienne) { ancienne.dispose(); ancienne = null; }
    if (actuelle && defaire) ancienne = actuelle; else if (actuelle) actuelle.dispose();
    actuelle = construireMaquette(params, { mobile });
    pivot.add(actuelle.groupe);
    hauteurCadre = Math.max(6, actuelle.hauteur + 2);
    cadrer();
  }

  // ------------------------------------------------------------------ boucle
  let parallaxeX = 0, parallaxeY = 0, cibleX = 0, cibleY = 0, dernierRendu = 0, visible = true;
  conteneur.addEventListener("pointermove", (e) => {
    const r = conteneur.getBoundingClientRect();
    cibleX = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
    cibleY = ((e.clientY - r.top) / r.height - 0.5) * 0.1;
  });
  conteneur.addEventListener("pointerleave", () => { cibleX = 0; cibleY = 0; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(conteneur);

  const horloge = new THREE.Clock();
  let precedent = 0;
  function image(maintenant) {
    requestAnimationFrame(image);
    if (!visible && !enLecture) return;
    if (mobile && maintenant - dernierRendu < 32) return; // 30 i/s sur mobile
    dernierRendu = maintenant;
    const ecoule = horloge.getElapsedTime();
    const dt = Math.min(0.25, ecoule - precedent); // suit le temps réel, même si l'affichage est lent
    precedent = ecoule;

    if (enLecture) {
      t = Math.min(DUREE_TOTALE, t + dt);
      if (ancienne) {
        const p = Math.min(1, t / DEFAIRE);
        ancienne.groupe.scale.y = Math.max(0.0001, 1 - p);
        ancienne.groupe.position.y = -0.35 * p;
        if (p >= 1) { ancienne.dispose(); ancienne = null; }
      }
      if (actuelle) appliquer(actuelle, t);
      while (auxTemps.length && auxTemps[0].t <= t) auxTemps.shift().f();
      if (t >= DUREE_TOTALE) finir();
    }
    if (respire && actuelle) {
      const s = 1 + Math.sin(ecoule * 3) * 0.012;
      actuelle.groupe.scale.set(s, 1, s);
    }
    parallaxeX += (cibleX - parallaxeX) * 0.05;
    parallaxeY += (cibleY - parallaxeY) * 0.05;
    const r = conteneur.getBoundingClientRect();
    const defil = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (r.top + r.height / 2)) / window.innerHeight));
    pivot.rotation.y = 0.15 + parallaxeX + (reduit() ? 0 : Math.sin(ecoule * 0.18) * 0.1 + defil * 0.35);
    pivot.rotation.x = parallaxeY;
    renderer.render(scene, camera);
  }

  function finir() {
    if (!enLecture && t >= DUREE_TOTALE) return;
    t = DUREE_TOTALE;
    if (ancienne) { ancienne.dispose(); ancienne = null; }
    if (actuelle) appliquer(actuelle, t);
    while (auxTemps.length) auxTemps.shift().f();
    enLecture = false;
    const f = auFini; auFini = null;
    if (f) f();
  }

  // État initial : la maquette d'exemple, déjà construite
  installer(EXEMPLE, { defaire: false });
  appliquer(actuelle, DUREE_TOTALE);
  cadrer();
  requestAnimationFrame(image);

  // Interrompre l'animation au défilement, au clic ou au clavier
  const interrompre = () => { if (enLecture) finir(); };
  ["wheel", "touchmove", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, interrompre, { passive: true }));

  return {
    /** Le socle « respire » pendant le chargement des données. */
    respirer(oui) {
      respire = oui;
      if (!oui && actuelle) actuelle.groupe.scale.set(1, 1, 1);
    },
    /**
     * Construit une nouvelle maquette. evenements : [{ t, f }] rappelés pendant la lecture.
     * options.depuisEtages : ne pas défaire l'ancienne (saisie du CA), reprendre à la montée des étages.
     */
    construire(params, { evenements = [], fin = null, depuisEtages = false } = {}) {
      respire = false;
      if (enLecture) finir();
      installer(params, { defaire: !depuisEtages });
      auxTemps.length = 0;
      auxTemps.push(...[...evenements].sort((a, b) => a.t - b.t));
      auFini = fin;
      if (reduit()) { t = DUREE_TOTALE; enLecture = true; finir(); return; }
      t = depuisEtages ? 1.2 : 0;
      if (actuelle) appliquer(actuelle, t);
      enLecture = true;
    },
    terminer: finir,
    /** Image PNG 1600 × 900 : maquette, nom, « depuis », logo et adresse du site. Aucune valeur. */
    async exporter({ nom, depuis }) {
      const L = 1600, H = 900;
      const tailleAvant = new THREE.Vector2();
      renderer.getSize(tailleAvant);
      const ratioAvant = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(1000, 820, false);
      camera.aspect = 1000 / 820; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const rendu = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(ratioAvant);
      renderer.setSize(tailleAvant.x, tailleAvant.y, false);
      cadrer();

      await document.fonts.ready;
      const toile = document.createElement("canvas");
      toile.width = L; toile.height = H;
      const ctx = toile.getContext("2d");
      ctx.fillStyle = "#231E18"; ctx.fillRect(0, 0, L, H);
      const fond = ctx.createRadialGradient(1060, 380, 60, 1060, 380, 640);
      fond.addColorStop(0, "#3A3128"); fond.addColorStop(1, "rgba(35,30,24,0)");
      ctx.fillStyle = fond; ctx.fillRect(0, 0, L, H);
      const img = new Image();
      img.src = rendu;
      await img.decode();
      ctx.drawImage(img, 560, 40, 1000, 820);

      ctx.fillStyle = "#A39886";
      ctx.font = '500 20px "IBM Plex Mono", monospace';
      ctx.fillText("M A Q U E T T E", 96, 300);
      ctx.fillStyle = "#FBF6EC";
      let corps = 92;
      ctx.font = `400 ${corps}px "Instrument Serif", Georgia, serif`;
      while (ctx.measureText(nom).width > 520 && corps > 44) { corps -= 4; ctx.font = `400 ${corps}px "Instrument Serif", Georgia, serif`; }
      const lignes = couper(ctx, nom, 520);
      lignes.slice(0, 3).forEach((l, i) => ctx.fillText(l, 96, 390 + i * corps * 1.02));
      if (depuis) {
        ctx.fillStyle = "#E9C9A4";
        ctx.font = 'italic 400 52px "Instrument Serif", Georgia, serif';
        ctx.fillText(`depuis ${depuis}`, 96, 390 + Math.min(3, lignes.length) * corps * 1.02 + 30);
      }
      // Logo « Le Seuil » et adresse du site, en bas à droite
      ctx.save();
      ctx.translate(L - 330, H - 92);
      ctx.strokeStyle = "#FBF6EC"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(9, 27); ctx.lineTo(9, 15); ctx.arc(16, 15, 7, Math.PI, 0); ctx.lineTo(23, 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, 27); ctx.lineTo(27, 27); ctx.stroke();
      ctx.fillStyle = "#A8653A"; ctx.beginPath(); ctx.arc(16, 21, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FBF6EC"; ctx.font = '400 34px "Instrument Serif", Georgia, serif';
      ctx.fillText("Passation", 40, 28);
      ctx.fillStyle = "#A39886"; ctx.font = '400 18px "IBM Plex Mono", monospace';
      ctx.fillText(location.host, 42, 58);
      ctx.restore();
      return new Promise((ok) => toile.toBlob(ok, "image/png"));
    },
  };
}

function couper(ctx, texte, largeur) {
  const mots = texte.split(/\s+/);
  const lignes = [];
  let ligne = "";
  for (const m of mots) {
    const essai = ligne ? `${ligne} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && ligne) { lignes.push(ligne); ligne = m; } else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}
