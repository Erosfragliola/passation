// Reconciliation with the published accounts (EDHEC brief, B3: "a test or script that reconciles a computed figure
// against the value reported in the filing, or checks units and totals").
//
// The six files in test/fixtures/ are real responses of the free public APIs, recorded on 10/11/2026: the
// `ratios_inpi_bce` dataset of data.economie.gouv.fr gives, for each filed fiscal year, the revenue
// (`chiffre_d_affaires`), the EBITDA (`ebe`) and the net income (`resultat_net`), in euros.
//
// For each recorded response, this test checks that the figure retained by the application is exactly the published
// one, for the same year and in the same unit (euros, never thousands):
//   1. after normalization (src/sources/inpi.js), year by year;
//   2. in the public card of the company (src/maquette/donnees.js), the series shown to the owner;
//   3. in the quick estimate (src/valuation/express.js): the aggregate multiplied is the latest published EBITDA, and
//      the low / central / high values are that amount × the multiples of src/data/multiples.json, in euros.
// A fiscal year whose accounts are confidential (amounts 0 in the source) must become "not published" (null), never 0.
//
// The expected values below are copied by hand from the raw JSON files (fields `date_cloture_exercice`,
// `confidentiality`, `chiffre_d_affaires`, `ebe`, `resultat_net`), never computed by the code under test.
// The recorded responses contain no published ratio (no EBITDA margin field), so no ratio is reconciled: the margin
// check of the brief does not apply to these files.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler } from "../src/maquette/donnees.js";
import { estimationExpress } from "../src/valuation/express.js";

const brut = (s) => JSON.parse(readFileSync(new URL(`./fixtures/${s}.json`, import.meta.url)));
const multiples = JSON.parse(readFileSync(new URL("../src/data/multiples.json", import.meta.url)));

// [year of the closing date, confidentiality, revenue €, EBITDA €, net income €], as published in the raw response
const PUBLIE = {
  319252813: [ // LA FRAISERAIE SAS, NAF section C
    [2023, "Public", 6545936, 165807, 108338],
    [2022, "Public", 7141793, 384235, 373514],
    [2021, "Public", 6181724, 297051, 53171],
    [2020, "Public", 5259290, 197997, 106524],
    [2019, "Partiellement confidentiel (RAPCAC)", 0, 0, 211982],
    [2018, "Public", 5723197, 859011, 124950],
    [2017, "Public", 5412928, 503359, 46636],
  ],
  434436622: [ // HABI PRO', NAF section G
    [2024, "Public", 1115853, 88859, 61909],
    [2021, "Public", 746603, 94512, 51478],
    [2019, "Public", 875248, 58356, 1687],
    [2018, "Public", 847247, 63907, 9739],
    [2017, "Public", 741973, 73374, 17452],
    [2016, "Public", 827536, 73894, 61754],
  ],
  512803552: [ // CRISTAL'ID, NAF section J
    [2024, "Public", 7838692, 1158279, 595305],
    [2023, "Public", 9057768, 1552575, 515448],
    [2021, "Partiellement confidentiel", 0, 0, 947115],
    [2020, "Partiellement confidentiel", 0, 0, 835428],
    [2019, "Partiellement confidentiel", 0, 0, 718048],
    [2018, "Public", 2796051, 618377, 378619],
    [2017, "Partiellement confidentiel", 0, 0, 245923],
    [2016, "Partiellement confidentiel", 0, 0, 196214],
  ],
  631880408: [ // BONGARD BAZOT ET FILS, NAF section A
    [2024, "Publication simplifiee", 23685555, 506193, 94466],
    [2023, "Publication simplifiee", 25977485, 575996, 232257],
    [2022, "Publication simplifiee", 25635761, 1176933, 351969],
    [2020, "Public", 19725085, 704184, 584456],
    [2019, "Public", 21821427, 408127, 199899],
    [2018, "Public", 20450202, 142647, 117734],
    [2016, "Public", 18965261, 53571, 152479],
  ],
  794576231: [ // MK ENERGIES, NAF section F
    [2025, "Public", 42150668, 3984036, 1988076],
    [2024, "Public", 46859519, 3729013, 2112752],
    [2023, "Public", 41934732, 3527310, 1751837],
    [2022, "Public", 26261093, 1295251, 579044],
    [2021, "Public", 22096741, 1101095, 401706],
    [2020, "Public", 17570718, 392628, 129958],
    [2019, "Public", 20481470, 909952, 519272],
    [2018, "Public", 20897704, 856435, 545724],
    [2017, "Public", 24388674, 107785, 939645],
    [2016, "Public", 12397595, -409633, -645918],
  ],
  814672010: [ // ELEVATION ALPS, NAF section I
    [2025, "Partiellement confidentiel", 0, 0, 85201],
  ],
};
const confidentiel = (c) => c.startsWith("Partiellement confidentiel");

