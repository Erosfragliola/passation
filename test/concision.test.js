// Memorandum chapters: lengths guaranteed by the code, whatever the drafted text.
import { describe, it, expect } from "vitest";
import { contenuConcis, couper, phrases, LIMITES } from "../src/documents/concision.js";

describe("concision of the chapters", () => {
  it('introduction cut to two sentences; points formatted "- **Title**: text"', () => {
    const c = contenuConcis({ introduction: "Première phrase. Deuxième phrase. Troisième phrase de trop.", points: [{ titre: "Production intégrée :", texte: "atelier et pose sous le même toit. Peu de sous-traitance. Encore une phrase." }] });
    expect(c).toBe("Première phrase. Deuxième phrase.\n\n- **Production intégrée** : Atelier et pose sous le même toit. Peu de sous-traitance.");
  });
  it('six points at most; empty or "À compléter" points are removed', () => {
    const points = Array.from({ length: 9 }, (_, k) => ({ titre: `Point ${k}`, texte: `Texte ${k}.` }));
    points[1] = { titre: "Certifications", texte: "À compléter." };
    points[2] = { titre: "", texte: "Sans titre." };
    const lignes = contenuConcis({ introduction: "", points }).split("\n");
    expect(lignes).toHaveLength(LIMITES.points);
    expect(lignes.join(" ")).not.toMatch(/Certifications|Sans titre/);
  });
  it('a sentence that is too long is cut at a word, with "…", never in the middle of a word', () => {
    const t = couper("mot ".repeat(100), 2, 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith("mot…")).toBe(true);
  });
  it("splitting into sentences: figures and common French abbreviations", () => {
    expect(phrases("Le CA atteint 3,5 M€. Il progresse de 6,7 % par an.")).toEqual(["Le CA atteint 3,5 M€.", "Il progresse de 6,7 % par an."]);
  });
});
