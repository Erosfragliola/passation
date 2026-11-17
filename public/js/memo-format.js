// Mise en forme des chiffres du mémorandum, à la manière des banques d'affaires (module pur, partagé entre le Worker,
// la page et les tests) : tableaux en k€ sans décimale, montants négatifs entre parenthèses, « n.d. » quand une
// valeur manque ; dans le texte, M€ à une décimale dès le million, k€ sinon ; pourcentages à une décimale.

const nombre = (v, d = 0) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace(/\u202f/g, "\u00a0");
const ok = (v) => typeof v === "number" && Number.isFinite(v);

/** Cellule de tableau en k€ : 12 825 400 € → « 12 825 » ; −1 294 000 € → « (1 294) » ; absent → « n.d. ». */
export function kEuros(v) {
  if (!ok(v)) return "n.d.";
  const k = Math.round(v / 1000);
  if (k === 0) return "–";
  return k < 0 ? `(${nombre(-k)})` : nombre(k);
}

/** Montant dans une phrase ou une tuile : « 1,1 M€ », « 890 k€ », « −45 k€ ». */
export function montant(v) {
  if (!ok(v)) return "n.d.";
  const s = v < 0 ? "−" : "";
  const a = Math.abs(v);
  return a >= 1e6 ? `${s}${nombre(a / 1e6, 1)} M€` : `${s}${nombre(Math.round(a / 1000))} k€`;
}

/** Pourcentage : 0,0794 → « 7,9 % » ; avec signe : « +4,2 % » ; absent → « n.d. ». */
export function pourcent(x, { signe = false, decimales = 1 } = {}) {
  if (!ok(x)) return "n.d.";
  const v = x * 100;
  const s = signe && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${nombre(Math.abs(v), decimales)} %`;
}

/** Ratio en tableau (% du CA, croissance) : entre parenthèses quand il est négatif, comme les montants. */
export function ratioTableau(x) {
  if (!ok(x)) return "n.d.";
  const t = nombre(Math.abs(x * 100), 1);
  return x < 0 ? `(${t} %)` : `${t} %`;
}

/** Multiple : 2,04 → « 2,0x ». */
export const multiple = (x) => (ok(x) ? `${nombre(x, 1)}x` : "n.d.");

/** Mois et année du document : « novembre 2026 ». */
export const moisAnnee = (date = new Date()) => date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
