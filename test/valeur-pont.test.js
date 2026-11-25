// "Your value" (part C): bridge from reported EBITDA to the value of the shares, restatements shown live, adjusted net
// assets next to the range, k€ format, new consistency checks. Expected values calculated by hand (detail in the
// comments), not copied from the code.
import { describe, it, expect } from "vitest";
import { valorisationApprofondie, pontEbe } from "../src/valuation/approfondie.js";
import { lignesRetraitement, apercuRetraitements, pontValeur, situationAncc, texteAncc, kEuros, fois } from "../public/js/valeur-pont.js";
import { controlerExercice } from "../src/valuation/controles.js";
import { avecLangue } from "../src/i18n.js";
import HYP from "../src/data/hypotheses.json";

// Test multiples (not the real table): 4× / 5.5× / 7×
const TABLE = { secteurs: [{ cle: "industrie", sections: ["C"], ebe: { bas: 4, central: 5.5, haut: 7 }, source: "essai-2026-11" }] };
// One fiscal year, 2025. Reported EBITDA = 1,000,000 − 300,000 − 200,000 − 20,000 − 380,000 = 100,000.
const EX = { annee: 2025, chiffre_affaires: 1_000_000, autres_produits: 0, achats_consommes: 300_000, charges_externes: 200_000, impots_taxes: 20_000, charges_personnel: 380_000,
  stocks: 50_000, creances_clients: 150_000, dettes_fournisseurs: 80_000, dettes_fiscales_sociales: 70_000,
  tresorerie: 200_000, emprunts: 120_000, capitaux_propres: 900_000 };
// Owner +30,000 (90,000 − 60,000); rent −6,000 (24,000 paid to the SCI, market 30,000); exceptional 2025 +10,000
const RETRAITEMENTS = { remuneration_dirigeant_reelle: 90_000, remuneration_normative: 60_000, loyer_paye: 24_000, loyer_marche: 30_000,
  exceptionnels: [{ annee: 2025, libelle: "Litige", montant: 10_000, justification: "Non récurrent" }, { annee: 2024, montant: 99_000 }] };
const entree = (ex = {}, c = {}) => ({ secteur: "industrie", exercices: [{ ...EX, ...ex }], retraitements: RETRAITEMENTS,
  complements: { comptes_courants_remboursables: 30_000, dividendes_a_verser: 10_000, actifs_hors_exploitation: 25_000, ...c }, decotes: [], modeEbe: "dernier" });

describe("restatements: one rule for the screen and the engine", () => {
  it("lines of a year: owner +30,000, rent −6,000, the year's exceptional item only", () => {
    expect(lignesRetraitement(RETRAITEMENTS, 2025).map((l) => [l.cle, l.montant])).toEqual([["dirigeant", 30_000], ["loyer", -6_000], ["exceptionnel", 10_000]]);
    expect(lignesRetraitement({ remuneration_dirigeant_reelle: 90_000 }, 2025)).toEqual([]); // normalized pay missing: no line
  });
  it("live preview: reported EBITDA 100,000 → restated 134,000; the same figure as the engine", () => {
    const a = apercuRetraitements(100_000, RETRAITEMENTS, 2025);
    expect(a.ebe_retraite).toBe(134_000);
    expect(pontEbe([EX], RETRAITEMENTS)[0].ebe_retraite).toBe(134_000);
    expect(apercuRetraitements(null, RETRAITEMENTS, 2025)).toBeNull();
  });
});

