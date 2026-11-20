import { describe, it, expect } from "vitest";
import { periode, periodeExercices } from "../public/js/memo-format.js";

// Memorandum titles: never "2024-2024" when a single fiscal year is approved (audit, point 14).
describe("period of the fiscal years", () => {
  it("a single fiscal year → the year alone", () => {
    expect(periode([2024])).toBe("2024");
    expect(periodeExercices([2024])).toBe("exercice 2024");
  });
  it("several fiscal years → first and last year", () => {
    expect(periode([2022, 2023, 2024])).toBe("2022-2024");
    expect(periodeExercices([2023, 2024])).toBe("exercices 2023 à 2024");
  });
  it("no fiscal year → nothing", () => {
    expect(periode([])).toBe("");
    expect(periodeExercices()).toBe("");
  });
  it("the same year twice (duplicate) → the year alone", () => expect(periode([2024, 2024])).toBe("2024"));
});
