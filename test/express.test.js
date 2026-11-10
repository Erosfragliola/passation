import { describe, it, expect } from "vitest";
import { estimationExpress, secteurPour } from "../src/valuation/express.js";
import MULTIPLES from "../src/data/multiples.json";

// Table de test FICTIVE (multiples inventés pour tester le calcul, jamais utilisés dans l'application)
const TABLE = { secteurs: [
  { cle: "test", sections: ["C"], ebe: { bas: 4, central: 5, haut: 6 }, ca: { bas: 0.4, central: 0.5, haut: 0.6 }, source: "fictive" },
  { cle: "sans-ebe", sections: ["G"], ebe: { bas: null, central: null, haut: null }, ca: { bas: 0.3, central: 0.4, haut: 0.5 }, source: "fictive" },
  { cle: "vide", sections: ["F"], ebe: { bas: null, central: null, haut: null }, ca: { bas: null, central: null, haut: null }, source: null },
] };

describe("valorisation express", () => {
  it("EBE positif : VE = EBE × multiple (calcul à la main : 200 k€ × 4 / 5 / 6)", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 2_000_000 }], ebe: [{ annee: 2024, valeur: 200_000 }] }, TABLE);
    expect(r).toMatchObject({ statut: "ok", methode: "multiple_ebe", exercice: 2024, bas: 800_000, central: 1_000_000, haut: 1_200_000 });
  });
  it("EBE négatif : repli sur le CA (2 M€ × 0,4 / 0,5 / 0,6), avec avertissement", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 2_000_000 }], ebe: [{ annee: 2024, valeur: -50_000 }] }, TABLE);
    expect(r).toMatchObject({ statut: "ok", methode: "multiple_ca", bas: 800_000, central: 1_000_000, haut: 1_200_000 });
    expect(r.avertissement).toBeTruthy();
  });
  it("l'EBE doit être du même exercice que le CA", () => {
    const r = estimationExpress({ section_naf: "C", ca: [{ annee: 2024, valeur: 1_000_000 }], ebe: [{ annee: 2023, valeur: 100_000 }] }, TABLE);
    expect(r.methode).toBe("multiple_ca");
  });
  it("comptes absents", () => {
    expect(estimationExpress({ section_naf: "C", ca: [], ebe: [] }, TABLE).statut).toBe("comptes_absents");
  });
  it("secteur sans multiple sourcé : aucun chiffre", () => {
    const r = estimationExpress({ section_naf: "F", ca: [{ annee: 2024, valeur: 1e6 }], ebe: [{ annee: 2024, valeur: 1e5 }] }, TABLE);
    expect(r).toEqual({ statut: "reference_a_completer", exercice: 2024, secteur: "vide" });
  });
  it("le fichier réel ne contient aucun multiple non sourcé", () => {
    for (const s of MULTIPLES.secteurs) {
      const valeurs = [...Object.values(s.ebe), ...Object.values(s.ca)];
      if (valeurs.some((v) => v != null)) expect(s.source, `secteur ${s.cle}`).toBeTruthy();
    }
  });
  it("chaque section NAF A à U a un secteur", () => {
    for (const l of "ABCDEFGHIJKLMNOPQRSTU") expect(secteurPour(l), l).not.toBeNull();
  });
});

describe("multiples croisés (fichier réel)", () => {
  it("bas ≤ central ≤ haut, valeurs plausibles pour des PME (entre 1x et 15x l'EBE)", () => {
    for (const s of MULTIPLES.secteurs) {
      const { bas, central, haut } = s.ebe;
      expect(bas, s.cle).toBeLessThanOrEqual(central);
      expect(central, s.cle).toBeLessThanOrEqual(haut);
      expect(bas, s.cle).toBeGreaterThanOrEqual(1);
      expect(haut, s.cle).toBeLessThanOrEqual(15);
    }
  });
  it("chaque source du croisement est citée avec une URL", () => {
    for (const src of MULTIPLES.sources["croisement-2026-11"]) expect(src.url).toMatch(/^https:\/\//);
  });
  it("le fichier est à jour par rapport à ses données d'entrée (npm run multiples)", async () => {
    const { readFileSync } = await import("node:fs");
    const entrees = JSON.parse(readFileSync(new URL("../src/data/multiples-sources.json", import.meta.url)));
    expect(MULTIPLES.version).toBe(entrees.consulte_le);
  });
});
