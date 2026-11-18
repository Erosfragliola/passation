// Chapitres du mémorandum : longueurs garanties par le code, quel que soit le texte rédigé.
import { describe, it, expect } from "vitest";
import { contenuConcis, couper, phrases, LIMITES } from "../src/documents/concision.js";

describe("concision des chapitres", () => {
  it("introduction coupée à deux phrases ; points mis en forme « - **Titre** : texte »", () => {
    const c = contenuConcis({ introduction: "Première phrase. Deuxième phrase. Troisième phrase de trop.", points: [{ titre: "Production intégrée :", texte: "atelier et pose sous le même toit. Peu de sous-traitance. Encore une phrase." }] });
    expect(c).toBe("Première phrase. Deuxième phrase.\n\n- **Production intégrée** : Atelier et pose sous le même toit. Peu de sous-traitance.");
  });
  it("six points au plus ; les points vides ou « À compléter » sont retirés", () => {
    const points = Array.from({ length: 9 }, (_, k) => ({ titre: `Point ${k}`, texte: `Texte ${k}.` }));
    points[1] = { titre: "Certifications", texte: "À compléter." };
    points[2] = { titre: "", texte: "Sans titre." };
    const lignes = contenuConcis({ introduction: "", points }).split("\n");
    expect(lignes).toHaveLength(LIMITES.points);
    expect(lignes.join(" ")).not.toMatch(/Certifications|Sans titre/);
  });
  it("une phrase trop longue est coupée sur un mot, avec « … », jamais au milieu d'un mot", () => {
    const t = couper("mot ".repeat(100), 2, 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith("mot…")).toBe(true);
  });
  it("découpage en phrases : chiffres et abréviations françaises usuelles", () => {
    expect(phrases("Le CA atteint 3,5 M€. Il progresse de 6,7 % par an.")).toEqual(["Le CA atteint 3,5 M€.", "Il progresse de 6,7 % par an."]);
  });
});
