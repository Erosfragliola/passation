// Polices de la landing en woff2, à partir des TTF du kit de refonte (_refonte/assets/fonts, licences OFL) :
//   node scripts/polices-landing.mjs
// Encodeur WOFF2 minimal écrit ici (Brotli de Node, aucune dépendance) : tables recopiées sans transformation
// (« null transform », version 3 pour glyf et loca, prévue par la norme W3C WOFF2). Pas de sous-ensemble : les
// fichiers gardent tous leurs caractères. Les woff2 produits sont versionnés ; le kit ne l'est pas.
import { readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";

const KIT = new URL("../_refonte/assets/fonts/", import.meta.url);
const SORTIE = new URL("../public/fonts/", import.meta.url);
const POLICES = [
  ["BigShoulders-Bold.ttf", "big-shoulders-bold.woff2"],             // tampon « Projet … »
];

// Index des balises connues (norme WOFF2, § 5.1) ; les autres sont écrites en clair (index 63)
const CONNUES = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ",
  "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB"];

const base128 = (n) => {
  const octets = [];
  do { octets.unshift(n & 0x7f); n = Math.floor(n / 128); } while (n > 0);
  return octets.map((o, i) => (i < octets.length - 1 ? o | 0x80 : o));
};

export function ttfVersWoff2(ttf) {
  const v = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const flavor = v.getUint32(0), nb = v.getUint16(4);
  let tables = [];
  for (let i = 0; i < nb; i++) {
    const o = 12 + i * 16;
    tables.push({ tag: ttf.toString("latin1", o, o + 4), offset: v.getUint32(o + 8), longueur: v.getUint32(o + 12) });
  }
  // glyf immédiatement suivi de loca, comme l'attendent les décodeurs
  const loca = tables.find((t) => t.tag === "loca");
  if (loca) {
    tables = tables.filter((t) => t !== loca);
    tables.splice(tables.findIndex((t) => t.tag === "glyf") + 1, 0, loca);
  }
  const repertoire = [];
  for (const t of tables) {
    const index = CONNUES.indexOf(t.tag);
    const version = t.tag === "glyf" || t.tag === "loca" ? 3 : 0;      // 3 = sans transformation pour glyf/loca
    repertoire.push((index >= 0 ? index : 63) | (version << 6));
    if (index < 0) repertoire.push(...Buffer.from(t.tag, "latin1"));
    repertoire.push(...base128(t.longueur));
  }
  const donnees = Buffer.concat(tables.map((t) => ttf.subarray(t.offset, t.offset + t.longueur)));
  const compresse = brotliCompressSync(donnees, { params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_SIZE_HINT]: donnees.length } });
  const tailleSfnt = 12 + 16 * nb + tables.reduce((s, t) => s + Math.ceil(t.longueur / 4) * 4, 0);
  const brut = 48 + repertoire.length + compresse.length;
  const total = Math.ceil(brut / 4) * 4;
  const sortie = Buffer.alloc(total);
  const e = new DataView(sortie.buffer);
  e.setUint32(0, 0x774f4632);           // « wOF2 »
  e.setUint32(4, flavor);
  e.setUint32(8, total);
  e.setUint16(12, nb);
  e.setUint32(16, tailleSfnt);
  e.setUint32(20, compresse.length);
  Buffer.from(repertoire).copy(sortie, 48);
  compresse.copy(sortie, 48 + repertoire.length);
  return sortie;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("polices-landing.mjs")) {
  for (const [source, cible] of POLICES) {
    const ttf = readFileSync(new URL(source, KIT));
    const woff2 = ttfVersWoff2(ttf);
    writeFileSync(new URL(cible, SORTIE), woff2);
    console.log(`${cible} : ${(ttf.length / 1024).toFixed(0)} Ko → ${(woff2.length / 1024).toFixed(1)} Ko`);
  }
}
