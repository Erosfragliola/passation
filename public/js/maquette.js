// « Votre maquette » : construit en code la maquette 3D d'une entreprise à partir de ses données.
// construireMaquette(params, options) renvoie { groupe, animations, temoin, dispose }.
// - params : résultat de parametresMaquette() (regles.js), + nom et depuis.
// - animations : liste de pistes { debut, fin, appliquer(p) } que scene.js joue (p de 0 à 1) ou termine d'un coup.
// Langage commun : volumes crème mats, socle en noyer, arêtes fines pierre, lumière chaude.

import * as THREE from "/vendor/three.module.min.js";

const C = {
  platre: 0xf3eadb, noyer: 0x5a3e2b, noyerClair: 0x6e4c35, trait: 0x8a7f70,
  vitreEteinte: 0x3a3128, vitreAllumee: 0xf0d6a8, lueur: 0xe8a35a, vert: 0x1e3a2e,
  cuivre: 0xa8653a, sable: 0xeadfcb, arbre: 0xd9cbb0,
};

const HAUTEUR_ETAGE = 0.9;
const BASE = 0.35; // épaisseur du socle

const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p) => { const c = 1.35; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

/** Fabrique de matériaux : tout ce qui est créé ici est libéré par dispose(). */
function atelier() {
  const aLiberer = [];
  const garder = (x) => { aLiberer.push(x); return x; };
  const m = {
    platre: garder(new THREE.MeshStandardMaterial({ color: C.platre, roughness: 0.92 })),
    noyer: garder(new THREE.MeshStandardMaterial({ color: C.noyer, roughness: 0.65 })),
    sable: garder(new THREE.MeshStandardMaterial({ color: C.sable, roughness: 0.95 })),
    vert: garder(new THREE.MeshStandardMaterial({ color: C.vert, roughness: 0.6 })),
    arbre: garder(new THREE.MeshStandardMaterial({ color: C.arbre, roughness: 0.95 })),
    tronc: garder(new THREE.MeshStandardMaterial({ color: C.noyerClair, roughness: 0.8 })),
    vitreEteinte: garder(new THREE.MeshStandardMaterial({ color: C.vitreEteinte, roughness: 0.35, metalness: 0.1 })),
    vitrine: garder(new THREE.MeshStandardMaterial({ color: 0xcfc3ad, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55 })),
    trait: garder(new THREE.LineBasicMaterial({ color: C.trait, transparent: true, opacity: 0.55 })),
    pointilles: garder(new THREE.LineDashedMaterial({ color: 0xeadfcb, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.8 })),
    cuivre: garder(new THREE.MeshStandardMaterial({ color: C.cuivre, roughness: 0.28, metalness: 0.75, emissive: 0x3a1a08 })),
  };
  return { m, garder, liberer: () => aLiberer.forEach((x) => x.dispose()) };
}

export function construireMaquette(params, { mobile = false } = {}) {
  const { m, garder, liberer } = atelier();
  const groupe = new THREE.Group();
  const animations = [];
  const geos = [];
  const geo = (g) => { geos.push(g); return g; };

  /** Volume plein avec arêtes dessinées. */
  function volume(g, mat, x, y, z, parent = groupe) {
    geo(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const aretes = new THREE.LineSegments(geo(new THREE.EdgesGeometry(g, 20)), m.trait);
    mesh.add(aretes);
    parent.add(mesh);
    return mesh;
  }
  function prisme(points, profondeur) {
    const forme = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(forme, { depth: profondeur, bevelEnabled: false });
    g.translate(0, 0, -profondeur / 2);
    return g;
  }
  /** Piste d'animation : un objet qui « pousse » depuis le sol (échelle verticale). */
  function pousser(obj, debut, fin, { rebond = false, depuisY = null } = {}) {
    const y0 = obj.position.y;
    animations.push({ debut, fin, appliquer: (p) => {
      const e = rebond ? easeOutBack(p) : easeOut(p);
      obj.scale.y = Math.max(0.0001, e);
      if (depuisY != null) obj.position.y = depuisY + (y0 - depuisY) * Math.min(1, e);
      obj.visible = p > 0;
    } });
  }

  // ---------------------------------------------------------------- Socle et pierre de fondation
  const L = 12, P = 8;
  const socle = volume(new THREE.BoxGeometry(L, BASE, P), m.noyer, 0, BASE / 2, 0);
  animations.push({ debut: 0.6, fin: 1.2, appliquer: (p) => { const e = easeOut(p); socle.scale.set(0.92 + 0.08 * e, 1, 0.92 + 0.08 * e); socle.visible = p > 0; } });

  if (params.depuis) {
    const toile = document.createElement("canvas");
    toile.width = 512; toile.height = 192;
    const ctx = toile.getContext("2d");
    ctx.fillStyle = "#F3EADB"; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = "#8A7F70"; ctx.lineWidth = 4; ctx.strokeRect(14, 14, 484, 164);
    ctx.fillStyle = "#231E18"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '500 30px "Geist Mono", monospace';
    ctx.fillText("D E P U I S", 256, 62);
    ctx.font = '500 80px "Geist", sans-serif';
    ctx.fillText(String(params.depuis), 256, 128);
    const tex = garder(new THREE.CanvasTexture(toile));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const matPierre = garder(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xe8a35a, emissiveIntensity: 0 }));
    const matsPierre = [m.platre, m.platre, matPierre, m.platre, m.platre, m.platre];
    const pierre = new THREE.Mesh(geo(new THREE.BoxGeometry(2.1, 0.08, 0.8)), matsPierre);
    pierre.position.set(-L / 2 + 1.55, BASE + 0.04, P / 2 - 0.7);
    pierre.receiveShadow = true;
    groupe.add(pierre);
    animations.push({ debut: 0.8, fin: 1.4, appliquer: (p) => { pierre.visible = p > 0; matPierre.emissiveIntensity = 0.45 * Math.sin(Math.PI * p); } });
  }

  // ---------------------------------------------------------------- Corps principal et étages
  const arch = ARCHETYPES[params.archetype] || ARCHETYPES.generique;
  const corps = arch.corps; // { x, z, l, p } emprise du bâtiment qui reçoit les étages
  const etagesReels = params.etages ?? 1;
  const nbEtages = params.comptesManquants ? 1 : etagesReels;
  const fenetresParFace = mobile ? Math.max(2, Math.round(corps.l / 1.1)) : Math.max(2, Math.round(corps.l / 0.75));
  const fenetres = [];

  // Rez-de-chaussée propre à l'archétype
  const rdc = new THREE.Group();
  groupe.add(rdc);
  const fenetreRdc = (x, y, z, l, h) => fenetres.push(volumeFenetre(rdc, x, y, z, l, h));
  arch.rdc({ volume, prisme, m, groupe: rdc, corps, geo, BASE, fenetre: fenetreRdc });
  pousser(rdc, 1.2, 1.7, { rebond: true });

  // Étages supérieurs
  const empile = new THREE.Group();
  groupe.add(empile);
  const yRdc = BASE + arch.hauteurRdc;
  const dureeEtage = nbEtages > 1 ? Math.min(0.45, 1.8 / (nbEtages - 1)) : 0;
  for (let i = 1; i < nbEtages; i++) {
    const etage = new THREE.Group();
    const y = yRdc + (i - 1) * HAUTEUR_ETAGE;
    volume(new THREE.BoxGeometry(corps.l, HAUTEUR_ETAGE, corps.p), m.platre, corps.x, y + HAUTEUR_ETAGE / 2, corps.z, etage);
    poserFenetres(etage, y + HAUTEUR_ETAGE * 0.52, arch.vitrage);
    etage.position.y = 0;
    empile.add(etage);
    const debut = 1.7 + (i - 1) * dureeEtage;
    pousserEtage(etage, y, debut, debut + 0.4);
  }
  const yToit = yRdc + (nbEtages - 1) * HAUTEUR_ETAGE;

  // Étages en pointillés : comptes non publiés, plan inachevé
  if (params.comptesManquants) {
    for (let i = 0; i < 2; i++) {
      const g = geo(new THREE.EdgesGeometry(new THREE.BoxGeometry(corps.l, HAUTEUR_ETAGE, corps.p)));
      const lignes = new THREE.LineSegments(g, m.pointilles);
      lignes.computeLineDistances();
      lignes.position.set(corps.x, yToit + HAUTEUR_ETAGE * (i + 0.5), corps.z);
      groupe.add(lignes);
      animations.push({ debut: 1.8 + i * 0.3, fin: 2.2 + i * 0.3, appliquer: (p) => { lignes.visible = p > 0; m.pointilles.opacity = 0.8 * p; } });
    }
  } else {
    // Toit
    const toit = new THREE.Group();
    arch.toit({ volume, prisme, m, groupe: toit, corps, y: yToit, geo });
    groupe.add(toit);
    pousserEtage(toit, yToit, 1.7 + Math.max(0, nbEtages - 1) * dureeEtage, 1.7 + Math.max(0, nbEtages - 1) * dureeEtage + 0.35);
  }

  function pousserEtage(obj, yBas, debut, fin) {
    // L'objet monte depuis l'étage du dessous avec un petit rebond.
    obj.position.y = -0.0001;
    animations.push({ debut, fin, appliquer: (p) => {
      const e = easeOutBack(p);
      obj.visible = p > 0;
      obj.position.y = (e - 1) * 0.6;
      obj.scale.set(1, 1, 1);
    } });
  }

  function poserFenetres(parent, y, vitrage = "fenetres") {
    const avant = corps.z + corps.p / 2 + 0.012;
    if (vitrage === "baies") {
      // Bureaux : un bandeau vitré continu par étage, découpé en baies
      const n = fenetresParFace;
      const larg = corps.l / n;
      for (let k = 0; k < n; k++) fenetres.push(volumeFenetre(parent, corps.x - corps.l / 2 + larg * (k + 0.5), y, avant, larg * 0.92, HAUTEUR_ETAGE * 0.62));
    } else {
      const n = fenetresParFace;
      const pas = corps.l / n;
      for (let k = 0; k < n; k++) fenetres.push(volumeFenetre(parent, corps.x - corps.l / 2 + pas * (k + 0.5), y, avant, Math.min(0.42, pas * 0.55), HAUTEUR_ETAGE * 0.5));
    }
  }
  function volumeFenetre(parent, x, y, z, l, h) {
    const mat = garder(new THREE.MeshStandardMaterial({ color: C.vitreEteinte, roughness: 0.35, metalness: 0.1, emissive: C.lueur, emissiveIntensity: 0 }));
    const f = new THREE.Mesh(geo(new THREE.BoxGeometry(l, h, 0.05)), mat);
    f.position.set(x, y, z);
    parent.add(f);
    return f;
  }

  // ---------------------------------------------------------------- Fenêtres allumées
  const total = fenetres.length;
  const allumees = Math.min(total, params.fenetresAllumees ?? 1);
  // Ordre déterministe et dispersé (pas de hasard : même entreprise, même maquette)
  const ordre = fenetres.map((f, i) => ({ f, cle: (i * 7919) % 97 })).sort((a, b) => a.cle - b.cle).map((x) => x.f);
  ordre.slice(0, allumees).forEach((f, i) => {
    const debut = 3.5 + (i / Math.max(1, allumees)) * 0.9;
    animations.push({ debut, fin: debut + 0.12, appliquer: (p) => {
      f.material.color.setHex(p > 0.5 ? C.vitreAllumee : C.vitreEteinte);
      f.material.emissiveIntensity = 0.75 * p;
    } });
  });

  // ---------------------------------------------------------------- Arbres et haie
  const placesArbres = [[-5.1, 2.6], [5.1, 2.8], [-5.2, -2.7], [5.0, -2.6]];
  const nbArbres = params.arbres?.nombre ?? 0;
  for (let i = 0; i < nbArbres; i++) {
    const [x, z] = placesArbres[i];
    const arbre = new THREE.Group();
    volume(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), m.tronc, 0, 0.4, 0, arbre);
    volume(new THREE.IcosahedronGeometry(0.62, 1), m.arbre, 0, 1.15, 0, arbre);
    arbre.position.set(x, BASE, z);
    groupe.add(arbre);
    const d = 3.6 + i * 0.2;
    animations.push({ debut: d, fin: d + 0.6, appliquer: (p) => { arbre.visible = p > 0; arbre.scale.setScalar(Math.max(0.0001, easeOutBack(p))); } });
  }
  if (params.arbres?.haie) {
    const haie = volume(new THREE.BoxGeometry(L - 1.4, 0.38, 0.38), m.arbre, 0, BASE + 0.19, -P / 2 + 0.45);
    pousser(haie, 4.0, 4.5);
  }

  // ---------------------------------------------------------------- Échafaudage (croissance > 20 % sur 3 ans)
  if (params.echafaudage && !params.comptesManquants) {
    const ech = new THREE.Group();
    const hauteur = yToit - BASE + 0.4;
    const xE = corps.x + corps.l / 2 + 0.28;
    const tube = (l) => geo(new THREE.CylinderGeometry(0.018, 0.018, l, 6));
    for (const z of [corps.z - corps.p / 2 + 0.1, corps.z + corps.p / 2 - 0.1]) {
      for (const dx of [0, 0.38]) {
        const montant = new THREE.Mesh(tube(hauteur), m.sable);
        montant.position.set(xE + dx, BASE + hauteur / 2, z);
        ech.add(montant);
      }
    }
    for (let y = BASE + 0.6; y < BASE + hauteur; y += HAUTEUR_ETAGE) {
      const lisse = new THREE.Mesh(tube(corps.p - 0.2), m.sable);
      lisse.rotation.x = Math.PI / 2;
      lisse.position.set(xE + 0.38, y, corps.z);
      ech.add(lisse);
      const plancher = new THREE.Mesh(geo(new THREE.BoxGeometry(0.42, 0.025, corps.p - 0.2)), m.noyer);
      plancher.position.set(xE + 0.19, y - 0.02, corps.z);
      ech.add(plancher);
    }
    groupe.add(ech);
    pousser(ech, 3.0, 3.6);
  }

  // ---------------------------------------------------------------- Le témoin
  const temoin = new THREE.Mesh(geo(new THREE.SphereGeometry(0.17, 32, 16)), m.cuivre);
  temoin.castShadow = true;
  const porte = arch.porte(corps);
  const posFinale = new THREE.Vector3(porte.x, BASE + 0.17, porte.z + 0.75);
  groupe.add(temoin);
  animations.push({ debut: 4.5, fin: 5.5, appliquer: (p) => {
    temoin.visible = p > 0;
    const e = easeOut(p);
    temoin.position.set(posFinale.x + Math.cos(e * 6) * (1 - e) * 1.2, posFinale.y + (1 - e) * 5, posFinale.z + Math.sin(e * 6) * (1 - e) * 1.2);
    temoin.rotation.y = e * 8;
  } });

  // État initial : tout est caché avant le début de sa piste
  animations.forEach((a) => a.appliquer(0));

  return {
    groupe, animations, temoin,
    totalFenetres: total,
    hauteur: yToit + (params.comptesManquants ? 2 * HAUTEUR_ETAGE : 1.2),
    dispose() {
      groupe.removeFromParent();
      geos.forEach((g) => g.dispose());
      liberer();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Archétypes : chacun définit l'emprise du corps principal, son rez-de-chaussée, son toit et sa porte.
// ---------------------------------------------------------------------------------------------
const porteCentre = (c) => ({ x: c.x, z: c.z + c.p / 2 });

function porteSimple({ volume, m, groupe }, c, h = 1.15) {
  volume(new THREE.BoxGeometry(0.7, h, 0.06), m.vert, c.x, 0.35 + h / 2, c.z + c.p / 2 + 0.012, groupe);
}
function rdcStandard(ctx, h = 1.6) {
  const { volume, m, groupe, corps: c, fenetre } = ctx;
  volume(new THREE.BoxGeometry(c.l, h, c.p), m.platre, c.x, 0.35 + h / 2, c.z, groupe);
  porteSimple(ctx, c);
  // Deux fenêtres de part et d'autre de la porte
  for (const dx of [-c.l / 3, c.l / 3]) fenetre(c.x + dx, 0.35 + h * 0.55, c.z + c.p / 2 + 0.012, 0.45, 0.6);
}
function toitDeuxPans({ volume, prisme, m, groupe, corps: c, y }, haut = 1.2) {
  volume(prisme([[-c.l / 2 - 0.15, 0], [c.l / 2 + 0.15, 0], [0, haut]], c.p + 0.2), m.platre, c.x, y, c.z, groupe);
}
function toitPlat({ volume, m, groupe, corps: c, y }) {
  volume(new THREE.BoxGeometry(c.l + 0.12, 0.14, c.p + 0.12), m.platre, c.x, y + 0.07, c.z, groupe);
}

const ARCHETYPES = {
  // C : atelier à sheds + bloc de bureaux qui reçoit les étages, cheminée fine
  industrie: {
    corps: { x: -2.9, z: 0.3, l: 3.2, p: 2.8 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx);
      const { volume, prisme, m, groupe } = ctx;
      const ax = 2.0, aw = 5.4, ah = 2.0, ad = 3.8;
      volume(new THREE.BoxGeometry(aw, ah, ad), m.platre, ax, 0.35 + ah / 2, -0.2, groupe);
      for (let i = 0; i < 4; i++) volume(prisme([[0, 0], [aw / 4, 0], [0, 0.75]], ad), m.platre, ax - aw / 2 + (i * aw) / 4, 0.35 + ah, -0.2, groupe);
      volume(new THREE.BoxGeometry(1.4, 1.5, 0.06), m.sable, ax + 1.4, 0.35 + 0.75, -0.2 + ad / 2 + 0.012, groupe);
      volume(new THREE.CylinderGeometry(0.12, 0.15, 4.2, 12), m.platre, ax + 2.1, 0.35 + 2.1, -1.5, groupe);
    },
    toit: toitPlat,
  },
  // F : bâtiment simple + grue à tour au trait
  construction: {
    corps: { x: -1.2, z: 0.2, l: 4.0, p: 3.0 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx);
      const { volume, m, groupe } = ctx;
      const gx = 3.6, gz = -1.8;
      volume(new THREE.BoxGeometry(0.22, 7.2, 0.22), m.sable, gx, 0.35 + 3.6, gz, groupe);
      volume(new THREE.BoxGeometry(5.6, 0.16, 0.16), m.sable, gx - 1.6, 0.35 + 7.1, gz, groupe);
      volume(new THREE.BoxGeometry(0.5, 0.35, 0.4), m.noyer, gx + 1.0, 0.35 + 6.9, gz, groupe);
      volume(new THREE.BoxGeometry(0.02, 2.4, 0.02), m.sable, gx - 3.6, 0.35 + 5.8, gz, groupe);
    },
    toit: toitPlat,
  },
  // G : boutique avec grande vitrine et auvent, logement au-dessus, toit à deux pans
  commerce: {
    corps: { x: 0, z: 0.2, l: 4.4, p: 3.2 }, hauteurRdc: 1.7, vitrage: "fenetres", porte: (c) => ({ x: c.x + 1.4, z: c.z + c.p / 2 }),
    rdc(ctx) {
      const { volume, m, groupe, corps: c } = ctx;
      volume(new THREE.BoxGeometry(c.l, 1.7, c.p), m.platre, c.x, 0.35 + 0.85, c.z, groupe);
      ctx.fenetre(c.x - 0.6, 0.35 + 0.72, c.z + c.p / 2 + 0.012, 2.6, 1.15); // la vitrine s'éclaire comme une fenêtre
      volume(new THREE.BoxGeometry(0.7, 1.2, 0.06), m.vert, c.x + 1.4, 0.35 + 0.6, c.z + c.p / 2 + 0.012, groupe);
      const auvent = volume(new THREE.BoxGeometry(3.4, 0.06, 0.9), m.vert, c.x - 0.3, 0.35 + 1.45, c.z + c.p / 2 + 0.4, groupe);
      auvent.rotation.x = 0.28;
    },
    toit: (ctx) => toitDeuxPans(ctx, 1.3),
  },
  // I : maison de ville, terrasse avec deux tables et parasols
  restauration: {
    corps: { x: -0.8, z: -0.4, l: 4.2, p: 3.0 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx);
      const { volume, m, groupe, corps: c } = ctx;
      volume(new THREE.BoxGeometry(5.4, 0.06, 2.0), m.sable, c.x + 0.6, 0.38, c.z + c.p / 2 + 1.2, groupe);
      for (const dx of [-0.9, 1.5]) {
        const tx = c.x + 0.6 + dx, tz = c.z + c.p / 2 + 1.2;
        volume(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 20), m.platre, tx, 0.35 + 0.5, tz, groupe);
        volume(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), m.sable, tx, 0.35 + 0.7, tz, groupe);
        volume(new THREE.ConeGeometry(0.75, 0.32, 16), m.vert, tx, 0.35 + 1.45, tz, groupe);
      }
    },
    toit: (ctx) => toitDeuxPans(ctx, 1.2),
  },
  // H : entrepôt long avec quais de chargement + petit bloc de bureaux
  logistique: {
    corps: { x: -4.0, z: 0.4, l: 2.4, p: 2.6 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx);
      const { volume, m, groupe } = ctx;
      const ex = 1.4, el = 7.6, eh = 2.1, ep = 4.2;
      volume(new THREE.BoxGeometry(el, eh, ep), m.platre, ex, 0.35 + eh / 2, -0.2, groupe);
      volume(new THREE.BoxGeometry(el + 0.1, 0.1, ep + 0.1), m.platre, ex, 0.35 + eh + 0.05, -0.2, groupe);
      for (let i = 0; i < 5; i++) {
        const qx = ex - el / 2 + 0.9 + i * 1.45;
        volume(new THREE.BoxGeometry(0.95, 1.2, 0.05), m.noyer, qx, 0.35 + 0.75, -0.2 + ep / 2 + 0.012, groupe);
        volume(new THREE.BoxGeometry(1.1, 0.3, 0.5), m.sable, qx, 0.35 + 0.15, -0.2 + ep / 2 + 0.25, groupe);
      }
    },
    toit: toitPlat,
  },
  // A : corps de ferme + grange
  ferme: {
    corps: { x: -2.6, z: 0.2, l: 3.6, p: 2.8 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx);
      const { volume, prisme, m, groupe } = ctx;
      const gx = 2.3, gl = 4.2, gh = 2.4, gp = 3.6;
      volume(new THREE.BoxGeometry(gl, gh, gp), m.platre, gx, 0.35 + gh / 2, -0.4, groupe);
      volume(prisme([[-gl / 2 - 0.2, 0], [gl / 2 + 0.2, 0], [0, 1.6]], gp + 0.2), m.noyer, gx, 0.35 + gh, -0.4, groupe);
      volume(new THREE.BoxGeometry(1.6, 1.9, 0.06), m.noyer, gx, 0.35 + 0.95, -0.4 + gp / 2 + 0.012, groupe);
    },
    toit: (ctx) => toitDeuxPans(ctx, 1.25),
  },
  // J, K, M, N : immeuble de bureaux aux grandes baies vitrées
  bureaux: {
    corps: { x: -0.4, z: 0, l: 4.6, p: 3.4 }, hauteurRdc: 1.5, vitrage: "baies", porte: porteCentre,
    rdc(ctx) {
      const { volume, m, groupe, corps: c } = ctx;
      volume(new THREE.BoxGeometry(c.l, 1.5, c.p), m.platre, c.x, 0.35 + 0.75, c.z, groupe);
      for (const dx of [-c.l / 3, c.l / 3]) ctx.fenetre(c.x + dx, 0.35 + 0.6, c.z + c.p / 2 + 0.012, c.l / 3 - 0.2, 1.0);
      volume(new THREE.BoxGeometry(0.8, 1.1, 0.07), m.vert, c.x, 0.35 + 0.55, c.z + c.p / 2 + 0.02, groupe);
      volume(new THREE.BoxGeometry(c.l + 0.6, 0.08, 1.0), m.platre, c.x, 0.35 + 1.55, c.z + c.p / 2 + 0.45, groupe);
    },
    toit: toitPlat,
  },
  // Q : bâtiment clair et horizontal, avec patio
  sante: {
    corps: { x: -2.2, z: 0.6, l: 3.6, p: 2.6 }, hauteurRdc: 1.5, vitrage: "baies", porte: porteCentre,
    rdc(ctx) {
      rdcStandard(ctx, 1.5);
      const { volume, m, groupe } = ctx;
      const px = 2.3, pz = -0.2, pl = 4.2, pp = 4.4, h = 1.2, e = 0.9;
      volume(new THREE.BoxGeometry(pl, h, e), m.platre, px, 0.35 + h / 2, pz - pp / 2 + e / 2, groupe);
      volume(new THREE.BoxGeometry(pl, h, e), m.platre, px, 0.35 + h / 2, pz + pp / 2 - e / 2, groupe);
      volume(new THREE.BoxGeometry(e, h, pp - 2 * e), m.platre, px + pl / 2 - e / 2, 0.35 + h / 2, pz, groupe);
      volume(new THREE.BoxGeometry(pl - e - 0.2, 0.04, pp - 2 * e - 0.2), m.sable, px - e / 2 + 0.1, 0.37, pz, groupe);
      volume(new THREE.IcosahedronGeometry(0.4, 1), m.arbre, px - 0.3, 0.35 + 0.5, pz, groupe);
    },
    toit: toitPlat,
  },
  generique: {
    corps: { x: 0, z: 0, l: 4.2, p: 3.0 }, hauteurRdc: 1.6, vitrage: "fenetres", porte: porteCentre,
    rdc(ctx) { rdcStandard(ctx); },
    toit: toitPlat,
  },
};

/** Maquette d'exemple affichée avant toute recherche. */
export const EXEMPLE = {
  archetype: "industrie", etages: 3, fenetresAllumees: 6, arbres: { nombre: 3, haie: false }, echafaudage: false,
  depuis: null, comptesManquants: false,
};
