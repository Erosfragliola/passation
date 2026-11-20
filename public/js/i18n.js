// Traductions, partagées par le navigateur et le Worker (même module des deux côtés).
// Les textes sont dans src/contenu/<langue>/*.json (une langue = un dossier, mêmes clés). Ce module ne contient aucun
// texte : il lit le dictionnaire de la langue courante.
//   Navigateur : le Worker pose le dictionnaire de la page dans <script type="application/json" id="i18n"> (anglais
//                complété par le français pour toute clé absente) et la langue dans <html lang>.
//   Worker     : src/i18n.js installe les dictionnaires et la langue de la requête en cours.
//
// t("espace.supprimer.confirmer", { nom: "X" }) : texte de la clé, {repères} remplacés. Une clé dont la valeur est
// { one, other } (ou { zero, one, other }) choisit sa forme d'après valeurs.n (règles de pluriel de la langue).
// Clé introuvable dans la langue : texte français ; introuvable partout : la clé elle-même (repérée par les tests).

export const LANGUES = ["en", "fr"];
export const LANGUE_DEFAUT = "en";
/** Préfixe d'adresse de chaque langue (la langue par défaut garde les adresses sans préfixe). */
export const PREFIXES = { en: "", fr: "/fr" };
const LOCALES = { en: "en-US", fr: "fr-FR" };

const dictionnaires = {};
let source = () => (typeof document !== "undefined" ? document.documentElement.lang : undefined);

/** Dictionnaire d'une langue (objet imbriqué, clés « a.b.c »). */
export function installerDictionnaire(langue, dictionnaire) { dictionnaires[langue] = dictionnaire; }
/** Fonction qui donne la langue courante (le Worker la lit dans le contexte de la requête). */
export function sourceDeLangue(fn) { source = fn; }

/** Langue courante : « en » ou « fr » (français si rien n'est connu, c'est la langue des données). */
export function langue() {
  const l = source();
  return LANGUES.includes(l) ? l : "fr";
}
/** Locale Intl de la langue courante (formats de nombres, de dates). */
export const locale = (l = langue()) => LOCALES[l] || LOCALES.fr;

const lire = (objet, cle) => String(cle).split(".").reduce((v, k) => (v == null ? undefined : v[k]), objet);

/** Valeur brute d'une clé (chaîne, liste, objet), langue courante puis français. */
export function valeur(cle, l = langue()) {
  const v = lire(dictionnaires[l], cle);
  return v === undefined || v === "" ? lire(dictionnaires.fr, cle) : v;
}

/** Texte d'une clé, {repères} remplacés par valeurs. */
export function t(cle, valeurs = {}, l = langue()) {
  let v = valeur(cle, l);
  if (v && typeof v === "object" && !Array.isArray(v) && "other" in v) {
    const n = Number(valeurs.n ?? 0);
    const forme = n === 0 && "zero" in v ? "zero" : new Intl.PluralRules(locale(l)).select(n);
    v = v[forme] ?? v.other;
  }
  if (v == null) return cle;
  if (typeof v !== "string") return v;
  return v.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (m, k) => (Object.hasOwn(valeurs, k) && valeurs[k] != null ? String(valeurs[k]) : m));
}

/** Langue posée par la page ou la requête, ou null (tests, code hors requête). */
export function langueConnue() {
  const l = source();
  return LANGUES.includes(l) ? l : null;
}

/** Adresse interne dans la langue de la page ou de la requête : lien("/espace/") → « /fr/espace/ » en français.
 *  Sans langue connue, l'adresse est rendue telle quelle. */
export function lien(chemin, l = langueConnue()) {
  const s = String(chemin);
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/api/")) return s;
  const prefixe = PREFIXES[l] || "";
  if (!prefixe || s === prefixe || s.startsWith(`${prefixe}/`)) return s;
  return s === "/" ? `${prefixe}/` : prefixe + s;
}

/** Marqueur d'un texte traduit dans une définition partagée (questions, champs…) : avecTextes() le remplace par un
 *  accesseur, lu à chaque accès dans la langue de la page ou de la requête (jamais figé au chargement du module). */
export const T = Symbol("texte");
/** Remplace chaque propriété marquée T par un accesseur : t(`${base}.${propriété}`). */
export function avecTextes(objet, base) {
  for (const [k, v] of Object.entries(objet)) if (v === T) Object.defineProperty(objet, k, { get: () => t(`${base}.${k}`), enumerable: true, configurable: true });
  return objet;
}

/** Nombre au format de la langue (options d'Intl.NumberFormat). */
export const nombre = (v, options = {}, l = langue()) => new Intl.NumberFormat(locale(l), options).format(v);

// Navigateur : dictionnaire posé dans la page par le Worker.
if (typeof document !== "undefined") {
  const s = document.getElementById("i18n");
  if (s) { try { installerDictionnaire(langue(), JSON.parse(s.textContent)); } catch { /* page sans dictionnaire */ } }
}
