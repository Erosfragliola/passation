// Facts found on the company's website, limited choices and key dates: pure rules, shared by the guided flow
// (browser) and the server (proposals, drafting). Tested in test/faits-site.test.js.

import { TRANCHES } from "./regles.js";
import { t } from "./i18n.js";

// ------------------------------------------------------------------ Website facts grouped by theme
/** Theme shown for each category of fact (src/lib/claude.js, SCHEMA_SITE). */
export const THEMES_FAITS = { activite: "activite", produits: "activite", qualite: "savoir_faire", clients: "clients_zone", marche: "clients_zone", implantation: "clients_zone", histoire: "histoire", equipe: "histoire", autre: "autre" };
export const ORDRE_THEMES = ["activite", "savoir_faire", "clients_zone", "histoire", "autre"];

/** Facts grouped by theme, in display order: [[theme, [faits]]], empty themes left out. */
export function faitsParTheme(faits = []) {
  const groupes = new Map(ORDRE_THEMES.map((k) => [k, []]));
  for (const f of faits) groupes.get(THEMES_FAITS[f.categorie] || "autre").push(f);
  return [...groupes].filter(([, l]) => l.length);
}

/** The most useful facts, shown at once: the first of each main theme, then the next ones, n at most. */
export function faitsEssentiels(faits = [], n = 4) {
  const parTheme = faitsParTheme(faits).filter(([k]) => k !== "autre").map(([, l]) => [...l]);
  const choisis = [];
  while (choisis.length < n && parTheme.some((l) => l.length)) for (const l of parTheme) if (l.length && choisis.length < n) choisis.push(l.shift());
  return choisis;
}

// ------------------------------------------------------------------ Contradictions site / registres
const ANNEE = /\b(18[5-9]\d|19\d\d|20[0-4]\d)\b/;
// « créée en 1982 », « fondée en 1982 », « depuis 1982 », « depuis plus de 40 ans » is not dated: ignored
const CREATION = /(cr[ée]{2}e?s?|fond[ée]e?s?|n[ée]e?|depuis|since|founded|established|created)\b[^.]{0,30}?\b(18[5-9]\d|19\d\d|20[0-4]\d)\b/i;
// Headcount: « 12 salariés », « une équipe de 14 personnes », « 25 employees »
const EFFECTIF = /\b(\d{1,4})\s+(salari[ée]s|collaborat(?:eurs|rices)|personnes|compagnons|employ[ée]s|employees|staff|people)\b/i;

/**
 * Website facts contradicted by the registries: different year of incorporation, headcount outside the INSEE band.
 * @returns [{ id, type: "creation" | "effectif", site, registre }]; the fact is not used until the owner has decided
 *          (key « resolu » set on the fact).
 */
export function contradictions(faits = [], entreprise = {}) {
  const res = [];
  const creation = Number(String(entreprise.date_creation || "").slice(0, 4)) || null;
  const code = String(entreprise.tranche_effectif?.code ?? "");
  const tranche = code && code !== "NN" && TRANCHES[code] ? [TRANCHES[code].min, TRANCHES[code].max ?? Infinity] : null;
  for (const f of faits) {
    const texte = String(f.fait || "");
    if (creation && ["histoire", "activite", "autre", "implantation"].includes(f.categorie)) {
      const m = CREATION.exec(texte);
      const a = m ? Number(m[2]) : null;
      if (a && a !== creation && ANNEE.test(texte)) { res.push({ id: f.id, type: "creation", site: a, registre: creation }); continue; }
    }
    if (tranche) {
      const m = EFFECTIF.exec(texte);
      const n = m ? Number(m[1]) : null;
      if (n != null && (n < tranche[0] || n > tranche[1])) res.push({ id: f.id, type: "effectif", site: n, registre: tranche });
    }
  }
  return res;
}

/** Facts usable for the drafting: approved, and without an unresolved contradiction. */
export function faitsUtilisables(faits = [], entreprise = {}) {
  const enAttente = new Set(contradictions(faits, entreprise).map((c) => c.id));
  return faits.filter((f) => f.valide !== false && (!enAttente.has(f.id) || f.resolu));
}