describe("bridge from EBITDA to the value of the shares (calculated by hand)", () => {
  // EV = 134,000 × 4 = 536,000 and × 7 = 938,000. Net debt = 120,000 + 30,000 + 10,000 − 200,000 = −40,000 (net cash).
  // Working capital: a single fiscal year, so actual = normalized, gap 0. Equity = EV + 40,000 + 25,000:
  // low 601,000, high 1,003,000.
  const r = valorisationApprofondie(entree(), HYP, TABLE);
  const p = pontValeur(r);
  const ligne = (cle) => p.lignes.find((l) => l.cle === cle);
  it("each line, in order", () => {
    expect(p.lignes.map((l) => l.cle)).toEqual(["ebe_comptable", "dirigeant", "loyer", "exceptionnel", "ebe_retenu", "multiples", "ve",
      "dette_emprunts", "dette_comptes_courants", "dette_dividendes", "dette_tresorerie", "hors_exploitation", "titres"]);
    expect(ligne("ebe_comptable").montant).toBe(100_000);
    expect(ligne("ebe_retenu").montant).toBe(134_000);
    expect([ligne("multiples").bas, ligne("multiples").haut]).toEqual([4, 7]);
    expect([ligne("ve").bas, ligne("ve").haut]).toEqual([536_000, 938_000]);
    expect(ligne("dette_emprunts").bas).toBe(-120_000);
    expect(ligne("dette_tresorerie").bas).toBe(200_000);
    expect([ligne("titres").bas, ligne("titres").haut]).toEqual([601_000, 1_003_000]);
  });
  it("the lines add up: EBITDA used, then equity value at both ends of the range", () => {
    const somme = (cles, k) => cles.reduce((a, c) => a + (ligne(c)[k] ?? ligne(c).montant), 0);
    expect(somme(["ebe_comptable", "dirigeant", "loyer", "exceptionnel"], "montant")).toBe(134_000);
    for (const k of ["bas", "haut"]) expect(somme(["ve", "dette_emprunts", "dette_comptes_courants", "dette_dividendes", "dette_tresorerie", "hors_exploitation"], k)).toBe(ligne("titres")[k]);
    expect(r.synthese.bas).toBe(601_000); // same as the engine's range shown everywhere
  });
  it("average mode: reported EBITDA and each restatement averaged, adding up to the normalized EBITDA", () => {
    // Reported 260,000 / 320,000 / 380,000 → average 320,000; owner +50,000 and rent +12,000 every year;
    // exceptional +20,000 in 2024 only → average 6,666.67. Total 388,666.67 (approfondie.test.js).
    const exs = [2023, 2024, 2025].map((annee, i) => ({ ...EX, annee, chiffre_affaires: 2_000_000 + 200_000 * i, achats_consommes: 800_000 + 80_000 * i,
      charges_externes: 300_000 + 20_000 * i, impots_taxes: 40_000, charges_personnel: 600_000 + 40_000 * i }));
    const rr = valorisationApprofondie({ ...entree(), exercices: exs, modeEbe: "moyenne",
      retraitements: { remuneration_dirigeant_reelle: 150_000, remuneration_normative: 100_000, loyer_paye: 60_000, loyer_marche: 48_000, exceptionnels: [{ annee: 2024, montant: 20_000 }] } }, HYP, TABLE);
    const pp = pontValeur(rr);
    expect(pp.annees).toEqual([2023, 2024, 2025]);
    expect(pp.lignes[0].montant).toBe(320_000);
    expect(pp.lignes.find((l) => l.cle === "exceptionnel").montant).toBeCloseTo(6_666.67, 2);
    expect(pp.lignes.find((l) => l.cle === "ebe_retenu").montant).toBeCloseTo(388_666.67, 2);
  });
  it("discounts: one line, EV × (factor − 1)", () => {
    const rr = valorisationApprofondie({ ...entree(), decotes: [{ cle: "dependance_dirigeant", pct: -0.1 }] }, HYP, TABLE);
    const d = pontValeur(rr).lignes.find((l) => l.cle === "decotes");
    expect(d.bas).toBeCloseTo(-53_600, 6); // 536,000 × −10 %
    expect(d.haut).toBeCloseTo(-93_800, 6);
  });
  it("no bridge when the multiples do not apply (negative EBITDA)", () => {
    expect(pontValeur(valorisationApprofondie({ ...entree({ charges_personnel: 600_000 }), retraitements: {} }, HYP, TABLE))).toBeNull();
  });
});

