// Shape of the hero: notched polygon and rounded path (values calculated by hand).
import { describe, it, expect } from "vitest";
import { polygone, cheminArrondi } from "../public/js/landing/forme-hero.js";

describe("shape of the hero", () => {
  it("rectangle without a notch: four vertices clockwise", () => {
    expect(polygone(100, 50)).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
  it("notch at the top left and notch on the right edge", () => {
    expect(polygone(100, 50, { hg: { w: 30, h: 20 }, d: [{ debut: 10, longueur: 20, profondeur: 15 }] }))
      .toEqual([[0, 20], [30, 20], [30, 0], [100, 0], [100, 10], [85, 10], [85, 30], [100, 30], [100, 50], [0, 50]]);
  });
  it("rounded path: outward angle clockwise (1), inward angle counterclockwise (0), radius reduced on short sides", () => {
    const d = cheminArrondi([[0, 20], [30, 20], [30, 0], [100, 0], [100, 50], [0, 50]], 10);
    expect(d.startsWith("M 10 20 L 20 20 ")).toBe(true);  // start at the end of the first vertex's rounding (0, 20)
    expect(d).toContain("A 10 10 0 0 0 30 10");   // (30,20): inward
    expect(d).toContain("A 10 10 0 0 1 40 0");    // (30,0): outward
    expect(cheminArrondi([[0, 0], [8, 0], [8, 40], [0, 40]], 10)).toContain("A 4 4");   // side of 8: radius 4
  });
});
