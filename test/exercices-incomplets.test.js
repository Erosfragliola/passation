// FIN-01 (audit of 18/11/2026): an incomplete fiscal year must never enter the valuation with expenses
// counted as zero. Before the fix, a fiscal year with only revenue (€1,000,000) approved gave a normalized EBITDA of
// €1,000,000 and a central value of €5.6M. Expected values calculated by hand (details in comments).
import { describe, it, expect } from "vitest";
import { assemblerEntree } from "../src/valuation/entree.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import { construireDatapack } from "../src/documents/datapack.js";
import HYP from "../src/data/hypotheses.json";

const valide = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { valeur: v, valide: true, source: "dirigeant" }]));

// Fiscal year 2025 complete, manufacturing (section C, multiples 4 / 5.6 / 7):
// EBITDA = 1,000,000 − 400,000 − 200,000 − 20,000 − 230,000 = 150,000
// Net debt = 120,000 − 80,000 = 40,000; working capital = 50,000 + 100,000 − 60,000 − 40,000 = 50,000 (gap to normalized: 0)
// Shares = 150,000 × (4; 5.6; 7) − 40,000 = 560,000; 800,000; 1,010,000
const complet2025 = valide({
  chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 200_000, impots_taxes: 20_000, charges_personnel: 230_000,
  stocks: 50_000, creances_clients: 100_000, tresorerie: 80_000, capitaux_propres: 300_000, emprunts: 120_000,
  dettes_fournisseurs: 60_000, dettes_fiscales_sociales: 40_000,
});
const caSeul = (ca) => valide({ chiffre_affaires: ca });
const calcul = (lignes) => {
  const { entree, H } = assemblerEntree({ section_naf: "C" }, lignes, {}, HYP);
  return { entree, H, r: valorisationApprofondie(entree, H) };
};
const proche = (a, b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("incomplete fiscal years (FIN-01)", () => {
  it("only revenue approved: no calculation, fiscal year flagged (and no longer €5.6M of value)", () => {
    const { entree, r } = calcul({ 2025: caSeul(1_000_000) });
    expect(entree.exercices).toEqual([]);
    expect(entree.exercices_exclus.map((x) => x.annee)).toEqual([2025]);
    expect(r.statut).toBe("chiffres_absents");
    expect(r.alertes.join(" ")).toMatch(/2025 écarté/);
  });

  it("complete fiscal year only: shares 560,000 / 800,000 / 1,010,000", () => {
    const { r } = calcul({ 2025: complet2025 });
    expect(r.ebe_normatif.valeur).toBe(150_000);
    expect(r.dette_nette.total).toBe(40_000);
    proche(r.multiples.titres.bas, 560_000);
    proche(r.multiples.titres.central, 800_000);
    proche(r.multiples.titres.haut, 1_010_000);
  });

  it("mixed (2025 complete + 2024 with revenue only): 2024 left out, same results as 2025 alone", () => {
    const { entree, r } = calcul({ 2024: caSeul(900_000), 2025: complet2025 });
    expect(entree.exercices.map((x) => x.annee)).toEqual([2025]);
    expect(r.annees).toEqual([2025]);
    expect(r.ebe_normatif.valeur).toBe(150_000); // and not (150,000 + 900,000) / 2
    proche(r.multiples.titres.central, 800_000);
    expect(r.synthese.alertes.join(" ")).toMatch(/Exercice 2024 écarté/);
  });

  it("one unapproved required line is enough to leave the fiscal year out", () => {
    const l = structuredClone(complet2025);
    l.charges_externes.valide = false;
    const { entree } = calcul({ 2025: l });
    expect(entree.exercices_exclus).toEqual([{ annee: 2025, manquants: ["charges_externes"] }]);
  });

  it("missing value (null) ≠ real zero: purchases at 0 approved → fiscal year used, EBITDA 550,000", () => {
    const zero = structuredClone(complet2025);
    zero.achats_consommes.valeur = 0; // 1 000 000 − 0 − 200 000 − 20 000 − 230 000 = 550 000
    expect(calcul({ 2025: zero }).r.ebe_normatif.valeur).toBe(550_000);
    const absent = structuredClone(complet2025);
    absent.achats_consommes.valeur = null;
    expect(calcul({ 2025: absent }).entree.exercices).toEqual([]);
  });

  it("public accounts: published EBITDA approved instead of the detail of expenses → used", () => {
    const l = structuredClone(complet2025);
    for (const k of ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"]) delete l[k];
    l.ebe = { valeur: 120_000, valide: true, source: "inpi" };
    const { r } = calcul({ 2025: l });
    expect(r.ebe_normatif.valeur).toBe(120_000);
  });

  it("engine called directly with a partial fiscal year: left out by the engine itself", () => {
    const r = valorisationApprofondie({ secteur: "industrie", exercices: [{ annee: 2025, chiffre_affaires: 1_000_000 }] }, HYP);
    expect(r.statut).toBe("chiffres_absents");
    expect(r.alertes.join(" ")).toMatch(/EBE non déterminable/);
  });

  it("datapack (mixed case): only 2025 appears, formulas = engine (normalized EBITDA 150,000, central shares 800,000)", () => {
    const { entree, H, r } = calcul({ 2024: caSeul(900_000), 2025: complet2025 });
    const wb = construireDatapack({ entreprise: { nom: "Exemple", siren: "000000000" }, entree, H, resultat: r, genereLe: new Date("2026-11-18") });
    const calc = wb.calculer();
    expect(calc.lire("1.1 Comptes", 2, 1)).toBe(2025);
    expect(calc.lire("1.1 Comptes", 2, 2)).not.toBe(2024);
    proche(calc.valeur("2.2 Multiples", "B3"), 150_000);
    proche(calc.valeur("2.2 Multiples", "C8"), 800_000);
  });
});
