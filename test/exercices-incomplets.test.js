// FIN-01 (audit of 18/11/2026): an incomplete fiscal year must never enter the valuation with expenses
// counted as zero. Before the fix, a fiscal year with only revenue (€1,000,000) approved gave a normalized EBITDA of
// €1,000,000 and a central value of €5.6M. Expected values calculated by hand (details in comments).
import { describe, it, expect } from "vitest";
import { assemblerEntree } from "../src/valuation/entree.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import { construireDatapack } from "../src/documents/datapack.js";
import { exercicesAttendus } from "../public/js/champs-financiers.js";
import { cleDuCalcul } from "../src/routes/valorisation.js";
import { empreinte } from "../src/lib/auth.js";
import MULTIPLES from "../src/data/multiples.json";
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

// 25/11/2026: an earlier fiscal year needs only its income statement (the owner had entered 2023 and 2024 without
// their balance sheets: both were left out, and the memorandum showed 2025 alone).
// 2024: EBITDA = 900,000 − 360,000 − 180,000 − 18,000 − 222,000 = 120,000 (detail of expenses, no balance sheet)
// 2023: published EBITDA 100,000 approved (no balance sheet)
// Normalized EBITDA (average) = (100,000 + 120,000 + 150,000) / 3 = 123,333.33
// Working capital: 2025 only (the others have no balance sheet) = 50,000, i.e. 50,000 / 1,000,000 × 365 = 18.25 days
// Shares = 123,333.33 × (4; 5.6; 7) − 40,000 = 453,333.33; 650,666.67; 823,333.33
describe("earlier fiscal years used for their income statement", () => {
  const resultat2024 = valide({ chiffre_affaires: 900_000, achats_consommes: 360_000, charges_externes: 180_000, impots_taxes: 18_000, charges_personnel: 222_000 });
  const publie2023 = valide({ chiffre_affaires: 800_000, ebe: 100_000 });
  const trois = { 2023: publie2023, 2024: resultat2024, 2025: complet2025 };

  it("the three fiscal years are used; only 2025 has a complete balance sheet", () => {
    const { entree } = calcul(trois);
    expect(entree.exercices.map((x) => [x.annee, x.bilan_complet])).toEqual([[2023, false], [2024, false], [2025, true]]);
    expect(entree.exercices_exclus).toEqual([]);
  });
  it("normalized EBITDA over three years; working capital and net debt from 2025 only (never a missing item as zero)", () => {
    const { r } = calcul(trois);
    expect(r.annees).toEqual([2023, 2024, 2025]);
    proche(r.ebe_normatif.valeur, 123_333.33);
    expect(r.bfr.normatif.par_exercice.map((x) => x.annee)).toEqual([2025]);
    proche(r.bfr.normatif.jours, 18.25);
    expect(r.dette_nette.total).toBe(40_000);
    proche(r.multiples.titres.bas, 453_333.33);
    proche(r.multiples.titres.central, 650_666.67);
    proche(r.multiples.titres.haut, 823_333.33);
  });
  it("the latest fiscal year must stay complete: 2025 without balance sheet → 2025 left out, 2024 cannot become the latest", () => {
    const sansBilan = valide({ chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 200_000, impots_taxes: 20_000, charges_personnel: 230_000 });
    const { entree, r } = calcul({ 2024: resultat2024, 2025: sansBilan });
    expect(entree.exercices).toEqual([]);
    expect(entree.exercices_exclus.map((x) => x.annee)).toEqual([2024, 2025]);
    expect(r.statut).toBe("chiffres_absents");
  });
  it("an earlier fiscal year with an expense missing is still left out, listing only income-statement lines", () => {
    const l = structuredClone(resultat2024); delete l.charges_externes;
    const { entree } = calcul({ 2024: l, 2025: complet2025 });
    expect(entree.exercices_exclus).toEqual([{ annee: 2024, manquants: ["charges_externes"] }]);
  });
  it("expected fiscal years: 2023 and 2024 count as done with their income statement", () => {
    expect(exercicesAttendus(trois).recommandes_manquants).toEqual([]);
  });
  it("datapack: three columns; no working capital for 2023 and 2024; same results as the engine", () => {
    const { entree, H, r } = calcul(trois);
    const wb = construireDatapack({ entreprise: { nom: "Exemple", siren: "000000000" }, entree, H, resultat: r, genereLe: new Date("2026-11-25") });
    const calc = wb.calculer();
    expect([1, 2, 3].map((c) => calc.lire("1.1 Comptes", 2, c))).toEqual([2023, 2024, 2025]);
    proche(calc.valeur("2.2 Multiples", "B3"), 123_333.33);
    proche(calc.valeur("2.2 Multiples", "C8"), 650_666.67);
  });
});

describe("key of the approved figures stays the same for files already approved (25/11/2026)", () => {
  // Fake D1: the two reads of cleDuCalcul (financial lines, answers)
  const envDe = (lignes) => ({ DB: { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: sql.includes("FROM financials")
    ? Object.entries(lignes).flatMap(([y, l]) => Object.entries(l).map(([field, c]) => ({ year: Number(y), field, value: c.valeur, source: c.source, validated: c.valide ? 1 : 0 })))
    : [] }) }) }) } });
  const row = { id: "d1", company_json: JSON.stringify({ section_naf: "C" }) };
  it("complete fiscal years: same key as the rule before 25/11/2026 (no « to approve again » after the update)", async () => {
    const lignes = { 2025: complet2025 };
    // Key as calculated before: fiscal years without bilan_complet
    const { entree, H } = assemblerEntree({ section_naf: "C" }, lignes, {}, HYP);
    const { erreurs, ...e } = entree;
    e.exercices = e.exercices.map(({ bilan_complet, ...x }) => x);
    expect(await cleDuCalcul(envDe(lignes), row)).toBe(await empreinte(JSON.stringify({ e, H, m: MULTIPLES.version })));
  });
  it("an earlier fiscal year now used without its balance sheet changes the key (the value changes: to approve again)", async () => {
    const avant = await cleDuCalcul(envDe({ 2025: complet2025 }), row);
    const apres = await cleDuCalcul(envDe({ 2024: valide({ chiffre_affaires: 800_000, ebe: 100_000 }), 2025: complet2025 }), row);
    expect(apres).not.toBe(avant);
  });
});
