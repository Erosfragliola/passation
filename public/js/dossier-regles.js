// Rules of the file (pure module, shared by the Worker, the browser and the tests):
// "Your preparation" checklist and calculation of progress (per block, and overall based on the steps of the flow).
import { t, T, avecTextes } from "./i18n.js";

/** Documents usually requested by a buyer during the acquisition due diligence. Indicative list. */
export const CHECKLIST = [
  { cle: "juridique", groupe: T, items: [
    ["statuts", T],
    ["kbis", T],
    ["pv-ag", T],
    ["capital", T],
  ] },
  { cle: "financier", groupe: T, items: [
    ["liasses", T],
    ["situation", T],
    ["emprunts", T],
    ["balances", T],
  ] },
  { cle: "social", groupe: T, items: [
    ["organigramme", T],
    ["registre", T],
    ["contrats-cles", T],
    ["accords", T],
  ] },
  { cle: "commercial", groupe: T, items: [
    ["clients", T],
    ["contrats", T],
    ["cgv", T],
  ] },
  { cle: "actifs", groupe: T, items: [
    ["baux", T],
    ["equipements", T],
    ["marques", T],
    ["assurances", T],
    ["litiges", T],
    ["autorisations", T],
  ] },
];
// Texts (groups and documents): src/contenu/<language>/dossier.json, read at each access in the current language.
for (const g of CHECKLIST) {
  avecTextes(g, `dossier.checklist.${g.cle}`);
  for (const item of g.items) Object.defineProperty(item, 1, { get: () => t(`dossier.checklist.${g.cle}.items.${item[0]}`), enumerable: true, configurable: true });
}
export const CLES_CHECKLIST = new Set(CHECKLIST.flatMap((g) => g.items.map(([k]) => k)));

/**
 * Progress from 0 to 100 per block, and overall: the steps of the flow (single list ETAPES_PARCOURS), weighted.
 * The owner does not start from zero: the file exists, so the company is identified (15); a first value,
 * quick or detailed (10); the latest fiscal year confirmed (25, the only required one: the previous fiscal years
 * are optional and do not count in the percentage); the questions of the flow (15, pro rata); detailed
 * valuation (15); documents (20, pro rata of the 3). The "Your preparation" checklist stays separate.
 * This calculation is read in only one place for display: etatParcours (dossier-parcours.js).
 * @param d { estimation_express: bool, dernier_exercice: bool, questions_pct: 0..100, valorisation_approfondie: bool,
 *            documents: n (0..3), checklist: Set of ticked keys }
 */
export function avancement(d) {
  const preparation = Math.round(100 * [...(d.checklist || [])].filter((k) => CLES_CHECKLIST.has(k)).length / CLES_CHECKLIST.size);
  const chiffres = d.dernier_exercice ? 100 : 0;
  const valorisation = d.valorisation_approfondie ? 100 : d.estimation_express ? 25 : 0;
  const nDocs = Math.min(3, d.documents || 0);
  const documents = Math.round(100 * nDocs / 3);
  const q = Math.min(100, Math.max(0, d.questions_pct || 0));
  const global = Math.round(15 + (d.estimation_express || d.valorisation_approfondie ? 10 : 0) + (d.dernier_exercice ? 25 : 0)
    + 15 * q / 100 + (d.valorisation_approfondie ? 15 : 0) + 20 * nDocs / 3);
  return { global, chiffres, valorisation, documents, preparation };
}
