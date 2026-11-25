// Demonstration scenario (docs/DEMO.md): entirely fictitious tax return "Atelier Exemple" (test/fixtures/liasse-fictive.pdf),
// fiscal years 2024 and 2025, manufacturing industry, 3% size premium (demonstration assumption), no adjustment or discount.
// Expected values calculated independently, by a Python script that does not import the site's code (formulas of
// docs/valorisation-calculs.md):
//   EBITDA 2024 = 2,200,000 − 880,000 − 320,000 − 40,000 − 640,000 = 320,000; EBITDA 2025 = 380,000; normalized 350,000
//   net debt = 300,000 + 20,000 − 250,000 − 50,000 = 20,000; working capital 180,000 and 200,000, i.e. 30.1402 days on average,
//   actual − normalized gap = +1,818.18; historical growth 9.0909%; EBITDA margin 14.5833%; WACC 11.2085%
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

describe("demonstration scenario (fictitious Atelier Exemple tax return)", () => {
  it("without a size premium: multiples only (1,381,818 / 1,941,818 / 2,431,818), DCF to be completed and flagged", () => {
    const { r } = calcul({});
    expect(r.ebe_normatif.valeur).toBe(350_000);
    proche(r.multiples.titres.bas, 1_381_818.18);
    proche(r.multiples.titres.central, 1_941_818.18);
    proche(r.multiples.titres.haut, 2_431_818.18);
    expect(r.dcf.statut).toBe("a_completer");
    expect(r.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
  });
  it("3% size premium: DCF calculated (2,530,797 / 2,819,933 / 3,180,021) but summary on the multiples only (default of 18/11/2026)", () => {
    const { r } = calcul({ prime_taille: 0.03 });
    expect(r.dcf.statut).toBe("ok");
    proche(r.dcf.cmpc.valeur, 0.112085, 1e-6);
    proche(r.dcf.titres.bas, 2_530_796.95);
    proche(r.dcf.titres.central, 2_819_933.02);
    proche(r.dcf.titres.haut, 3_180_020.94);
    expect(r.synthese.ponderation).toEqual({ multiples: 1, dcf: 0 });
    proche(r.synthese.bas, 1_381_818.18);
    proche(r.synthese.central, 1_941_818.18);
    proche(r.synthese.haut, 2_431_818.18);
    expect(r.ancc.valeur).toBe(700_000);
  });
  it('DCF enabled as an option at 40% in "Fine-tune": 60/40 summary = 1,841,409.69 / 2,293,064.12 / 2,731,099.28', () => {
    // 0,6 × 1 381 818,18 + 0,4 × 2 530 796,95 ; 0,6 × 1 941 818,18 + 0,4 × 2 819 933,02 ; 0,6 × 2 431 818,18 + 0,4 × 3 180 020,94
    const { r } = calcul({ prime_taille: 0.03, poids_multiples: 0.6 });
    expect(r.synthese.ponderation).toEqual({ multiples: 0.6, dcf: 0.4 });
    proche(r.synthese.bas, 1_841_409.69);
    proche(r.synthese.central, 2_293_064.12);
    proche(r.synthese.haut, 2_731_099.28);
  });
  it("datapack: the Excel formulas give back the summary of the engine and of the reference (default and DCF at 40%)", () => {
    const datapack = (reglages) => {
      const { entree, H, r } = calcul(reglages);
      return construireDatapack({ entreprise: { nom: "Atelier Exemple", siren: "" }, entree, H, resultat: r, genereLe: new Date("2026-11-18") }).calculer();
    };
    const parDefaut = datapack({ prime_taille: 0.03 });
    proche(parDefaut.valeur("2.5 Synthèse", "C11"), 1_941_818.18);
    proche(parDefaut.valeur("2.3 DCF", "C31"), 2_819_933.02);
    const avecDcf = datapack({ prime_taille: 0.03, poids_multiples: 0.6 });
    proche(avecDcf.valeur("2.5 Synthèse", "C11"), 2_293_064.12);
    proche(avecDcf.valeur("2.3 DCF", "C31"), 2_819_933.02);
  });
});
