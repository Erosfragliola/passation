// Translation check: npm run i18n:check
//   1. each file of src/contenu/fr/ has its counterpart in src/contenu/en/, with exactly the same keys;
//   2. no empty value in English where the French has one (an empty value in French is an intended setting);
//   3. list of English values identical to the French (often an oversight; proper nouns and acronyms allowed);
//   4. French texts left hard-coded outside the translation files (HTML pages and browser JavaScript).
// Output: code 1 if 1 or 2 fail (or 4 with --strict); 3 is a warning.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const dossier = (l) => `${racine}src/contenu/${l}/`;
const strict = process.argv.includes("--strict");

/** Leaves of an object: [["a.b.0", value], …] (the "_lisez_moi" keys are instructions, ignored). */
export function feuilles(v, chemin = "") {
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([k]) => k !== "_lisez_moi").flatMap(([k, y]) => feuilles(y, chemin ? `${chemin}.${k}` : k));
  }
  return [[chemin, v]];
}

/** Values that can legitimately be identical in both languages. */
const IDENTIQUES_ADMIS = /^(?:[A-Z]{2,6}|Passation|SIREN|SIRET|NAF|EBITDA|Excel|[\d\s.,:/%€$kM–+-]*|[a-z_]+:\{[a-z_.]+\}|\{[a-z0-9_.]+\}(?:\/5)?|English|Français|Datapack|Teaser|Guides?|Cookies|Certifications|Production|Commercial|version \{n\}|Justification|Documents|France|2\.2 Multiples|2\.3 DCF|Sources?|Date|Projection|Section \{num\} – \{titre\}|Actions|Page(?: \{n\})?|Photo \{n\}|source|\(x\)|\{nom\} · Passation|Teaser · version \{version\} · \{date\}|qualifications, labels|\d+ s|\d+ sources|Projet Chêne|Menuiserie Durand & Fils|.{0,2})$/;

export function comparer() {
  const erreurs = [], identiques = [];
  const fichiers = (l) => readdirSync(dossier(l)).filter((f) => f.endsWith(".json")).sort();
  const fr = fichiers("fr"), en = fichiers("en");
  for (const f of fr.filter((x) => !en.includes(x))) erreurs.push(`en/${f} missing`);
  for (const f of en.filter((x) => !fr.includes(x))) erreurs.push(`en/${f} without a French counterpart`);
  for (const f of fr.filter((x) => en.includes(x))) {
    const a = new Map(feuilles(JSON.parse(readFileSync(dossier("fr") + f, "utf8"))));
    const b = new Map(feuilles(JSON.parse(readFileSync(dossier("en") + f, "utf8"))));
    for (const k of a.keys()) if (!b.has(k)) erreurs.push(`${f}: key "${k}" missing in English`);
    for (const k of b.keys()) if (!a.has(k)) erreurs.push(`${f}: key "${k}" missing in French`);
    for (const [k, v] of a) {
      if (!b.has(k)) continue;
      const w = b.get(k);
      const vide = (x) => x == null || (typeof x === "string" && x.trim() === "");
      if (!vide(v) && vide(w)) erreurs.push(`${f}: "${k}" empty in English`);
      if (typeof v === "string" && v === w && !vide(v) && !IDENTIQUES_ADMIS.test(v.trim())) identiques.push(`${f}: ${k} = "${v.slice(0, 70)}"`);
    }
  }
  return { erreurs, identiques };
}

/** Hard-coded French texts: accents or common words in the text of the pages and the JavaScript strings. */
export function textesEnDur() {
  const trouves = [];
  // Saved values of choice answers (identifiers in French, labels translated by libelleOption) and
  // region names (proper nouns): not texts to translate.
  const options = JSON.parse(readFileSync(`${dossier("fr")}questionnaire.json`, "utf8")).options;
  const admis = new Set([...Object.values(options).flatMap((o) => Object.keys(o)),
    ...[...readFileSync(`${racine}public/js/questionnaire.js`, "utf8").matchAll(/"([A-ZÎ][^"]+)"/g)].map((m) => m[1])]);
  const MOTS = /[éèêàçùâîôû]|\b(?:nous|votre|vos|pour|avec|découvrez|dossier|entreprise|chiffres?)\b/i;
  const pages = ["404.html", "cgu.html", "confidentialite.html", "connexion.html", "estimation.html", "index.html", "mentions-legales.html",
    "espace/index.html", "espace/demarrer/index.html", "espace/valorisation/index.html", "espace/documents/memo/index.html", "espace/documents/teaser/index.html"];
  for (const p of pages) {
    const s = readFileSync(`${racine}public/${p}`, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
    for (const m of s.matchAll(/>([^<>]+)</g)) if (MOTS.test(m[1]) && m[1].trim()) trouves.push(`public/${p}: "${m[1].trim().slice(0, 60)}"`);
    for (const m of s.matchAll(/\s(?:alt|title|placeholder|aria-label|content|value)="([^"]*)"/g)) if (MOTS.test(m[1])) trouves.push(`public/${p}: attribute "${m[1].slice(0, 60)}"`);
  }
  const js = (d) => readdirSync(`${racine}public/js/${d}`).filter((f) => f.endsWith(".js")).map((f) => `${d}${f}`);
  for (const f of [...js(""), ...js("landing/")]) {
    const lignes = readFileSync(`${racine}public/js/${f}`, "utf8").split("\n");
    let ignore = false; // between "i18n:ignorer-debut" and "i18n:ignorer-fin": text never displayed (flagged elsewhere)
    lignes.forEach((l, i) => {
      if (l.includes("i18n:ignorer-debut")) ignore = true;
      if (l.includes("i18n:ignorer-fin")) ignore = false;
      if (ignore || l.includes("i18n:ignorer-ligne")) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      const code = l.replace(/\/\/.*$/, "");
      for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
        if (/[éèêàçùâîôû]/.test(m[2]) && !/^[\w./-]*$/.test(m[2]) && !admis.has(m[2])) { trouves.push(`public/js/${f}:${i + 1}: "${m[2].slice(0, 60)}"`); }
      }
    });
  }
  return trouves;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { erreurs, identiques } = comparer();
  const enDur = textesEnDur();
  console.log(`Keys: ${erreurs.length ? `${erreurs.length} error(s)` : "identical in both languages, no empty value"}`);
  for (const e of erreurs) console.log(`  ✗ ${e}`);
  console.log(`English values identical to the French (to check): ${identiques.length}`);
  for (const e of identiques.slice(0, 200)) console.log(`  · ${e}`);
  console.log(`Hard-coded French texts outside the translation files: ${enDur.length}`);
  for (const e of enDur.slice(0, strict ? Infinity : 40)) console.log(`  · ${e}`);
  if (!strict && enDur.length > 40) console.log(`  … (${enDur.length - 40} more, --strict to see everything)`);
  process.exit(erreurs.length || (strict && enDur.length) ? 1 : 0);
}
