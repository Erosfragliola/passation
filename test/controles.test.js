import { describe, it, expect } from "vitest";
import { controlerExercice, lignesBloquees } from "../src/valuation/controles.js";

const L = (o) => Object.fromEntries(Object.entries(o).map(([k, valeur]) => [k, { valeur, source: "liasse", valide: false }]));
const sain = {
  chiffre_affaires: 2_400_000, autres_produits: 0, achats_consommes: 960_000, charges_externes: 340_000, impots_taxes: 40_000, charges_personnel: 680_000,
  dotations_amortissements: 72_000, resultat_exploitation: 308_000,
  immobilisations_nettes: 500_000, stocks: 200_000, creances_clients: 400_000, autres_creances: 30_000, placements: 50_000, tresorerie: 250_000,
  capitaux_propres: 900_000, provisions_risques: 20_000, emprunts: 300_000, dettes_fournisseurs: 250_000, dettes_fiscales_sociales: 150_000, autres_dettes: 10_000,
};
describe("checks of a fiscal year", () => {
  it("consistent fiscal year: no signal", () => {
    // EBITDA = 2,400,000 − 960,000 − 340,000 − 40,000 − 680,000 = 380,000 = 308,000 + 72,000; assets 1,430,000 = liabilities 1,630,000? no → adjusted below
    const l = L({ ...sain, autres_dettes: 0, capitaux_propres: 710_000 }); // liabilities = 710+20+300+250+150 = 1,430,000 = assets
    expect(controlerExercice(l, { caPublic: 2_400_000 })).toEqual([]);
  });
  it("balance sheet unbalanced beyond 3%: attention (does not prevent approval)", () => {
    const c = controlerExercice(L(sain));
    expect(c.find((x) => x.code === "bilan")).toMatchObject({ niveau: "attention" });
    expect(lignesBloquees(c).size).toBe(0);
  });
  it("revenue different from the public accounts: alert on revenue only", () => {
    const c = controlerExercice(L({ ...sain, capitaux_propres: 710_000, autres_dettes: 0 }), { caPublic: 2_000_000 });
    expect(c.map((x) => x.code)).toEqual(["ca_public"]);
    expect([...lignesBloquees(c)]).toEqual(["chiffre_affaires"]);
  });
  it("impossible negative value and empty required line: alerts", () => {
    const { stocks, ...sansStocks } = sain;
    const c = controlerExercice(L({ ...sansStocks, tresorerie: -5 }));
    expect(c.map((x) => x.code)).toEqual(expect.arrayContaining(["manquant", "negatif"]));
    expect(lignesBloquees(c)).toEqual(new Set(["stocks", "tresorerie"]));
  });
  it("EBITDA inconsistent with operating income + depreciation: attention", () => {
    expect(controlerExercice(L({ ...sain, resultat_exploitation: 50_000 })).some((x) => x.code === "ebe")).toBe(true);
  });
  it("revenue multiplied by 1,000 from one year to the next (unit): alert", () => {
    const c = controlerExercice(L({ ...sain, chiffre_affaires: 2_400 }), { precedent: L({ chiffre_affaires: 2_200_000 }) });
    expect(c.some((x) => x.code === "variation" && x.niveau === "alerte")).toBe(true);
  });
  it("public accounts only (revenue + published EBITDA): the detail of expenses is not required", () => {
    const c = controlerExercice(L({ chiffre_affaires: 1_000_000, ebe: 120_000 }));
    expect(c.find((x) => x.code === "manquant").lignes).not.toContain("charges_personnel");
  });
});
