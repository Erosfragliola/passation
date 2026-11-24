// Quick estimate: calls to the existing routes (GET /api/maquette/:siren, POST /api/estimation) and formatting
// of the amounts and suggestions. No calculation here: the engine is on the server side (src/valuation/express.js).
import { libelleSalaries } from "../regles.js";
import { t, langue, locale } from "../i18n.js";

/** Public data and estimate of a company: { ok: true, donnees } or { ok: false, code }. */
export async function chargerEntreprise(siren) {
  let r;
  try { r = await fetch(`/api/maquette/${encodeURIComponent(siren)}`); } catch { return { ok: false, code: "reseau" }; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, code: d.erreur || (r.status >= 500 ? "source_indisponible" : "introuvable") };
  return { ok: true, donnees: d };
}

/** Unpublished accounts: estimate from the revenue and EBITDA entered (in euros). Nothing is saved. */
export async function estimationManuelle({ section_naf, ca, ebe }) {
  try {
    const r = await fetch("/api/estimation", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_naf, ca, ebe }) });
    if (!r.ok) return null;
    return (await r.json()).estimation ?? null;
  } catch { return null; }
}

/** Search by name (autocomplete): active suggestions, or null if the service does not respond. */
export async function rechercher(q) {
  try {
    const r = await fetch(`/api/company/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    return (await r.json()).suggestions ?? [];
  } catch { return null; }
}

const nombre = (v, decimales) => new Intl.NumberFormat(locale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
/** Amount with its unit: "1,8 M€" in French, "€1.8M" in English (sep: space before the unit in French). */
const euros = (texte, unite, sep = " ") => (langue() === "fr" ? `${texte}${sep}${unite}€` : `€${texte}${unite === "k" ? "K" : unite}`);

/**
 * Readable range, a single unit: in M€ with one decimal as soon as the top reaches €1M
 * ("1,8 – 2,4 M€"; in English "€1.8–2.4M"), otherwise in k€ rounded to the nearest ten ("150 – 230 k€", "€150–230K").
 * In French, no-break space before the unit and before the dash.
 */
export function fourchette(bas, haut) {
  const fr = langue() === "fr";
  if (haut >= 1e6) return fr ? `${nombre(bas / 1e6, 1)} – ${nombre(haut / 1e6, 1)} M€` : `€${nombre(bas / 1e6, 1)}–${nombre(haut / 1e6, 1)}M`;
  const k = (v) => nombre(Math.round(v / 1e4) * 10, 0);
  return fr ? `${k(bas)} – ${k(haut)} k€` : `€${k(bas)}–${k(haut)}K`;
}

/** A single amount, in the unit of its range (M€ if the top reaches €1M): "1,9 M€", "400 k€". */
export function montant(v, haut) {
  if (haut >= 1e6) return euros(nombre(v / 1e6, 1), "M");
  return euros(nombre(Math.round(v / 1e4) * 10, 0), "k");
}

/** Position of the central value on the low → high bar, in % (0 to 100; 50 if the range is zero). */
export function positionRepere(bas, central, haut) {
  if (!(haut > bas)) return 50;
  return Math.min(100, Math.max(0, ((central - bas) / (haut - bas)) * 100));
}

/** Date of a multiples reference ("croisement-2026-11" → "novembre 2026", "November 2026"); null if missing. */
export function moisSource(source) {
  const m = /(\d{4})-(\d{2})$/.exec(String(source || ""));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleDateString(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Displayed multiple: "5,6" */
export const multiple = (v) => nombre(v, Number.isInteger(v) ? 0 : 1);

/** Replaces {cle} in a text template. */
export const remplir = (modele, valeurs) => String(modele || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in valeurs ? String(valeurs[k]) : m));

const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

/** Line of a suggestion: "City (dept.) · founded in YYYY · 20 to 49 employees". */
export function detailSuggestion(x) {
  const dep = departement(x.code_postal);
  const annee = /^\d{4}/.test(x.date_creation || "") ? x.date_creation.slice(0, 4) : null;
  const effectif = x.tranche_effectif && x.tranche_effectif !== "NN" ? libelleSalaries(x.tranche_effectif) : null;
  return [x.ville ? `${x.ville}${dep ? ` (${dep})` : ""}` : null, annee ? t("regles.suggestion.creee", { annee }) : null, effectif].filter(Boolean).join(" · ");
}
