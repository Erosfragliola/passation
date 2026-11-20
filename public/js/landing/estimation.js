// Estimation express : appels aux routes existantes (GET /api/maquette/:siren, POST /api/estimation) et mise en
// forme des montants et des suggestions. Aucun calcul ici : le moteur est côté serveur (src/valuation/express.js).
import { libelleSalaries } from "../regles.js";
import { t, langue, locale } from "../i18n.js";

/** Données publiques et estimation d'une société : { ok: true, donnees } ou { ok: false, code }. */
export async function chargerEntreprise(siren) {
  let r;
  try { r = await fetch(`/api/maquette/${encodeURIComponent(siren)}`); } catch { return { ok: false, code: "reseau" }; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, code: d.erreur || (r.status >= 500 ? "source_indisponible" : "introuvable") };
  return { ok: true, donnees: d };
}

/** Comptes non publiés : estimation à partir du CA et de l'EBE saisis (en euros). Rien n'est enregistré. */
export async function estimationManuelle({ section_naf, ca, ebe }) {
  try {
    const r = await fetch("/api/estimation", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_naf, ca, ebe }) });
    if (!r.ok) return null;
    return (await r.json()).estimation ?? null;
  } catch { return null; }
}

/** Recherche par nom (autocomplétion) : suggestions actives, ou null si le service ne répond pas. */
export async function rechercher(q) {
  try {
    const r = await fetch(`/api/company/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    return (await r.json()).suggestions ?? [];
  } catch { return null; }
}

const nombre = (v, decimales) => new Intl.NumberFormat(locale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
/** Montant avec son unité : « 1,8 M€ » en français, « €1.8M » en anglais (sep : espace avant l'unité en français). */
const euros = (texte, unite, sep = " ") => (langue() === "fr" ? `${texte}${sep}${unite}€` : `€${texte}${unite === "k" ? "K" : unite}`);

/**
 * Fourchette lisible, une seule unité : en M€ avec une décimale dès que le haut atteint 1 M€
 * (« 1,8 – 2,4 M€ » ; en anglais « €1.8–2.4M »), sinon en k€ arrondis à la dizaine (« 150 – 230 k€ », « €150–230K »).
 * En français, espace insécable avant l'unité et avant le tiret.
 */
export function fourchette(bas, haut) {
  const fr = langue() === "fr";
  if (haut >= 1e6) return fr ? `${nombre(bas / 1e6, 1)} – ${nombre(haut / 1e6, 1)} M€` : `€${nombre(bas / 1e6, 1)}–${nombre(haut / 1e6, 1)}M`;
  const k = (v) => nombre(Math.round(v / 1e4) * 10, 0);
  return fr ? `${k(bas)} – ${k(haut)} k€` : `€${k(bas)}–${k(haut)}K`;
}

/** Un montant seul, dans l'unité de sa fourchette (M€ si le haut atteint 1 M€) : « 1,9 M€ », « 400 k€ ». */
export function montant(v, haut) {
  if (haut >= 1e6) return euros(nombre(v / 1e6, 1), "M");
  return euros(nombre(Math.round(v / 1e4) * 10, 0), "k");
}

/** Position de la valeur centrale sur la barre bas → haut, en % (0 à 100 ; 50 si la fourchette est nulle). */
export function positionRepere(bas, central, haut) {
  if (!(haut > bas)) return 50;
  return Math.min(100, Math.max(0, ((central - bas) / (haut - bas)) * 100));
}

/** Date d'une référence de multiples (« croisement-2026-11 » → « novembre 2026 », « November 2026 ») ; null si absente. */
export function moisSource(source) {
  const m = /(\d{4})-(\d{2})$/.exec(String(source || ""));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleDateString(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Multiple affiché : « 5,6 » */
export const multiple = (v) => nombre(v, Number.isInteger(v) ? 0 : 1);

/** Remplace {cle} dans un modèle de texte. */
export const remplir = (modele, valeurs) => String(modele || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in valeurs ? String(valeurs[k]) : m));

const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

/** Ligne d'une suggestion : « Ville (dép.) · créée en AAAA · 20 à 49 salariés ». */
export function detailSuggestion(x) {
  const dep = departement(x.code_postal);
  const annee = /^\d{4}/.test(x.date_creation || "") ? x.date_creation.slice(0, 4) : null;
  const effectif = x.tranche_effectif && x.tranche_effectif !== "NN" ? libelleSalaries(x.tranche_effectif) : null;
  return [x.ville ? `${x.ville}${dep ? ` (${dep})` : ""}` : null, annee ? t("regles.suggestion.creee", { annee }) : null, effectif].filter(Boolean).join(" · ");
}
