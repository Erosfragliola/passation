// Fictitious "Projet Chêne" example on the home page (audit, point 12): a single range everywhere, and an illustration
// of the figures consistent with the industry multiples. Expected values calculated by hand:
//   industry "Travaux de construction spécialisés" (section F): EBITDA multiples 3 (low) to 5 (high);
//   value of the shares = multiple × EBITDA + net cash;
//   low  = 3 × €300K + €900K = €1,800K = €1.8M;
//   high = 5 × €300K + €900K = €2,400K = €2.4M.
import { describe, it, expect } from "vitest";
import accueil from "../src/contenu/fr/accueil.json";
import CLES from "../src/contenu/cles.json";
import commun from "../src/contenu/fr/commun.json";
// Home page content as the Worker assembles it: French texts and shared settings.
const contenu = { ...accueil, commun, cles: { ...CLES, ...accueil.cles } };
import MULTIPLES from "../src/data/multiples.json";

const FOURCHETTE = "1,8 – 2,4 M€";
/** All the strings of the content, with their path. */
function chaines(x, chemin = []) {
  if (typeof x === "string") return [[chemin.join("."), x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => chaines(v, [...chemin, i]));
  if (x && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => chaines(v, [...chemin, k]));
  return [];
}
const euros = (t) => { const m = /^(-?[\d,]+)\s*(M€|k€)$/.exec(t.replace(/ /g, " ").trim()); return m ? Number(m[1].replace(",", ".")) * (m[2] === "M€" ? 1e6 : 1e3) : NaN; };

describe('fictitious example "Projet Chêne"', () => {
  const fourchettes = chaines(contenu).filter(([, t]) => /\d,\d\s*–\s*\d,\d\s*M€/.test(t));
  // 3 displayed places (hero bubble, SIREN and figures illustrations); the 5 other copies were in
  // keys never read by the page, removed with the cleanup of 19/11/2026
  it("the 3 displayed places carry the example's range", () => expect(fourchettes.map(([c]) => c)).toEqual(["hero.bulles.code.valeur", "comment.illustrations.siren.valeur", "comment.illustrations.chiffres.fourchette"]));
  it.each(fourchettes)("%s : %s", (_, t) => expect(t).toBe(FOURCHETTE));
  it("no more central value in the figures illustration", () => {
    const c = contenu.comment.illustrations.chiffres;
    expect(c).not.toHaveProperty("centrale");
    expect([c.fourchette, c.bas, c.haut]).toEqual([FOURCHETTE, "1,8 M€", "2,4 M€"]);
  });
  it("EBITDA and cash of the illustration × construction industry multiples = the range", () => {
    const c = contenu.comment.illustrations.chiffres;
    const ligne = (p) => euros(c.lignes.find((l) => l.poste === p).montant);
    const m = MULTIPLES.secteurs.find((s) => s.sections.includes("F")).ebe;
    expect([m.bas, m.haut]).toEqual([3, 5]);
    expect(ligne("EBE")).toBe(300_000);
    expect(ligne("Trésorerie nette")).toBe(900_000);
    expect(m.bas * ligne("EBE") + ligne("Trésorerie nette")).toBe(euros(c.bas));
    expect(m.haut * ligne("EBE") + ligne("Trésorerie nette")).toBe(euros(c.haut));
  });
  it("plausible EBITDA margin: €300K / €2.4M = 12.5%", () => {
    const c = contenu.comment.illustrations.chiffres;
    expect(euros(c.lignes[1].montant) / euros(c.lignes[0].montant)).toBe(0.125);
  });
});
