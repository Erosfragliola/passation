// Le diorama sous la cloche : construit en code à partir des paramètres de regles.js (étages = CA, fenêtres
// allumées = effectif, arbres = marge, archétype = NAF, échafaudage = croissance, personnages = effectif).
// Finition « maquette d'architecte » : volumes arrondis en plâtre, toitures et menuiseries en balsa, vitrages
// acryliques, personnages blancs, arbres en lichen sur fil de laiton.
//
// creerDiorama(params, m, options) → { groupe, pistes, fenetresAllumees, personnes, animer(dt, t), demonter(p), dispose }
// pistes : [{ debut, fin, appliquer(p) }] jouées par la chorégraphie (p de 0 à 1).
import * as THREE from "/vendor/three.module.min.js";
import { RoundedBoxGeometry } from "/vendor/rendu3d.js";
import { spriteDoux } from "/js/cloche/materiaux.js";

const HE = 0.9;              // hauteur d'étage (unités de maquette)
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
/** Chute avec micro-rebond : accélère, touche, rebondit à peine. */
const chute = (p) => (p < 0.72 ? Math.pow(p / 0.72, 2) : 1 - Math.sin(((p - 0.72) / 0.28) * Math.PI) * 0.035);
const SAUGE = [0x8a9474, 0x7b8766, 0x9ba184, 0x6f7a5c, 0xa6aa8c, 0x84906c];

