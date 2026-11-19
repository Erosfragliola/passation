import { describe, it, expect } from "vitest";
import { periode, periodeExercices } from "../public/js/memo-format.js";

// Titres du mémorandum : jamais « 2024-2024 » quand un seul exercice est validé (audit, point 14).
describe("période des exercices", () => {
  it("un seul exercice → l'année seule", () => {
    expect(periode([2024])).toBe("2024");
    expect(periodeExercices([2024])).toBe("exercice 2024");
  });
  it("plusieurs exercices → première et dernière année", () => {
    expect(periode([2022, 2023, 2024])).toBe("2022-2024");
    expect(periodeExercices([2023, 2024])).toBe("exercices 2023 à 2024");
  });
  it("aucun exercice → rien", () => {
    expect(periode([])).toBe("");
    expect(periodeExercices()).toBe("");
  });
  it("deux fois la même année (doublon) → l'année seule", () => expect(periode([2024, 2024])).toBe("2024"));
});
