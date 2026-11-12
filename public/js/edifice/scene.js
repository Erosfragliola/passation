// « De l'esquisse à l'édifice » : une seule scène 3D, une maquette d'architecte posée sur sa feuille de dessin.
// Le canevas se loge dans la fenêtre de la page la plus visible ([data-fenetre]) et défile avec elle, nativement.
// L'état de la maquette est une fonction pure du défilement (etats.js) et des données de l'entreprise ; seul le
// changement d'entreprise joue une courte transition (le tracé s'efface puis se redessine).
//
// API utilisée par votre-maquette.js : construire(params, { evenements }), terminer(), respirer(oui),
// exporter({ nom, depuis }) → Blob PNG, temps (repères de la transition, en secondes).
import * as THREE from "/vendor/three.module.min.js";
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from "/vendor/rendu3d.js";
import { creerRendu } from "/js/edifice/rendu.js";
import { chargerTextures, creerMateriaux, matiereProgressive, dessinerFeuille, dessinerCote, ombreRectangle, plaqueGravee, GRAPHITE } from "/js/edifice/materiaux.js";
import { creerBatiment } from "/js/edifice/batiment.js";
import { etatScene, poseCamera, calendrierVolume, centreRelatif, decalageStrate, STRATES, doux, segment, clamp01 } from "/js/edifice/etats.js";

/** Maquette d'exemple, affichée tant qu'aucun SIREN n'est saisi (présentée comme telle). */
export const EXEMPLE = {
  archetype: "industrie", etages: 3, fenetresAllumees: 7, arbres: { nombre: 3, haie: false }, echafaudage: false,
  depuis: null, comptesManquants: false, personnages: 3, effectif: null, nom: "Entreprise d'exemple", exemple: true,
  cote: "Exemple", legendeCote: "Votre fourchette après votre SIREN",
};
const TEMPS = { effacement: [0, 0.35], construction: [0.35, 1.45], valeur: 1.5, fin: 1.6 };
const NEUTRE = new THREE.Color(0xfff6ec), CHAUD = new THREE.Color(0xffdcb4), CREPUSCULE = new THREE.Color(0x8ea3d4);
const CIEL_JOUR = new THREE.Color(0xfff8ee), CIEL_SOIR = new THREE.Color(0x313c58);
const SOL_JOUR = new THREE.Color(0xcfc6b6), SOL_SOIR = new THREE.Color(0x17120e);
const CUIVRE = new THREE.Color(0xa8653a);

