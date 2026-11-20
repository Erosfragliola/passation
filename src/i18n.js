// Langues côté Worker : dictionnaires (src/contenu/<langue>/*.json), langue de la requête en cours, adresses.
//
// Langue d'une requête :
//   page        : l'adresse fait foi (/fr/… = français, sinon anglais) ;
//   API         : la page d'où vient l'appel (en-tête Referer), sinon le cookie « langue », sinon inconnue (textes en
//                 français, liens sans préfixe) ;
//   tâche planifiée (rappels) : français.
// Le module public/js/i18n.js (t, lien…) lit cette langue : les modules partagés avec le navigateur l'utilisent tels quels.
import { AsyncLocalStorage } from "node:async_hooks";
import { installerDictionnaire, sourceDeLangue, LANGUES, LANGUE_DEFAUT, PREFIXES } from "../public/js/i18n.js";
import CLES from "./contenu/cles.json";
import frAccueil from "./contenu/fr/accueil.json";
import enAccueil from "./contenu/en/accueil.json";
import frCommun from "./contenu/fr/commun.json";
import enCommun from "./contenu/en/commun.json";

export { LANGUES, LANGUE_DEFAUT, PREFIXES };
export { CLES };

/** Fichiers de traduction, par langue puis par espace de noms (= nom du fichier). Mêmes clés dans chaque langue. */
export const SOURCES = {
  fr: { accueil: frAccueil, commun: frCommun },
  en: { accueil: enAccueil, commun: enCommun },
};

/** Valeur vide : chaîne blanche ou absente (la traduction manque, le français prend le relais). */
const manque = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Dictionnaire d'une langue complété par le français pour chaque valeur absente ou vide (jamais de clé affichée). */
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

/** Exécute fn avec la langue donnée comme langue courante (t(), lien()…). */
export const avecLangue = (langue, fn) => contexte.run({ langue }, fn);

/** Langue et chemin sans préfixe d'une adresse : « /fr/cgu » → { langue: "fr", chemin: "/cgu" }. */
export function decouper(pathname) {
  for (const l of LANGUES) {
    const p = PREFIXES[l];
    if (p && (pathname === p || pathname.startsWith(`${p}/`))) return { langue: l, chemin: pathname.slice(p.length) || "/" };
  }
  return { langue: LANGUE_DEFAUT, chemin: pathname };
}

/** Valeur du cookie « langue » (choix fait avec le sélecteur), ou null. */
export function langueDuCookie(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)langue=([a-z]{2})(?:;|$)/);
  return m && LANGUES.includes(m[1]) ? m[1] : null;
}

/** Langue d'une requête (voir l'en-tête du fichier), ou null si l'appel ne dit rien. */
export function langueDeRequete(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return decouper(url.pathname).langue;
  const origine = request.headers.get("referer");
  if (origine) {
    try {
      const r = new URL(origine);
      if (r.origin === url.origin) return decouper(r.pathname).langue;
    } catch { /* en-tête invalide */ }
  }
  return langueDuCookie(request);
}

/** Adresse d'un chemin dans une langue : adresse("/cgu", "fr") → « /fr/cgu ». */
export const adresse = (chemin, langue) => (PREFIXES[langue] ? (chemin === "/" ? `${PREFIXES[langue]}/` : PREFIXES[langue] + chemin) : chemin);
