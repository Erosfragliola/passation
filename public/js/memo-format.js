// Formatting of the memorandum's figures, in the style of investment banks (pure module, shared by the Worker,
// the page and the tests): tables in k€ without decimals, negative amounts in parentheses, "n.d." when a
// value is missing; in the text, M€ with one decimal from one million, k€ otherwise; percentages with one decimal.
// In English: "€1.1M", "€890K", "7.9%", "n/a" (language of the page or the request).
import { t, langue, locale } from "./i18n.js";

const nombre = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace(/\u202f/g, "\u00a0");
const nd = () => t("dossier.formats.nd");
const pct = (texte) => (langue() === "fr" ? `${texte} %` : `${texte}%`);
const ok = (v) => typeof v === "number" && Number.isFinite(v);

/** Table cell in k€: €12,825,400 → "12 825"; −€1,294,000 → "(1 294)"; missing → "n.d." (French format). */
export function kEuros(v) {
  if (!ok(v)) return nd();
  const k = Math.round(v / 1000);
  if (k === 0) return "–";
  return k < 0 ? `(${nombre(-k)})` : nombre(k);
}

/** Amount in a sentence or a tile: "1,1 M€", "890 k€", "−45 k€" (French format). */
export function montant(v) {
  if (!ok(v)) return nd();
  const s = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (langue() !== "fr") return a >= 1e6 ? `${s}€${nombre(a / 1e6, 1)}M` : `${s}€${nombre(Math.round(a / 1000))}K`;
  return a >= 1e6 ? `${s}${nombre(a / 1e6, 1)} M€` : `${s}${nombre(Math.round(a / 1000))} k€`;
}

/** Percentage: 0.0794 → "7,9 %"; with sign: "+4,2 %"; missing → "n.d." (French format). */
export function pourcent(x, { signe = false, decimales = 1 } = {}) {
  if (!ok(x)) return nd();
  const v = x * 100;
  const s = signe && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${pct(nombre(Math.abs(v), decimales))}`;
}

/** Ratio in a table (% of revenue, growth): in parentheses when negative, like the amounts. */
export function ratioTableau(x) {
  if (!ok(x)) return nd();
  const n = nombre(Math.abs(x * 100), 1);
  return x < 0 ? `(${pct(n)})` : pct(n);
}

/** Multiple: 2.04 → "2,0x" (French format). */
export const multiple = (x) => (ok(x) ? `${nombre(x, 1)}x` : nd());

/** Month and year of the document: "novembre 2026" ("November 2026" in English). */
export const moisAnnee = (date = new Date()) => date.toLocaleDateString(locale(), { month: "long", year: "numeric" });

/** Period covered by fiscal years: [2024] → "2024"; [2022, 2023, 2024] → "2022-2024"; none → "". */
export function periode(annees = []) {
  if (!annees.length) return "";
  return annees.length === 1 || annees[0] === annees.at(-1) ? String(annees.at(-1)) : `${annees[0]}-${annees.at(-1)}`;
}
/** The same in words: "fiscal year 2024"; "fiscal years 2022 to 2024". */
export function periodeExercices(annees = []) {
  if (!annees.length) return "";
  return annees.length === 1 || annees[0] === annees.at(-1) ? t("dossier.formats.exercice", { annee: annees.at(-1) }) : t("dossier.formats.exercices", { de: annees[0], a: annees.at(-1) });
}

/**
 * Placement of the memorandum's photos (12 at most) by their approved category and use (« Use as proposed »), the
 * order chosen by the owner deciding for the same category. Never the same photo twice; large (cover, opening pages)
 * only if its width allows it; a photo « to avoid » is never placed.
 *   couverture   : the best rated of the premises, the outside or the workshop;
 *   activite     : workshop and products (two at most);
 *   realisations : completed work (dedicated page from 3 on);
 *   equipe       : the approved team photo;
 *   ouvertures   : the remaining photos that are large enough, for the opening pages.
 * A photo without an approved assessment (no analysis, or « Ignore ») completes the cover then the business, in order;
 * it is never used for the team (what it shows is unknown).
 * @param photos [{ n, decision, categorie, usage, analyse: { note }, largeur }]
 */
export function placementPhotos(photos = [], { largeurPleinePage = 1200, realisationsMin = 3 } = {}) {
  const pris = new Set();
  const valide = (p) => p.decision === "utilise" && p.categorie;
  const libre = (p) => !pris.has(p.n) && p.usage !== "eviter";
  const grande = (p) => p.largeur == null || p.largeur >= largeurPleinePage;
  const note = (p) => p.analyse?.note ?? 0;
  const prendre = (p) => { if (!p) return null; pris.add(p.n); return p.n; };
  const parNote = (l) => [...l].sort((a, b) => note(b) - note(a));
  const l = photos.filter((p) => p && Number.isInteger(p.n));
  const classees = l.filter(valide), sansJugement = l.filter((p) => !valide(p));

  const couverture = prendre(parNote(classees.filter((p) => libre(p) && grande(p) && (p.usage === "couverture" || ["locaux", "exterieur", "atelier"].includes(p.categorie))))[0])
    ?? prendre(sansJugement.find((p) => libre(p) && grande(p)));
  const equipe = prendre(parNote(classees.filter((p) => libre(p) && (p.categorie === "equipe" || p.usage === "equipe")))[0]);
  const reals = classees.filter((p) => libre(p) && (p.categorie === "realisations" || p.usage === "realisations"));
  const realisations = reals.length >= realisationsMin ? reals.slice(0, 6).map(prendre) : [];
  const activite = [...classees.filter((p) => libre(p) && (["atelier", "produits"].includes(p.categorie) || p.usage === "activite")), ...sansJugement.filter(libre)].slice(0, 2).map(prendre);
  const ouvertures = l.filter((p) => libre(p) && grande(p) && (valide(p) || p.decision !== "ignore")).map(prendre);
  return { couverture, activite, realisations, equipe, ouvertures };
}
