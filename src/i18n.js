// Languages on the Worker side: dictionaries (src/contenu/<language>/*.json), language of the current request, addresses.
//
// Language of a request:
//   page        : the address decides (/fr/… = French, otherwise English);
//   API         : the page the call comes from (Referer header), otherwise the "langue" cookie, otherwise unknown
//                 (texts in French, links without a prefix);
//   scheduled task (reminders): French.
// The module public/js/i18n.js (t, lien…) reads this language: the modules shared with the browser use it as is.
import { AsyncLocalStorage } from "node:async_hooks";
import { installerDictionnaire, sourceDeLangue, LANGUES, LANGUE_DEFAUT, PREFIXES } from "../public/js/i18n.js";
import CLES from "./contenu/cles.json";
// One file per namespace and per language (static imports: the Worker is bundled in advance).
import fr_accueil from "./contenu/fr/accueil.json";
import en_accueil from "./contenu/en/accueil.json";
import fr_cgu from "./contenu/fr/cgu.json";
import en_cgu from "./contenu/en/cgu.json";
import fr_champs from "./contenu/fr/champs.json";
import en_champs from "./contenu/en/champs.json";
import fr_commun from "./contenu/fr/commun.json";
import en_commun from "./contenu/en/commun.json";
import fr_confidentialite from "./contenu/fr/confidentialite.json";
import en_confidentialite from "./contenu/en/confidentialite.json";
import fr_connexion from "./contenu/fr/connexion.json";
import en_connexion from "./contenu/en/connexion.json";
import fr_connexion_code from "./contenu/fr/connexion_code.json";
import en_connexion_code from "./contenu/en/connexion_code.json";
import fr_demarrer from "./contenu/fr/demarrer.json";
import en_demarrer from "./contenu/en/demarrer.json";
import fr_dossier from "./contenu/fr/dossier.json";
import en_dossier from "./contenu/en/dossier.json";
import fr_erreur_404 from "./contenu/fr/erreur_404.json";
import en_erreur_404 from "./contenu/en/erreur_404.json";
import fr_espace from "./contenu/fr/espace.json";
import en_espace from "./contenu/en/espace.json";
import fr_estimation from "./contenu/fr/estimation.json";
import en_estimation from "./contenu/en/estimation.json";
import fr_memo from "./contenu/fr/memo.json";
import en_memo from "./contenu/en/memo.json";
import fr_mentions_legales from "./contenu/fr/mentions_legales.json";
import en_mentions_legales from "./contenu/en/mentions_legales.json";
import fr_parcours from "./contenu/fr/parcours.json";
import en_parcours from "./contenu/en/parcours.json";
import fr_questionnaire from "./contenu/fr/questionnaire.json";
import en_questionnaire from "./contenu/en/questionnaire.json";
import fr_regles from "./contenu/fr/regles.json";
import en_regles from "./contenu/en/regles.json";
import fr_serveur from "./contenu/fr/serveur.json";
import en_serveur from "./contenu/en/serveur.json";
import fr_teaser from "./contenu/fr/teaser.json";
import en_teaser from "./contenu/en/teaser.json";
import fr_valorisation from "./contenu/fr/valorisation.json";
import en_valorisation from "./contenu/en/valorisation.json";

export { LANGUES, LANGUE_DEFAUT, PREFIXES };
export { CLES };

/** Translation files, by language then by namespace (= file name). Same keys in every language. */
export const SOURCES = {
  fr: { accueil: fr_accueil, cgu: fr_cgu, champs: fr_champs, commun: fr_commun, confidentialite: fr_confidentialite, connexion: fr_connexion, connexion_code: fr_connexion_code, demarrer: fr_demarrer, dossier: fr_dossier, erreur_404: fr_erreur_404, espace: fr_espace, estimation: fr_estimation, memo: fr_memo, mentions_legales: fr_mentions_legales, parcours: fr_parcours, questionnaire: fr_questionnaire, regles: fr_regles, serveur: fr_serveur, teaser: fr_teaser, valorisation: fr_valorisation },
  en: { accueil: en_accueil, cgu: en_cgu, champs: en_champs, commun: en_commun, confidentialite: en_confidentialite, connexion: en_connexion, connexion_code: en_connexion_code, demarrer: en_demarrer, dossier: en_dossier, erreur_404: en_erreur_404, espace: en_espace, estimation: en_estimation, memo: en_memo, mentions_legales: en_mentions_legales, parcours: en_parcours, questionnaire: en_questionnaire, regles: en_regles, serveur: en_serveur, teaser: en_teaser, valorisation: en_valorisation },
};

/** Empty value: blank or missing string (the translation is missing, French takes over). */
const manque = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Dictionary of a language completed with French for each missing or empty value (a key is never displayed). */
export function completerParFrancais(langue, fr = SOURCES.fr, autre = SOURCES[langue]) {
  if (langue === "fr") return fr;
  const fusion = (a, b) => {
    if (Array.isArray(a)) return Array.isArray(b) && b.length ? b.map((x, i) => fusion(a[i] ?? a[0], x)) : a;
    if (a && typeof a === "object") {
      const o = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b && typeof b === "object" ? b : {})])) o[k] = fusion(a[k], b?.[k]);
      return o;
    }
    return manque(b) ? a : b;
  };
  return fusion(fr, autre);
}

export const DICTIONNAIRES = Object.fromEntries(LANGUES.map((l) => [l, completerParFrancais(l)]));
for (const l of LANGUES) installerDictionnaire(l, DICTIONNAIRES[l]);

const contexte = new AsyncLocalStorage();
sourceDeLangue(() => contexte.getStore()?.langue);

/** Runs fn with the given language as the current language (t(), lien()…). */
export const avecLangue = (langue, fn) => contexte.run({ langue }, fn);

/** Language and path without the prefix of an address: "/fr/cgu" → { langue: "fr", chemin: "/cgu" }. */
export function decouper(pathname) {
  for (const l of LANGUES) {
    const p = PREFIXES[l];
    if (p && (pathname === p || pathname.startsWith(`${p}/`))) return { langue: l, chemin: pathname.slice(p.length) || "/" };
  }
  return { langue: LANGUE_DEFAUT, chemin: pathname };
}

/** Value of the "langue" cookie (choice made with the switcher), or null. */
export function langueDuCookie(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)langue=([a-z]{2})(?:;|$)/);
  return m && LANGUES.includes(m[1]) ? m[1] : null;
}

/** Language of a request (see the file header), or null if the call says nothing. */
export function langueDeRequete(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return decouper(url.pathname).langue;
  const origine = request.headers.get("referer");
  if (origine) {
    try {
      const r = new URL(origine);
      if (r.origin === url.origin) return decouper(r.pathname).langue;
    } catch { /* invalid header */ }
  }
  return langueDuCookie(request);
}

/** Address of a path in a language: adresse("/cgu", "fr") → "/fr/cgu". */
export const adresse = (chemin, langue) => (PREFIXES[langue] ? (chemin === "/" ? `${PREFIXES[langue]}/` : PREFIXES[langue] + chemin) : chemin);