// Latest published fiscal year, read in the table above: the one the quick estimate must use
const DERNIER = {
  319252813: { annee: 2023, ca: 6545936, ebe: 165807, section: "C" },
  434436622: { annee: 2024, ca: 1115853, ebe: 88859, section: "G" },
  512803552: { annee: 2024, ca: 7838692, ebe: 1158279, section: "J" },
  631880408: { annee: 2024, ca: 23685555, ebe: 506193, section: "A" },
  794576231: { annee: 2025, ca: 42150668, ebe: 3984036, section: "F" },
};

const carte = (s) => {
  const f = brut(s);
  const e = normaliserEntreprise(f.entreprise, String(s));
  return assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, String(s), e.date_creation));
};

describe("Reconciliation: the expected values are those of the raw files", () => {
  it.each(Object.keys(PUBLIE))("%s: the table above is the raw response, field by field", (s) => {
    const r = brut(s).inpi.results.map((x) => [Number(x.date_cloture_exercice.slice(0, 4)), x.confidentiality, x.chiffre_d_affaires, x.ebe, x.resultat_net]);
    expect(r).toEqual(PUBLIE[s]);
  });
});

describe("Reconciliation: normalized fiscal years = published amounts (same year, euros)", () => {
  it.each(Object.keys(PUBLIE))("%s", (s) => {
    const ex = normaliserExercices(brut(s).inpi);
    for (const [annee, conf, ca, ebe, rn] of PUBLIE[s]) {
      const e = ex.find((x) => x.annee === annee);
      expect(e, `fiscal year ${annee}`).toBeDefined();
      if (confidentiel(conf)) {
        // amounts 0 in the source = confidential accounts, not zero: never retained as 0
        expect([e.publie, e.ca, e.ebe, e.resultat_net]).toEqual([false, null, null, null]);
      } else {
        expect([e.ca, e.ebe, e.resultat_net]).toEqual([ca, ebe, rn]);
      }
    }
    expect(ex).toHaveLength(PUBLIE[s].length); // one fiscal year per closing year, none added
  });
});

describe("Reconciliation: series of the public card = published amounts", () => {
  it.each(Object.keys(PUBLIE))("%s", (s) => {
    const d = carte(s);
    const publies = PUBLIE[s].filter(([, conf]) => !confidentiel(conf)).sort((a, b) => a[0] - b[0]);
    expect(d.ca).toEqual(publies.map(([annee, , ca]) => ({ annee, valeur: ca })));
    expect(d.ebe).toEqual(publies.map(([annee, , , ebe]) => ({ annee, valeur: ebe })));
  });
  it("814672010: no published fiscal year, so no amount and the accounts are flagged confidential", () => {
    const d = carte(814672010);
    expect([d.ca, d.ebe, d.comptes_confidentiels]).toEqual([[], [], true]);
  });
});

describe("Reconciliation: the quick estimate multiplies the latest published EBITDA, in euros", () => {
  it.each(Object.keys(DERNIER))("%s", (s) => {
    const att = DERNIER[s];
    const x = estimationExpress(carte(s));
    expect(x.exercice).toBe(att.annee);
    const m = multiples.secteurs.find((x) => x.sections.includes(att.section)); // the industry row of the NAF section
    if (x.statut === "ok" && x.methode === "multiple_ebe") {
      expect(x.agregat).toBe(att.ebe);
      // units and totals: low / central / high = published EBITDA (€) × the multiples of the table, nothing else
      expect([x.bas, x.central, x.haut]).toEqual([att.ebe * m.ebe.bas, att.ebe * m.ebe.central, att.ebe * m.ebe.haut]);
    } else if (x.statut === "ok") {
      expect(x.agregat).toBe(att.ca);
      expect([x.bas, x.central, x.haut]).toEqual([att.ca * m.ca.bas, att.ca * m.ca.central, att.ca * m.ca.haut]);
    } else {
      throw new Error(`no estimate for ${s}: ${x.statut}`);
    }
  });
  it("814672010: no published accounts, so no estimate (never an amount built on zeros)", () => {
    expect(estimationExpress(carte(814672010)).statut).toBe("comptes_absents");
  });
});
