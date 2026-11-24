// Detailed valuation: expected values established independently of the code (reference calculation in Python,
// details in docs/valorisation-calculs.md), on the "Atelier Exemple" test case (manufacturing industry).
import { describe, it, expect } from "vitest";
import {
  ebe, pontEbe, ebeNormatif, bfr, bfrNormatif, detteNette, impotSocietes, cmpc, dcf, ancc, facteurDecotes,
  valorisationApprofondie,
} from "../src/valuation/approfondie.js";
import HYP from "../src/data/hypotheses.json";

const exercices = [
  { annee: 2023, chiffre_affaires: 2_000_000, autres_produits: 0, achats_consommes: 800_000, charges_externes: 300_000, impots_taxes: 40_000, charges_personnel: 600_000, dotations_amortissements: 60_000,
    stocks: 160_000, creances_clients: 340_000, dettes_fournisseurs: 210_000, dettes_fiscales_sociales: 130_000 },
  { annee: 2024, chiffre_affaires: 2_200_000, autres_produits: 0, achats_consommes: 880_000, charges_externes: 320_000, impots_taxes: 40_000, charges_personnel: 640_000, dotations_amortissements: 66_000,
    stocks: 180_000, creances_clients: 370_000, dettes_fournisseurs: 230_000, dettes_fiscales_sociales: 140_000 },
  { annee: 2025, chiffre_affaires: 2_400_000, autres_produits: 0, achats_consommes: 960_000, charges_externes: 340_000, impots_taxes: 40_000, charges_personnel: 680_000, dotations_amortissements: 72_000,
    stocks: 200_000, creances_clients: 400_000, dettes_fournisseurs: 250_000, dettes_fiscales_sociales: 150_000,
    tresorerie: 250_000, placements: 50_000, emprunts: 300_000, provisions_risques: 20_000, capitaux_propres: 900_000 },
];
const retraitements = {
  remuneration_dirigeant_reelle: 150_000, remuneration_normative: 100_000,
  loyer_paye: 60_000, loyer_marche: 48_000,
  exceptionnels: [{ annee: 2024, libelle: "Litige fournisseur", montant: 20_000, justification: "Charge non récurrente" }],
};
const complements = { comptes_courants_remboursables: 50_000, creances_douteuses: 10_000 };
const previsions = { croissance: 0.05, marge_ebe: 0.16, amortissements_pct: 0.03, investissements_pct: 0.03, bfr_jours: 30 };
const decotes = [{ cle: "dependance_dirigeant", pct: -0.10, justification: "Dirigeant seul commercial" }, { cle: "recurrence", pct: 0.05, justification: "Contrats annuels" }];
const proche = (a, b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("EBITDA and adjustments", () => {
  it("reported EBITDA = revenue + other income − purchases − external expenses − taxes − personnel", () => {
    expect(exercices.map(ebe)).toEqual([260_000, 320_000, 380_000]);
  });
  it("without the detail of expenses (INPI accounts): the published EBITDA is taken as is", () => {
    expect(ebe({ chiffre_affaires: 1_000_000, ebe: 120_000 })).toBe(120_000);
    // Partial detail (purchases and external expenses missing): they are not counted as zero, the published EBITDA is used.
    // (Before the FIN-01 fix, this case gave 1,000,000 − 300,000 = 700,000.)
    expect(ebe({ chiffre_affaires: 1_000_000, ebe: 120_000, charges_personnel: 300_000 })).toBe(120_000);
  });
  it("EBITDA cannot be determined: revenue only, or partial detail without published EBITDA → null (never revenue − missing expenses)", () => {
    expect(ebe({ chiffre_affaires: 1_000_000 })).toBeNull();
    expect(ebe({ chiffre_affaires: 1_000_000, charges_personnel: 300_000 })).toBeNull();
  });
  it("an entered zero is a real zero: 1,000,000 − 0 − 200,000 − 0 − 300,000 = 500,000", () => {
    expect(ebe({ chiffre_affaires: 1_000_000, achats_consommes: 0, charges_externes: 200_000, charges_personnel: 300_000 })).toBe(500_000);
  });
  it("bridge from reported → adjusted EBITDA: owner +50,000, rent +12,000, non-recurring 2024 +20,000", () => {
    const p = pontEbe(exercices, retraitements);
    expect(p.map((x) => x.ebe_retraite)).toEqual([322_000, 402_000, 442_000]);
    expect(p[1].lignes.map((l) => l.montant)).toEqual([50_000, 12_000, 20_000]);
  });
  it("normalized EBITDA: average of the 3 fiscal years (388,666.67) or latest fiscal year, as chosen", () => {
    const p = pontEbe(exercices, retraitements);
    proche(ebeNormatif(p).valeur, 388_666.6667);
    expect(ebeNormatif(p, "dernier").valeur).toBe(442_000);
  });
});

describe("working capital and net debt", () => {
  it("working capital = inventory + receivables − payables − tax and social liabilities", () => {
    expect(exercices.map(bfr)).toEqual([160_000, 180_000, 200_000]);
  });
  it("normalized working capital: average of days of revenue (29.8268 days), applied to the latest revenue (196,121.21)", () => {
    const n = bfrNormatif(exercices);
    proche(n.jours, 29.826768, 1e-5);
    proche(n.valeur, 196_121.2121);
  });
  it("net debt = borrowings + current accounts + provisions − cash − investments = 70,000", () => {
    expect(detteNette(exercices[2], complements).total).toBe(70_000);
  });
  it("net cash: negative net debt accepted", () => {
    expect(detteNette({ emprunts: 0, tresorerie: 500_000 }, {}).total).toBe(-500_000);
  });
});

describe("corporate income tax (service-public, checked on 17/02/2026)", () => {
  it("reduced rate 15% up to €42,500, 25% above: 100,000 → 20,750", () => {
    expect(impotSocietes(100_000, { tauxReduit: true }, HYP)).toBe(20_750);
  });
  it("standard rate: 100,000 → 25,000; negative income → 0", () => {
    expect(impotSocietes(100_000, { tauxReduit: false }, HYP)).toBe(25_000);
    expect(impotSocietes(-50_000, { tauxReduit: true }, HYP)).toBe(0);
  });
});

describe("WACC and DCF", () => {
  it("manufacturing WACC with a 3% size premium: levered beta 1.17679, cost of equity 12.1657%, WACC 11.2085%", () => {
    const c = cmpc({ primeTaille: 0.03, secteur: "industrie" }, HYP);
    proche(c.beta_endette, 1.17679088, 1e-6);
    proche(c.cout_fonds_propres, 0.121657223, 1e-8);
    proche(c.valeur, 0.112085258, 1e-8);
  });
  it('without a size premium entered: WACC "to be completed", no figure', () => {
    expect(cmpc({ primeTaille: null, secteur: "industrie" }, HYP)).toMatchObject({ statut: "a_completer", valeur: null });
  });
  it("5-year DCF: flows, Gordon-Shapiro terminal value, EV 2,815,132.61", () => {
    const r = dcf({ ca0: 2_400_000, ...previsions, cmpc: 0.112085258, g: 0.02, tauxReduit: false }, HYP);
    proche(r.flux[0].flux, 235_836.9863);
    proche(r.flux[4].flux, 286_661.3308);
    proche(r.valeur_terminale, 3_175_259.15, 0.05);
    proche(r.ve, 2_815_132.61, 0.05);
  });
  it("safeguard: WACC ≤ g → explicit error", () => {
    expect(() => dcf({ ca0: 1_000_000, ...previsions, cmpc: 0.02, g: 0.02 }, HYP)).toThrow(/CMPC/);
  });
});

describe("ANCC and discounts", () => {
  it("ANCC = equity + gains − assets without value = 890,000", () => {
    expect(ancc(exercices[2], complements).valeur).toBe(890_000);
  });
  it("negative equity: negative ANCC displayed as is (no invented floor)", () => {
    expect(ancc({ capitaux_propres: -120_000 }, {}).valeur).toBe(-120_000);
  });
  it("discounts and premiums add up: −10% + 5% → × 0.95", () => {
    proche(facteurDecotes(decotes), 0.95, 1e-12);
  });
});

describe("summary of the detailed valuation", () => {
  const entree = { secteur: "industrie", exercices, retraitements, complements, previsions, decotes, primeTaille: 0.03, tauxReduit: false };
  it("multiples: shares 1,410,812 / 2,001,585 / 2,518,512 (EV × 0.95 − net debt + working capital gap)", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.multiples.titres.bas, 1_410_812.12);
    proche(v.multiples.titres.central, 2_001_585.45);
    proche(v.multiples.titres.haut, 2_518_512.12);
  });
  it("DCF: shares 2,608,254.77 (low WACC + 1 pt: 2,341,609.13; high WACC − 1 pt: 2,940,077.98)", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.dcf.titres.central, 2_608_254.77, 0.05);
    proche(v.dcf.titres.bas, 2_341_609.13, 0.05);
    proche(v.dcf.titres.haut, 2_940_077.98, 0.05);
  });
  it("by default (18/11/2026), central value = multiples only = 2,001,585.45; the DCF is calculated alongside; ANCC separate", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.synthese.central, 2_001_585.45);
    expect(v.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
    expect(v.dcf.statut).toBe("ok");
    expect(v.synthese.plancher_ancc).toBe(890_000);
  });
  it("DCF enabled as an option at 40%: 0.6 × 2,001,585.45 + 0.4 × 2,608,254.77 = 2,244,253.18", () => {
    const v = valorisationApprofondie({ ...entree, ponderation: { multiples: 0.6, dcf: 0.4 } }, HYP);
    proche(v.synthese.central, 2_244_253.18, 0.05);
  });
  it("sensitivity: multiple ± 1x → shares 1,632,352.12 and 2,370,818.79", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.sensibilites.multiple.moins, 1_632_352.12);
    proche(v.sensibilites.multiple.plus, 2_370_818.79);
  });
  it("without a size premium: DCF to be completed, summary on the multiples only, flagged", () => {
    const v = valorisationApprofondie({ ...entree, primeTaille: null, ponderation: { multiples: 0.6, dcf: 0.4 } }, HYP); // DCF requested
    expect(v.dcf.statut).toBe("a_completer");
    expect(v.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
    proche(v.synthese.central, 2_001_585.45);
    expect(v.synthese.alertes.join(" ")).toMatch(/prime de taille/i);
  });
  it("negative normalized EBITDA: no multiple applied, method flagged as not applicable", () => {
    const pertes = exercices.map((e) => ({ ...e, charges_personnel: e.charges_personnel + 600_000 }));
    const v = valorisationApprofondie({ ...entree, exercices: pertes }, HYP);
    expect(v.multiples.statut).toBe("non_applicable");
    expect(v.synthese.alertes.join(" ")).toMatch(/EBE/);
  });
  it("a single fiscal year: normalized EBITDA = that fiscal year; normalized working capital = its own days", () => {
    const v = valorisationApprofondie({ ...entree, exercices: [exercices[2]], retraitements: {} }, HYP);
    expect(v.ebe_normatif.valeur).toBe(380_000);
    proche(v.bfr.normatif.valeur, 200_000);
  });
  it("industry without a sourced beta → DCF to be completed", () => {
    const v = valorisationApprofondie({ ...entree, secteur: "inconnu" }, HYP);
    expect(v.dcf.statut).toBe("a_completer");
  });
  it("non-consecutive fiscal years: sorted and used, alert displayed", () => {
    const v = valorisationApprofondie({ ...entree, exercices: [exercices[2], exercices[0]] }, HYP);
    expect(v.annees).toEqual([2023, 2025]);
    expect(v.synthese.alertes.join(" ")).toMatch(/non consécutifs/);
  });
});

