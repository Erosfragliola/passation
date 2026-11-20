import { describe, it, expect } from "vitest";
import { estimationExpress, secteurPour } from "../src/valuation/express.js";
import MULTIPLES from "../src/data/multiples.json";

// FICTITIOUS test table (multiples invented to test the calculation, never used in the application)
const TABLE = { secteurs: [
  { cle: "test", sections: ["C"], ebe: { bas: 4, central: 5, haut: 6 }, ca: { bas: 0.4, central: 0.5, haut: 0.6 }, source: "fictive" },
  { cle: "sans-ebe", sections: ["G"], ebe: { bas: null, central: null, haut: null }, ca: { bas: 0.3, central: 0.4, haut: 0.5 }, source: "fictive" },
  { cle: "vide", sections: ["F"], ebe: { bas: null, central: null, haut: null }, ca: { bas: null, central: null, haut: null }, source: null },
] };

describe("quick valuation", () => {
  it("positive EBITDA: EV = EBITDA × multiple (calculated by hand: €200K × 4 / 5 / 6)", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 2_000_000 }], ebe: [{ annee: 2024, valeur: 200_000 }] }, TABLE);
    expect(r).toMatchObject({ statut: "ok", methode: "multiple_ebe", exercice: 2024, bas: 800_000, central: 1_000_000, haut: 1_200_000 });
  });
  it("negative EBITDA: fallback on revenue (€2M × 0.4 / 0.5 / 0.6), with a warning", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 2_000_000 }], ebe: [{ annee: 2024, valeur: -50_000 }] }, TABLE);
    expect(r).toMatchObject({ statut: "ok", methode: "multiple_ca", bas: 800_000, central: 1_000_000, haut: 1_200_000 });
    expect(r.avertissement).toBeTruthy();
  });
  it("EBITDA must be from the same fiscal year as revenue", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 1_000_000 }], ebe: [{ annee: 2023, valeur: 100_000 }] }, TABLE);
    expect(r.methode).toBe("multiple_ca");
  });
  it("missing accounts", () => {
    expect(estimationExpress({ section_naf: "C", ca: [], ebe: [] }, TABLE).statut).toBe("comptes_absents");
  });
  it("industry without a sourced multiple: no figure", () => {
    const r = estimationExpress({ section_naf: "F", ca: [{ annee: 2024, valeur: 1e6 }], ebe: [{ annee: 2024, valeur: 1e5 }] }, TABLE);
    expect(r).toEqual({ statut: "reference_a_completer", exercice: 2024, secteur: "vide" });
  });
  it("the real file contains no unsourced multiple", () => {
    for (const s of MULTIPLES.secteurs) {
      const valeurs = [...Object.values(s.ebe), ...Object.values(s.ca)];
      if (valeurs.some((v) => v != null)) expect(s.source, `secteur ${s.cle}`).toBeTruthy();
    }
  });
  it("each NAF section A to U has an industry", () => {
    for (const l of "ABCDEFGHIJKLMNOPQRSTU") expect(secteurPour(l), l).not.toBeNull();
  });
});

describe("cross-checked multiples (real file)", () => {
  it("low ≤ central ≤ high, plausible values for SMEs (between 1x and 15x EBITDA)", () => {
    for (const s of MULTIPLES.secteurs) {
      const { bas, central, haut } = s.ebe;
      expect(bas, s.cle).toBeLessThanOrEqual(central);
      expect(central, s.cle).toBeLessThanOrEqual(haut);
      expect(bas, s.cle).toBeGreaterThanOrEqual(1);
      expect(haut, s.cle).toBeLessThanOrEqual(15);
    }
  });
  it("each source of the cross-check is cited with a URL", () => {
    for (const src of MULTIPLES.sources["croisement-2026-11"]) expect(src.url).toMatch(/^https:\/\//);
  });
  it("the file is up to date with its input data (npm run multiples)", async () => {
    const { readFileSync } = await import("node:fs");
    const entrees = JSON.parse(readFileSync(new URL("../src/data/multiples-sources.json", import.meta.url)));
    expect(MULTIPLES.version).toBe(entrees.consulte_le);
  });
});
