// Polices de la landing : woff2 en sous-ensemble latin (accents, Œ, €, espaces fines, guillemets), à partir des
// TTF du kit de refonte (_refonte/assets/fonts, licences OFL). Outil ponctuel, rien d'ajouté au projet :
//
//   npx -y -p subset-font@2.9.0 node scripts/polices-landing.mjs
//
// Les fichiers produits (public/fonts/*.woff2) sont versionnés ; le kit ne l'est pas.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

// subset-font est installé par npx dans son cache : on le retrouve par le PATH que npx prépare
const bin = (process.env.PATH || "").split(delimiter).find((d) => d.includes("_npx") && d.endsWith(join("node_modules", ".bin")));
if (!bin) throw new Error("Lancer avec : npx -y -p subset-font@2.9.0 node scripts/polices-landing.mjs");
const subsetFont = createRequire(join(bin, "..", "x.js"))("subset-font");

const plage = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join("");
const LATIN = plage(0x20, 0x7e) + plage(0xa0, 0xff) + "ŒœŸ’‘“”–—… €";

const KIT = new URL("../_refonte/assets/fonts/", import.meta.url);
const SORTIE = new URL("../public/fonts/", import.meta.url);
const POLICES = [
  ["InstrumentSerif-Italic.ttf", "instrument-serif-italic.woff2"],   // mots-clés des titres
  ["BigShoulders-Bold.ttf", "big-shoulders-bold.woff2"],             // tampon « Projet … »
  ["NothingYouCouldDo-Regular.ttf", "nothing-you-could-do.woff2"],   // recto manuscrit des étiquettes
];
for (const [source, cible] of POLICES) {
  const ttf = readFileSync(new URL(source, KIT));
  const woff2 = await subsetFont(ttf, LATIN, { targetFormat: "woff2" });
  writeFileSync(new URL(cible, SORTIE), woff2);
  console.log(`${cible} : ${(ttf.length / 1024).toFixed(0)} Ko → ${(woff2.length / 1024).toFixed(1)} Ko`);
}
