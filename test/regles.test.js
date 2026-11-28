import { describe, it, expect } from "vitest";
import {
  etages, fenetresAllumees, arbres, archetype, croissance3ans, echafaudage,
  casseVille, parametresMaquette, libelleEffectif, personnages,
} from "../public/js/regles.js";

describe("étages (CA)", () => {
  // Values calculated by hand: 1 + round(2 × log10(revenue / 100,000)), bounded to [1, 8]
  it.each([
    [50_000, 1], [100_000, 1], [1_000_000, 3], [10_000_000, 5], [100_000_000, 7], [200_000_000, 8], [5e9, 8],
  ])("CA %d € → %d étage(s)", (ca, n) => expect(etages(ca)).toBe(n));
  it("CA nul ou négatif → 1 étage", () => { expect(etages(0)).toBe(1); expect(etages(-5000)).toBe(1); });
  it("CA inconnu → null (étages en pointillés)", () => expect(etages(null)).toBeNull());
});

describe("fenêtres allumées (effectif)", () => {
  it("1 seul salarié (tranche 01, milieu 1,5) → 1 fenêtre", () => expect(fenetresAllumees("01", 20)).toBe(1));
  it("tranche 12 (20 à 49, milieu 34,5) → 7 fenêtres", () => expect(fenetresAllumees("12", 20)).toBe(7));
  it("plus de 5 000 salariés → plafonné au nombre de fenêtres", () => {
    expect(fenetresAllumees("52", 30)).toBe(30);
    expect(fenetresAllumees("53", 12)).toBe(12);
  });
  it("aucun salarié ou tranche inconnue → 1 fenêtre (le dirigeant)", () => {
    expect(fenetresAllumees("NN", 20)).toBe(1);
    expect(fenetresAllumees(undefined, 20)).toBe(1);
  });
});

describe("arbres (marge d'EBE)", () => {
  it.each([
    [-50, 0, false], [0, 1, false], [49, 1, false], [50, 2, false], [99, 2, false], [100, 3, false], [150, 3, false], [151, 4, true],
  ])("EBE %d pour CA 1 000 → %d arbre(s), haie %s", (ebe, n, haie) => {
    const r = arbres(1000, ebe);
    expect(r.nombre).toBe(n);
    expect(r.haie).toBe(haie);
  });
  it("EBE ou CA absent → aucun arbre", () => {
    expect(arbres(null, 10).nombre).toBe(0);
    expect(arbres(1000, null).nombre).toBe(0);
  });
});

describe("archétype (section NAF)", () => {
  it.each([
    ["C", "industrie"], ["F", "construction"], ["G", "commerce"], ["I", "restauration"], ["H", "logistique"],
    ["A", "ferme"], ["J", "bureaux"], ["K", "bureaux"], ["M", "bureaux"], ["N", "bureaux"], ["Q", "sante"],
    ["S", "generique"], [null, "generique"],
  ])("%s → %s", (s, a) => expect(archetype(s)).toBe(a));
});

describe("croissance et échafaudage", () => {
  it("+21 % en 3 ans → échafaudage", () => {
    expect(echafaudage([{ annee: 2021, valeur: 1000 }, { annee: 2024, valeur: 1210 }])).toBe(true);
  });
  it("+20 % pile → pas d'échafaudage (seuil strict)", () => {
    expect(echafaudage([{ annee: 2021, valeur: 1000 }, { annee: 2024, valeur: 1200 }])).toBe(false);
  });
  it("exercices espacés de 2 ans : croissance ramenée à 3 ans", () => {
    // 1000 → 1210 en 2 ans : (1,21)^(3/2) - 1 = 0,331
    expect(croissance3ans([{ annee: 2022, valeur: 1000 }, { annee: 2024, valeur: 1210 }])).toBeCloseTo(0.331, 3);
  });
  it("un seul exercice ou écart trop grand → null", () => {
    expect(croissance3ans([{ annee: 2024, valeur: 1000 }])).toBeNull();
    expect(croissance3ans([{ annee: 2016, valeur: 1000 }, { annee: 2024, valeur: 3000 }])).toBeNull();
  });
});

describe("villes", () => {
  it.each([
    ["VILLENEUVE D ASCQ", "Villeneuve d'Ascq"],
    ["ERDRE-EN-ANJOU", "Erdre-en-Anjou"],
    ["LES SABLES D OLONNE", "Les Sables d'Olonne"],
    ["LE POULIGUEN", "Le Pouliguen"],
    ["L ISLE ADAM", "L'Isle Adam"],
    ["Saint-Péreuse", "Saint-Péreuse"],
  ])("%s → %s", (brut, casse) => {
    expect(casseVille(brut)).toBe(casse);
  });
});

// The « You built » timeline (redigerFrise, aVille, paliersCA) was removed on 23/11/2026: only the tests had used it
// since the old home page was removed (PR #27, « to be reviewed by the owner »).
describe("effectif", () => {
  it("libellés d'effectif", () => {
    expect(libelleEffectif("01")).toBe("une ou deux personnes");
    expect(libelleEffectif("53")).toMatch(/^plus de 10\s000 personnes$/); // narrow no-break space (French typography)
    expect(libelleEffectif("00")).toBeNull();
  });
});

describe("paramètres de maquette : cas limites", () => {
  it("comptes absents → étages null, pas d'arbres, maquette marquée incomplète", () => {
    const p = parametresMaquette({ section_naf: "I", date_creation: "2015-11-09", tranche_effectif: { code: "11" }, ca: [], ebe: [] });
    expect(p).toMatchObject({ archetype: "restauration", etages: null, comptesManquants: true, depuis: 2015 });
    expect(p.arbres.nombre).toBe(0);
  });
  it("EBE négatif → aucun arbre, mais rien d'autre ne change", () => {
    const p = parametresMaquette({ section_naf: "C", ca: [{ annee: 2024, valeur: 3_000_000 }], ebe: [{ annee: 2024, valeur: -200_000 }], tranche_effectif: { code: "11" } });
    expect(p.arbres.nombre).toBe(0);
    expect(p.etages).toBe(4); // 1 + round(2 × log10(30)) = 1 + round(2,95) = 4
  });
  it("entreprise créée cette année", () => {
    const p = parametresMaquette({ section_naf: "M", date_creation: "2026-01-15", ca: [], ebe: [] });
    expect(p.depuis).toBe(2026);
  });
});

describe("personnages de maquette (effectif)", () => {
  // Rule: 1 figure per started band of 10 employees, on the lower bound of the INSEE band;
  // at least 1 (the owner), at most 8 (4 on mobile).
  it.each([
    ["NN", 1], ["00", 1], ["01", 1], ["02", 1], ["03", 1], // 0 to 9 employees → 1
    ["11", 1],  // 10 to 19: lower bound 10 → 10/10 = 1
    ["12", 2],  // 20 to 49: 20/10 = 2
    ["21", 5],  // 50 to 99: 50/10 = 5
    ["22", 8],  // 100 to 199: 10, capped at 8
    ["53", 8],
  ])("tranche %s → %i", (code, n) => expect(personnages(code)).toBe(n));
  it("tranche inconnue → 1 (le dirigeant)", () => expect(personnages(undefined)).toBe(1));
  it("plafond mobile", () => expect(personnages("21", 4)).toBe(4));
  it("parametresMaquette transmet le nombre et le libellé", () => {
    const p = parametresMaquette({ section_naf: "C", tranche_effectif: { code: "12" }, ca: [], ebe: [] });
    expect(p.personnages).toBe(2);
    expect(p.effectif).toBe("de 20 à 49 personnes");
  });
});
