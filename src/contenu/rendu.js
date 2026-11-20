// Textes des pages (src/contenu/<langue>/*.json) : fonctions pures, sans DOM ni Worker (testées dans
// test/contenu.test.js). Le Worker les applique aux pages avec HTMLRewriter (src/routes/pages.js).
// contenu.langue (« fr » par défaut) choisit la typographie ; contenu.typo === false la désactive (textes déjà
// typographiés, recopiés tels quels des pages).
//
// Conventions du fichier de contenu :
//   *mot*      mot-clé en italique (Instrument Serif) ;
//   {cle}      valeur de « cles » (prix, téléphone…) ;
//   valeur vide (ou {cle} vide) : l'élément est retiré de la page ;
//   liste de textes : un paragraphe par élément.
// La typographie est appliquée ici : on peut écrire le fichier avec des espaces et apostrophes simples.

const FINE = " ";   // espace fine insécable
const INSECABLE = " ";

/** Espaces fines avant ; : ! ? et dans « », apostrophe typographique, espace insécable avant les unités, points
 *  de suspension. N'ajoute jamais d'espace là où il n'y en a pas avant ; : ! ? (heures, adresses). */
export function typographier(s, langue = "fr") {
  if (langue === false) return String(s);
  if (langue !== "fr") return String(s).replace(/\.\.\./g, "…").replace(/'/g, "’");
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

/** Typographie d'un contenu : sa langue, ou false (aucune). */
const typo = (contenu) => (contenu?.typo === false ? false : contenu?.langue || "fr");

/** Valeur à un chemin « a.b.0.c ». */
export function lire(contenu, chemin) {
  return String(chemin).split(".").reduce((v, k) => (v == null ? undefined : v[k]), contenu);
}

/** Vide : absente, chaîne blanche, faux (booléen), liste vide, objet dont toutes les valeurs sont vides. */
export function estVide(v) {
  if (v == null || v === false) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(estVide);
  if (typeof v === "object") return Object.values(v).every(estVide);
  return false;
}

/**
 * Condition d'affichage sur une clé de « cles » : « telephone », « legal.rcs » (chemin), « guides:3 » (liste d'au
 * moins 3 entrées non vides). Vrai si l'élément doit rester.
 */
export function condition(cles, jeton) {
  const [chemin, min] = String(jeton).split(":");
  const v = lire(cles, chemin);
  if (min) return Array.isArray(v) && v.filter((x) => !estVide(x)).length >= Number(min);
  return !estVide(v);
}

/** Remplace {cle} par la valeur de contenu.cles ; renvoie null si une clé utilisée est vide. Les {repères}
 *  inconnus de « cles » (ex. {exercice}) sont laissés tels quels pour le JavaScript de la page. */
export function interpoler(s, cles = {}) {
  let manque = false;
  const r = String(s).replace(/\{([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\}/g, (m, k) => {
    if (!Object.hasOwn(cles, k.split(".")[0])) return m;
    const v = lire(cles, k);
    if (estVide(v)) { manque = true; return ""; }
    return String(v);
  });
  return manque ? null : r;
}

/** Texte en ligne : échappé, typographié, *mot* → <em>mot</em>. */
export function enLigne(s, langue = "fr") {
  return echapper(typographier(s, langue)).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * HTML d'une valeur du contenu, ou null si elle est vide (l'élément doit alors disparaître).
 * Chaîne : texte en ligne ; liste de chaînes : un paragraphe par élément.
 */
export function html(contenu, chemin) {
  const v = lire(contenu, chemin);
  if (estVide(v)) return null;
  const un = (s) => { const t = interpoler(s, contenu.cles); return t == null || estVide(t) ? null : enLigne(t, typo(contenu)); };
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
  return t == null || estVide(t) ? null : typographier(t, typo(contenu)).replace(/\*([^*]+)\*/g, "$1");
}

/** « attr=chemin; attr2=chemin2 » → [[attr, chemin], …] */
export const lireAttributs = (spec) => String(spec).split(";").map((x) => x.trim()).filter(Boolean).map((x) => x.split("=").map((y) => y.trim()));

/** Valeur d'attribut finale : guillemets droits neutralisés ; « tel:01 23 45 67 89 » → « tel:0123456789 » (aucune espace,
 * insécable comprise, dans le lien). */
export function valeurAttribut(attr, t) {
  const v = attr === "href" && t.startsWith("tel:") ? `tel:${t.slice(4).replace(/[^\d+]/g, "")}` : t;
  return v.replace(/"/g, "”");
}

/** Sous-arbre destiné au JavaScript de la page : chaînes typographiées et interpolées (vides conservés). */
export function pourJs(contenu, chemin) {
  const v = lire(contenu, chemin);
  const parcourir = (x) => {
    if (typeof x === "string") return typographier(interpoler(x, contenu.cles) ?? "", typo(contenu));
    if (Array.isArray(x)) return x.map(parcourir);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, parcourir(y)]));
    return x;
  };
  return parcourir(v);
}

/** JSON sûr dans une balise <script> (pas de « </script> » possible). */
export const jsonDansScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Clés de contenu.cles encore vides (avertissement en développement, liste « À me fournir »). */
export function clesVides(contenu) {
  const vides = [];
  const parcourir = (objet, prefixe) => {
    for (const [k, v] of Object.entries(objet)) {
      const chemin = prefixe ? `${prefixe}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) parcourir(v, chemin);
      else if (estVide(v)) vides.push(chemin);
    }
  };
  parcourir(contenu.cles || {}, "");
  return vides;
}

/** Identité légale du pied de page : « Raison sociale, forme au capital de X, RCS Y, adresse. » Les morceaux vides
 * disparaissent ; rien du tout si tout est vide. */
export function identiteLegale(legal = {}) {
  const v = (k) => (typeof legal?.[k] === "string" ? legal[k].trim() : "");
  const forme = [v("forme"), v("capital") ? `au capital de ${v("capital")}` : ""].filter(Boolean).join(" ");
  const parties = [v("raison_sociale"), forme, v("rcs") ? `RCS ${v("rcs")}` : "", v("adresse")].filter(Boolean);
  return parties.length ? `${parties.join(", ")}.` : "";
}

/** Légende d'un témoignage : « prénom, métier, ville », les morceaux vides retirés. */
export const legendeTemoignage = (t = {}) =>
  ["prenom", "metier", "ville"].map((k) => (typeof t?.[k] === "string" ? t[k].trim() : "")).filter(Boolean).join(", ");

/** Contenu servi : le fichier, plus les valeurs calculées (pied.identite d'après cles.legal ; preuves.legendes d'après
 * cles.temoignages). */
export function completer(contenu) {
  const temoignages = Array.isArray(contenu.cles?.temoignages) ? contenu.cles.temoignages : [];
  return {
    ...contenu,
    pied: { ...contenu.pied, identite: identiteLegale(contenu.cles?.legal) },
    preuves: { ...contenu.preuves, legendes: temoignages.map(legendeTemoignage) },
  };
}
