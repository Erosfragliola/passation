// Faits relevés sur le site de l'entreprise, choix limités et dates clés : règles pures, partagées par le parcours
// guidé (navigateur) et le serveur (propositions, rédaction). Testées dans test/faits-site.test.js.

import { TRANCHES } from "./regles.js";
import { t } from "./i18n.js";

// ------------------------------------------------------------------ Faits du site regroupés par thème
/** Thème affiché de chaque catégorie de fait (src/lib/claude.js, SCHEMA_SITE). */
export const THEMES_FAITS = { activite: "activite", produits: "activite", qualite: "savoir_faire", clients: "clients_zone", marche: "clients_zone", implantation: "clients_zone", histoire: "histoire", equipe: "histoire", autre: "autre" };
export const ORDRE_THEMES = ["activite", "savoir_faire", "clients_zone", "histoire", "autre"];

/** Faits groupés par thème, dans l'ordre d'affichage : [[theme, [faits]]], thèmes vides omis. */
export function faitsParTheme(faits = []) {
  const groupes = new Map(ORDRE_THEMES.map((k) => [k, []]));
  for (const f of faits) groupes.get(THEMES_FAITS[f.categorie] || "autre").push(f);
  return [...groupes].filter(([, l]) => l.length);
}

/** Les faits les plus utiles, montrés d'emblée : le premier de chaque thème principal, puis les suivants, n au plus. */
export function faitsEssentiels(faits = [], n = 4) {
  const parTheme = faitsParTheme(faits).filter(([k]) => k !== "autre").map(([, l]) => [...l]);
  const choisis = [];
  while (choisis.length < n && parTheme.some((l) => l.length)) for (const l of parTheme) if (l.length && choisis.length < n) choisis.push(l.shift());
  return choisis;
}

// ------------------------------------------------------------------ Contradictions site / registres
const ANNEE = /\b(18[5-9]\d|19\d\d|20[0-4]\d)\b/;
// « créée en 1982 », « fondée en 1982 », « depuis 1982 », « depuis plus de 40 ans » n'est pas daté : ignoré
const CREATION = /(cr[ée]{2}e?s?|fond[ée]e?s?|n[ée]e?|depuis|since|founded|established|created)\b[^.]{0,30}?\b(18[5-9]\d|19\d\d|20[0-4]\d)\b/i;
// Effectif : « 12 salariés », « une équipe de 14 personnes », « 25 employees »
const EFFECTIF = /\b(\d{1,4})\s+(salari[ée]s|collaborat(?:eurs|rices)|personnes|compagnons|employ[ée]s|employees|staff|people)\b/i;

/**
 * Faits du site contredits par les registres : année de création différente, effectif hors de la tranche INSEE.
 * @returns [{ id, type: "creation" | "effectif", site, registre }] ; le fait n'est pas utilisé tant que le dirigeant
 *          n'a pas tranché (cle « resolu » posée sur le fait).
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

/** Faits utilisables pour la rédaction : validés, et sans contradiction non tranchée. */
export function faitsUtilisables(faits = [], entreprise = {}) {
  const enAttente = new Set(contradictions(faits, entreprise).map((c) => c.id));
  return faits.filter((f) => f.valide !== false && (!enAttente.has(f.id) || f.resolu));
}

// ------------------------------------------------------------------ Choix limités
/** Garde au plus `max` réponses (les premières), sans doublon. */
export function limiterChoix(valeurs, max) {
  const l = [...new Set(Array.isArray(valeurs) ? valeurs : [])];
  return Number.isFinite(max) ? l.slice(0, max) : l;
}

// ------------------------------------------------------------------ Dates clés
/** Types d'événement proposés (valeurs enregistrées ; libellés dans src/contenu/<langue>/parcours.json). */
export const TYPES_EVENEMENT = ["creation", "reprise", "transfert_siege", "agrandissement", "nouveau_metier", "certification", "recrutement", "equipement", "autre"];

/** « 2016 », « 03/2016 », « 3-2016 », « 15/03/2016 », « 2016-03-15 » → { annee, mois?, jour?, texte } ; null sinon. */
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
 * Dates clés enregistrées → lignes { date, type, precision, source }. Accepte l'ancien format (texte « une ligne par
 * date » : « 1998 : création à Lyon ») pour les dossiers déjà remplis.
 */
export function lignesDates(v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object").map((x) => ({ date: String(x.date ?? ""), type: TYPES_EVENEMENT.includes(x.type) ? x.type : "autre", precision: String(x.precision ?? ""), source: x.source ?? null }));
  return String(v ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}[/.-]\d{4}|\d{4})\s*[:–-]?\s*(.*)$/.exec(l);
    return m ? { date: m[1], type: "autre", precision: m[2], source: null } : { date: "", type: "autre", precision: l, source: null };
  });
}

// ------------------------------------------------------------------ Phrase d'activité (proposée, modifiable)
/** « MENUISERIE EXEMPLE » → « Menuiserie Exemple » (raison sociale en capitales des registres) ; sinon inchangé. */
export function nomLisible(nom) {
  const s = String(nom || "").trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Sas|Sarl|Sa|Eurl|Sasu|Snc)\b/g, (x) => x.toUpperCase());
}
/** Premier mot en minuscule, sauf sigle (« RGE », « ISO ») : pour une énumération dans une phrase. */
const enMinuscule = (x) => (/^\p{Lu}\p{Ll}/u.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
/**
 * Phrase d'ouverture proposée à partir des choix du dirigeant (aucun appel à Claude, aucun mot ajouté) :
 * « Menuiserie Exemple : escaliers sur mesure, portes intérieures et agencement de magasins, pour des particuliers et
 * des entreprises. » Vide si aucun métier n'est coché.
 * @param o.nom raison sociale ; o.metiers libellés cochés ; o.clients libellés des types de clientèle cochés ; o.l langue
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
