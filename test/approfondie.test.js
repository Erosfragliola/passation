// Valorisation approfondie : valeurs attendues établies indépendamment du code (calcul de référence en Python,
// détail dans docs/valorisation-calculs.md), sur le cas d'essai « Atelier Exemple » (secteur industrie).
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

describe("EBE et retraitements", () => {
  it("EBE comptable = CA + autres produits − achats − charges externes − impôts − personnel", () => {
    expect(exercices.map(ebe)).toEqual([260_000, 320_000, 380_000]);
  });
  it("sans détail des charges (comptes INPI) : l'EBE publié est pris tel quel", () => {
    expect(ebe({ chiffre_affaires: 1_000_000, ebe: 120_000 })).toBe(120_000);
    // Détail partiel (achats et charges externes absents) : on ne les compte pas à zéro, l'EBE publié est retenu.
    // (Avant le correctif FIN-01, ce cas donnait 1 000 000 − 300 000 = 700 000.)
    expect(ebe({ chiffre_affaires: 1_000_000, ebe: 120_000, charges_personnel: 300_000 })).toBe(120_000);
  });
  it("EBE non déterminable : CA seul, ou détail partiel sans EBE publié → null (jamais CA − charges absentes)", () => {
    expect(ebe({ chiffre_affaires: 1_000_000 })).toBeNull();
    expect(ebe({ chiffre_affaires: 1_000_000, charges_personnel: 300_000 })).toBeNull();
  });
  it("un zéro saisi est un vrai zéro : 1 000 000 − 0 − 200 000 − 0 − 300 000 = 500 000", () => {
    expect(ebe({ chiffre_affaires: 1_000_000, achats_consommes: 0, charges_externes: 200_000, charges_personnel: 300_000 })).toBe(500_000);
  });
  it("pont EBE comptable → retraité : dirigeant +50 000, loyer +12 000, exceptionnel 2024 +20 000", () => {
    const p = pontEbe(exercices, retraitements);
    expect(p.map((x) => x.ebe_retraite)).toEqual([322_000, 402_000, 442_000]);
    expect(p[1].lignes.map((l) => l.montant)).toEqual([50_000, 12_000, 20_000]);
  });
  it("EBE normatif : moyenne des 3 exercices (388 666,67) ou dernier exercice au choix", () => {
    const p = pontEbe(exercices, retraitements);
    proche(ebeNormatif(p).valeur, 388_666.6667);
    expect(ebeNormatif(p, "dernier").valeur).toBe(442_000);
  });
});

describe("BFR et dette nette", () => {
  it("BFR = stocks + clients − fournisseurs − dettes fiscales et sociales", () => {
    expect(exercices.map(bfr)).toEqual([160_000, 180_000, 200_000]);
  });
  it("BFR normatif : moyenne des jours de CA (29,8268 j), appliquée au dernier CA (196 121,21)", () => {
    const n = bfrNormatif(exercices);
    proche(n.jours, 29.826768, 1e-5);
    proche(n.valeur, 196_121.2121);
  });
  it("dette nette = emprunts + comptes courants + provisions − trésorerie − placements = 70 000", () => {
    expect(detteNette(exercices[2], complements).total).toBe(70_000);
  });
  it("trésorerie nette : dette nette négative acceptée", () => {
    expect(detteNette({ emprunts: 0, tresorerie: 500_000 }, {}).total).toBe(-500_000);
  });
});

describe("impôt sur les sociétés (service-public, vérifié le 17/02/2026)", () => {
  it("taux réduit 15 % jusqu'à 42 500 €, 25 % au-delà : 100 000 → 20 750", () => {
    expect(impotSocietes(100_000, { tauxReduit: true }, HYP)).toBe(20_750);
  });
  it("taux normal : 100 000 → 25 000 ; résultat négatif → 0", () => {
    expect(impotSocietes(100_000, { tauxReduit: false }, HYP)).toBe(25_000);
    expect(impotSocietes(-50_000, { tauxReduit: true }, HYP)).toBe(0);
  });
});

describe("CMPC et DCF", () => {
  it("CMPC industrie avec prime de taille 3 % : bêta endetté 1,17679, coût des fonds propres 12,1657 %, CMPC 11,2085 %", () => {
    const c = cmpc({ primeTaille: 0.03, secteur: "industrie" }, HYP);
    proche(c.beta_endette, 1.17679088, 1e-6);
    proche(c.cout_fonds_propres, 0.121657223, 1e-8);
    proche(c.valeur, 0.112085258, 1e-8);
  });
  it("sans prime de taille renseignée : CMPC « à compléter », pas de chiffre", () => {
    expect(cmpc({ primeTaille: null, secteur: "industrie" }, HYP)).toMatchObject({ statut: "a_completer", valeur: null });
  });
  it("DCF 5 ans : flux, valeur terminale de Gordon-Shapiro, VE 2 815 132,61", () => {
    const r = dcf({ ca0: 2_400_000, ...previsions, cmpc: 0.112085258, g: 0.02, tauxReduit: false }, HYP);
    proche(r.flux[0].flux, 235_836.9863);
    proche(r.flux[4].flux, 286_661.3308);
    proche(r.valeur_terminale, 3_175_259.15, 0.05);
    proche(r.ve, 2_815_132.61, 0.05);
  });
  it("garde-fou : CMPC ≤ g → erreur explicite", () => {
    expect(() => dcf({ ca0: 1_000_000, ...previsions, cmpc: 0.02, g: 0.02 }, HYP)).toThrow(/CMPC/);
  });
});

