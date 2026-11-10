import { describe, it, expect } from "vitest";
import {
  etages, fenetresAllumees, arbres, archetype, croissance3ans, echafaudage, paliersCA,
  redigerFrise, casseVille, aVille, parametresMaquette, libelleEffectif,
} from "../public/js/regles.js";

describe("étages (CA)", () => {
  // Valeurs calculées à la main : 1 + round(2 × log10(CA / 100 000)), borné à [1, 8]
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

describe("paliers de CA", () => {
  it("ne retient que les franchissements observés entre deux exercices", () => {
    const s = [{ annee: 2018, valeur: 600_000 }, { annee: 2019, valeur: 1_100_000 }, { annee: 2021, valeur: 2_300_000 }];
    // 500 k€ déjà dépassé au premier exercice : inconnu, donc ignoré
    expect(paliersCA(s)).toEqual([{ annee: 2019, palier: 1_000_000 }, { annee: 2021, palier: 2_000_000 }]);
  });
});

describe("villes", () => {
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

describe("frise « Vous avez bâti »", () => {
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

  it("commence par la création et finit par « Aujourd'hui »", () => {
    const f = redigerFrise(base, 2026);
    expect(f[0]).toEqual({ date: "1994", texte: "ATELIER TEST voit le jour à Annecy." });
    expect(f.at(-1)).toEqual({ date: "Aujourd'hui", texte: "Il est temps de préparer la suite." });
  });

  it("6 lignes au plus, dans l'ordre chronologique", () => {
    const f = redigerFrise(base, 2026);
    expect(f.length).toBeLessThanOrEqual(6);
    const annees = f.slice(0, -1).map((l) => Number(l.date.slice(0, 4)));
    expect([...annees].sort((a, b) => a - b)).toEqual(annees);
  });

  it("garde les événements les plus marquants (palier le plus haut, reprise)", () => {
    const textes = redigerFrise(base, 2026).map((l) => l.texte);
    expect(textes).toContain("Le chiffre d'affaires dépasse 5 M€.");
    expect(textes).toContain("L'entreprise reprend un fonds au Pouliguen.");
  });

  it("ne parle jamais du lecteur à la 2e personne", () => {
    const tout = redigerFrise(base, 2026).map((l) => l.texte).join(" ");
    expect(tout).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
  });

  it("sans événement ni comptes : 2 lignes seulement (création, aujourd'hui)", () => {
    const f = redigerFrise({ nom: "SOLO", date_creation: "2026-02-01", ca: [], evenements: [], tranche_effectif: { code: "NN", annee: 2025 } }, 2026);
    expect(f).toEqual([{ date: "2026", texte: "SOLO voit le jour." }, { date: "Aujourd'hui", texte: "Il est temps de préparer la suite." }]);
  });

  it("plusieurs reprises sont regroupées en une ligne", () => {
    const d = { ...base, evenements: [
      { date: "2015-05-01", type: "reprise_fonds", detail: "Clisson" },
      { date: "2019-03-01", type: "reprise_fonds", detail: "Pornic" },
    ] };
    expect(redigerFrise(d, 2026).map((l) => l.texte)).toContain("L'entreprise reprend 2 fonds de commerce.");
  });

  it("libellés d'effectif", () => {
    expect(libelleEffectif("01")).toBe("une ou deux personnes");
    expect(libelleEffectif("53")).toMatch(/^plus de 10\s000 personnes$/); // espace fine insécable (typographie française)
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
