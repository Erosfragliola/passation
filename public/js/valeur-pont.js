// "Your value" for the owner and a banker (part C, 24/11/2026). Pure module, shared by the Worker, the browser and the
// tests (test/valeur-pont.test.js). It never calculates a value of its own: it reads the engine's result
// (src/valuation/approfondie.js) and lays it out. The only arithmetic is the restatement rule itself
// (lignesRetraitement, used by the engine's pontEbe: one definition) and averages of the engine's own lines.
import { t, langue, locale } from "./i18n.js";

const fini = (x) => typeof x === "number" && Number.isFinite(x);
const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);

/**
 * Reported EBITDA of a fiscal year (single definition, used by the engine as `ebe`):
 * revenue + other operating income − purchases consumed − external expenses − taxes and duties − personnel.
 * Calculated only if revenue and the three required expenses are filled in (an entered 0 is a real zero);
 * "other income" and "taxes and duties" are optional items of the entry: if missing, they count as 0.
 * Otherwise, the published EBITDA (INPI accounts) is taken as is; failing that, EBITDA cannot be determined (null).
 */
const CHARGES_OBLIGATOIRES = ["achats_consommes", "charges_externes", "charges_personnel"];
const renseigne = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));
const nb = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
export function ebeExercice(ex = {}) {
  if (renseigne(ex.chiffre_affaires) && CHARGES_OBLIGATOIRES.every((k) => renseigne(ex[k]))) {
    return nb(ex.chiffre_affaires) + nb(ex.autres_produits) - nb(ex.achats_consommes) - nb(ex.charges_externes) - nb(ex.impots_taxes) - nb(ex.charges_personnel);
  }
  return renseigne(ex.ebe) ? Number(ex.ebe) : null;
}

/**
 * Restatements of one fiscal year, as amounts added to the reported EBITDA (PLAN.md § 5.2):
 *   owner: actual pay − normalized pay of a salaried manager (charges included);
 *   rent: rent paid − market rent (walls owned by the owner or a family SCI);
 *   non-recurring items of that year (an exceptional expense is added back, an exceptional income removed).
 * Leasing does not change EBITDA (convention FIN-05 kept on 24/11/2026: the remaining principal is in net debt).
 * @param r { remuneration_dirigeant_reelle, remuneration_normative, loyer_paye, loyer_marche, exceptionnels[] }
 * @returns [{ cle: "dirigeant" | "loyer" | "exceptionnel", montant, libelle?, justification? }]
 */
export function lignesRetraitement(r = {}, annee) {
  const lignes = [];
  if (fini(r.remuneration_dirigeant_reelle) && fini(r.remuneration_normative)) {
    lignes.push({ cle: "dirigeant", montant: r.remuneration_dirigeant_reelle - r.remuneration_normative });
  }
  if (fini(r.loyer_paye) && fini(r.loyer_marche)) lignes.push({ cle: "loyer", montant: r.loyer_paye - r.loyer_marche });
  for (const e of r.exceptionnels || []) {
    if (e.annee === annee && fini(e.montant)) lignes.push({ cle: "exceptionnel", montant: e.montant, libelle: e.libelle || "", justification: e.justification || "" });
  }
  return lignes;
}

/** Live preview on the restatements screen: reported EBITDA of a year → restated EBITDA (same rule as the engine). */
export function apercuRetraitements(ebeComptable, r, annee) {
  if (!fini(ebeComptable)) return null;
  const lignes = lignesRetraitement(r, annee);
  return { ebe_comptable: ebeComptable, lignes, ebe_retraite: ebeComptable + lignes.reduce((a, l) => a + l.montant, 0) };
}

/** Amount in thousands of euros, negatives in brackets: "1 234 k€", "(120 k€)"; in English "€1,234K", "(€120K)". */
export function kEuros(v) {
  if (!fini(v)) return "–";
  const k = Math.round(v / 1000);
  const n = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.abs(k));
  const s = langue() === "fr" ? `${n} k€` : `€${n}K`;
  return k < 0 ? `(${s})` : s;
}

