// Contenus de la page d'accueil (src/contenu/landing.json) : fonctions pures, sans DOM ni Worker (testées dans
// test/contenu.test.js). Le Worker les applique à la page avec HTMLRewriter (src/routes/landing.js).
//
// Conventions du fichier de contenu :
//   *mot*      mot-clé en italique (Instrument Serif) ;
//   {cle}      valeur de « cles » (prix, téléphone…) ;
//   valeur vide (ou {cle} vide) : l'élément est retiré de la page ;
//   liste de textes : un paragraphe par élément.
// La typographie française est appliquée ici : on peut écrire le fichier avec des espaces et apostrophes simples.

const FINE = " ";   // espace fine insécable
const INSECABLE = " ";

/** Espaces fines avant ; : ! ? et dans « », apostrophe typographique, espace insécable avant les unités, points
 *  de suspension. N'ajoute jamais d'espace là où il n'y en a pas avant ; : ! ? (heures, adresses). */
export function typographier(s) {
  return String(s)
    .replace(/\.\.\./g, "…")
    .replace(/'/g, "’")
    .replace(/[   ]*([;:!?])/g, (m, p) => (m.length > 1 ? FINE + p : p))
    .replace(/«[   ]*/g, "«" + FINE)
    .replace(/[   ]*»/g, FINE + "»")
    .replace(/ – /g, INSECABLE + "– ")
    .replace(/ ((?:[kM])?€|%)/g, INSECABLE + "$1");
}

/** Échappement HTML (texte et attributs). */
export const echapper = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Valeur à un chemin « a.b.0.c ». */
export function lire(contenu, chemin) {
  return String(chemin).split(".").reduce((v, k) => (v == null ? undefined : v[k]), contenu);
}

/** Vide : absente, chaîne blanche, liste vide (ou ne contenant que du vide). */
export function estVide(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(estVide);
  return false;
}

/** Remplace {cle} par la valeur de contenu.cles ; renvoie null si une clé utilisée est vide. Les {repères}
 *  inconnus de « cles » (ex. {exercice}) sont laissés tels quels pour le JavaScript de la page. */
export function interpoler(s, cles = {}) {
  let manque = false;
  const r = String(s).replace(/\{([a-z_]+)\}/g, (m, k) => {
    if (!Object.hasOwn(cles, k)) return m;
    if (estVide(cles[k])) { manque = true; return ""; }
    return String(cles[k]);
  });
  return manque ? null : r;
}

/** Texte en ligne : échappé, typographié, *mot* → <em>mot</em>. */
export function enLigne(s) {
  return echapper(typographier(s)).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * HTML d'une valeur du contenu, ou null si elle est vide (l'élément doit alors disparaître).
 * Chaîne : texte en ligne ; liste de chaînes : un paragraphe par élément.
 */
export function html(contenu, chemin) {
  const v = lire(contenu, chemin);
  if (estVide(v)) return null;
  const un = (s) => { const t = interpoler(s, contenu.cles); return t == null || estVide(t) ? null : enLigne(t); };
  if (Array.isArray(v)) {
    const ps = v.map(un).filter(Boolean);
    return ps.length ? ps.map((p) => `<p>${p}</p>`).join("") : null;
  }
  if (typeof v !== "string") return null;
  return un(v);
}

/** Texte brut (attributs : alt, aria-label, content…), ou null si vide. Les *mots* perdent leurs astérisques. */
export function texte(contenu, chemin) {
  const v = lire(contenu, chemin);
  if (typeof v !== "string" || estVide(v)) return null;
  const t = interpoler(v, contenu.cles);
  return t == null || estVide(t) ? null : typographier(t).replace(/\*([^*]+)\*/g, "$1");
}

/** « attr=chemin; attr2=chemin2 » → [[attr, chemin], …] */
export const lireAttributs = (spec) => String(spec).split(";").map((x) => x.trim()).filter(Boolean).map((x) => x.split("=").map((y) => y.trim()));

/** Sous-arbre destiné au JavaScript de la page : chaînes typographiées et interpolées (vides conservés). */
export function pourJs(contenu, chemin) {
  const v = lire(contenu, chemin);
  const parcourir = (x) => {
    if (typeof x === "string") return typographier(interpoler(x, contenu.cles) ?? "");
    if (Array.isArray(x)) return x.map(parcourir);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, parcourir(y)]));
    return x;
  };
  return parcourir(v);
}

/** JSON sûr dans une balise <script> (pas de « </script> » possible). */
export const jsonDansScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Clés de contenu.cles encore vides (avertissement en développement, liste « À me fournir »). */
export const clesVides = (contenu) => Object.entries(contenu.cles || {}).filter(([, v]) => estVide(v)).map(([k]) => k);