// ------------------------------------------------------------------ Limited choices
/** Keeps at most `max` answers (the first ones), without duplicates. */
export function limiterChoix(valeurs, max) {
  const l = [...new Set(Array.isArray(valeurs) ? valeurs : [])];
  return Number.isFinite(max) ? l.slice(0, max) : l;
}

// ------------------------------------------------------------------ Key dates
/** Types of event proposed (saved values; labels in src/contenu/<language>/parcours.json). */
export const TYPES_EVENEMENT = ["creation", "reprise", "transfert_siege", "agrandissement", "nouveau_metier", "certification", "recrutement", "equipement", "autre"];

/** « 2016 », « 03/2016 », « 3-2016 », « 15/03/2016 », « 2016-03-15 » → { annee, mois?, jour?, texte }; null otherwise. */
export function lireDate(brut) {
  const s = String(brut ?? "").trim();
  let m;
  const ok = (annee, mois = null, jour = null) => {
    if (annee < 1800 || annee > 2100) return null;
    if (mois != null && (mois < 1 || mois > 12)) return null;
    if (jour != null && (jour < 1 || jour > new Date(Date.UTC(annee, mois, 0)).getUTCDate())) return null;
    const p = (x) => String(x).padStart(2, "0");
    return { annee, mois, jour, texte: jour ? `${p(jour)}/${p(mois)}/${annee}` : mois ? `${p(mois)}/${annee}` : String(annee) };
  };
  if ((m = /^(\d{4})$/.exec(s))) return ok(+m[1]);
  if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(s))) return ok(+m[2], +m[1]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) return ok(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return ok(+m[1], +m[2], +m[3]);
  return null;
}

/**
 * Saved key dates → rows { date, type, precision, source }. Accepts the old format (text « one line per date »:
 * « 1998 : création à Lyon ») for files already filled in.
 */
export function lignesDates(v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object").map((x) => ({ date: String(x.date ?? ""), type: TYPES_EVENEMENT.includes(x.type) ? x.type : "autre", precision: String(x.precision ?? ""), source: x.source ?? null }));
  return String(v ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}[/.-]\d{4}|\d{4})\s*[:–-]?\s*(.*)$/.exec(l);
    return m ? { date: m[1], type: "autre", precision: m[2], source: null } : { date: "", type: "autre", precision: l, source: null };
  });
}

// ------------------------------------------------------------------ Business sentence (proposed, editable)
/**
 * « MENUISERIE EXEMPLE » → « Menuiserie Exemple » (company name in capitals in the registries); otherwise unchanged.
 */
export function nomLisible(nom) {
  const s = String(nom || "").trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Sas|Sarl|Sa|Eurl|Sasu|Snc)\b/g, (x) => x.toUpperCase());
}
/** First word in lower case, except an acronym (« RGE », « ISO »): for a list inside a sentence. */
const enMinuscule = (x) => (/^\p{Lu}\p{Ll}/u.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
/**
 * Opening sentence proposed from the owner's choices (no call to Claude, no word added):
 * « Menuiserie Exemple : escaliers sur mesure, portes intérieures et agencement de magasins, pour des particuliers et
 * des entreprises. » Empty if no trade is ticked.
 * @param o.nom company name; o.metiers labels ticked; o.clients labels of the types of customers ticked; o.l language
 */
export function phraseActivite({ nom, metiers = [], clients = [], l }) {
  const m = metiers.map((x) => String(x).trim()).filter(Boolean);
  if (!m.length) return "";
  const liste = (xs) => new Intl.ListFormat(l === "en" ? "en-US" : "fr-FR", { style: "long", type: "conjunction" }).format(xs);
  const metiersTxt = liste(m.map(enMinuscule));
  const n = nomLisible(nom) || t("parcours.phrase.entreprise", {}, l);
  return clients.length
    ? t("parcours.phrase.avec_clients", { nom: n, metiers: metiersTxt, clients: liste(clients.map((c) => t(/^(autres|other)\s/i.test(c) ? "parcours.phrase.client_autres" : "parcours.phrase.client_article", { client: enMinuscule(c) }, l))) }, l)
    : t("parcours.phrase.sans_clients", { nom: n, metiers: metiersTxt }, l);
}
