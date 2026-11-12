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
    tampon: { op: Math.min(1, sp * 3), echelle: 1.9 - 0.9 * eIn(sp) },
    secousse: Math.abs(choc) < 0.01 ? 0 : choc,
    lignes: [0, 1, 2, 3].map((j) => ({ revele: eIO(seg(t, ...DEMO.lignes(j))) })),
    pastille: { op: Math.min(1, vp * 2.5), echelle: 0.86 + 0.14 * eBack(vp) },
    mentionOp: seg(t, ...DEMO.mention),
    apres: eOut(seg(t, ...DEMO.apres)),
  };
}
