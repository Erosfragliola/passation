// Le bâtiment de la maquette, construit en code à partir des paramètres de regles.js : étages = chiffre d'affaires,
// fenêtres allumées = effectif, arbres = rentabilité, archétype = secteur (NAF), échafaudage = croissance,
// personnages = effectif. Finition « maquette d'architecte » : murs en pierre de taille, toitures et menuiseries en
// balsa, vitrages, personnages blancs, arbres en lichen sur fil de laiton. Rien n'est animé ici : la scène règle
// chaque partie selon le défilement (scene.js).
//
// creerBatiment(params, m, options) → { groupe, niveaux, toit, details, echafaudage, allee, arbres, personnes,
//   allumees, enseignes, traits (segments de l'esquisse), traitsBati, pointilles, boite, centre, hauteur, dispose }
import * as THREE from "/vendor/three.module.min.js";
import { RoundedBoxGeometry } from "/vendor/rendu3d.js";

const HE = 0.9;              // hauteur d'étage (unités de maquette)
const SAUGE = [0x8a9474, 0x7b8766, 0x9ba184, 0x6f7a5c, 0xa6aa8c, 0x84906c];

/** Générateur pseudo-aléatoire à graine (même entreprise → même maquette). */
function alea(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

export function creerBatiment(params, m, { mobile = false, graine = 7 } = {}) {
  const rnd = alea(graine);
  const groupe = new THREE.Group();
  const geos = [];
  const geo = (g) => { geos.push(g); return g; };
  const aLiberer = [];
  const fenetres = [];         // { vitre, parent }
  const enseignes = [];        // plaques de cuivre des façades (effacées avec l'enseigne)

  // Fenêtres allumées : 3 teintes chaudes, fixes (pas de scintillement)
  const lueurs = [0xffb467, 0xffbe78, 0xffa95a].map((e) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe6bd, emissive: e, emissiveIntensity: 2.4, roughness: 0.55 });
    aLiberer.push(mat);
    return mat;
  });

  // ---------------------------------------------------------------- Outils de modelage
  function boite(l, h, p, mat, x, y, z, parent, r = 0.045) {
    const g = geo(new RoundedBoxGeometry(l, h, p, 2, Math.min(r, l / 2.1, h / 2.1, p / 2.1)));
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylindre(rh, rb, h, mat, x, y, z, parent, seg = 20) {
    const mesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(rh, rb, h, seg)), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function prisme(points, profondeur, mat, x, y, z, parent) {
    const forme = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = geo(new THREE.ExtrudeGeometry(forme, { depth: profondeur - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }));
    g.translate(0, 0, -(profondeur - 0.06) / 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** Barreaux de menuiserie accumulés par groupe, puis fusionnés en un InstancedMesh (performance). */
  const barreaux = new Map();
  function barreau(parent, x, y, z, l, h, p) {
    if (!barreaux.has(parent)) barreaux.set(parent, []);
    barreaux.get(parent).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(l, h, p)));
  }
  function poserBarreaux() {
    const cube = geo(new THREE.BoxGeometry(1, 1, 1));
    for (const [parent, mats] of barreaux) {
      const im = new THREE.InstancedMesh(cube, m.platre, mats.length);
      mats.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.castShadow = true; im.receiveShadow = true;
      parent.add(im);
    }
  }
  /** Fenêtre : vitre acrylique (éteinte ou lueur), cadre, petits-bois, appui. Façade avant (normale +z). */
  function fenetre(parent, x, y, z, l, h, { baie = false } = {}) {
    const vitre = new THREE.Mesh(geo(new THREE.PlaneGeometry(l, h)), m.vitreEteinte);
    vitre.position.set(x, y, z + 0.006);
    vitre.receiveShadow = true;
    parent.add(vitre);
    const e = 0.035, d = 0.05;
    barreau(parent, x, y + h / 2, z + d / 2, l + e, e, d);
    barreau(parent, x, y - h / 2, z + d / 2, l + e, e, d);
    barreau(parent, x - l / 2, y, z + d / 2, e, h, d);
    barreau(parent, x + l / 2, y, z + d / 2, e, h, d);
    if (baie) {
      const n = Math.max(1, Math.round(l / 0.45));
      for (let k = 1; k < n; k++) barreau(parent, x - l / 2 + (k * l) / n, y, z + d / 2, e * 0.7, h, d * 0.8);
      barreau(parent, x, y + h * 0.18, z + d / 2, l, e * 0.7, d * 0.8);
    } else {
      barreau(parent, x, y, z + d / 2, e * 0.6, h, d * 0.8);          // petit-bois vertical
      barreau(parent, x, y + h * 0.12, z + d / 2, l, e * 0.6, d * 0.8); // petit-bois horizontal
      barreau(parent, x, y - h / 2 - 0.035, z + 0.06, l + 0.12, 0.04, 0.12); // appui
    }
    const f = { vitre, parent };
    fenetres.push(f);
    return f;
  }
  function porte(parent, x, z, h = 1.15, l = 0.68) {
    boite(l, h, 0.07, m.balsa, x, h / 2, z + 0.02, parent, 0.02);
    barreau(parent, x, h + 0.03, z + 0.05, l + 0.14, 0.06, 0.1);
    cylindre(0.025, 0.025, 0.04, m.laiton, x + l * 0.32, h * 0.48, z + 0.08, parent, 10).rotation.x = Math.PI / 2;
  }
  function enseigne(parent, x, y, z, l = 1.1) {
    enseignes.push(boite(l, 0.18, 0.03, m.cuivre, x, y, z + 0.03, parent, 0.012));
    boite(l - 0.12, 0.035, 0.035, m.platre, x, y, z + 0.05, parent, 0.01); // filet en relief, lu comme un lettrage au trait
  }
  function gouttiere(parent, c, yToit) {
    const g = cylindre(0.035, 0.035, c.l + 0.1, m.laiton, c.x, yToit - 0.02, c.z + c.p / 2 + 0.06, parent, 10);
    g.rotation.z = Math.PI / 2;
    cylindre(0.025, 0.025, yToit, m.laiton, c.x + c.l / 2 + 0.02, yToit / 2, c.z + c.p / 2 + 0.06, parent, 10);
  }


  // ---------------------------------------------------------------- Le bâtiment, niveau par niveau
  const arch = ARCHETYPES[params.archetype] || ARCHETYPES.generique;
  const c = arch.corps;
  const nbEtages = params.comptesManquants ? 1 : Math.max(1, params.etages ?? 1);
  const outils = { boite, cylindre, prisme, fenetre, porte, enseigne, barreau, m, rnd, mobile, geo };
  const niveaux = [];          // { groupe, y0, h } du rez-de-chaussée au dernier étage

  const rdc = new THREE.Group(); rdc.name = "rdc";
  groupe.add(rdc);
  arch.rdc({ ...outils, groupe: rdc, c });
  const yRdc = arch.hauteurRdc;
  niveaux.push({ groupe: rdc, y0: 0, h: yRdc });

  const parFace = Math.max(2, Math.round(c.l / (mobile ? 1.0 : 0.78)));
  for (let i = 1; i < nbEtages; i++) {
    const etage = new THREE.Group(); etage.name = `etage-${i}`;
    groupe.add(etage);
    const y = yRdc + (i - 1) * HE;
    boite(c.l, HE - 0.02, c.p, m.mur, c.x, y + HE / 2, c.z, etage, 0.035);
    boite(c.l + 0.06, 0.05, c.p + 0.06, m.mur, c.x, y + 0.02, c.z, etage, 0.02); // bandeau d'étage
    const avant = c.z + c.p / 2;
    if (arch.vitrage === "baies") {
      const larg = c.l / parFace;
      for (let k = 0; k < parFace; k++) fenetre(etage, c.x - c.l / 2 + larg * (k + 0.5), y + HE * 0.52, avant, larg * 0.86, HE * 0.6, { baie: true });
    } else {
      const pasF = c.l / parFace;
      for (let k = 0; k < parFace; k++) fenetre(etage, c.x - c.l / 2 + pasF * (k + 0.5), y + HE * 0.52, avant, Math.min(0.4, pasF * 0.52), HE * 0.5);
    }
    // Fenêtre latérale (profondeur) : une par étage, côté droit
    const vitreCote = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.36, HE * 0.45)), m.vitreEteinte);
    vitreCote.position.set(c.x + c.l / 2 + 0.006, y + HE * 0.52, c.z);
    vitreCote.rotation.y = Math.PI / 2;
    etage.add(vitreCote);
    niveaux.push({ groupe: etage, y0: y, h: HE });
  }
  const yToit = yRdc + (nbEtages - 1) * HE;

  // Toit, ou, si les comptes ne sont pas publiés, deux étages au trait pointillé (plan inachevé)
  let toit = null;
  const pointilles = [];
  if (params.comptesManquants) {
    for (let i = 0; i < 2; i++) {
      const b = new THREE.EdgesGeometry(new THREE.BoxGeometry(c.l, HE, c.p));
      b.translate(c.x, yToit + HE * (i + 0.5), c.z);
      pointilles.push(...b.attributes.position.array);
      b.dispose();
    }
  } else {
    toit = new THREE.Group(); toit.name = "toit";
    groupe.add(toit);
    arch.toit({ ...outils, groupe: toit, c, y: yToit });
    gouttiere(toit, c, yToit);
  }

  // Détails : enseigne, accessoires de l'archétype ; échafaudage si l'activité croît
  const details = new THREE.Group(); details.name = "details";
  groupe.add(details);
  enseigne(details, c.x, Math.min(arch.hauteurRdc - 0.22, 1.42), c.z + c.p / 2);
  arch.accessoires?.({ ...outils, groupe: details, c, yToit, aLiberer });

  let echafaudage = null;
  if (params.echafaudage && !params.comptesManquants) {
    echafaudage = new THREE.Group(); echafaudage.name = "echafaudage";
    groupe.add(echafaudage);
    const haut = yToit + 0.4;
    const xE = c.x + c.l / 2 + 0.3;
    for (const z of [c.z - c.p / 2 + 0.12, c.z + c.p / 2 - 0.12]) for (const dx of [0, 0.4]) cylindre(0.018, 0.018, haut, m.laiton, xE + dx, haut / 2, z, echafaudage, 6);
    for (let y = 0.6; y < haut; y += HE) {
      boite(0.46, 0.03, c.p - 0.2, m.balsa, xE + 0.2, y, c.z, echafaudage, 0.01);
      const lisse = cylindre(0.014, 0.014, c.p - 0.2, m.laiton, xE + 0.4, y + 0.35, c.z, echafaudage, 6);
      lisse.rotation.x = Math.PI / 2;
    }
  }

  // Allée en carton, de la porte vers l'avant
  const pPorte = arch.porte(c);
  const allee = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.9, 3.4)), m.allee);
  allee.rotation.x = -Math.PI / 2;
  allee.position.set(pPorte.x, 0.008, pPorte.z + 1.7);
  allee.receiveShadow = true;
  groupe.add(allee);

  // ---------------------------------------------------------------- Arbres en lichen (fil de laiton torsadé)
  const nbArbres = params.arbres?.nombre ?? 0;
  const places = arch.arbres || [[-5.0, 2.4], [4.9, 2.6], [-4.8, -2.6], [4.6, -2.7]];
  const arbres = [];
  for (let i = 0; i < nbArbres && i < places.length; i++) {
    const taille = 0.85 + rnd() * 0.3;
    arbres.push({ groupe: arbre(places[i][0], places[i][1], taille), taille });
  }
  if (params.arbres?.haie) arbres.push({ groupe: haie(-4.6, -3.4, 4.6, -3.4), taille: 1 });

  function arbre(x, z, taille) {
    const a = new THREE.Group();
    a.position.set(x, 0, z);
    a.scale.setScalar(taille);
    // Tronc : trois brins de laiton torsadés qui s'écartent en branches
    for (let b = 0; b < 3; b++) {
      const phase = (b / 3) * Math.PI * 2;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, y = t * 1.15;
        const ouvre = t > 0.62 ? (t - 0.62) * 1.4 : 0;
        const r = 0.028 + ouvre;
        pts.push(new THREE.Vector3(Math.cos(phase + t * 7) * r, y, Math.sin(phase + t * 7) * r));
      }
      const tube = new THREE.Mesh(geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 6)), m.laiton);
      tube.castShadow = true;
      a.add(tube);
    }
    // Houppier : amas de petites boules irrégulières, tons de sauge désaturés
    const n = mobile ? 90 : 190;
    const boule = geo(new THREE.IcosahedronGeometry(0.075, 1));
    const im = new THREE.InstancedMesh(boule, m.lichen, n);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      let px, py, pz;
      do { px = rnd() * 2 - 1; py = rnd() * 2 - 1; pz = rnd() * 2 - 1; } while (px * px + py * py + pz * pz > 1);
      const rr = 0.55 + 0.45 * Math.cbrt(rnd());
      const len = Math.hypot(px, py, pz) || 1;
      px = (px / len) * rr; py = (py / len) * rr; pz = (pz / len) * rr;
      e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
      const s = 0.65 + rnd() * 0.85;
      mx.compose(new THREE.Vector3(px * 0.6, 1.42 + py * 0.48, pz * 0.6), q, new THREE.Vector3(s, s * (0.8 + rnd() * 0.4), s));
      im.setMatrixAt(k, mx);
      im.setColorAt(k, col.setHex(SAUGE[Math.floor(rnd() * SAUGE.length)]).multiplyScalar(0.85 + rnd() * 0.25));
    }
    im.castShadow = true; im.receiveShadow = true;
    a.add(im);
    groupe.add(a);
    return a;
  }
  function haie(x1, z1, x2, z2) {
    const h = new THREE.Group();
    const n = mobile ? 110 : 260;
    const boule = geo(new THREE.IcosahedronGeometry(0.07, 1));
    const im = new THREE.InstancedMesh(boule, m.lichen, n);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const t = rnd();
      const s = 0.8 + rnd() * 0.7;
      mx.compose(new THREE.Vector3(x1 + (x2 - x1) * t, 0.1 + rnd() * 0.32, z1 + (z2 - z1) * t + (rnd() - 0.5) * 0.36), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      im.setMatrixAt(k, mx);
      im.setColorAt(k, col.setHex(SAUGE[Math.floor(rnd() * SAUGE.length)]));
    }
    im.castShadow = true; im.receiveShadow = true;
    h.add(im);
    groupe.add(h);
    return h;
  }


  // ---------------------------------------------------------------- Personnages blancs de maquette (immobiles)
  const personnes = [];
  const nbPers = Math.min(params.personnages ?? 1, mobile ? 4 : 8);
  const corpsGeo = geo(new THREE.CapsuleGeometry(0.075, 0.27, 4, 10));
  const teteGeo = geo(new THREE.SphereGeometry(0.062, 14, 10));
  const placesPers = [
    [pPorte.x + 0.55, pPorte.z + 0.7], [pPorte.x - 0.6, pPorte.z + 1.6], [pPorte.x + 0.2, pPorte.z + 2.4],
    [c.x - c.l / 2 - 0.5, c.z + c.p / 2 + 0.6], [c.x + c.l / 2 + 0.7, c.z + c.p / 2 + 1.2], [pPorte.x - 1.6, pPorte.z + 0.6],
    [pPorte.x + 1.7, pPorte.z + 2.0], [pPorte.x - 0.9, pPorte.z + 2.8],
  ];
  for (let i = 0; i < nbPers; i++) {
    const [px, pz] = placesPers[i];
    const p = new THREE.Group();
    const corps = new THREE.Mesh(corpsGeo, m.personnage); corps.position.y = 0.21; corps.castShadow = true;
    const tete = new THREE.Mesh(teteGeo, m.personnage); tete.position.y = 0.47; tete.castShadow = true;
    p.add(corps, tete);
    p.position.set(px, 0, pz);
    p.rotation.y = rnd() * Math.PI * 2;
    groupe.add(p);
    personnes.push(p);
  }

  poserBarreaux();

  // ---------------------------------------------------------------- Fenêtres allumées (ordre déterministe, dispersé)
  const nbAllumees = Math.min(fenetres.length, params.fenetresAllumees ?? 1);
  const ordre = fenetres.map((f) => ({ f, cle: rnd() })).sort((a, b) => a.cle - b.cle).map((x) => x.f);
  const allumees = ordre.slice(0, nbAllumees).map((f, i) => ({ vitre: f.vitre, lueur: lueurs[i % 3] }));

  // ---------------------------------------------------------------- Esquisse : arêtes des volumes et des fenêtres
  // Un seul tableau de segments, rangé du bas vers le haut : le tracé progressif dessine le bâtiment niveau par niveau.
  groupe.updateMatrixWorld(true);
  const traits = [];
  const v = new THREE.Vector3();
  const COINS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const ARETES_BOITE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  function aretes(objet) {
    objet.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const t = o.geometry.type;
      const plan = t === "PlaneGeometry" && o.material === m.vitreEteinte;
      const boite = t === "RoundedBoxGeometry" || t === "BoxGeometry";
      const haute = t === "CylinderGeometry" && o.geometry.parameters.height > 1.5; // cheminée
      if (!plan && !boite && !haute && t !== "ExtrudeGeometry") return;
      o.geometry.computeBoundingSphere();
      if (!plan && o.geometry.boundingSphere.radius < 0.2) return;
      if (boite) {
        // Les coins arrondis n'ont pas d'arête vive : on trace le parallélépipède englobant (12 arêtes nettes)
        o.geometry.computeBoundingBox();
        const { min, max } = o.geometry.boundingBox;
        const pts = COINS.map(([a, b, c]) => new THREE.Vector3(a ? max.x : min.x, b ? max.y : min.y, c ? max.z : min.z).applyMatrix4(o.matrixWorld));
        for (const [i, j] of ARETES_BOITE) traits.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        return;
      }
      const e = new THREE.EdgesGeometry(o.geometry, 32);
      const p = e.attributes.position;
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld); traits.push(v.x, v.y, v.z); }
      e.dispose();
    });
  }
  niveaux.forEach((n) => aretes(n.groupe));
  if (toit) aretes(toit);
  const finBati = traits.length;
  // Arbres en plan : un cercle au sol par arbre (symbole d'architecte)
  for (const { groupe: a } of arbres) {
    const r = 0.62, n = 28;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      traits.push(a.position.x + Math.cos(a0) * r, 0.02, a.position.z + Math.sin(a0) * r, a.position.x + Math.cos(a1) * r, 0.02, a.position.z + Math.sin(a1) * r);
    }
  }

  // ---------------------------------------------------------------- Mesures (cadrage, feuille de papier)
  const boite3 = new THREE.Box3().setFromObject(groupe, true);
  for (let k = 0; k < traits.length; k += 3) boite3.expandByPoint(v.set(traits[k], traits[k + 1], traits[k + 2]));
  const centre = boite3.getCenter(new THREE.Vector3());

  return {
    groupe, niveaux, toit, details, echafaudage, allee, arbres, personnes, allumees, enseignes,
    vitreEteinte: m.vitreEteinte,
    traits: new Float32Array(traits), traitsBati: finBati / 6, pointilles: new Float32Array(pointilles),
    boite: boite3, centre, hauteur: boite3.max.y,
    porte: new THREE.Vector3(pPorte.x, 0.7, pPorte.z + 0.2),
    dispose() {
      groupe.removeFromParent();
      geos.forEach((g) => g.dispose());
      aLiberer.forEach((x) => x.dispose());
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Archétypes : emprise du corps qui reçoit les étages, rez-de-chaussée, toit, porte, accessoires.
// Unités de maquette ; le sol est à y = 0.
// ---------------------------------------------------------------------------------------------
const porteCentre = (c) => ({ x: c.x, z: c.z + c.p / 2 });

function rdcStandard(o, h = 1.6) {
  const { boite, fenetre, porte, m, groupe, c } = o;
  boite(c.l, h, c.p, m.mur, c.x, h / 2, c.z, groupe);
  boite(c.l + 0.1, 0.12, c.p + 0.1, m.mur, c.x, 0.06, c.z, groupe, 0.03); // soubassement
  porte(groupe, c.x, c.z + c.p / 2);
  for (const dx of [-c.l / 3, c.l / 3]) fenetre(groupe, c.x + dx, h * 0.56, c.z + c.p / 2, 0.46, 0.62);
}
function toitDeuxPans({ prisme, boite, m, groupe, c, y }, haut = 1.2) {
  prisme([[-c.l / 2 - 0.18, 0], [c.l / 2 + 0.18, 0], [0, haut]], c.p + 0.24, m.balsa, c.x, y, c.z, groupe);
  boite(0.32, 0.55, 0.32, m.mur, c.x + c.l * 0.22, y + haut * 0.62, c.z - 0.3, groupe, 0.03); // souche de cheminée
}
function toitPlat({ boite, m, groupe, c, y }) {
  boite(c.l + 0.14, 0.14, c.p + 0.14, m.mur, c.x, y + 0.07, c.z, groupe, 0.03);
  boite(c.l - 0.3, 0.05, c.p - 0.3, m.balsa, c.x, y + 0.165, c.z, groupe, 0.015); // couverture en balsa
  boite(0.6, 0.3, 0.45, m.platre, c.x - c.l * 0.25, y + 0.3, c.z - 0.2, groupe, 0.03); // édicule technique
}
function velo(o, x, z, rot = 0) {
  const { m, groupe } = o;
  const v = new THREE.Group();
  for (const dx of [-0.24, 0.24]) {
    const roue = new THREE.Mesh(o.geo(new THREE.TorusGeometry(0.15, 0.012, 6, 24)), m.laiton);
    roue.position.set(dx, 0.16, 0);
    v.add(roue);
  }
  const tube = (x1, y1, x2, y2) => {
    const l = Math.hypot(x2 - x1, y2 - y1);
    const t = new THREE.Mesh(o.geo(new THREE.CylinderGeometry(0.01, 0.01, l, 5)), m.laiton);
    t.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    t.rotation.z = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
    v.add(t);
  };
  tube(-0.24, 0.16, 0, 0.17); tube(0, 0.17, 0.2, 0.34); tube(-0.24, 0.16, -0.06, 0.34); tube(-0.06, 0.34, 0.2, 0.34); tube(0.24, 0.16, 0.2, 0.36); tube(0, 0.17, -0.06, 0.34);
  v.position.set(x, 0, z);
  v.rotation.y = rot;
  v.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  groupe.add(v);
}
function banc(o, x, z, rot = 0) {
  const { boite, m, groupe } = o;
  const b = new THREE.Group();
  boite(0.8, 0.04, 0.2, m.balsa, 0, 0.2, 0, b, 0.01);
  boite(0.8, 0.16, 0.03, m.balsa, 0, 0.32, -0.09, b, 0.01);
  for (const dx of [-0.33, 0.33]) boite(0.04, 0.2, 0.18, m.platre, dx, 0.1, 0, b, 0.01);
  b.position.set(x, 0, z); b.rotation.y = rot;
  groupe.add(b);
}
function palettes(o, x, z) {
  const { boite, m, groupe } = o;
  for (let k = 0; k < 3; k++) {
    for (let s = 0; s < 4; s++) boite(0.6, 0.03, 0.1, m.balsa, x, 0.03 + k * 0.12 + 0.06, z - 0.22 + s * 0.15, groupe, 0.008);
    for (const dz of [-0.24, 0, 0.24]) boite(0.6, 0.05, 0.06, m.balsa, x, 0.025 + k * 0.12, z + dz, groupe, 0.008);
  }
  boite(0.55, 0.32, 0.5, m.platre, x + 0.75, 0.16, z, groupe, 0.03); // caisse
}
function chariot(o, x, z) {
  const { boite, cylindre, m, groupe } = o;
  const g = new THREE.Group();
  boite(0.5, 0.28, 0.36, m.platre, 0, 0.22, 0, g, 0.04);
  boite(0.12, 0.62, 0.3, m.platre, 0.3, 0.42, 0, g, 0.02);
  for (const dz of [-0.1, 0.1]) boite(0.38, 0.025, 0.05, m.laiton, 0.5, 0.06, dz, g, 0.008);
  for (const [dx, dz] of [[-0.16, -0.19], [0.16, -0.19], [-0.16, 0.19], [0.16, 0.19]]) cylindre(0.08, 0.08, 0.05, m.pneu, dx, 0.08, dz, g, 14).rotation.x = Math.PI / 2;
  g.position.set(x, 0, z); g.rotation.y = -0.5;
  groupe.add(g);
}

const ARCHETYPES = {
  // Industrie : bloc de bureaux (reçoit les étages) + atelier à sheds, cheminée qui fume, palettes, chariot
  industrie: {
    corps: { x: -2.6, z: 0.6, l: 3.0, p: 2.6 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    arbres: [[-4.9, 2.2], [4.9, 2.6], [-4.6, -2.5], [1.2, 3.6]],
    rdc(o) {
      rdcStandard(o);
      const { boite, prisme, cylindre, m, groupe } = o;
      const ax = 2.1, aw = 4.8, ah = 1.9, ad = 3.6;
      boite(aw, ah, ad, m.mur, ax, ah / 2, -0.3, groupe);
      for (let i = 0; i < 4; i++) prisme([[0, 0], [aw / 4, 0], [0, 0.7]], ad, m.balsa, ax - aw / 2 + (i * aw) / 4, ah, -0.3, groupe);
      boite(1.3, 1.35, 0.07, m.balsa, ax + 1.3, 0.7, -0.3 + ad / 2 + 0.02, groupe, 0.02); // porte sectionnelle
      for (let k = 1; k < 5; k++) o.barreau(groupe, ax + 1.3, k * 0.27, -0.3 + ad / 2 + 0.06, 1.28, 0.015, 0.02);
      for (let k = 0; k < 3; k++) o.fenetre(groupe, ax - 1.6 + k * 0.85, 1.2, -0.3 + ad / 2, 0.5, 0.45, { baie: true });
      cylindre(0.13, 0.17, 3.9, m.mur, ax + 1.9, 1.95, -1.6, groupe, 24);
      cylindre(0.16, 0.16, 0.08, m.laiton, ax + 1.9, 3.88, -1.6, groupe, 24);
    },
    toit: toitPlat,
    accessoires(o) {
      palettes(o, 1.0, 2.5);
      chariot(o, 3.4, 2.3);
    },
  },
  // Construction : bâtiment simple, grue en laiton, bétonnière, barrières
  construction: {
    corps: { x: -1.3, z: 0.4, l: 3.8, p: 2.8 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(o) { rdcStandard(o); },
    toit: toitPlat,
    accessoires(o) {
      const { boite, cylindre, m, groupe } = o;
      const gx = 3.2, gz = -1.6;
      for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) cylindre(0.02, 0.02, 6.4, m.laiton, gx + dx, 3.2, gz + dz, groupe, 6);
      for (let y = 0.4; y < 6.4; y += 0.4) boite(0.26, 0.015, 0.26, m.laiton, gx, y, gz, groupe, 0.004);
      boite(4.8, 0.08, 0.14, m.laiton, gx - 1.4, 6.4, gz, groupe, 0.02);
      boite(0.5, 0.32, 0.4, m.platre, gx + 0.9, 6.25, gz, groupe, 0.03);
      cylindre(0.006, 0.006, 2.2, m.laiton, gx - 3.4, 5.3, gz, groupe, 4);
      boite(0.3, 0.2, 0.3, m.balsa, gx - 3.4, 4.1, gz, groupe, 0.02);
      // Bétonnière
      const b = cylindre(0.22, 0.3, 0.5, m.platre, 2.6, 0.5, 2.0, groupe, 20); b.rotation.z = 0.9;
      for (const dz of [-0.2, 0.2]) cylindre(0.1, 0.1, 0.04, m.pneu, 2.75, 0.1, 2.0 + dz, groupe, 12).rotation.x = Math.PI / 2;
      // Barrières
      for (let k = 0; k < 3; k++) {
        boite(0.8, 0.05, 0.03, m.platre, -3.6 + k * 0.9, 0.42, 2.9, groupe, 0.01);
        boite(0.8, 0.05, 0.03, m.cuivre, -3.6 + k * 0.9, 0.3, 2.9, groupe, 0.01);
        for (const dx of [-0.35, 0.35]) boite(0.04, 0.48, 0.04, m.platre, -3.6 + k * 0.9 + dx, 0.24, 2.9, groupe, 0.01);
      }
    },
  },
  // Commerce : boutique à grande vitrine, auvent, logement au-dessus, vélo devant
  commerce: {
    corps: { x: 0, z: 0.3, l: 4.2, p: 3.0 }, hauteurRdc: 1.7, vitrage: "fenetres", porte: (c) => ({ x: c.x + 1.35, z: c.z + c.p / 2 }),
    rdc(o) {
      const { boite, fenetre, porte, m, groupe, c } = o;
      boite(c.l, 1.7, c.p, m.mur, c.x, 0.85, c.z, groupe);
      boite(c.l + 0.1, 0.12, c.p + 0.1, m.mur, c.x, 0.06, c.z, groupe, 0.03);
      fenetre(groupe, c.x - 0.6, 0.8, c.z + c.p / 2, 2.4, 1.05, { baie: true });
      porte(groupe, c.x + 1.35, c.z + c.p / 2, 1.2);
      const auvent = boite(3.2, 0.05, 0.85, m.vert, c.x - 0.25, 1.5, c.z + c.p / 2 + 0.38, groupe, 0.015);
      auvent.rotation.x = 0.26;
      for (let k = 0; k < 8; k++) boite(0.38, 0.1, 0.02, m.vert, c.x - 1.65 + k * 0.4, 1.36, c.z + c.p / 2 + 0.8, groupe, 0.008);
    },
    toit: (o) => toitDeuxPans(o, 1.3),
    accessoires(o) { velo(o, 1.0, 2.6, 0.25); banc(o, -1.9, 2.5); },
  },
  // Restauration : maison de ville, terrasse avec tables et parasols
  restauration: {
    corps: { x: -0.6, z: -0.5, l: 4.0, p: 2.8 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(o) { rdcStandard(o); },
    toit: (o) => toitDeuxPans(o, 1.2),
    accessoires(o) {
      const { boite, cylindre, m, groupe, c } = o;
      boite(5.2, 0.05, 2.0, m.balsa, c.x + 0.6, 0.03, c.z + c.p / 2 + 1.25, groupe, 0.01);
      for (const dx of [-1.3, 1.1, 2.6]) {
        const tx = c.x + 0.6 + dx, tz = c.z + c.p / 2 + 1.25;
        cylindre(0.28, 0.28, 0.04, m.platre, tx, 0.42, tz, groupe, 24);
        cylindre(0.02, 0.02, 1.25, m.laiton, tx, 0.65, tz, groupe, 6);
        const toile = new THREE.Mesh(o.geo(new THREE.ConeGeometry(0.72, 0.26, 16, 1, true)), m.platre);
        toile.position.set(tx, 1.32, tz); toile.castShadow = true;
        groupe.add(toile);
        for (const a of [0, Math.PI]) boite(0.16, 0.24, 0.16, m.balsa, tx + Math.cos(a) * 0.42, 0.12, tz + Math.sin(a) * 0.42, groupe, 0.02);
      }
    },
  },
  // Logistique : entrepôt à quais + bureaux, camion de livraison
  logistique: {
    corps: { x: -3.6, z: 0.6, l: 2.4, p: 2.4 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    arbres: [[-4.9, 2.6], [4.9, 2.9], [-4.8, -2.7], [0, 3.6]],
    rdc(o) {
      rdcStandard(o);
      const { boite, m, groupe } = o;
      const ex = 1.4, el = 6.4, eh = 2.0, ep = 3.8;
      boite(el, eh, ep, m.mur, ex, eh / 2, -0.3, groupe);
      for (let i = 0; i < 4; i++) {
        const qx = ex - el / 2 + 1.0 + i * 1.45;
        boite(0.95, 1.15, 0.06, m.balsa, qx, 0.75, -0.3 + ep / 2 + 0.02, groupe, 0.02);
        boite(1.1, 0.28, 0.45, m.platre, qx, 0.14, -0.3 + ep / 2 + 0.24, groupe, 0.02);
      }
    },
    toit: toitPlat,
    accessoires(o) {
      const { boite, cylindre, m, groupe } = o;
      const t = new THREE.Group();
      boite(0.75, 0.75, 0.9, m.platre, 1.35, 0.55, 0, t, 0.08);            // cabine
      boite(0.05, 0.3, 0.7, m.vitreEteinte, 1.73, 0.72, 0, t, 0.01);         // pare-brise
      boite(2.1, 1.05, 0.95, m.platre, -0.15, 0.72, 0, t, 0.05);           // caisse
      boite(2.2, 0.08, 0.98, m.balsa, -0.1, 0.17, 0, t, 0.02);
      for (const dx of [-0.8, -0.35, 1.3]) for (const dz of [-0.42, 0.42]) cylindre(0.17, 0.17, 0.12, m.pneu, dx, 0.17, dz, t, 18).rotation.x = Math.PI / 2;
      t.position.set(2.2, 0, 2.8); t.rotation.y = 0.12;
      t.traverse((x) => { if (x.isMesh) x.castShadow = true; });
      groupe.add(t);
    },
  },
  // Agriculture : corps de ferme + grange en balsa, tracteur
  ferme: {
    corps: { x: -2.4, z: 0.4, l: 3.4, p: 2.6 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(o) {
      rdcStandard(o);
      const { boite, prisme, m, groupe } = o;
      const gx = 2.3, gl = 3.8, gh = 2.2, gp = 3.4;
      boite(gl, gh, gp, m.mur, gx, gh / 2, -0.5, groupe);
      prisme([[-gl / 2 - 0.2, 0], [gl / 2 + 0.2, 0], [0, 1.5]], gp + 0.2, m.balsa, gx, gh, -0.5, groupe);
      boite(1.5, 1.8, 0.07, m.balsa, gx, 0.9, -0.5 + gp / 2 + 0.02, groupe, 0.02);
      for (let k = 1; k < 6; k++) o.barreau(groupe, gx - 0.75 + k * 0.25, 0.9, -0.5 + gp / 2 + 0.07, 0.015, 1.76, 0.02);
    },
    toit: (o) => toitDeuxPans(o, 1.2),
    accessoires(o) {
      const { boite, cylindre, m, groupe } = o;
      const t = new THREE.Group();
      boite(1.0, 0.36, 0.5, m.platre, 0, 0.42, 0, t, 0.06);
      boite(0.5, 0.55, 0.5, m.platre, -0.28, 0.85, 0, t, 0.04);
      boite(0.46, 0.04, 0.54, m.balsa, -0.28, 1.14, 0, t, 0.01);
      cylindre(0.03, 0.03, 0.4, m.laiton, 0.32, 0.78, 0.12, t, 6);
      for (const dz of [-0.33, 0.33]) {
        cylindre(0.34, 0.34, 0.16, m.pneu, -0.32, 0.34, dz, t, 22).rotation.x = Math.PI / 2;
        cylindre(0.19, 0.19, 0.12, m.pneu, 0.38, 0.19, dz, t, 18).rotation.x = Math.PI / 2;
      }
      t.position.set(1.4, 0, 2.6); t.rotation.y = -0.35;
      t.traverse((x) => { if (x.isMesh) x.castShadow = true; });
      groupe.add(t);
    },
  },
  // Services (J, K, M, N) : immeuble de bureaux à baies vitrées, vélos, banc
  bureaux: {
    corps: { x: -0.3, z: 0.1, l: 4.4, p: 3.2 }, hauteurRdc: 1.5, vitrage: "baies", porte: porteCentre,
    rdc(o) {
      const { boite, fenetre, porte, m, groupe, c } = o;
      boite(c.l, 1.5, c.p, m.mur, c.x, 0.75, c.z, groupe);
      boite(c.l + 0.1, 0.12, c.p + 0.1, m.mur, c.x, 0.06, c.z, groupe, 0.03);
      for (const dx of [-c.l / 3, c.l / 3]) fenetre(groupe, c.x + dx, 0.66, c.z + c.p / 2, c.l / 3 - 0.25, 0.95, { baie: true });
      porte(groupe, c.x, c.z + c.p / 2, 1.1, 0.8);
      boite(c.l + 0.5, 0.07, 0.95, m.platre, c.x, 1.52, c.z + c.p / 2 + 0.42, groupe, 0.02); // marquise
    },
    toit: toitPlat,
    accessoires(o) { velo(o, 2.2, 2.6, 0.1); velo(o, 2.75, 2.65, 0.1); banc(o, -2.0, 2.6); },
  },
  // Santé : bâtiment horizontal avec patio, banc, enseigne
  sante: {
    corps: { x: -2.1, z: 0.7, l: 3.4, p: 2.4 }, hauteurRdc: 1.5, vitrage: "baies", porte: porteCentre,
    rdc(o) {
      rdcStandard(o, 1.5);
      const { boite, m, groupe } = o;
      const px = 2.2, pz = -0.3, pl = 3.8, pp = 4.0, h = 1.15, e = 0.85;
      boite(pl, h, e, m.mur, px, h / 2, pz - pp / 2 + e / 2, groupe);
      boite(pl, h, e, m.mur, px, h / 2, pz + pp / 2 - e / 2, groupe);
      boite(e, h, pp - 2 * e, m.mur, px + pl / 2 - e / 2, h / 2, pz, groupe);
      for (let k = 0; k < 3; k++) o.fenetre(groupe, px - 1.3 + k * 1.0, 0.65, pz + pp / 2, 0.7, 0.5, { baie: true });
    },
    toit: toitPlat,
    accessoires(o) { banc(o, 0.4, 2.6); },
  },
  generique: {
    corps: { x: 0, z: 0.2, l: 4.0, p: 2.8 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(o) { rdcStandard(o); },
    toit: toitPlat,
    accessoires(o) { banc(o, 1.8, 2.4); },
  },
};
