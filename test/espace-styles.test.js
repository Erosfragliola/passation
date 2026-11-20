// A single art direction in the owner's space (PR "Owner's space: a single art direction, one screen per
// step, without jargon", 19/11/2026): each page loads the shared stylesheet, the code name is written in Geist semibold
// everywhere (home page included), and the replaced jargon does not come back on screen.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHAMPS, libelleEcran, aideEcran } from "../public/js/champs-financiers.js";

const racine = new URL("../public/", import.meta.url).pathname;
function pagesHtml(dossier) {
  return readdirSync(dossier).flatMap((f) => {
    const p = join(dossier, f);
    return statSync(p).isDirectory() ? pagesHtml(p) : f.endsWith(".html") ? [p] : [];
  });
}
const PAGES = [...pagesHtml(join(racine, "espace")), join(racine, "connexion.html")];
const css = (f) => readFileSync(join(racine, "css", f), "utf8");

describe("shared stylesheet of the owner's space", () => {
  it("the space has at least six pages (file, guided steps, valuation, teaser, memorandum, sign-in)", () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(6);
  });
  it.each(PAGES.map((p) => [p.replace(racine, "public/"), p]))("%s charge styles.css puis espace-bento.css", (_, p) => {
    const html = readFileSync(p, "utf8");
    const i = html.indexOf('href="/css/styles.css"'), j = html.indexOf('href="/css/espace-bento.css"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(html).toMatch(/<body[^>]*class="[^"]*\bpage-espace\b/);
  });
});

describe("code name: Geist semibold everywhere", () => {
  it("espace-bento.css no longer loads Instrument Serif and no longer writes the code name in italics", () => {
    const s = css("espace-bento.css");
    expect(s).not.toMatch(/Instrument Serif/);
    expect(s).not.toMatch(/font-style:\s*italic/);
  });
  it("home page: no italic code-name selector", () => {
    const s = css("landing-bento.css");
    for (const sel of [".carte-estimation-code", ".confid-apres", ".resultat-code", ".bulle-code", ".dossier-cta-code"]) {
      for (const regle of s.split("}").filter((r) => r.includes(sel))) expect(regle, sel).not.toMatch(/font-style:\s*italic/);
    }
  });
});

describe("jargon: labels shown to the owner", () => {
  it('"EBE publié" becomes "EBE des comptes publics" on screen; the Excel label does not change', () => {
    const ebe = CHAMPS.find((c) => c.cle === "ebe");
    expect(libelleEcran(ebe)).toBe("EBE des comptes publics");
    expect(aideEcran(ebe)).toMatch(/comptes publics \(registre national des entreprises\)/);
    expect(ebe.libelle).toBe("EBE publié"); // Excel datapack (document for buyers) unchanged
  });
  it("the other fields keep their on-screen label", () => {
    expect(libelleEcran(CHAMPS.find((c) => c.cle === "chiffre_affaires"))).toBe("Chiffre d'affaires");
  });
});
