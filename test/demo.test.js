// Scénario de démonstration (docs/DEMO.md) : liasse entièrement fictive « Atelier Exemple » (test/fixtures/liasse-fictive.pdf),
// exercices 2024 et 2025, secteur industrie, prime de taille 3 % (hypothèse de démonstration), sans retraitement ni décote.
// Valeurs attendues calculées indépendamment, par un script Python qui n'importe pas le code du site (formules de
// docs/valorisation-calculs.md) :
//   EBE 2024 = 2 200 000 − 880 000 − 320 000 − 40 000 − 640 000 = 320 000 ; EBE 2025 = 380 000 ; normatif 350 000
//   dette nette = 300 000 + 20 000 − 250 000 − 50 000 = 20 000 ; BFR 180 000 et 200 000, soit 30,1402 j en moyenne,
//   écart réel − normatif = +1 818,18 ; croissance historique 9,0909 % ; marge d'EBE 14,5833 % ; CMPC 11,2085 %
import { describe, it, expect } from "vitest";
import { assemblerEntree } from "../src/valuation/entree.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import { construireDatapack } from "../src/documents/datapack.js";
import HYP from "../src/data/hypotheses.json";

const v = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, { valeur: x, valide: true, source: "liasse" }]));
export const LIASSE_DEMO = {
  2024: v({ chiffre_affaires: 2_200_000, autres_produits: 0, achats_consommes: 880_000, charges_externes: 320_000, impots_taxes: 40_000, charges_personnel: 640_000,
    dotations_amortissements: 66_000, resultat_exploitation: 254_000, resultat_net: 185_000, immobilisations_nettes: 470_000, stocks: 180_000, creances_clients: 370_000,
    autres_creances: 30_000, placements: 50_000, tresorerie: 210_000, capitaux_propres: 590_000, provisions_risques: 20_000, emprunts: 340_000,
    dettes_fournisseurs: 230_000, dettes_fiscales_sociales: 140_000, autres_dettes: 0 }),
  2025: v({ chiffre_affaires: 2_400_000, autres_produits: 0, achats_consommes: 960_000, charges_externes: 340_000, impots_taxes: 40_000, charges_personnel: 680_000,
    dotations_amortissements: 72_000, resultat_exploitation: 308_000, resultat_net: 227_750, immobilisations_nettes: 480_000, stocks: 200_000, creances_clients: 400_000,
    autres_creances: 30_000, placements: 50_000, tresorerie: 250_000, capitaux_propres: 700_000, provisions_risques: 20_000, emprunts: 300_000,
    dettes_fournisseurs: 250_000, dettes_fiscales_sociales: 150_000, autres_dettes: 0 }),
};
const calcul = (reglages) => {
  const { entree, H } = assemblerEntree({ section_naf: "C" }, LIASSE_DEMO, { reglages }, HYP);
  return { entree, H, r: valorisationApprofondie(entree, H) };
};
const proche = (a, b, tol = 0.05) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("scénario de démonstration (liasse fictive Atelier Exemple)", () => {
  it("sans prime de taille : multiples seuls (1 381 818 / 1 941 818 / 2 431 818), DCF à compléter et signalé", () => {
    const { r } = calcul({});
    expect(r.ebe_normatif.valeur).toBe(350_000);
    proche(r.multiples.titres.bas, 1_381_818.18);
    proche(r.multiples.titres.central, 1_941_818.18);
    proche(r.multiples.titres.haut, 2_431_818.18);
    expect(r.dcf.statut).toBe("a_completer");
    expect(r.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
  });
  it("prime de taille 3 % : DCF calculé (2 530 797 / 2 819 933 / 3 180 021) et synthèse 60/40 = 2 293 064,12", () => {
    const { r } = calcul({ prime_taille: 0.03 });
    expect(r.dcf.statut).toBe("ok");
    proche(r.dcf.cmpc.valeur, 0.112085, 1e-6);
    proche(r.dcf.titres.bas, 2_530_796.95);
    proche(r.dcf.titres.central, 2_819_933.02);
    proche(r.dcf.titres.haut, 3_180_020.94);
    proche(r.synthese.bas, 1_841_409.69);
    proche(r.synthese.central, 2_293_064.12);
    proche(r.synthese.haut, 2_731_099.28);
    expect(r.ancc.valeur).toBe(700_000);
  });
  it("datapack : les formules Excel redonnent la synthèse du moteur et de la référence", () => {
    const { entree, H, r } = calcul({ prime_taille: 0.03 });
    const calc = construireDatapack({ entreprise: { nom: "Atelier Exemple", siren: "" }, entree, H, resultat: r, genereLe: new Date("2026-11-18") }).calculer();
    proche(calc.valeur("Synthèse", "C11"), 2_293_064.12);
    proche(calc.valeur("DCF", "C31"), 2_819_933.02);
  });
});
