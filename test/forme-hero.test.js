// Forme du hero : polygone à encoches et chemin arrondi (valeurs calculées à la main).
import { describe, it, expect } from "vitest";
import { polygone, cheminArrondi } from "../public/js/landing/forme-hero.js";

describe("forme du hero", () => {
  it("rectangle sans encoche : quatre sommets dans le sens des aiguilles d'une montre", () => {
    expect(polygone(100, 50)).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
  it("encoche en haut à gauche et encoche sur le bord droit", () => {
    expect(polygone(100, 50, { hg: { w: 30, h: 20 }, d: [{ debut: 10, longueur: 20, profondeur: 15 }] }))
      .toEqual([[0, 20], [30, 20], [30, 0], [100, 0], [100, 10], [85, 10], [85, 30], [100, 30], [100, 50], [0, 50]]);
  });
  it("chemin arrondi : angle saillant en sens horaire (1), angle rentrant en sens inverse (0), rayon réduit aux côtés courts", () => {
    const d = cheminArrondi([[0, 20], [30, 20], [30, 0], [100, 0], [100, 50], [0, 50]], 10);
    expect(d.startsWith("M 10 20 L 20 20 ")).toBe(true);  // départ à la fin de l'arrondi du premier sommet (0, 20)
    expect(d).toContain("A 10 10 0 0 0 30 10");   // (30,20) : rentrant
    expect(d).toContain("A 10 10 0 0 1 40 0");    // (30,0) : saillant
    expect(cheminArrondi([[0, 0], [8, 0], [8, 40], [0, 40]], 10)).toContain("A 4 4");   // côté de 8 : rayon 4
  });
});