/** Multiple as displayed: "4,0×" / "4.0×". */
export const fois = (m) => `${new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m)}×`;

/**
 * Bridge from reported EBITDA to the value of the shares, as a banker reads it, from the engine's result only:
 *   reported EBITDA → restatements → EBITDA used → × industry multiples (low – high) → enterprise value
 *   → discounts/premiums → + cash − debts (one line each) → working-capital gap → non-operating assets → equity value.
 * With the "average" mode, the reported EBITDA and each restatement are the averages over the fiscal years used, so
 * that the lines add up exactly to the EBITDA used (the engine's normalized EBITDA).
 * @returns null if the multiples method does not apply, otherwise { annees, mode, lignes: [{ cle, montant | bas+haut, total? }] }
 */
export function pontValeur(r) {
  if (r?.statut !== "ok" || r.multiples?.statut !== "ok") return null;
  const annees = r.ebe_normatif.annees || [];
  const ponts = (r.pont_ebe || []).filter((p) => annees.includes(p.annee));
  const lignes = [{ cle: "ebe_comptable", montant: moyenne(ponts.map((p) => p.ebe_comptable)) }];
  for (const cle of ["dirigeant", "loyer", "exceptionnel"]) {
    const m = moyenne(ponts.map((p) => p.lignes.filter((l) => l.cle === cle).reduce((a, l) => a + l.montant, 0)));
    if (ponts.some((p) => p.lignes.some((l) => l.cle === cle))) lignes.push({ cle, montant: m });
  }
  lignes.push({ cle: "ebe_retenu", montant: r.ebe_normatif.valeur, total: true });
  const m = r.multiples, pt = r.pont_titres;
  lignes.push({ cle: "multiples", bas: m.multiples.bas, haut: m.multiples.haut, source: m.source });
  lignes.push({ cle: "ve", bas: m.ve.bas, haut: m.ve.haut, total: true });
  if (pt.facteur_decotes !== 1) lignes.push({ cle: "decotes", bas: m.ve.bas * (pt.facteur_decotes - 1), haut: m.ve.haut * (pt.facteur_decotes - 1) });
  for (const l of r.dette_nette.lignes) if (l.montant) lignes.push({ cle: `dette_${l.cle}`, bas: -l.montant, haut: -l.montant });
  if (Math.round(pt.ecart_bfr)) lignes.push({ cle: "bfr", bas: pt.ecart_bfr, haut: pt.ecart_bfr });
  if (pt.hors_exploitation) lignes.push({ cle: "hors_exploitation", bas: pt.hors_exploitation, haut: pt.hors_exploitation });
  lignes.push({ cle: "titres", bas: m.titres.bas, haut: m.titres.haut, total: true });
  return { annees: ponts.map((p) => p.annee), mode: r.ebe_normatif.mode, lignes };
}

/**
 * Adjusted net assets next to the range of the shares (defect of 24/11/2026: a "floor" above the range). The word
 * "floor" is used only when the adjusted net assets are below the whole range.
 * @returns null | { cas: "plancher" | "dans" | "au_dessus" | "negatif", valeur }
 */
export function situationAncc(bas, haut, ancc) {
  if (!fini(ancc) || !fini(bas) || !fini(haut)) return null;
  if (ancc < 0) return { cas: "negatif", valeur: ancc };
  if (ancc < bas) return { cas: "plancher", valeur: ancc };
  if (ancc > haut) return { cas: "au_dessus", valeur: ancc };
  return { cas: "dans", valeur: ancc };
}

/** Sentence shown to the owner for that situation (texts: dossier.json, "ancc"). */
export function texteAncc(s, { bas, haut } = {}) {
  if (!s) return null;
  return t(`dossier.ancc.${s.cas}`, { ancc: kEuros(s.valeur), bas: kEuros(bas), haut: kEuros(haut) });
}
