// Mise en forme des chiffres du mémorandum, à la manière des banques d'affaires (module pur, partagé entre le Worker,
// la page et les tests) : tableaux en k€ sans décimale, montants négatifs entre parenthèses, « n.d. » quand une
// valeur manque ; dans le texte, M€ à une décimale dès le million, k€ sinon ; pourcentages à une décimale.
// En anglais : « €1.1M », « €890K », « 7.9% », « n/a » (langue de la page ou de la requête).
import { t, langue, locale } from "./i18n.js";

const nombre = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace(/\u202f/g, "\u00a0");
const nd = () => t("dossier.formats.nd");
const pct = (texte) => (langue() === "fr" ? `${texte} %` : `${texte}%`);
const ok = (v) => typeof v === "number" && Number.isFinite(v);

/** Cellule de tableau en k€ : 12 825 400 € → « 12 825 » ; −1 294 000 € → « (1 294) » ; absent → « n.d. ». */
export function kEuros(v) {
  if (!ok(v)) return nd();
  const k = Math.round(v / 1000);
  if (k === 0) return "–";
  return k < 0 ? `(${nombre(-k)})` : nombre(k);
}

/** Montant dans une phrase ou une tuile : « 1,1 M€ », « 890 k€ », « −45 k€ ». */
export function montant(v) {
  if (!ok(v)) return nd();
  const s = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (langue() !== "fr") return a >= 1e6 ? `${s}€${nombre(a / 1e6, 1)}M` : `${s}€${nombre(Math.round(a / 1000))}K`;
  return a >= 1e6 ? `${s}${nombre(a / 1e6, 1)} M€` : `${s}${nombre(Math.round(a / 1000))} k€`;
}

/** Pourcentage : 0,0794 → « 7,9 % » ; avec signe : « +4,2 % » ; absent → « n.d. ». */
export function pourcent(x, { signe = false, decimales = 1 } = {}) {
  if (!ok(x)) return nd();
  const v = x * 100;
  const s = signe && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${pct(nombre(Math.abs(v), decimales))}`;
}

/** Ratio en tableau (% du CA, croissance) : entre parenthèses quand il est négatif, comme les montants. */
export function ratioTableau(x) {
  if (!ok(x)) return nd();
  const n = nombre(Math.abs(x * 100), 1);
  return x < 0 ? `(${pct(n)})` : pct(n);
}

/** Multiple : 2,04 → « 2,0x ». */
export const multiple = (x) => (ok(x) ? `${nombre(x, 1)}x` : nd());

/** Mois et année du document : « novembre 2026 ». */
export const moisAnnee = (date = new Date()) => date.toLocaleDateString(locale(), { month: "long", year: "numeric" });

/** Période couverte par des exercices : [2024] → « 2024 » ; [2022, 2023, 2024] → « 2022-2024 » ; aucun → « ». */
export function periode(annees = []) {
  if (!annees.length) return "";
  return annees.length === 1 || annees[0] === annees.at(-1) ? String(annees.at(-1)) : `${annees[0]}-${annees.at(-1)}`;
}
/** Même chose en toutes lettres : « exercice 2024 » ; « exercices 2022 à 2024 ». */
export function periodeExercices(annees = []) {
  if (!annees.length) return "";
  return annees.length === 1 || annees[0] === annees.at(-1) ? t("dossier.formats.exercice", { annee: annees.at(-1) }) : t("dossier.formats.exercices", { de: annees[0], a: annees.at(-1) });
}
