// Démo « Et la vôtre ? » : état du dossier en fonction du temps écoulé (secondes), sans DOM (test/demo-etat.test.js).
// Le nom s'écrit (0,6 s) ; deux bandeaux noirs le recouvrent, puis un troisième la ligne SIREN et ville (0,35 s
// chacun) ; le tampon tombe (échelle 1,9 → 1 en 0,35 s, petit choc du dossier) ; le teaser s'affiche ligne par ligne
// (0,38 s chacune) ; la pastille de la première valeur, puis la mention. Ensuite le texte de gauche change.
import { seg, eIO, eIn, eOut } from "./histoire-poses.js";

export const DEMO = {
  nom: [0, 0.6], meta: [0.6, 0.8],
  bandeaux: [[0.9, 1.25], [1.25, 1.6], [1.6, 1.95]],
  tampon: [2.15, 2.5],
  lignes: (j) => [2.9 + j * 0.38, 2.9 + j * 0.38 + 0.38],
  pastille: [4.6, 5.05], mention: [4.95, 5.25],
  apres: [5.6, 6.1],
  fin: 6.1,
};
const eBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

export function etatDemo(t) {
  const sp = seg(t, ...DEMO.tampon);
  const choc = t > DEMO.tampon[1] ? 6 * Math.exp(-(t - DEMO.tampon[1]) * 12) * Math.cos((t - DEMO.tampon[1]) * 40) : 0;
  const vp = seg(t, ...DEMO.pastille);
  return {
    attente: 1 - seg(t, -0.2, 0),
    ecrit: seg(t, ...DEMO.nom),
    metaOp: seg(t, ...DEMO.meta),
    bandeaux: DEMO.bandeaux.map((b) => eIO(seg(t, ...b))),
    tampon: { op: Math.min(1, sp * 3), echelle: sp >= 1 ? 1 : 1.9 - 0.9 * eIn(sp) },
    secousse: Math.abs(choc) < 0.01 ? 0 : choc,
    lignes: [0, 1, 2, 3].map((j) => ({ revele: eIO(seg(t, ...DEMO.lignes(j))) })),
    pastille: { op: Math.min(1, vp * 2.5), echelle: 0.86 + 0.14 * eBack(vp) },
    mentionOp: seg(t, ...DEMO.mention),
    apres: eOut(seg(t, ...DEMO.apres)),
  };
}

// ---------------------------------------------------------------- Les quatre gestes du nom de code (histoire, 4e temps)
// Chaque geste se joue d'un coup, au temps, quand le défilement atteint son seuil ; une fois joué, il reste en place.
// Le nom s'écrit en 0,6 s ; les bandes noires passent en 0,3 s ; le tampon tombe en 0,35 s (puis le petit choc
// s'amortit) ; la valeur apparaît en 0,4 s, avec les lignes du teaser et la mention.
export const ORDRE_GESTES = ["nom", "bandes", "tampon", "valeur"];
export const GESTES = { nom: 0.6, bandes: 0.3, tampon: 0.35, valeur: 0.4 };
const AMORTI = 0.45;   // durée du choc du tampon après sa chute

/**
 * Départs des gestes (secondes, horloge libre) : les n premiers seuils sont atteints à l'instant « maintenant ».
 * Un geste ne part jamais avant la fin du précédent : un défilement rapide met les gestes à la file, sans les
 * superposer. Les départs déjà fixés ne bougent plus.
 */
export function planifierGestes(departs, n, maintenant) {
  const d = { ...departs };
  let libre = -Infinity;
  ORDRE_GESTES.forEach((g, k) => {
    if (d[g] == null && k < n) d[g] = Math.max(maintenant, libre);
    if (d[g] != null) libre = d[g] + GESTES[g];
  });
  return d;
}

/** Durée restante d'animation (secondes) : 0 quand tous les gestes partis sont terminés, choc compris. */
export function resteGestes(departs, maintenant) {
  return Math.max(0, ...ORDRE_GESTES.filter((g) => departs[g] != null)
    .map((g) => departs[g] + GESTES[g] + (g === "tampon" ? AMORTI : 0) - maintenant));
}

/** État partiel du dossier (definir) d'après le temps écoulé depuis le départ de chaque geste (absent : pas joué). */
export function etatGestes(ecoule = {}) {
  const e = (g) => (ecoule[g] == null ? -1 : ecoule[g]);
  const nom = e("nom"), bandes = e("bandes"), tampon = e("tampon"), valeur = e("valeur");
  const kn = seg(nom, 0, GESTES.nom);
  const sp = seg(tampon, 0, GESTES.tampon);
  const apres = tampon - GESTES.tampon;
  const choc = apres > 0 && apres < AMORTI ? 6 * Math.exp(-apres * 12) * Math.cos(apres * 40) : 0;
  const vp = seg(valeur, 0.1, GESTES.valeur);
  return {
    attente: nom < 0 ? 1 : 0,
    ecrit: kn,
    metaOp: seg(kn, 0.6, 1),
    bandeaux: [0, 1, 2].map((j) => eIO(seg(bandes, j * 0.06, j * 0.06 + 0.18))),
    tampon: { op: Math.min(1, sp * 3), echelle: sp >= 1 ? 1 : 1.9 - 0.9 * eIn(sp) },
    secousse: Math.abs(choc) < 0.01 ? 0 : choc,
    lignes: [0, 1, 2, 3].map((j) => ({ revele: eIO(seg(valeur, j * 0.05, j * 0.05 + 0.25)) })),
    pastille: { op: Math.min(1, vp * 2.5), echelle: 0.86 + 0.14 * eBack(vp) },
    mentionOp: seg(valeur, 0.25, GESTES.valeur),
  };
}

/** Tous les gestes joués (mouvement réduit, état final). */
export const GESTES_JOUES = Object.fromEntries(ORDRE_GESTES.map((g) => [g, 10]));
