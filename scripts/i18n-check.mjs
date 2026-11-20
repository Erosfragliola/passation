// Contrôle des traductions : npm run i18n:check
//   1. chaque fichier de src/contenu/fr/ a son pendant dans src/contenu/en/, avec exactement les mêmes clés ;
//   2. aucune valeur vide en anglais là où le français en a une (une valeur vide en français est un réglage voulu) ;
//   3. liste des valeurs anglaises identiques au français (souvent un oubli ; noms propres et sigles admis) ;
//   4. textes français restés en dur hors des fichiers de traduction (pages HTML et JavaScript du navigateur).
// Sortie : code 1 si 1 ou 2 échouent (ou 4 avec --strict) ; 3 est un avertissement.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const dossier = (l) => `${racine}src/contenu/${l}/`;
const strict = process.argv.includes("--strict");

/** Feuilles d'un objet : [["a.b.0", valeur], …] (les clés « _lisez_moi » sont des modes d'emploi, ignorées). */
export function feuilles(v, chemin = "") {
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([k]) => k !== "_lisez_moi").flatMap(([k, y]) => feuilles(y, chemin ? `${chemin}.${k}` : k));
  }
  return [[chemin, v]];
}

/** Valeurs qui peuvent légitimement être identiques dans les deux langues. */
const IDENTIQUES_ADMIS = /^(?:[A-Z]{2,6}|Passation|SIREN|SIRET|NAF|EBITDA|Excel|[\d\s.,:/%€$kM–+-]*|[a-z_]+:\{[a-z_.]+\}|\{[a-z0-9_.]+\}(?:\/5)?|English|Français|Datapack|Teaser|Guides?|Cookies|\d+ s|\d+ sources|Projet Chêne|Menuiserie Durand & Fils|.{0,2})$/;

export function comparer() {
  const erreurs = [], identiques = [];
  const fichiers = (l) => readdirSync(dossier(l)).filter((f) => f.endsWith(".json")).sort();
  const fr = fichiers("fr"), en = fichiers("en");
  for (const f of fr.filter((x) => !en.includes(x))) erreurs.push(`en/${f} manquant`);
  for (const f of en.filter((x) => !fr.includes(x))) erreurs.push(`en/${f} sans pendant français`);
  for (const f of fr.filter((x) => en.includes(x))) {
    const a = new Map(feuilles(JSON.parse(readFileSync(dossier("fr") + f, "utf8"))));
    const b = new Map(feuilles(JSON.parse(readFileSync(dossier("en") + f, "utf8"))));
    for (const k of a.keys()) if (!b.has(k)) erreurs.push(`${f} : clé « ${k} » absente en anglais`);
    for (const k of b.keys()) if (!a.has(k)) erreurs.push(`${f} : clé « ${k} » absente en français`);
    for (const [k, v] of a) {
      if (!b.has(k)) continue;
      const w = b.get(k);
      const vide = (x) => x == null || (typeof x === "string" && x.trim() === "");
      if (!vide(v) && vide(w)) erreurs.push(`${f} : « ${k} » vide en anglais`);
      if (typeof v === "string" && v === w && !vide(v) && !IDENTIQUES_ADMIS.test(v.trim())) identiques.push(`${f} : ${k} = « ${v.slice(0, 70)} »`);
    }
  }
  return { erreurs, identiques };
}

/** Textes français en dur : accents ou mots courants dans le texte des pages et les chaînes du JavaScript. */
export function textesEnDur() {
  const trouves = [];
  const MOTS = /[éèêàçùâîôû]|\b(?:nous|votre|vos|pour|avec|découvrez|dossier|entreprise|chiffres?)\b/i;
  const pages = ["404.html", "cgu.html", "confidentialite.html", "connexion.html", "estimation.html", "index.html", "mentions-legales.html",
    "espace/index.html", "espace/demarrer/index.html", "espace/valorisation/index.html", "espace/documents/memo/index.html", "espace/documents/teaser/index.html"];
  for (const p of pages) {
    const s = readFileSync(`${racine}public/${p}`, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
    for (const m of s.matchAll(/>([^<>]+)</g)) if (MOTS.test(m[1]) && m[1].trim()) trouves.push(`public/${p} : « ${m[1].trim().slice(0, 60)} »`);
    for (const m of s.matchAll(/\s(?:alt|title|placeholder|aria-label|content|value)="([^"]*)"/g)) if (MOTS.test(m[1])) trouves.push(`public/${p} : attribut « ${m[1].slice(0, 60)} »`);
  }
  const js = (d) => readdirSync(`${racine}public/js/${d}`).filter((f) => f.endsWith(".js")).map((f) => `${d}${f}`);
  for (const f of [...js(""), ...js("landing/")]) {
    const lignes = readFileSync(`${racine}public/js/${f}`, "utf8").split("\n");
    lignes.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      const code = l.replace(/\/\/.*$/, "");
      for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
        if (/[éèêàçùâîôû]/.test(m[2]) && !/^[\w./-]*$/.test(m[2])) { trouves.push(`public/js/${f}:${i + 1} : « ${m[2].slice(0, 60)} »`); }
      }
    });
  }
  return trouves;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { erreurs, identiques } = comparer();
  const enDur = textesEnDur();
  console.log(`Clés : ${erreurs.length ? `${erreurs.length} erreur(s)` : "identiques dans les deux langues, aucune valeur vide"}`);
  for (const e of erreurs) console.log(`  ✗ ${e}`);
  console.log(`Valeurs anglaises identiques au français (à vérifier) : ${identiques.length}`);
  for (const e of identiques.slice(0, 200)) console.log(`  · ${e}`);
  console.log(`Textes français en dur hors des fichiers de traduction : ${enDur.length}`);
  for (const e of enDur.slice(0, strict ? Infinity : 40)) console.log(`  · ${e}`);
  if (!strict && enDur.length > 40) console.log(`  … (${enDur.length - 40} de plus, --strict pour tout voir)`);
  process.exit(erreurs.length || (strict && enDur.length) ? 1 : 0);
}