describe("ANCC et décotes", () => {
  it("ANCC = capitaux propres + plus-values − actifs sans valeur = 890 000", () => {
    expect(ancc(exercices[2], complements).valeur).toBe(890_000);
  });
  it("capitaux propres négatifs : ANCC négatif affiché tel quel (pas de plancher inventé)", () => {
    expect(ancc({ capitaux_propres: -120_000 }, {}).valeur).toBe(-120_000);
  });
  it("décotes et primes s'additionnent : −10 % + 5 % → × 0,95", () => {
    proche(facteurDecotes(decotes), 0.95, 1e-12);
  });
});

describe("synthèse de la valorisation approfondie", () => {
  const entree = { secteur: "industrie", exercices, retraitements, complements, previsions, decotes, primeTaille: 0.03, tauxReduit: false };
  it("multiples : titres 1 410 812 / 2 001 585 / 2 518 512 (VE × 0,95 − dette nette + écart de BFR)", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.multiples.titres.bas, 1_410_812.12);
    proche(v.multiples.titres.central, 2_001_585.45);
    proche(v.multiples.titres.haut, 2_518_512.12);
  });
  it("DCF : titres 2 608 254,77 (bas CMPC + 1 pt : 2 341 609,13 ; haut CMPC − 1 pt : 2 940 077,98)", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.dcf.titres.central, 2_608_254.77, 0.05);
    proche(v.dcf.titres.bas, 2_341_609.13, 0.05);
    proche(v.dcf.titres.haut, 2_940_077.98, 0.05);
  });
  it("valeur centrale = 60 % multiples + 40 % DCF = 2 244 253,18 ; ANCC 890 000 à part (plancher)", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.synthese.central, 2_244_253.18, 0.05);
    expect(v.synthese.plancher_ancc).toBe(890_000);
    expect(v.synthese.ponderation).toEqual({ multiples: 0.6, dcf: 0.4 });
  });
  it("sensibilité : multiple ± 1x → titres 1 632 352,12 et 2 370 818,79", () => {
    const v = valorisationApprofondie(entree, HYP);
    proche(v.sensibilites.multiple.moins, 1_632_352.12);
    proche(v.sensibilites.multiple.plus, 2_370_818.79);
  });
  it("sans prime de taille : DCF à compléter, synthèse sur les multiples seuls, signalée", () => {
    const v = valorisationApprofondie({ ...entree, primeTaille: null }, HYP);
    expect(v.dcf.statut).toBe("a_completer");
    expect(v.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
    proche(v.synthese.central, 2_001_585.45);
    expect(v.synthese.alertes.join(" ")).toMatch(/prime de taille/i);
  });
  it("EBE normatif négatif : pas de multiple appliqué, méthode signalée non applicable", () => {
    const pertes = exercices.map((e) => ({ ...e, charges_personnel: e.charges_personnel + 600_000 }));
    const v = valorisationApprofondie({ ...entree, exercices: pertes }, HYP);
    expect(v.multiples.statut).toBe("non_applicable");
    expect(v.synthese.alertes.join(" ")).toMatch(/EBE/);
  });
  it("un seul exercice : EBE normatif = cet exercice ; BFR normatif = ses propres jours", () => {
    const v = valorisationApprofondie({ ...entree, exercices: [exercices[2]], retraitements: {} }, HYP);
    expect(v.ebe_normatif.valeur).toBe(380_000);
    proche(v.bfr.normatif.valeur, 200_000);
  });
  it("secteur sans bêta sourcé → DCF à compléter", () => {
    const v = valorisationApprofondie({ ...entree, secteur: "inconnu" }, HYP);
    expect(v.dcf.statut).toBe("a_completer");
  });
  it("exercices non consécutifs : triés et utilisés, alerte affichée", () => {
    const v = valorisationApprofondie({ ...entree, exercices: [exercices[2], exercices[0]] }, HYP);
    expect(v.annees).toEqual([2023, 2025]);
    expect(v.synthese.alertes.join(" ")).toMatch(/non consécutifs/);
  });
});
