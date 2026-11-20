import { describe, it, expect } from "vitest";
import {
  etages, fenetresAllumees, arbres, archetype, croissance3ans, echafaudage, paliersCA,
  redigerFrise, casseVille, aVille, parametresMaquette, libelleEffectif, personnages,
} from "../public/js/regles.js";

describe("floors (revenue)", () => {
  // Values calculated by hand: 1 + round(2 × log10(revenue / 100,000)), bounded to [1, 8]
  it.each([
    [50_000, 1], [100_000, 1], [1_000_000, 3], [10_000_000, 5], [100_000_000, 7], [200_000_000, 8], [5e9, 8],
  ])("CA %d € → %d étage(s)", (ca, n) => expect(etages(ca)).toBe(n));
  it("zero or negative revenue → 1 floor", () => { expect(etages(0)).toBe(1); expect(etages(-5000)).toBe(1); });
  it("unknown revenue → null (floors in dotted lines)", () => expect(etages(null)).toBeNull());
});

describe("lit windows (headcount)", () => {
  it("a single employee (band 01, midpoint 1.5) → 1 window", () => expect(fenetresAllumees("01", 20)).toBe(1));
  it("band 12 (20 to 49, midpoint 34.5) → 7 windows", () => expect(fenetresAllumees("12", 20)).toBe(7));
  it("more than 5,000 employees → capped at the number of windows", () => {
    expect(fenetresAllumees("52", 30)).toBe(30);
    expect(fenetresAllumees("53", 12)).toBe(12);
  });
  it("no employee or unknown band → 1 window (the owner)", () => {
    expect(fenetresAllumees("NN", 20)).toBe(1);
    expect(fenetresAllumees(undefined, 20)).toBe(1);
  });
});

describe("trees (EBITDA margin)", () => {
  it.each([
    [-50, 0, false], [0, 1, false], [49, 1, false], [50, 2, false], [99, 2, false], [100, 3, false], [150, 3, false], [151, 4, true],
  ])("EBE %d pour CA 1 000 → %d arbre(s), haie %s", (ebe, n, haie) => {
    const r = arbres(1000, ebe);
    expect(r.nombre).toBe(n);
    expect(r.haie).toBe(haie);
  });
  it("missing EBITDA or revenue → no tree", () => {
    expect(arbres(null, 10).nombre).toBe(0);
    expect(arbres(1000, null).nombre).toBe(0);
  });
});

describe("archetype (NAF section)", () => {
  it.each([
    ["C", "industrie"], ["F", "construction"], ["G", "commerce"], ["I", "restauration"], ["H", "logistique"],
    ["A", "ferme"], ["J", "bureaux"], ["K", "bureaux"], ["M", "bureaux"], ["N", "bureaux"], ["Q", "sante"],
    ["S", "generique"], [null, "generique"],
  ])("%s → %s", (s, a) => expect(archetype(s)).toBe(a));
});

describe("growth and scaffolding", () => {
  it("+21% in 3 years → scaffolding", () => {
    expect(echafaudage([{ annee: 2021, valeur: 1000 }, { annee: 2024, valeur: 1210 }])).toBe(true);
  });
  it("exactly +20% → no scaffolding (strict threshold)", () => {
    expect(echafaudage([{ annee: 2021, valeur: 1000 }, { annee: 2024, valeur: 1200 }])).toBe(false);
  });
  it("fiscal years 2 years apart: growth brought to 3 years", () => {
    // 1000 → 1210 in 2 years: (1.21)^(3/2) - 1 = 0.331
    expect(croissance3ans([{ annee: 2022, valeur: 1000 }, { annee: 2024, valeur: 1210 }])).toBeCloseTo(0.331, 3);
  });
  it("a single fiscal year or gap too large → null", () => {
    expect(croissance3ans([{ annee: 2024, valeur: 1000 }])).toBeNull();
    expect(croissance3ans([{ annee: 2016, valeur: 1000 }, { annee: 2024, valeur: 3000 }])).toBeNull();
  });
});

describe("revenue thresholds", () => {
  it("keeps only crossings observed between two fiscal years", () => {
    const s = [{ annee: 2018, valeur: 600_000 }, { annee: 2019, valeur: 1_100_000 }, { annee: 2021, valeur: 2_300_000 }];
    // €500K already exceeded in the first fiscal year: unknown, therefore ignored
    expect(paliersCA(s)).toEqual([{ annee: 2019, palier: 1_000_000 }, { annee: 2021, palier: 2_000_000 }]);
  });
});

describe("cities", () => {
  it.each([
    ["VILLENEUVE D ASCQ", "Villeneuve d'Ascq", "à Villeneuve d'Ascq"],
    ["ERDRE-EN-ANJOU", "Erdre-en-Anjou", "à Erdre-en-Anjou"],
    ["LES SABLES D OLONNE", "Les Sables d'Olonne", "aux Sables d'Olonne"],
    ["LE POULIGUEN", "Le Pouliguen", "au Pouliguen"],
    ["L ISLE ADAM", "L'Isle Adam", "à L'Isle Adam"],
    ["Saint-Péreuse", "Saint-Péreuse", "à Saint-Péreuse"],
  ])("%s → %s", (brut, casse, avec) => {
    expect(casseVille(brut)).toBe(casse);
    expect(aVille(brut)).toBe(avec);
  });
});

