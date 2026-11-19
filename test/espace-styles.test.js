// Une seule direction artistique dans l'espace du dirigeant (PR « Espace : une seule direction artistique, un écran par
// étape, sans jargon », 19/11/2026) : chaque page charge la feuille commune, le nom de code est écrit en Geist demi-gras
// partout (accueil compris), et le jargon remplacé ne revient pas à l'écran.
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

describe("feuille de style commune de l'espace", () => {
  it("l'espace compte au moins six pages (dossier, parcours, valorisation, teaser, mémorandum, connexion)", () => {
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

describe("nom de code : Geist demi-gras partout", () => {
  it("espace-bento.css ne charge plus Instrument Serif et n'écrit plus le nom de code en italique", () => {
    const s = css("espace-bento.css");
    expect(s).not.toMatch(/Instrument Serif/);
    expect(s).not.toMatch(/font-style:\s*italic/);
  });
  it("accueil : aucun sélecteur de nom de code en italique", () => {
    const s = css("landing-bento.css");
    for (const sel of [".carte-estimation-code", ".confid-apres", ".resultat-code", ".bulle-code", ".dossier-cta-code"]) {
      for (const regle of s.split("}").filter((r) => r.includes(sel))) expect(regle, sel).not.toMatch(/font-style:\s*italic/);
    }
  });
});

describe("jargon : libellés montrés au dirigeant", () => {
  it("« EBE publié » devient « EBE des comptes publics » à l'écran ; le libellé de l'Excel ne change pas", () => {
    const ebe = CHAMPS.find((c) => c.cle === "ebe");
    expect(libelleEcran(ebe)).toBe("EBE des comptes publics");
    expect(aideEcran(ebe)).toMatch(/comptes publics \(registre national des entreprises\)/);
    expect(ebe.libelle).toBe("EBE publié"); // datapack Excel (document des repreneurs) inchangé
  });
  it("les autres champs gardent leur libellé à l'écran", () => {
    expect(libelleEcran(CHAMPS.find((c) => c.cle === "chiffre_affaires"))).toBe("Chiffre d'affaires");
  });
});
