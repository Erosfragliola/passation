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