describe('"You built it" timeline', () => {
  const base = {
    nom: "ATELIER TEST", date_creation: "1994-03-01", ville_creation: "Annecy",
    tranche_effectif: { code: "12", annee: 2024 },
    ca: [{ annee: 2016, valeur: 800_000 }, { annee: 2018, valeur: 1_200_000 }, { annee: 2022, valeur: 2_500_000 }, { annee: 2024, valeur: 5_400_000 }],
    evenements: [
      { date: "2008-06-12", type: "transfert_siege", detail: "Seynod" },
      { date: "2012-01-10", type: "denomination", ancien: "ATELIER ANCIEN", nouveau: "ATELIER TEST" },
      { date: "2015-05-01", type: "reprise_fonds", detail: "Le Pouliguen" },
    ],
  };

  it(`starts with the creation and ends with "Aujourd'hui" (today)`, () => {
    const f = redigerFrise(base, 2026);
    expect(f[0]).toEqual({ date: "1994", texte: "ATELIER TEST voit le jour à Annecy." });
    expect(f.at(-1)).toEqual({ date: "Aujourd'hui", texte: "Il est temps de préparer la suite." });
  });

  it("6 lines at most, in chronological order", () => {
    const f = redigerFrise(base, 2026);
    expect(f.length).toBeLessThanOrEqual(6);
    const annees = f.slice(0, -1).map((l) => Number(l.date.slice(0, 4)));
    expect([...annees].sort((a, b) => a - b)).toEqual(annees);
  });

  it("keeps the most significant events (highest threshold, acquisition)", () => {
    const textes = redigerFrise(base, 2026).map((l) => l.texte);
    expect(textes).toContain("Le chiffre d'affaires dépasse 5 M€.");
    expect(textes).toContain("L'entreprise reprend un fonds au Pouliguen.");
  });

  it("never addresses the reader in the second person", () => {
    const tout = redigerFrise(base, 2026).map((l) => l.texte).join(" ");
    expect(tout).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
  });

  it("without events or accounts: only 2 lines (creation, today)", () => {
    const f = redigerFrise({ nom: "SOLO", date_creation: "2026-02-01", ca: [], evenements: [], tranche_effectif: { code: "NN", annee: 2025 } }, 2026);
    expect(f).toEqual([{ date: "2026", texte: "SOLO voit le jour." }, { date: "Aujourd'hui", texte: "Il est temps de préparer la suite." }]);
  });

  it("several acquisitions are grouped into one line", () => {
    const d = { ...base, evenements: [
      { date: "2015-05-01", type: "reprise_fonds", detail: "Clisson" },
      { date: "2019-03-01", type: "reprise_fonds", detail: "Pornic" },
    ] };
    expect(redigerFrise(d, 2026).map((l) => l.texte)).toContain("L'entreprise reprend 2 fonds de commerce.");
  });

  it("headcount labels", () => {
    expect(libelleEffectif("01")).toBe("une ou deux personnes");
    expect(libelleEffectif("53")).toMatch(/^plus de 10\s000 personnes$/); // narrow no-break space (French typography)
    expect(libelleEffectif("00")).toBeNull();
  });
});

describe("model parameters: edge cases", () => {
  it("missing accounts → floors null, no trees, model marked incomplete", () => {
    const p = parametresMaquette({ section_naf: "I", date_creation: "2015-11-09", tranche_effectif: { code: "11" }, ca: [], ebe: [] });
    expect(p).toMatchObject({ archetype: "restauration", etages: null, comptesManquants: true, depuis: 2015 });
    expect(p.arbres.nombre).toBe(0);
  });
  it("negative EBITDA → no tree, but nothing else changes", () => {
    const p = parametresMaquette({ section_naf: "C", ca: [{ annee: 2024, valeur: 3_000_000 }], ebe: [{ annee: 2024, valeur: -200_000 }], tranche_effectif: { code: "11" } });
    expect(p.arbres.nombre).toBe(0);
    expect(p.etages).toBe(4); // 1 + round(2 × log10(30)) = 1 + round(2.95) = 4
  });
  it("company created this year", () => {
    const p = parametresMaquette({ section_naf: "M", date_creation: "2026-01-15", ca: [], ebe: [] });
    expect(p.depuis).toBe(2026);
  });
});

describe("model figures (headcount)", () => {
  // Rule: 1 figure per started band of 10 employees, on the lower bound of the INSEE band;
  // at least 1 (the owner), at most 8 (4 on mobile).
  it.each([
    ["NN", 1], ["00", 1], ["01", 1], ["02", 1], ["03", 1], // 0 to 9 employees → 1
    ["11", 1],  // 10 to 19: lower bound 10 → 10/10 = 1
    ["12", 2],  // 20 à 49 : 20/10 = 2
    ["21", 5],  // 50 à 99 : 50/10 = 5
    ["22", 8],  // 100 to 199: 10, capped at 8
    ["53", 8],
  ])("tranche %s → %i", (code, n) => expect(personnages(code)).toBe(n));
  it("unknown band → 1 (the owner)", () => expect(personnages(undefined)).toBe(1));
  it("mobile cap", () => expect(personnages("21", 4)).toBe(4));
  it("parametresMaquette passes on the number and the label", () => {
    const p = parametresMaquette({ section_naf: "C", tranche_effectif: { code: "12" }, ca: [], ebe: [] });
    expect(p.personnages).toBe(2);
    expect(p.effectif).toBe("de 20 à 49 personnes");
  });
});