// Audit, point 18: the information on net assets compares the TOP of the range (the calculation does not change).
// Adjusted net assets = equity 900,000 + unrealized gains − doubtful receivables 10,000; top of the
// multiples (value of the shares) = 2,518,512.12 (test above), unchanged by the unrealized gains.
describe('"range below the adjusted net assets" information', () => {
  const base = { secteur: "industrie", exercices, retraitements, previsions, decotes, primeTaille: 0.03, tauxReduit: false };
  const info = (v) => v.synthese.alertes.find((a) => /actif net corrigé/.test(a));
  it("gains 2,000,000 → net assets 2,890,000 > top 2,518,512: information with the amount", () => {
    const v = valorisationApprofondie({ ...base, complements: { ...complements, plus_values_latentes: 2_000_000 } }, HYP);
    expect(v.synthese.plancher_ancc).toBe(2_890_000);
    proche(v.synthese.haut, 2_518_512.12);
    expect(info(v).replace(/[\u202f\u00a0]/g, " ")).toBe("Votre fourchette est inférieure à l'actif net corrigé de l'entreprise (2 890 000 €). Un repreneur paie rarement moins que cet actif : à examiner avec votre conseil.");
  });
  it("gains 1,200,000 → net assets 2,090,000: above the center (2,001,585) but below the top, no information", () => {
    const v = valorisationApprofondie({ ...base, complements: { ...complements, plus_values_latentes: 1_200_000 } }, HYP);
    expect(v.synthese.plancher_ancc).toBe(2_090_000);
    expect(info(v)).toBeUndefined();
  });
  it("no acronym in the displayed information", () => {
    const v = valorisationApprofondie({ ...base, complements: { ...complements, plus_values_latentes: 2_000_000 } }, HYP);
    expect(info(v)).not.toMatch(/ANCC/);
  });
});
