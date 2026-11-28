// Deliverables in a single font, Geist (23/11/2026): memorandum, teaser, datapack and course deliverables. Titles in
// weight 500, letter spacing -0.05em, tight line height, settings centralized in CSS variables; no more Big Shoulders
// or
// Instrument Serif in the deliverables; Instrument Serif removed from the repository (no longer used anywhere).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { creerClasseur, POLICE_DATAPACK, TAILLES_DATAPACK } from "../src/documents/xlsx.js";

const racine = fileURLToPath(new URL("../", import.meta.url));
const lire = (f) => readFileSync(join(racine, f), "utf8");
const INTERDITES = /Big Shoulders|Instrument Serif|instrument-serif|big-shoulders/i;

/** CSS rules (selector, declarations) flattened, @media included, without the comments. */
function regles(css) {
  const sans = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...sans.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
}
const polices = (corps) => [...corps.matchAll(/font(?:-family)?\s*:\s*([^;]+)/g)].map((m) => m[1]);

describe("mémorandum (memo-im.css, memo.js)", () => {
  const css = lire("public/css/memo-im.css");
  it("ne cite plus Big Shoulders ni Instrument Serif, ni aucune police de secours à empattements", () => {
    expect(css).not.toMatch(INTERDITES);
    expect(css).not.toMatch(/Georgia/);
    expect(lire("public/js/memo.js")).not.toMatch(INTERDITES);
  });
  it("chaque police citée est Geist ou une variable", () => {
    for (const { selecteur, corps } of regles(css)) {
      for (const p of polices(corps)) expect(`${selecteur} → ${p}`).toMatch(/→ .*(Geist|var\(--)/);
    }
  });
  it("centralise le style des titres dans des variables : Geist, 500, -0.05em, interligne 0.94", () => {
    expect(css).toMatch(/--titre-police:\s*"Geist", sans-serif;/);
    expect(css).toMatch(/--titre-graisse:\s*500;/);
    expect(css).toMatch(/--titre-interlettrage:\s*-0\.05em;/);
    expect(css).toMatch(/--titre-interligne:\s*\.94;/);
  });
  it("les titres (couverture, chapitre, page, sommaire) suivent les variables et ne sont plus en capitales", () => {
    const finale = regles(css).find((r) => r.selecteur.startsWith(".im-couv-titre h2, .im-ouv-titre h2, .im-entete h3"));
    expect(finale).toBeTruthy();
    expect(finale.corps).toMatch(/font-family:\s*var\(--titre-police\)/);
    expect(finale.corps).toMatch(/font-weight:\s*var\(--titre-graisse\)/);
    expect(finale.corps).toMatch(/letter-spacing:\s*var\(--titre-interlettrage\)/);
    expect(finale.corps).toMatch(/text-transform:\s*none/);
    // the rule is the last one to touch these titles: nothing puts them back in capitals after it
    const apres = css.slice(css.indexOf(finale.selecteur));
    expect(apres).not.toMatch(/uppercase/);
  });
});

describe("teaser (styles.css, teaser.js)", () => {
  const reglesTeaser = regles(lire("public/css/styles.css")).filter((r) => /\.teaser|\.tsr-|\.doc-/.test(r.selecteur));
  it("aucune règle du teaser ne cite Big Shoulders ni Instrument Serif", () => {
    expect(reglesTeaser.length).toBeGreaterThan(20);
    for (const r of reglesTeaser) expect(`${r.selecteur} ${r.corps}`).not.toMatch(INTERDITES);
    expect(lire("public/js/teaser.js")).not.toMatch(INTERDITES);
  });
  it("titre et intertitres en Geist 500 / -0.05em, à partir des variables", () => {
    const vars = reglesTeaser.find((r) => r.selecteur === ".feuille-document.teaser");
    expect(vars.corps).toMatch(/--titre-graisse:\s*500/);
    expect(vars.corps).toMatch(/--titre-interlettrage:\s*-0\.05em/);
    expect(vars.corps).toMatch(/--titre-1:\s*44px/);
    const titres = reglesTeaser.find((r) => r.selecteur.startsWith(".teaser .doc-titre, .teaser .doc-section h3"));
    expect(titres.corps).toMatch(/font-weight:\s*var\(--titre-graisse\)/);
    expect(titres.corps).toMatch(/letter-spacing:\s*var\(--titre-interlettrage\)/);
  });
});

describe("impression : Geist embarquée", () => {
  it("styles.css déclare le fichier variable de Geist, graisses 100 à 900", () => {
    expect(lire("public/css/styles.css")).toMatch(/@font-face\s*\{\s*font-family:\s*"Geist";\s*src:\s*url\("\/fonts\/geist-var\.woff2"\)[^}]*font-weight:\s*100 900/);
    expect(existsSync(join(racine, "public/fonts/geist-var.woff2"))).toBe(true);
  });
});

describe("livrables du cours (docs/livrables)", () => {
  it.each(["business-plan.html"])("%s : Geist seule, embarquée depuis public/fonts", (f) => {
    const html = lire(`docs/livrables/${f}`);
    expect(html).not.toMatch(INTERDITES);
    expect(html).not.toMatch(/Helvetica|Arial/);
    expect(html).toMatch(/@font-face \{ font-family: "Geist"; src: url\("\.\.\/\.\.\/public\/fonts\/geist-var\.woff2"\)[^}]*font-weight: 100 900/);
    expect(html).toMatch(/--titre-graisse: 500;/);
    expect(html).toMatch(/h1, h2, h3 \{ font-family: var\(--titre-police\); font-weight: var\(--titre-graisse\); letter-spacing: var\(--titre-interlettrage\)/);
  });
});

describe("datapack Excel", () => {
  const c = creerClasseur();
  c.feuille("Essai");
  const fichiers = unzipSync(c.octets ? c.octets() : c.zip());
  const styles = strFromU8(fichiers["xl/styles.xml"]);
  it("une seule police, Arial par défaut (présente chez tous les lecteurs)", () => {
    expect(POLICE_DATAPACK).toBe("Arial");
    const noms = [...styles.matchAll(/<name val="([^"]+)"\/>/g)].map((m) => m[1]);
    expect(noms.length).toBe(10);
    expect(new Set(noms)).toEqual(new Set([POLICE_DATAPACK]));
  });
  it("tailles = échelle des titres 44 / 32 / 24 px divisée par deux, en points", () => {
    expect([TAILLES_DATAPACK.couverture, TAILLES_DATAPACK.titre, TAILLES_DATAPACK.sousTitre]).toEqual([44 / 2, 32 / 2, 24 / 2]);
    const tailles = [...styles.matchAll(/<sz val="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(new Set(tailles)).toEqual(new Set([22, 16, 12, 10, 9]));
  });
});

describe("Instrument Serif retirée du dépôt", () => {
  const fichiers = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? fichiers(p) : [p]; });
  it("ni fichier de police ni licence dans public/fonts", () => {
    expect(readdirSync(join(racine, "public/fonts")).filter((f) => /instrument/i.test(f))).toEqual([]);
  });
  it("aucun fichier servi ne la cite", () => {
    const servis = fichiers(join(racine, "public")).filter((f) => /\.(css|html|js)$/.test(f));
    expect(servis.filter((f) => /Instrument Serif|instrument-serif/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
  it("les mentions légales (FR et EN) ne la citent plus", () => {
    for (const l of ["fr", "en"]) {
      const m = JSON.parse(lire(`src/contenu/${l}/mentions_legales.json`));
      expect(m.polices_et_illustrations).not.toMatch(/Instrument/);
      expect(m.polices_et_illustrations).toMatch(/Geist/);
    }
  });
});

// The whole site in Geist (23/11/2026): no display font left in the site's style sheets or in the pages
describe("site : une seule police, Geist", () => {
  const feuilles = readdirSync(join(racine, "public/css")).filter((f) => f.endsWith(".css"));
  it("aucune feuille de public/css ne cite Big Shoulders ni Instrument Serif", () => {
    for (const f of feuilles) expect(`${f} : ${INTERDITES.test(lire(`public/css/${f}`))}`).toBe(`${f} : false`);
  });
  it("aucune page ne précharge une ancienne police, et le fichier Big Shoulders est retiré", () => {
    expect(lire("public/index.html")).not.toMatch(INTERDITES);
    expect(existsSync(join(racine, "public/fonts/big-shoulders-bold.woff2"))).toBe(false);
  });
  it("les titres d'affiche du site utilisent les variables de titre (Geist 500, -0.05em)", () => {
    const styles = lire("public/css/styles.css");
    expect(styles).toMatch(/--titre-graisse:\s*500/);
    expect(styles).toMatch(/--titre-interlettrage:\s*-0\.05em/);
    for (const f of ["landing-bento.css", "espace-bento.css"]) {
      const affiche = regles(lire(`public/css/${f}`)).find((r) => /(^|\s)\.affiche$/.test(r.selecteur));
      expect(affiche.corps).toMatch(/var\(--titre-police\)/);
      expect(affiche.corps).toMatch(/text-transform:\s*none/);
    }
  });
});
