// Texts of the pages (src/contenu/<language>/*.json): pure functions, without DOM or Worker (tested in
// test/contenu.test.js). The Worker applies them to the pages with HTMLRewriter (src/routes/pages.js).
// contenu.langue (« fr » by default) chooses the typography; contenu.typo === false turns it off (texts already
// typeset, copied as they are from the pages).
//
// Conventions of the content file:
//   *word*     highlighted keyword (<em> tag, in Geist);
//   {key}      value of « cles » (price, phone…);
//   empty value (or empty {key}): the element is removed from the page;
//   list of texts: one paragraph per element.
// Typography is applied here: the file can be written with plain spaces and apostrophes.

const FINE = " ";   // narrow no-break space
const INSECABLE = " ";

/**
 * Narrow spaces before ; : ! ? and inside « », typographic apostrophe, no-break space before units, ellipsis.
 * Never adds a space where there is none before ; : ! ? (times, addresses).
 */
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

/** HTML escaping (text and attributes). */
export const echapper = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Typography of a content: its language, or false (none). */
const typo = (contenu) => (contenu?.typo === false ? false : contenu?.langue || "fr");

/** Value at a path « a.b.0.c ». */
export function lire(contenu, chemin) {
  return String(chemin).split(".").reduce((v, k) => (v == null ? undefined : v[k]), contenu);
}

/** Empty: missing, blank string, false (boolean), empty list, object whose values are all empty. */
export function estVide(v) {
  if (v == null || v === false) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(estVide);
  if (typeof v === "object") return Object.values(v).every(estVide);
  return false;
}

/**
 * Display condition on a key of « cles »: « telephone », « legal.rcs » (path), « guides:3 » (list of at least 3
 * non-empty entries). True if the element must stay.
 */
export function condition(cles, jeton) {
  const [chemin, min] = String(jeton).split(":");
  const v = lire(cles, chemin);
  if (min) return Array.isArray(v) && v.filter((x) => !estVide(x)).length >= Number(min);
  return !estVide(v);
}

/**
 * Replaces {key} with the value of contenu.cles; returns null if a key used is empty. {Markers} unknown to « cles »
 * (e.g. {exercice}) are left as they are for the page's JavaScript.
 */
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

/** Inline text: escaped, typeset, *word* → <em>word</em>. */
export function enLigne(s, langue = "fr") {
  return echapper(typographier(s, langue)).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * HTML of a content value, or null if it is empty (the element must then disappear).
 * String: inline text; list of strings: one paragraph per element.
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

/** Plain text (attributes: alt, aria-label, content…), or null if empty. *Words* lose their asterisks. */
export function texte(contenu, chemin) {
  const v = lire(contenu, chemin);
  if (typeof v !== "string" || estVide(v)) return null;
  const t = interpoler(v, contenu.cles);
  return t == null || estVide(t) ? null : typographier(t, typo(contenu)).replace(/\*([^*]+)\*/g, "$1");
}

/** « attr=chemin; attr2=chemin2 » → [[attr, chemin], …] */
export const lireAttributs = (spec) => String(spec).split(";").map((x) => x.trim()).filter(Boolean).map((x) => x.split("=").map((y) => y.trim()));

/**
 * Final attribute value: straight quotes neutralized; « tel:01 23 45 67 89 » → « tel:0123456789 » (no space,
 * no-break space included, in the link).
 */
export function valeurAttribut(attr, t) {
  const v = attr === "href" && t.startsWith("tel:") ? `tel:${t.slice(4).replace(/[^\d+]/g, "")}` : t;
  return v.replace(/"/g, "”");
}

/** Subtree for the page's JavaScript: strings typeset and interpolated (empty values kept). */
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

/** Safe JSON inside a <script> tag (no « </script> » possible). */
export const jsonDansScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Keys of contenu.cles still empty (warning in development, « to provide » list). */
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

/**
 * Legal identity of the footer: « Company name, legal form with share capital of X, RCS Y, address. » Empty parts
 * disappear; nothing at all if everything is empty.
 */
export function identiteLegale(legal = {}, langue = "fr") {
  const v = (k) => (typeof legal?.[k] === "string" ? legal[k].trim() : "");
  const capital = langue === "fr" ? `au capital de ${v("capital")}` : `with share capital of ${v("capital")}`;
  const forme = [v("forme"), v("capital") ? capital : ""].filter(Boolean).join(" ");
  const parties = [v("raison_sociale"), forme, v("rcs") ? `RCS ${v("rcs")}` : "", v("adresse")].filter(Boolean);
  return parties.length ? `${parties.join(", ")}.` : "";
}

/** Caption of a testimonial: « first name, trade, city », empty parts removed. */
export const legendeTemoignage = (t = {}) =>
  ["prenom", "metier", "ville"].map((k) => (typeof t?.[k] === "string" ? t[k].trim() : "")).filter(Boolean).join(", ");

/**
 * Content served: the file, plus the calculated values (pied.identite from cles.legal; preuves.legendes from
 * cles.temoignages).
 */
export function completer(contenu) {
  const temoignages = Array.isArray(contenu.cles?.temoignages) ? contenu.cles.temoignages : [];
  return {
    ...contenu,
    pied: { ...contenu.pied, identite: identiteLegale(contenu.cles?.legal, contenu.langue) },
    preuves: { ...contenu.preuves, legendes: temoignages.map(legendeTemoignage) },
  };
}