/** Générateur pseudo-aléatoire à graine (même entreprise → même maquette). */
function alea(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

export function creerDiorama(params, m, { mobile = false, T, graine = 7 } = {}) {
  const rnd = alea(graine);
  const groupe = new THREE.Group();
  const pistes = [];
  const geos = [];
  const geo = (g) => { geos.push(g); return g; };
  const aLiberer = [];
  const pieces = [];           // groupes de premier niveau (pour le démontage)
  const fenetres = [];         // { vitre, parent }
  const personnes = [];
  const animables = [];        // fonctions (dt, t) appelées à chaque image

  // Matériaux de fenêtres allumées : 3 variantes, scintillement lent et décalé
  const lueurs = [0, 1, 2].map((i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe6bd, emissive: [0xffb467, 0xffbe78, 0xffa95a][i], emissiveIntensity: 2.6, roughness: 0.55 });
    aLiberer.push(mat);
    return mat;
  });
  animables.push((dt, t) => lueurs.forEach((mat, i) => {
    mat.emissiveIntensity = 2.6 * (1 + 0.05 * Math.sin(t * (0.7 + i * 0.23) + i * 2) + 0.03 * Math.sin(t * 2.3 + i));
  }));

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
    boite(l, 0.18, 0.03, m.cuivre, x, y, z + 0.03, parent, 0.012);
    boite(l - 0.12, 0.035, 0.035, m.platre, x, y, z + 0.05, parent, 0.01); // filet en relief, lu comme un lettrage au trait
  }
  function gouttiere(parent, c, yToit) {
    const g = cylindre(0.035, 0.035, c.l + 0.1, m.laiton, c.x, yToit - 0.02, c.z + c.p / 2 + 0.06, parent, 10);
    g.rotation.z = Math.PI / 2;
    cylindre(0.025, 0.025, yToit, m.laiton, c.x + c.l / 2 + 0.02, yToit / 2, c.z + c.p / 2 + 0.06, parent, 10);
  }

  // ---------------------------------------------------------------- Pistes d'animation
  /** Descend du haut de la cloche et se pose avec un micro-rebond. */
  function descendre(obj, debut, fin, hauteur = 7) {
    const y0 = obj.position.y;
    pistes.push({ debut, fin, appliquer: (p) => { obj.visible = p > 0; obj.position.y = y0 + hauteur * (1 - chute(p)); } });
  }
  function grandir(obj, debut, fin) {
    pistes.push({ debut, fin, appliquer: (p) => { obj.visible = p > 0; obj.scale.setScalar(Math.max(0.0001, easeOutBack(p))); } });
  }
  function piece(nomPiece) {
    const g = new THREE.Group();
    g.name = nomPiece;
    groupe.add(g);
    pieces.push(g);
    return g;
  }

  // ---------------------------------------------------------------- Le bâtiment
  const arch = ARCHETYPES[params.archetype] || ARCHETYPES.generique;
  const c = arch.corps;
  const nbEtages = params.comptesManquants ? 1 : (params.etages ?? 1);
  const outils = { boite, cylindre, prisme, fenetre, porte, enseigne, barreau, m, rnd, mobile, geo };

  const rdc = piece("rdc");
  arch.rdc({ ...outils, groupe: rdc, c });
  descendre(rdc, T.construction[0], T.construction[0] + 0.55);

  const yRdc = arch.hauteurRdc;
  const parFace = Math.max(2, Math.round(c.l / (mobile ? 1.0 : 0.78)));
  const tEtages = T.construction[0] + 0.55;
  const tToit = T.construction[1] - 0.75;
  const pas = nbEtages > 1 ? Math.min(0.5, (tToit - tEtages) / (nbEtages - 1)) : 0;
  for (let i = 1; i < nbEtages; i++) {
    const etage = piece(`etage-${i}`);
    const y = yRdc + (i - 1) * HE;
    boite(c.l, HE - 0.02, c.p, m.platre, c.x, y + HE / 2, c.z, etage, 0.035);
    boite(c.l + 0.06, 0.05, c.p + 0.06, m.platre, c.x, y + 0.02, c.z, etage, 0.02); // bandeau d'étage
    const avant = c.z + c.p / 2;
    if (arch.vitrage === "baies") {
      const larg = c.l / parFace;
      for (let k = 0; k < parFace; k++) fenetre(etage, c.x - c.l / 2 + larg * (k + 0.5), y + HE * 0.52, avant, larg * 0.86, HE * 0.6, { baie: true });
    } else {
      const pasF = c.l / parFace;
      for (let k = 0; k < parFace; k++) fenetre(etage, c.x - c.l / 2 + pasF * (k + 0.5), y + HE * 0.52, avant, Math.min(0.4, pasF * 0.52), HE * 0.5);
    }
    // Fenêtres latérales (profondeur) : une par étage, côté droit
    const vitreCote = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.36, HE * 0.45)), m.vitreEteinte);
    vitreCote.position.set(c.x + c.l / 2 + 0.006, y + HE * 0.52, c.z);
    vitreCote.rotation.y = Math.PI / 2;
    etage.add(vitreCote);
    const debut = tEtages + (i - 1) * pas;
    descendre(etage, debut, debut + 0.45, 5.5);
  }
  const yToit = yRdc + (nbEtages - 1) * HE;

  if (params.comptesManquants) {
    // Comptes non publiés : deux étages au trait pointillé (plan inachevé)
    const mat = new THREE.LineDashedMaterial({ color: 0xe9c9a4, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.85 });
    aLiberer.push(mat);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.LineSegments(geo(new THREE.EdgesGeometry(new THREE.BoxGeometry(c.l, HE, c.p))), mat);
      l.computeLineDistances();
      l.position.set(c.x, yToit + HE * (i + 0.5), c.z);
      groupe.add(l);
      pieces.push(l);
      pistes.push({ debut: tToit + i * 0.25, fin: tToit + 0.4 + i * 0.25, appliquer: (p) => { l.visible = p > 0; mat.opacity = 0.85 * p; } });
    }
  } else {
    const toit = piece("toit");
    arch.toit({ ...outils, groupe: toit, c, y: yToit });
    gouttiere(toit, c, yToit);
    descendre(toit, tToit, tToit + 0.5, 4.5);
  }

  // Détails : enseigne, accessoires de l'archétype, échafaudage
  const details = piece("details");
  enseigne(details, c.x, Math.min(arch.hauteurRdc - 0.22, 1.42), c.z + c.p / 2);
  arch.accessoires?.({ ...outils, groupe: details, c, yToit, ajouterAnimation: (f) => animables.push(f), aLiberer });
  const tDetails = T.construction[1] - 0.3;
  descendre(details, tDetails, tDetails + 0.5, 3);

  if (params.echafaudage && !params.comptesManquants) {
    const ech = piece("echafaudage");
    const haut = yToit + 0.4;
    const xE = c.x + c.l / 2 + 0.3;
    for (const z of [c.z - c.p / 2 + 0.12, c.z + c.p / 2 - 0.12]) for (const dx of [0, 0.4]) cylindre(0.018, 0.018, haut, m.laiton, xE + dx, haut / 2, z, ech, 6);
    for (let y = 0.6; y < haut; y += HE) {
      boite(0.46, 0.03, c.p - 0.2, m.balsa, xE + 0.2, y, c.z, ech, 0.01);
      const lisse = cylindre(0.014, 0.014, c.p - 0.2, m.laiton, xE + 0.4, y + 0.35, c.z, ech, 6);
      lisse.rotation.x = Math.PI / 2;
    }
    descendre(ech, tDetails + 0.1, tDetails + 0.6, 3);
  }

  // Allée en carton, de la porte au bord du plateau
  const pPorte = arch.porte(c);
  const allee = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.9, 6)), m.allee);
  allee.rotation.x = -Math.PI / 2;
  allee.position.set(pPorte.x, 0.006, pPorte.z + 3);
  allee.receiveShadow = true;
  groupe.add(allee);

  // ---------------------------------------------------------------- Arbres en lichen (fil de laiton torsadé)
  const nbArbres = params.arbres?.nombre ?? 0;
  const places = arch.arbres || [[-5.0, 2.4], [4.9, 2.6], [-4.8, -2.6], [4.6, -2.7]];
  for (let i = 0; i < nbArbres && i < places.length; i++) {
    const a = arbre(places[i][0], places[i][1], 0.85 + rnd() * 0.3);
    grandir(a, T.vie[0] + 0.1 + i * 0.18, T.vie[0] + 0.8 + i * 0.18);
  }
  if (params.arbres?.haie) {
    const h = haie(-4.6, -3.4, 4.6, -3.4);
    grandir(h, T.vie[0] + 0.3, T.vie[0] + 0.9);
  }
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
    pieces.push(a);
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
    pieces.push(h);
    return h;
  }

  // ---------------------------------------------------------------- Personnages blancs de maquette
  const nbPers = Math.min(params.personnages ?? 1, mobile ? 4 : 8);
  const corpsGeo = geo(new THREE.CapsuleGeometry(0.075, 0.27, 4, 10));
  const teteGeo = geo(new THREE.SphereGeometry(0.062, 14, 10));
  const placesPers = [
    [pPorte.x + 0.55, pPorte.z + 0.7, 1], [pPorte.x - 0.6, pPorte.z + 1.6, 1], [pPorte.x + 0.2, pPorte.z + 2.4, 0],
    [c.x - c.l / 2 - 0.5, c.z + c.p / 2 + 0.6, 1], [c.x + c.l / 2 + 0.7, c.z + c.p / 2 + 1.2, 0], [pPorte.x - 1.6, pPorte.z + 0.6, 0],
    [pPorte.x + 1.7, pPorte.z + 2.0, 1], [pPorte.x - 0.9, pPorte.z + 2.8, 0],
  ];
  for (let i = 0; i < nbPers; i++) {
    const [px, pz, marche] = placesPers[i];
    const p = new THREE.Group();
    const corps = new THREE.Mesh(corpsGeo, m.personnage); corps.position.y = 0.21; corps.castShadow = true;
    const tete = new THREE.Mesh(teteGeo, m.personnage); tete.position.y = 0.47; tete.castShadow = true;
    p.add(corps, tete);
    p.position.set(px, 0, pz);
    p.rotation.y = rnd() * Math.PI * 2;
    groupe.add(p);
    pieces.push(p);
    personnes.push(p);
    const d = T.vie[0] + i * 0.12;
    pistes.push({ debut: d, fin: d + 0.45, appliquer: (k) => { p.visible = k > 0; p.position.y = 1.2 * (1 - chute(k)); } });
    if (marche && !mobile) {
      const depart = new THREE.Vector3(px, 0, pz), arrivee = new THREE.Vector3(px + (rnd() > 0.5 ? 1 : -1) * 0.9, 0, pz + 0.3);
      const vitesse = 0.08 + rnd() * 0.05, phase = rnd() * 10;
      p.userData.marche = (t) => {
        const k = 0.5 - 0.5 * Math.cos((t * vitesse + phase) * Math.PI);
        p.position.x = depart.x + (arrivee.x - depart.x) * k;
        p.position.z = depart.z + (arrivee.z - depart.z) * k;
        const sens = Math.sin((t * vitesse + phase) * Math.PI) >= 0 ? 1 : -1;
        p.rotation.y = Math.atan2((arrivee.x - depart.x) * sens, (arrivee.z - depart.z) * sens);
      };
    }
  }

  poserBarreaux();

  // ---------------------------------------------------------------- Fenêtres qui s'allument (ordre déterministe, dispersé)
  const total = fenetres.length;
  const nbAllumees = Math.min(total, params.fenetresAllumees ?? 1);
  const ordre = fenetres.map((f) => ({ f, cle: rnd() })).sort((a, b) => a.cle - b.cle).map((x) => x.f);
  const allumees = ordre.slice(0, nbAllumees);
  const pasLueur = (T.vie[1] - T.vie[0] - 0.4) / Math.max(1, nbAllumees);
  allumees.forEach((f, i) => {
    const debut = T.vie[0] + 0.4 + i * pasLueur * (0.7 + rnd() * 0.6);
    f.vitre.userData.allumee = true;
    pistes.push({ debut, fin: debut + 0.08, appliquer: (p) => { f.vitre.material = p >= 1 ? lueurs[i % 3] : m.vitreEteinte; } });
  });

  // ---------------------------------------------------------------- Mise à l'échelle sous la cloche
  pistes.forEach((a) => a.appliquer(1));
  groupe.updateMatrixWorld(true);
  const boiteTotale = new THREE.Box3().setFromObject(groupe, true);
  // L'allée dépasse volontairement : on mesure sans elle
  allee.visible = false;
  const boiteBati = new THREE.Box3().setFromObject(groupe, true);
  allee.visible = true;
  const centre = boiteBati.getCenter(new THREE.Vector3());
  let rayon = 0;
  for (const x of [boiteBati.min.x, boiteBati.max.x]) for (const z of [boiteBati.min.z, boiteBati.max.z]) rayon = Math.max(rayon, Math.hypot(x - centre.x, z - centre.z));
  const hauteur = boiteBati.max.y + (params.comptesManquants ? 0 : 0.1);
  pistes.forEach((a) => a.appliquer(0));

  // Lueur intérieure : 3 petites lampes devant les 3 premières fenêtres allumées (desktop)
  const lampes = [];
  if (!mobile) {
    for (const f of allumees.slice(0, 3)) {
      const l = new THREE.PointLight(0xffb36a, 0, 2.2, 2);
      f.vitre.getWorldPosition(l.position);
      l.position.z += 0.35;
      groupe.add(l);
      lampes.push({ l, f });
    }
  }

  return {
    groupe, pistes, personnes, pieces, boiteTotale,
    porte: new THREE.Vector3(pPorte.x, 0.7, pPorte.z + 0.2),
    fenetresAllumees: allumees.map((f) => f.vitre),
    centre, rayon, hauteur,
    animer(dt, t) {
      animables.forEach((f) => f(dt, t));
      for (const p of personnes) if (p.visible && p.userData.marche && p.position.y < 0.001) p.userData.marche(t);
      for (const { l, f } of lampes) l.intensity = f.vitre.material === m.vitreEteinte ? 0 : 1.6 * lueurs[0].emissiveIntensity / 2.6;
    },
    /** Démontage en éclats : chaque pièce s'enfonce dans le socle en tournant un peu. */
    demonter(p) {
      pieces.forEach((g, i) => {
        if (!g.userData.base) g.userData.base = { y: g.position.y, rx: g.rotation.x, rz: g.rotation.z };
        const d = Math.min(1, Math.max(0, p * 1.4 - (i / pieces.length) * 0.4));
        const e = d * d;
        g.position.y = g.userData.base.y - e * 3;
        g.rotation.x = g.userData.base.rx + e * (i % 2 ? 0.4 : -0.3);
        g.rotation.z = g.userData.base.rz + e * (i % 3 ? -0.25 : 0.3);
      });
    },
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
  boite(c.l, h, c.p, m.platre, c.x, h / 2, c.z, groupe);
  boite(c.l + 0.1, 0.12, c.p + 0.1, m.platre, c.x, 0.06, c.z, groupe, 0.03); // soubassement
  porte(groupe, c.x, c.z + c.p / 2);
  for (const dx of [-c.l / 3, c.l / 3]) fenetre(groupe, c.x + dx, h * 0.56, c.z + c.p / 2, 0.46, 0.62);
}
function toitDeuxPans({ prisme, boite, m, groupe, c, y }, haut = 1.2) {
  prisme([[-c.l / 2 - 0.18, 0], [c.l / 2 + 0.18, 0], [0, haut]], c.p + 0.24, m.balsa, c.x, y, c.z, groupe);
  boite(0.32, 0.55, 0.32, m.platre, c.x + c.l * 0.22, y + haut * 0.62, c.z - 0.3, groupe, 0.03); // souche de cheminée
}
function toitPlat({ boite, m, groupe, c, y }) {
  boite(c.l + 0.14, 0.14, c.p + 0.14, m.platre, c.x, y + 0.07, c.z, groupe, 0.03);
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
      boite(aw, ah, ad, m.platre, ax, ah / 2, -0.3, groupe);
      for (let i = 0; i < 4; i++) prisme([[0, 0], [aw / 4, 0], [0, 0.7]], ad, m.balsa, ax - aw / 2 + (i * aw) / 4, ah, -0.3, groupe);
      boite(1.3, 1.35, 0.07, m.balsa, ax + 1.3, 0.7, -0.3 + ad / 2 + 0.02, groupe, 0.02); // porte sectionnelle
      for (let k = 1; k < 5; k++) o.barreau(groupe, ax + 1.3, k * 0.27, -0.3 + ad / 2 + 0.06, 1.28, 0.015, 0.02);
      for (let k = 0; k < 3; k++) o.fenetre(groupe, ax - 1.6 + k * 0.85, 1.2, -0.3 + ad / 2, 0.5, 0.45, { baie: true });
      cylindre(0.13, 0.17, 3.9, m.platre, ax + 1.9, 1.95, -1.6, groupe, 24);
      cylindre(0.16, 0.16, 0.08, m.laiton, ax + 1.9, 3.88, -1.6, groupe, 24);
    },
    toit: toitPlat,
    accessoires(o) {
      palettes(o, 1.0, 2.5);
      chariot(o, 3.4, 2.3);
      // Fumée douce : sprites qui montent lentement et se dissipent
      const { groupe, ajouterAnimation, aLiberer, mobile } = o;
      const n = mobile ? 14 : 28;
      const tex = spriteDoux(); aLiberer.push(tex);
      const mats = [];
      const sprites = [];
      for (let i = 0; i < n; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, color: 0xe8dccb, transparent: true, opacity: 0, depthWrite: false });
        aLiberer.push(mat); mats.push(mat);
        const s = new THREE.Sprite(mat);
        s.userData.age = i / n;
        groupe.add(s);
        sprites.push(s);
      }
      const origine = new THREE.Vector3(2.1 + 1.9, 4.0, -1.6);
      ajouterAnimation((dt) => {
        for (const s of sprites) {
          s.userData.age = (s.userData.age + dt * 0.07) % 1;
          const a = s.userData.age;
          s.position.set(origine.x + Math.sin(a * 5 + s.id) * 0.25 * a - a * 0.6, origine.y + a * 2.6, origine.z + Math.cos(a * 4 + s.id) * 0.2 * a);
          s.scale.setScalar(0.25 + a * 1.1);
          s.material.opacity = Math.sin(a * Math.PI) * 0.22;
        }
      });
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
      boite(c.l, 1.7, c.p, m.platre, c.x, 0.85, c.z, groupe);
      boite(c.l + 0.1, 0.12, c.p + 0.1, m.platre, c.x, 0.06, c.z, groupe, 0.03);
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
      boite(el, eh, ep, m.platre, ex, eh / 2, -0.3, groupe);
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
      boite(gl, gh, gp, m.platre, gx, gh / 2, -0.5, groupe);
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
      boite(c.l, 1.5, c.p, m.platre, c.x, 0.75, c.z, groupe);
      boite(c.l + 0.1, 0.12, c.p + 0.1, m.platre, c.x, 0.06, c.z, groupe, 0.03);
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
      boite(pl, h, e, m.platre, px, h / 2, pz - pp / 2 + e / 2, groupe);
      boite(pl, h, e, m.platre, px, h / 2, pz + pp / 2 - e / 2, groupe);
      boite(e, h, pp - 2 * e, m.platre, px + pl / 2 - e / 2, h / 2, pz, groupe);
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