describe("adjusted net assets next to the range: 'floor' only below it", () => {
  it("within, above, below, negative", () => {
    expect(situationAncc(601_000, 1_003_000, 900_000).cas).toBe("dans");
    expect(situationAncc(550_000, 750_000, 1_450_000).cas).toBe("au_dessus"); // the case seen on 24/11/2026
    expect(situationAncc(601_000, 1_003_000, 300_000).cas).toBe("plancher");
    expect(situationAncc(601_000, 1_003_000, -50_000).cas).toBe("negatif");
    expect(situationAncc(null, 1, 1)).toBeNull();
  });
  it("above the range: no word 'floor' (plancher), in French and in English", () => {
    const s = situationAncc(550_000, 750_000, 1_450_000);
    for (const l of ["fr", "en"]) {
      const texte = avecLangue(l, () => texteAncc(s, { bas: 550_000, haut: 750_000 }));
      expect(texte).not.toMatch(/plancher|floor/i);
      expect(texte).toContain(l === "fr" ? "1 450 k€" : "€1,450K");
    }
    expect(avecLangue("fr", () => texteAncc(situationAncc(601_000, 1_003_000, 300_000), { bas: 601_000, haut: 1_003_000 }))).toMatch(/plancher/);
  });
  it("the engine's own value: equity 1,450,000 gives 'above' with the 601,000 – 1,003,000 range", () => {
    const r = valorisationApprofondie(entree({ capitaux_propres: 1_450_000 }), HYP, TABLE);
    expect(situationAncc(r.synthese.bas, r.synthese.haut, r.ancc.valeur).cas).toBe("au_dessus");
  });
});

describe("k€ format, negatives in brackets", () => {
  it("French and English", () => {
    expect(avecLangue("fr", () => [kEuros(134_000), kEuros(-120_000), kEuros(1_003_000), kEuros(null)])).toEqual(["134 k€", "(120 k€)", "1 003 k€", "–"]);
    expect(avecLangue("en", () => [kEuros(134_000), kEuros(-120_000), kEuros(1_003_000)])).toEqual(["€134K", "(€120K)", "€1,003K"]);
    expect(avecLangue("fr", () => fois(4))).toBe("4,0×");
  });
});

describe("consistency checks of a fiscal year (part C)", () => {
  const l = (o) => Object.fromEntries(Object.entries(o).map(([k, valeur]) => [k, { valeur, source: "dirigeant", valide: false }]));
  const codes = (x) => x.map((c) => `${c.code}:${c.niveau}`);
  it("net income (276,000) above EBITDA (89,000): flagged for checking, never blocking", () => {
    const c = controlerExercice(l({ chiffre_affaires: 900_000, ebe: 89_000, resultat_net: 276_000 }));
    expect(codes(c)).toContain("resultat_net_ebe:attention");
    expect(controlerExercice(l({ chiffre_affaires: 900_000, ebe: 89_000, resultat_net: 40_000 })).some((x) => x.code === "resultat_net_ebe")).toBe(false);
  });
  it("the EBITDA calculated from the expenses is used when the detail is there", () => {
    // 1,000,000 − 300,000 − 200,000 − 380,000 = 120,000 < net income 150,000
    expect(codes(controlerExercice(l({ chiffre_affaires: 1_000_000, achats_consommes: 300_000, charges_externes: 200_000, charges_personnel: 380_000, resultat_net: 150_000 })))).toContain("resultat_net_ebe:attention");
  });
  it("negative shareholders' equity", () => {
    expect(codes(controlerExercice(l({ chiffre_affaires: 900_000, ebe: 89_000, capitaux_propres: -10_000 })))).toContain("capitaux_propres_negatifs:attention");
  });
  it("revenue up or down by more than 30 % (and the ×3 alert kept)", () => {
    const prec = l({ chiffre_affaires: 1_000_000 });
    expect(codes(controlerExercice(l({ chiffre_affaires: 1_310_000, ebe: 1 }), { precedent: prec }))).toContain("variation_30:attention");
    expect(codes(controlerExercice(l({ chiffre_affaires: 690_000, ebe: 1 }), { precedent: prec }))).toContain("variation_30:attention");
    expect(controlerExercice(l({ chiffre_affaires: 1_300_000, ebe: 1 }), { precedent: prec }).some((x) => x.code === "variation_30")).toBe(false);
    expect(codes(controlerExercice(l({ chiffre_affaires: 3_500_000, ebe: 1 }), { precedent: prec }))).toContain("variation:alerte");
  });
});
