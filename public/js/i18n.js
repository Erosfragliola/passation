// Translations, shared by the browser and the Worker (same module on both sides).
// The texts are in src/contenu/<language>/*.json (one language = one folder, same keys). This module contains no
// text: it reads the dictionary of the current language.
//   Browser: the Worker places the page's dictionary in <script type="application/json" id="i18n"> (English
//            completed with French for any missing key) and the language in <html lang>.
//   Worker : src/i18n.js installs the dictionaries and the language of the current request.
//
// t("dossier.taches.chiffres.titre", { annee: 2024 }): text of the key, {placeholders} replaced. A key whose value is
// { one, other } (or { zero, one, other }) picks its form from valeurs.n (plural rules of the language).
// Key not found in the language: French text; not found anywhere: the key itself (caught by the tests).

export const LANGUES = ["en", "fr"];
export const LANGUE_DEFAUT = "en";
/** Address prefix of each language (the default language keeps the addresses without a prefix). */
export const PREFIXES = { en: "", fr: "/fr" };
const LOCALES = { en: "en-US", fr: "fr-FR" };

const dictionnaires = {};
let source = () => (typeof document !== "undefined" ? document.documentElement.lang : undefined);

/** Dictionary of a language (nested object, keys "a.b.c"). */
export function installerDictionnaire(langue, dictionnaire) { dictionnaires[langue] = dictionnaire; }
/** Function that gives the current language (the Worker reads it in the request context). */
export function sourceDeLangue(fn) { source = fn; }

/** Current language: "en" or "fr" (French if nothing is known, it is the language of the data). */
export function langue() {
  const l = source();
  return LANGUES.includes(l) ? l : "fr";
}
/** Intl locale of the current language (number and date formats). */
export const locale = (l = langue()) => LOCALES[l] || LOCALES.fr;

const lire = (objet, cle) => String(cle).split(".").reduce((v, k) => (v == null ? undefined : v[k]), objet);

/** Raw value of a key (string, list, object), current language then French. */
export function valeur(cle, l = langue()) {
  const v = lire(dictionnaires[l], cle);
  return v === undefined || v === "" ? lire(dictionnaires.fr, cle) : v;
}

/** Text of a key, {placeholders} replaced by valeurs. */
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

/** Language set by the page or the request, or null (tests, code outside a request). */
export function langueConnue() {
  const l = source();
  return LANGUES.includes(l) ? l : null;
}

/** Internal address in the language of the page or the request: lien("/espace/") → "/fr/espace/" in French.
 *  Without a known language, the address is returned as is. */
export function lien(chemin, l = langueConnue()) {
  const s = String(chemin);
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/api/")) return s;
  const prefixe = PREFIXES[l] || "";
  if (!prefixe || s === prefixe || s.startsWith(`${prefixe}/`)) return s;
  return s === "/" ? `${prefixe}/` : prefixe + s;
}

/** Number entered by the user → Number. Spaces, €, % ignored; in French the comma is the decimal separator
 *  ("1 234,5"), in English it separates thousands ("1,234.5"). "" → null; unreadable → NaN. */
export function lireNombreSaisi(s, l = langue()) {
  let x = String(s ?? "").replace(/[\s\u00a0\u202f€%]/g, "");
  x = l === "fr" ? x.replace(",", ".") : x.replace(/,/g, "");
  if (x === "" || x === "-") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

/** Marker of a translated text in a shared definition (questions, fields…): avecTextes() replaces it with an
 *  accessor, read at each access in the language of the page or the request (never frozen when the module loads). */
export const T = Symbol("texte");
/** Replaces each property marked T with an accessor: t(`${base}.${property}`). */
export function avecTextes(objet, base) {
  for (const [k, v] of Object.entries(objet)) if (v === T) Object.defineProperty(objet, k, { get: () => t(`${base}.${k}`), enumerable: true, configurable: true });
  return objet;
}

/** Number in the language's format (Intl.NumberFormat options). */
export const nombre = (v, options = {}, l = langue()) => new Intl.NumberFormat(locale(l), options).format(v);

// Browser: dictionary placed in the page by the Worker.
if (typeof document !== "undefined") {
  const s = document.getElementById("i18n");
  if (s) { try { installerDictionnaire(langue(), JSON.parse(s.textContent)); } catch { /* page without a dictionary */ } }
}