function graineDe(texte) { let h = 2166136261; for (const ch of String(texte)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
const pluriel = (n, mot, motPluriel = mot + "s") => `${n} ${n > 1 ? motPluriel : mot}`;

/** Crée la scène (asynchrone : textures calculées dans un Worker, shaders compilés en arrière-plan). */
export async function creerScene({ fenetres, principale }) {
  const essai = document.createElement("canvas");
  if (!(essai.getContext("webgl2") || essai.getContext("webgl"))) return null;

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointeurFin = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const debug = new URLSearchParams(location.search).has("debug");

  // ---------------------------------------------------------------- Scène, rendu, matériaux
  const textures = await chargerTextures({ mobile });
  await document.fonts?.ready;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);
  const rendu = creerRendu(scene, camera, { mobile, debug });
  const toile = rendu.renderer.domElement;
  const m = creerMateriaux(textures, { mobile });

  const monde = new THREE.Group();
  scene.add(monde);

  // Lumière : studio neutre et doux pour l'esquisse et le carton blanc, soleil chaud quand la matière arrive
  const soleil = new THREE.DirectionalLight(0xffffff, 2.2);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  soleil.shadow.radius = mobile ? 2 : 5;
  soleil.shadow.bias = -0.0004;
  soleil.shadow.normalBias = 0.02;
  scene.add(soleil, soleil.target);
  rendu.ombres(soleil);
  const ciel = new THREE.HemisphereLight(0xfff8ee, 0xcfc6b6, 1.1);
  scene.add(ciel);

  // ---------------------------------------------------------------- Feuille, plaque, cote, tracé
  const liberer = [];
  const g = (x) => { liberer.push(x); return x; };
  const matFeuille = g(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  const feuille = new THREE.Mesh(g(new THREE.PlaneGeometry(1, 1)), matFeuille);
  feuille.rotation.x = -Math.PI / 2;
  feuille.receiveShadow = true;
  monde.add(feuille);
  const ombreFeuille = new THREE.Mesh(g(new THREE.PlaneGeometry(1, 1)), g(new THREE.MeshBasicMaterial({ map: g(ombreRectangle()), transparent: true, depthWrite: false, opacity: 0.55 })));
  ombreFeuille.rotation.x = -Math.PI / 2;
  ombreFeuille.position.y = -0.01;
  monde.add(ombreFeuille);
  // Même feuille sans nom (cartouche vide) : posée par-dessus quand l'enseigne s'efface
  const matAnonyme = g(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const feuilleAnonyme = new THREE.Mesh(feuille.geometry, matAnonyme);
  feuilleAnonyme.rotation.x = -Math.PI / 2;
  feuilleAnonyme.receiveShadow = true;
  feuilleAnonyme.visible = false;
  monde.add(feuilleAnonyme);

  const matPlaque = g(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 1, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.6 }));
  const plaque = new THREE.Group();
  const socle = new THREE.Mesh(g(new THREE.BoxGeometry(2.3, 0.16, 0.7)), m.balsa);
  socle.position.y = 0.08; socle.castShadow = true; socle.receiveShadow = true;
  const lame = new THREE.Mesh(g(new THREE.BoxGeometry(2.1, 0.54, 0.04)), [m.laiton, m.laiton, m.laiton, m.laiton, matPlaque, m.laiton]);
  lame.position.set(0, 0.42, 0); lame.rotation.x = -0.55; lame.castShadow = true;
  // Plaque vierge, en fondu par-dessus la gravure quand le nom s'efface
  const matVierge = g(new THREE.MeshStandardMaterial({ color: 0xd8b47a, metalness: 0.85, roughness: 0.42, transparent: true, opacity: 0 }));
  const vierge = new THREE.Mesh(g(new THREE.PlaneGeometry(2.08, 0.52)), matVierge);
  vierge.position.set(0, 0.42 + Math.sin(0.55) * 0.021, Math.cos(0.55) * 0.021);
  vierge.rotation.x = -0.55;
  vierge.visible = false;
  plaque.add(socle, lame, vierge);
  monde.add(plaque);

  const matCote = g(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
  const cote = new THREE.Mesh(g(new THREE.PlaneGeometry(1, 1)), matCote);
  cote.rotation.x = -Math.PI / 2;
  monde.add(cote);

  const matTrait = g(new LineMaterial({ color: GRAPHITE, linewidth: mobile ? 1.6 : 1.5, transparent: true, depthWrite: false }));
  matTrait.polygonOffset = true; matTrait.polygonOffsetFactor = -2; matTrait.polygonOffsetUnits = -2;
  const matPointille = g(new LineMaterial({ color: 0xa8653a, linewidth: mobile ? 1.6 : 1.5, dashed: true, dashSize: 0.14, gapSize: 0.1, transparent: true, depthWrite: false }));

  // ---------------------------------------------------------------- Entreprise affichée
  let params = EXEMPLE, bati = null, cal = null, yToit = 0;
  let forcage = null; // débogage : état imposé
  const cadre = new THREE.Box3();
  const reperes = [];          // points qui doivent rester dans le champ (coins de la feuille, haut du bâti)
  const fenetres_ = [...fenetres];

  function installer(p) {
    const b = creerBatiment(p, m, { mobile, graine: graineDe(p.nom || p.archetype) });
    const pt = new THREE.Group();
    b.groupe.position.set(-b.centre.x, 0, -b.centre.z);
    pt.add(b.groupe);
    const lg = new LineSegmentsGeometry().setPositions(b.traits);
    const lignes = new LineSegments2(lg, matTrait);
    lignes.position.copy(b.groupe.position);
    lignes.frustumCulled = false;
    pt.add(lignes);
    let pts = null;
    if (b.pointilles.length) {
      pts = new LineSegments2(new LineSegmentsGeometry().setPositions(b.pointilles), matPointille);
      pts.computeLineDistances();
      pts.position.copy(b.groupe.position);
      pt.add(pts);
    }
    monde.add(pt);
    // Matériaux propres à chaque strate (mise en évidence) et au décor (fondu) ; même passage carton → matière
    const clones = new Map();
    const cloner = (mat, groupe) => {
      const k = `${groupe}|${mat.uuid}`;
      if (!clones.has(k)) {
        const c = mat.clone();
        matiereProgressive(c, m.uniforms, { triplanaire: mat === m.mur });
        c.userData.groupe = groupe;
        clones.set(k, c);
      }
      return clones.get(k);
    };
    for (const [cle, liste] of Object.entries(b.strates)) {
      for (const o of liste) {
        o.userData.base = o.position.clone();
        const eteinte = o.material === m.vitreEteinte;
        o.material = cloner(o.material, cle);
        if (eteinte) o.userData.eteinte = o.material;
      }
    }
    for (const o of b.decor) o.material = cloner(o.material, "decor");
    const parGroupe = {};
    for (const c of clones.values()) (parGroupe[c.userData.groupe] ??= []).push(c);
    return { b, porteur: pt, lignes, pts, clones: [...clones.values()], parGroupe };
  }
  function desinstaller(x) {
    if (!x) return;
    x.porteur.removeFromParent();
    x.lignes.geometry.dispose();
    x.pts?.geometry.dispose();
    x.clones.forEach((c) => c.dispose());
    x.b.dispose();
  }
  /** Transparence d'un groupe de matériaux (bascule du mode transparent seulement quand il change). */
  function opacite(mats, a) {
    for (const c of mats ?? []) {
      const t = a < 0.999;
      if (c.transparent !== t) { c.transparent = t; c.needsUpdate = true; }
      c.opacity = a;
    }
  }

  /** Feuille, plaque et cote à la mesure du bâtiment ; nom et « depuis » sur la plaque et le cartouche. */
  function habiller(p) {
    const boite = bati.b.boite.clone().translate(bati.b.groupe.position);
    const taille = boite.getSize(new THREE.Vector3());
    const recul = Math.min(5, bati.b.hauteur * 0.55);    // la feuille s'étend derrière les bâtiments hauts
    const marge = mobile ? 3 : 4.5; // feuille plus serrée sur mobile : la maquette y paraît plus grande
    const L = Math.max(mobile ? 10.5 : 12, taille.x + marge), P = Math.max(mobile ? 8 : 9, taille.z + marge + 0.1 + recul);
    feuille.scale.set(L, P, 1);
    feuille.position.set(0, 0, -recul / 2 + 0.35);
    feuille.rotation.z = 0.025;
    ombreFeuille.scale.set(L * 1.12, P * 1.12, 1);
    ombreFeuille.position.set(0.25, -0.01, feuille.position.z + 0.3);
    ombreFeuille.rotation.z = feuille.rotation.z;
    matFeuille.map?.dispose();
    matFeuille.map = dessinerFeuille(L, P, { nom: p.nom, depuis: p.depuis, exemple: !!p.exemple });
    matFeuille.needsUpdate = true;
    feuilleAnonyme.scale.copy(feuille.scale);
    feuilleAnonyme.position.copy(feuille.position).setY(0.002);
    feuilleAnonyme.rotation.z = feuille.rotation.z;
    matAnonyme.map?.dispose();
    matAnonyme.map = dessinerFeuille(L, P, { nom: "", depuis: null, exemple: false });
    matAnonyme.needsUpdate = true;
    // Plaque de laiton à l'avant gauche, cote de plan à l'avant droit (le long de la façade)
    const avant = boite.max.z + 0.75;
    plaque.position.set(boite.min.x + 1.25, 0, avant);
    plaque.rotation.y = 0.18;
    for (const k of ["map", "normalMap", "roughnessMap"]) matPlaque[k]?.dispose();
    Object.assign(matPlaque, plaqueGravee({ nom: p.exemple ? "Exemple" : p.nom, depuis: p.depuis }));
    matPlaque.needsUpdate = true;
    const largeurCote = Math.min(6.5, Math.max(3.8, taille.x * 0.6));
    cote.scale.set(largeurCote, largeurCote * (300 / 1600), 1);
    cote.position.set(boite.max.x - largeurCote / 2 - 0.3, 0.012, avant + 0.15);
    matCote.map?.dispose();
    matCote.map = dessinerCote(p.cote || "À compléter", p.legendeCote || "");
    matCote.needsUpdate = true;
    // Cadrage : toute la feuille et le haut du bâtiment doivent tenir dans le canevas (aucun bord tranché)
    const z0 = feuille.position.z;
    reperes.length = 0;
    for (const [x, z] of [[-L / 2, z0 - P / 2], [L / 2, z0 - P / 2], [-L / 2, z0 + P / 2], [L / 2, z0 + P / 2]]) reperes.push(new THREE.Vector3(x * 1.04, 0, z + Math.sign(z - z0) * P * 0.02));
    for (const x of [boite.min.x, boite.max.x]) for (const z of [boite.min.z, boite.max.z]) {
      const r = new THREE.Vector3(x, boite.max.y, z);
      r.haut = true; r.avant = z === boite.max.z; // repères déplacés quand la maquette s'ouvre
      reperes.push(r);
    }
    cadre.makeEmpty();
    reperes.forEach((r) => cadre.expandByPoint(r));
    cadrer();
  }

  function poser(p) {
    params = p;
    desinstaller(bati);
    bati = installer(p);
    const b = bati.b;
    const n = b.niveaux[b.niveaux.length - 1];
    yToit = n.y0 + n.h;
    cal = calendrierVolume(b.niveaux.length, b.allumees.length, b.arbres.length);
    b.details.children.forEach((o) => { o.userData.echelle = o.scale.clone(); });
    habiller(p);
    decrire(p);
    prechauffer().catch(() => {});
  }

  // ---------------------------------------------------------------- Texte équivalent et légende
  function decrire(p) {
    const qui = p.exemple ? "d'une entreprise d'exemple" : `de ${p.nom}`;
    const niveaux = p.comptesManquants ? "un rez-de-chaussée, les étages restant à tracer faute de comptes publiés" : pluriel(p.etages ?? 1, "niveau", "niveaux");
    const fenetres = pluriel(Math.min(bati.b.allumees.length, p.fenetresAllumees ?? 0), "fenêtre allumée", "fenêtres allumées");
    const arbres = pluriel(bati.b.arbres.length, "arbre");
    const textes = {
      esquisse: `Esquisse au trait de la maquette ${qui}, sur une feuille d'architecte : ${niveaux}${p.depuis ? `, depuis ${p.depuis}` : ""}. Cote de plan : ${p.cote || "à compléter"}.`,
      ouvrage: `La maquette ${qui} prend volume, étage par étage (${niveaux}, ${fenetres}, ${arbres}), puis matière : pierre, verre et lumière chaude.`,
      eclate: `Vue éclatée de la maquette ${qui}, un niveau par outil : fondations pour la valorisation, étages pour le datapack, enseigne pour le teaser, façade pour le mémorandum, rez-de-chaussée pour les ressources, toiture pour le chat expert.`,
      enseigne: `Le nom quitte la plaque et le cartouche de la maquette, le décor s'estompe : il ne reste qu'un bâtiment anonyme.`,
      soir: `Le soir tombe sur la maquette ${qui} ; les lumières restent allumées (${fenetres}).`,
    };
    for (const f of fenetres_) if (textes[f.dataset.fenetre]) f.setAttribute("aria-label", textes[f.dataset.fenetre]);
    const legende = principale?.querySelector(".legende");
    if (legende) legende.textContent = p.exemple ? "Maquette d'exemple · saisissez votre SIREN" : `Maquette de ${p.nom} · d'après ses données publiques`;
  }

  // ---------------------------------------------------------------- Cadrage
  let distance = 20;
  const cible = new THREE.Vector3();
  function cadrer() {
    if (!rendu.dimensionner()) return;
    mettreAuPoint();
  }
  /** Distance de caméra pour que la maquette tienne dans le canevas, quel que soit son format. */
  function mettreAuPoint() {
    const sphere = cadre.getBoundingSphere(new THREE.Sphere());
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    distance = (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.9;
    cible.copy(sphere.center).setY(cadre.max.y * 0.22);
    const r = sphere.radius + 3;
    Object.assign(soleil.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 80 });
    soleil.shadow.camera.updateProjectionMatrix();
    sale = true;
  }

  const ndc = new THREE.Vector3();
  function placerCamera(az, el, d0, { haut = 0, avant = 0 } = {}) {
    let d = d0;
    const c = cible.clone().add(new THREE.Vector3(0, haut * 0.35, avant * 0.3));
    for (let k = 0; k < 4; k++) {
      camera.position.set(c.x + d * Math.cos(el) * Math.sin(az), c.y + d * Math.sin(el), c.z + d * Math.cos(el) * Math.cos(az));
      camera.lookAt(c);
      camera.updateMatrixWorld();
      let ecart = 0;
      for (const r of reperes) {
        ndc.copy(r);
        if (r.haut) { ndc.y += haut; if (r.avant) ndc.z += avant; }
        ndc.project(camera);
        ecart = Math.max(ecart, Math.abs(ndc.x), Math.abs(ndc.y));
      }
      if (!reperes.length) break;
      d *= 1 + (ecart / (mobile ? 0.95 : 0.9) - 1) * 0.85; // vise 90 % du champ (95 % sur mobile)
    }
  }

  // ---------------------------------------------------------------- Application d'un état
  let transition = null;      // changement d'entreprise : { t0, suivant, evenements, fin }
  // Mise en évidence des strates (0 à 1, lissée) : carte survolée ou touchée ; sur écran tactile, la carte au
  // centre de la zone visible sous la bande
  const surbrillance = Object.fromEntries(STRATES.map((x) => [x.cle, 0]));
  let survolee = null, choisie = null, auto = null;
  const cartes = [...document.querySelectorAll("[data-strate]")];
  for (const c of cartes) {
    if (pointeurFin) {
      c.addEventListener("pointerenter", () => { survolee = c.dataset.strate; demander(); });
      c.addEventListener("pointerleave", () => { if (survolee === c.dataset.strate) survolee = null; demander(); });
    }
    c.addEventListener("click", () => { choisie = choisie === c.dataset.strate ? null : c.dataset.strate; demander(); });
  }
  let respire = false;
  let sale = true;
  const pointeur = { x: 0, y: 0, cx: 0, cy: 0 };

  function facteurTrace(now) {
    if (!transition) return 1;
    const t = (now - transition.t0) / 1000;
    if (t < TEMPS.effacement[1]) return 1 - doux(t / TEMPS.effacement[1]);
    return doux(segment(t, TEMPS.construction[0], TEMPS.construction[1]));
  }

  function appliquer(e, now) {
    const b = bati.b;
    // Tracé : dessiné du bas vers le haut, puis les arbres en plan
    const fTrace = facteurTrace(now) * e.trace;
    const total = b.traits.length / 6;
    bati.lignes.geometry.instanceCount = Math.round(total * fTrace);
    const respiration = respire && !reduit() ? 0.6 + 0.4 * Math.cos(now / 260) : 1;
    matTrait.opacity = 0.92 * (1 - doux(e.matiere * 1.25)) * respiration;
    if (bati.pts) { bati.pts.visible = fTrace > 0.6; matPointille.opacity = 0.9 * respiration; }
    // Volume : étages un à un, toit, détails, fenêtres, arbres
    const v = e.volume;
    b.niveaux.forEach((n, i) => {
      const s = doux(cal.niveau(v, i));
      n.groupe.visible = s > 0.002;
      n.groupe.scale.y = Math.max(0.002, s);
      n.groupe.position.y = n.y0 * (1 - s);
    });
    if (b.toit) {
      const s = doux(cal.toit(v));
      b.toit.visible = s > 0.002;
      b.toit.scale.y = Math.max(0.002, s);
      b.toit.position.y = yToit * (1 - s);
    }
    const sd = doux(cal.details(v));
    b.details.visible = sd > 0.002;
    b.details.children.forEach((o) => o.scale.copy(o.userData.echelle).multiplyScalar(Math.max(0.002, sd)));
    if (b.echafaudage) { b.echafaudage.visible = sd > 0.002; b.echafaudage.scale.y = Math.max(0.002, sd); }
    b.allee.visible = v > 0.3;
    b.allee.scale.y = Math.max(0.002, doux(segment(v, 0.3, 0.5)));
    b.allee.position.z = b.porte.z + 1.5 + (1 - b.allee.scale.y) * -1.7;
    b.allumees.forEach((f, i) => { f.vitre.material = cal.fenetreAllumee(v, i) ? f.lueur : (f.vitre.userData.eteinte ?? b.vitreEteinte); });
    b.arbres.forEach((a, i) => {
      const s = cal.arbre(v, i);
      a.groupe.visible = s > 0.002;
      a.groupe.scale.setScalar(a.taille * Math.max(0.002, 1 - Math.pow(1 - s, 3)));
    });
    // Matière : pierre, verre, laiton ; lumière chaude ; les personnages arrivent
    const mt = doux(e.matiere);
    m.uniforms.matiere.value = mt;
    b.personnes.forEach((p, i) => {
      const s = doux(segment(e.matiere, 0.35 + i * 0.05, 0.6 + i * 0.05));
      p.visible = s > 0.002;
      p.scale.setScalar(Math.max(0.002, s));
    });
    // Soir : la lumière du jour baisse et bleuit, les fenêtres allumées restent allumées (et brillent davantage)
    const sr = doux(e.soir);
    soleil.color.lerpColors(NEUTRE, CHAUD, mt).lerp(CREPUSCULE, sr);
    soleil.intensity = (2.0 + 0.9 * mt) * (1 - 0.88 * sr);
    ciel.color.lerpColors(CIEL_JOUR, CIEL_SOIR, sr);
    ciel.groundColor.lerpColors(SOL_JOUR, SOL_SOIR, sr);
    ciel.intensity = (1.15 - 0.45 * mt) * (1 - 0.45 * sr);
    scene.environmentIntensity = (0.35 + 0.3 * mt) * (1 - 0.8 * sr);
    b.lueurs.forEach((l) => { l.emissiveIntensity = 2.4 + 1.6 * sr; });

    // Vue éclatée : une strate par outil ; la strate de la carte survolée ou touchée s'allume et se soulève
    const o = e.ouvert;
    const nbE = b.niveaux.length;
    for (const [cle, liste] of Object.entries(b.strates)) {
      const leve = surbrillance[cle] * 0.4 * o;
      for (const x of liste) {
        const niv = x.userData.niveau ?? 0;
        const d = cle === "facade"
          ? { y: decalageStrate(niv === 0 ? "rdc" : "etages", o, { etage: niv, nbEtages: nbE }).y, z: STRATES[3].dz * o }
          : decalageStrate(cle, o, { etage: niv, nbEtages: nbE });
        x.position.set(x.userData.base.x, x.userData.base.y + d.y + leve, x.userData.base.z + d.z);
      }
      for (const c of bati.parGroupe[cle] ?? []) { c.emissive.copy(CUIVRE); c.emissiveIntensity = 0.85 * surbrillance[cle] * o; }
    }
    if (b.echafaudage) b.echafaudage.visible = b.echafaudage.visible && o < 0.05;
    matPlaque.emissive.copy(CUIVRE); matPlaque.emissiveIntensity = 0.4 * surbrillance.enseigne * o;

    // Enseigne effacée : le nom quitte la plaque et le cartouche, la cote s'en va, le décor s'estompe
    const ef = e.efface;
    const nomEfface = doux(segment(ef, 0, 0.6));
    vierge.visible = nomEfface > 0.001;
    matVierge.opacity = nomEfface;
    opacite(bati.parGroupe.enseigne, 1 - nomEfface);
    const fondu = doux(segment(ef, 0.3, 1));
    opacite(bati.parGroupe.decor, 1 - 0.85 * fondu);
    // La feuille reste opaque (c'est le sol de la maquette) : seul son cartouche perd le nom
    const anonyme = doux(segment(ef, 0, 0.5));
    feuille.visible = anonyme < 0.999;
    feuilleAnonyme.visible = anonyme > 0.001;
    opacite([matAnonyme], anonyme);

    // Plaque et cote apparaissent avec le tracé
    const fp = doux(segment(fTrace, 0.55, 1));
    plaque.visible = fp > 0.01;
    plaque.scale.setScalar(Math.max(0.01, fp));
    plaque.position.y = surbrillance.enseigne * 0.25 * o;
    cote.visible = fp > 0.01 && ef < 0.4;
    matCote.opacity = fp * (1 - 0.35 * mt) * (1 - doux(segment(ef, 0, 0.4)));

    // Caméra : pose de l'étape, légère réaction au pointeur sur ordinateur ; distance ajustée pour que la feuille
    // entière (et la maquette ouverte) reste dans le champ : rien n'est coupé par le bord de la fenêtre
    const pose = poseCamera(e.etape);
    const az = pose.azimut + pointeur.cx * 0.06, el = pose.elevation + pointeur.cy * 0.03;
    placerCamera(az, el, distance * pose.distance, { haut: decalageStrate("toiture", o, { nbEtages: nbE }).y + 0.4 * o, avant: 2.6 * o });
    soleil.position.set(cible.x - 8, 14, cible.z + 9);
    soleil.target.position.copy(cible);
  }

  // ---------------------------------------------------------------- Fenêtres de la page et boucle de rendu
  let hote = null;
  const visibles = new Set();
  function mesurer() {
    const vh = window.innerHeight;
    const centres = {};
    let meilleure = null, vu = 0;
    for (const f of fenetres_) {
      const r = f.getBoundingClientRect();
      if (!r.height) continue;
      centres[f.dataset.fenetre] = centreRelatif(r.top, r.height, vh);
      const v = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (v > vu) { vu = v; meilleure = f; }
      const repere = f.dataset.repere && document.querySelector(f.dataset.repere);
      if (repere) {
        // Bande collante : avancement des cartes qui défilent sous elle
        const gr = repere.getBoundingClientRect();
        centres.outilsDefile = clamp01((r.bottom - gr.top) / Math.max(1, gr.height));
        if (!pointeurFin && v > 0) {
          const milieu = (Math.max(0, r.bottom) + vh) / 2;
          let proche = null, dmin = Infinity;
          for (const c of cartes) {
            const cr = c.getBoundingClientRect();
            const dist = Math.abs(cr.top + cr.height / 2 - milieu);
            if (cr.bottom > r.bottom && dist < dmin) { dmin = dist; proche = c.dataset.strate; }
          }
          auto = proche;
        }
      }
    }
    return { centres, active: meilleure };
  }
  function placer(f) {
    hote?.classList.remove("scene-prete");
    hote = f;
    f.append(toile);
    rendu.dimensionner(true);
    cadrer();
    requestAnimationFrame(() => f.classList.add("scene-prete"));
  }

  // Après chaque rendu, la boucle se relance d'elle-même pendant 300 ms (sans rien dessiner si rien ne change) :
  // ces images enchaînées donnent à la qualité adaptative la cadence réelle de l'écran (rendu.tic). Une image
  // demandée par un événement (défilement, pointeur) ne compte pas : rien ne dit qu'elle suit la précédente.
  let raf = 0, signature = "", actifJusqua = 0, perdu = false, enchaine = false;
  const demander = () => { if (!raf) raf = requestAnimationFrame(image); };
  function image(now) {
    raf = 0;
    const suite = enchaine;
    enchaine = false;
    if (document.hidden || !visibles.size || perdu) return;   // pause hors écran, onglet masqué, contexte perdu
    const { centres, active } = mesurer();
    if (!active) return;
    if (active !== hote) placer(active);
    const e = forcage ?? etatScene(centres, { reduit: reduit() });

    let anime = false;
    if (transition) {
      const t = (now - transition.t0) / 1000;
      if (transition.suivant && t >= TEMPS.effacement[1]) { poser(transition.suivant); transition.suivant = null; }
      while (transition.evenements.length && transition.evenements[0].t <= t) transition.evenements.shift().f();
      if (t >= TEMPS.fin) finirTransition(); else anime = true;
    }
    if (pointeurFin && !reduit()) {
      pointeur.cx += (pointeur.x - pointeur.cx) * 0.08;
      pointeur.cy += (pointeur.y - pointeur.cy) * 0.08;
      if (Math.abs(pointeur.x - pointeur.cx) + Math.abs(pointeur.y - pointeur.cy) > 0.002) anime = true;
    }
    if (respire && !reduit()) anime = true;
    const cible_ = e.ouvert > 0.01 ? (survolee ?? choisie ?? auto) : null;
    let somme = 0;
    for (const cle of Object.keys(surbrillance)) {
      const but = cle === cible_ ? 1 : 0;
      surbrillance[cle] = reduit() ? but : surbrillance[cle] + (but - surbrillance[cle]) * 0.18;
      if (Math.abs(but - surbrillance[cle]) > 0.003) anime = true; else surbrillance[cle] = but;
      somme += surbrillance[cle] * (STRATES.findIndex((x) => x.cle === cle) + 1);
    }
    for (const c of cartes) c.classList.toggle("strate-active", c.dataset.strate === cible_);

    const sig = [e.trace, e.volume, e.matiere, e.ouvert, e.efface, e.soir, e.etape, pointeur.cx, pointeur.cy, somme].map((x) => x.toFixed(4)).join("|") + `|${toile.width}x${toile.height}`;
    if (sale || anime || sig !== signature) {
      appliquer(e, now);
      rendu.rendre();
      signature = sig;
      sale = false;
      actifJusqua = now + 300;
    }
    rendu.tic(now, suite);
    if (anime || now < actifJusqua) { demander(); enchaine = true; }
  }

  function finirTransition() {
    if (!transition) return;
    if (transition.suivant) poser(transition.suivant);
    while (transition.evenements.length) transition.evenements.shift().f();
    transition = null;
    sale = true;
  }

  const io = new IntersectionObserver((entrees) => {
    for (const x of entrees) { if (x.isIntersecting) visibles.add(x.target); else visibles.delete(x.target); }
    demander();
  }, { rootMargin: "120px 0px" });
  fenetres_.forEach((f) => io.observe(f));
  window.addEventListener("scroll", demander, { passive: true });
  window.addEventListener("resize", () => { sale = true; demander(); }, { passive: true });
  document.addEventListener("visibilitychange", demander);
  new ResizeObserver(() => { cadrer(); demander(); }).observe(toile);
  if (pointeurFin) {
    window.addEventListener("pointermove", (ev) => {
      pointeur.x = (ev.clientX / window.innerWidth) * 2 - 1;
      pointeur.y = (ev.clientY / window.innerHeight) * 2 - 1;
      demander();
    }, { passive: true });
  }

  // ---------------------------------------------------------------- Précompilation des shaders
  // Tout programme absent au moment où une pièce apparaît se compile pendant le défilement : page figée de
  // 60 ms à plus d'une seconde, à froid, selon l'appareil. On compile donc d'avance, en arrière-plan et par passes
  // séparées par des moments calmes : vitres allumées, puis vitres éteintes et variantes transparentes (enseigne,
  // décor et cartouche qui s'estompent), puis les ombres. Chaque passe rétablit la scène avant de rendre la main :
  // aucune image n'en montre rien.
  const calme = () => new Promise((ok) => {
    if (window.requestIdleCallback) return requestIdleCallback(ok, { timeout: 1200 });
    setTimeout(() => { const t0 = performance.now(); ok({ timeRemaining: () => Math.max(0, 8 - (performance.now() - t0)) }); }, 60);
  });
  const mini = new THREE.WebGLRenderTarget(4, 4);
  liberer.push(mini);
  /** Comme dans la chaîne de post-traitement, la scène se rend dans une cible (espace linéaire), pas à l'écran :
   *  les programmes compilés d'avance doivent être ceux-là. */
  function dansLaCible(f) {
    const avant = rendu.renderer.getRenderTarget();
    rendu.renderer.setRenderTarget(mini);
    try { return f(); } finally { rendu.renderer.setRenderTarget(avant); }
  }
  const compiler = () => dansLaCible(() => rendu.renderer.compileAsync(scene, camera));
  function basculer(mats) {
    for (const c of mats) { c.transparent = !c.transparent; c.needsUpdate = true; }
  }
  async function prechauffer() {
    const x = bati;
    const vitres = x.b.allumees.map((f) => [f, f.vitre.material]);
    const remettre = () => vitres.forEach(([f, mat]) => { f.vitre.material = mat; });
    const variables = [...(x.parGroupe.enseigne ?? []), ...(x.parGroupe.decor ?? []), matAnonyme];
    const passes = [
      () => {
        vitres.forEach(([f]) => { f.vitre.material = f.lueur; });
        try { return compiler(); } finally { remettre(); }
      },
      () => {
        vitres.forEach(([f]) => { f.vitre.material = f.vitre.userData.eteinte ?? x.b.vitreEteinte; });
        basculer(variables);
        try { return compiler(); } finally { basculer(variables); remettre(); }
      },
      // Sans compilation parallèle (KHR_parallel_shader_compile), l'édition des liens attend le premier usage :
      // on la provoque ici, quelques programmes par moment calme
      async () => {
        const liste = [...rendu.renderer.info.programs];
        while (liste.length) {
          const d = await calme();
          if (x !== bati || perdu) return;
          do { const p = liste.shift(); p.getUniforms(); p.getAttributes(); } while (liste.length && d.timeRemaining() > 4);
        }
      },
      // Ombres : leurs shaders de profondeur ne se créent qu'au rendu. Une image hors écran, toutes pièces visibles.
      () => {
        const caches = [];
        monde.traverse((o) => { if (!o.visible) { caches.push(o); o.visible = true; } });
        try { dansLaCible(() => rendu.renderer.render(scene, camera)); } finally { caches.forEach((o) => { o.visible = false; }); }
      },
    ];
    for (const passe of passes) {
      await calme();
      if (x !== bati || perdu) return;   // entreprise changée entre-temps : la nouvelle a sa propre précompilation
      await passe();
    }
    sale = true;
    demander();
  }

  // ---------------------------------------------------------------- Contexte WebGL perdu (mémoire du téléphone)
  // Les images fixes reprennent la place de la scène ; au retour du contexte, Three.js recharge tout.
  toile.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    perdu = true;
    hote?.classList.remove("scene-prete");
  });
  toile.addEventListener("webglcontextrestored", () => {
    perdu = false;
    hote = null;            // replace le canevas et le révèle à la prochaine image
    sale = true;
    demander();
    prechauffer().catch(() => {});
  });

  // ---------------------------------------------------------------- État initial : l'entreprise d'exemple
  poser(EXEMPLE);
  appliquer(etatScene({ esquisse: 0.5 }), performance.now());
  await compiler().catch(() => {});
  demander();

  if (debug) {
    window.__edifice = {
      forcer(e) {
        forcage = e ? { trace: 0, volume: 0, matiere: 0, outils: 0, ouvert: 0, efface: 0, soir: 0, ...e } : null;
        if (forcage) forcage.etape = forcage.volume + forcage.matiere + forcage.outils + forcage.efface + forcage.soir;
        sale = true; demander();
      },
      surligner(cle) { choisie = cle; demander(); },
      get ips() { return rendu.ips; },
      image() { rendu.composer.render(); return toile.toDataURL("image/png"); },
      scene, rendu,
    };
  }

  return {
    temps: TEMPS,
    respirer(oui) { respire = oui; demander(); },
    /** Nouvelle entreprise : le tracé de la précédente s'efface, le sien se dessine ; evenements : [{ t, f }]. */
    construire(p, { evenements = [] } = {}) {
      finirTransition();
      respire = false;
      const evts = [...evenements].sort((a, b) => a.t - b.t);
      if (reduit()) { poser(p); evts.forEach((x) => x.f()); sale = true; demander(); return; }
      transition = { t0: performance.now(), suivant: p, evenements: evts };
      demander();
    },
    terminer: finirTransition,
    /** Image PNG 1600 × 900 : l'édifice fini (matière), le nom, « depuis », le logo et l'adresse du site. Aucune valeur. */
    async exporter({ nom, depuis }) {
      finirTransition();
      const L = 1600, H = 900;
      const taille = new THREE.Vector2();
      rendu.renderer.getSize(taille);
      const ratio = rendu.renderer.getPixelRatio();
      rendu.renderer.setPixelRatio(1);
      rendu.renderer.setSize(1000, 820, false);
      rendu.composer.setSize(1000, 820, false);
      camera.aspect = 1000 / 820; camera.updateProjectionMatrix();
      mettreAuPoint();
      const sauvegarde = { ...pointeur };
      pointeur.cx = pointeur.cy = 0;
      const coteVisible = cote.visible;
      appliquer({ trace: 1, volume: 1, matiere: 1, outils: 0, ouvert: 0, efface: 0, soir: 0, etape: 2 }, performance.now());
      cote.visible = false; // l'image partagée ne porte aucune valeur
      rendu.composer.render();
      const image = toile.toDataURL("image/png");
      cote.visible = coteVisible;
      Object.assign(pointeur, sauvegarde);
      rendu.renderer.setPixelRatio(ratio);
      rendu.renderer.setSize(taille.x, taille.y, false);
      rendu.composer.setSize(taille.x, taille.y, false);
      rendu.dimensionner(true);
      cadrer();
      signature = "";
      demander();

      await document.fonts.ready;
      const t2 = document.createElement("canvas");
      t2.width = L; t2.height = H;
      const ctx = t2.getContext("2d");
      ctx.fillStyle = "#120e0b"; ctx.fillRect(0, 0, L, H);
      const img = new Image();
      img.src = image;
      await img.decode();
      ctx.drawImage(img, 560, 40, 1000, 820);
      ctx.fillStyle = "#A39886";
      ctx.font = '500 20px "Geist Mono", monospace';
      ctx.fillText("M A Q U E T T E", 96, 300);
      ctx.fillStyle = "#FBF6EC";
      let corps = 92;
      ctx.font = `500 ${corps}px "Geist", sans-serif`;
      while (ctx.measureText(nom).width > 520 && corps > 44) { corps -= 4; ctx.font = `500 ${corps}px "Geist", sans-serif`; }
      const lignes = couper(ctx, nom, 520);
      lignes.slice(0, 3).forEach((l, i) => ctx.fillText(l, 96, 390 + i * corps * 1.02));
      if (depuis) {
        ctx.fillStyle = "#E9C9A4";
        ctx.font = 'italic 400 46px "Geist", sans-serif';
        ctx.fillText(`depuis ${depuis}`, 96, 390 + Math.min(3, lignes.length) * corps * 1.02 + 30);
      }
      ctx.save();
      ctx.translate(L - 330, H - 92);
      ctx.strokeStyle = "#FBF6EC"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(9, 27); ctx.lineTo(9, 15); ctx.arc(16, 15, 7, Math.PI, 0); ctx.lineTo(23, 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, 27); ctx.lineTo(27, 27); ctx.stroke();
      ctx.fillStyle = "#A8653A"; ctx.beginPath(); ctx.arc(16, 21, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FBF6EC"; ctx.font = '500 30px "Geist", sans-serif';
      ctx.fillText("Passation", 40, 28);
      ctx.fillStyle = "#A39886"; ctx.font = '400 18px "Geist Mono", monospace';
      ctx.fillText(location.host, 42, 58);
      ctx.restore();
      return new Promise((ok) => t2.toBlob(ok, "image/png"));
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
