import { describe, it, expect } from "vitest";
import { visuelsTeaser } from "../src/documents/teaser.js";

// Chiffres entièrement fictifs
const entreprise = { section_naf: "C", code_postal: "63370", date_creation: "1998-03-01", tranche_effectif: { code: "12" } };
const entree = { exercices: [
  { annee: 2022, chiffre_affaires: 2_000_000 },
  { annee: 2023, chiffre_affaires: 2_210_000 },
  { annee: 2024, chiffre_affaires: 2_430_000 },
] };
const resultat = { ebe_normatif: { valeur: 340_000 } };

describe("visuels du teaser", () => {
  const v = visuelsTeaser({ entreprise, resultat, entree, reponses: { clients: { part_recurrente: 0.64 } } });
  it("paliers de CA et de marge, sans montant", () => {
    expect(v.ca).toEqual({ palier: 2, libelle: "entre 2 M€ et 5 M€" });        // 2,43 M€ ∈ [2 ; 5[
    expect(v.marge).toEqual({ palier: 3, libelle: "entre 10 et 15 %" });       // 340 / 2 430 = 14,0 %
  });
  it("évolution en indice base 100 arrondi à 5, années relatives", () => {
    // 2 210 / 2 000 = 110,5 → 110 ; 2 430 / 2 000 = 121,5 → 120
    expect(v.evolution).toEqual([{ annee: "N-2", indice: 100 }, { annee: "N-1", indice: 110 }, { annee: "N", indice: 120 }]);
  });
  it("part récurrente arrondie à 10 %, région sans ville", () => {
    expect(v.recurrence).toBe(60);
    expect(v.tuiles.region).toBe("Auvergne-Rhône-Alpes");
  });
  it("aucun montant exact dans les visuels", () => {
    const t = JSON.stringify(v);
    for (const m of ["2000000", "2210000", "2430000", "340000", "2022", "2023", "2024", "63370"]) expect(t).not.toContain(m);
  });
  it("comptes absents : rien d'inventé", () => {
    const w = visuelsTeaser({ entreprise: {}, resultat: null, entree: null });
    expect(w.ca).toBeNull(); expect(w.marge).toBeNull(); expect(w.evolution).toBeNull(); expect(w.recurrence).toBeNull();
    expect(w.tuiles.region).toBe("France");
  });
  it("EBE négatif : premier palier", () => {
    const w = visuelsTeaser({ entreprise, resultat: { ebe_normatif: { valeur: -50_000 } }, entree });
    expect(w.marge).toEqual({ palier: 0, libelle: "négative" });
  });
});
