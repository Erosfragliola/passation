import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler } from "../src/maquette/donnees.js";

const fx = (s) => JSON.parse(readFileSync(new URL(`./fixtures/${s}.json`, import.meta.url)));
const donnees = (s) => {
  const f = fx(s);
  const e = normaliserEntreprise(f.entreprise, s);
  return assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, s, e.date_creation));
};

describe("INPI: fiscal years (real responses)", () => {
  it("a confidential fiscal year (revenue = 0 in the source) becomes null, not 0", () => {
    const ex = normaliserExercices(fx("512803552").inpi);
    const e2019 = ex.find((e) => e.annee === 2019);
    expect(e2019.publie).toBe(false);
    expect(e2019.ca).toBeNull();
    expect(donnees("512803552").ca.map((c) => c.annee)).toEqual([2018, 2023, 2024]);
  });
  it("one year per fiscal year, full accounts preferred", () => {
    const annees = normaliserExercices(fx("434436622").inpi).map((e) => e.annee);
    expect(new Set(annees).size).toBe(annees.length);
  });
  it('"Publication simplifiee" keeps its figures', () => {
    expect(donnees("631880408").ca.find((c) => c.annee === 2023).valeur).toBe(25977485);
  });
  it("no published fiscal year → confidential accounts", () => {
    const d = donnees("814672010");
    expect(d.comptes_confidentiels).toBe(true);
    expect(d.ca).toEqual([]);
  });
});

describe("BODACC: events (real responses)", () => {
  it("MK ENERGIES: created in Charmes, moves to Reims then to Saint-Léonard (transfer Reims → Reims ignored)", () => {
    const d = donnees("794576231");
    expect(d.ville_creation).toBe("Charmes");
    expect(d.evenements.filter((e) => e.type === "transfert_siege").map((e) => e.detail)).toEqual(["Reims", "Saint-Léonard"]);
  });
  it("acquisitions of businesses: only when the company is the buyer", () => {
    // La Fraiseraie bought 5 businesses (2015-2019) and SOLD one in Les Sables-d'Olonne in 2019: the sale is excluded.
    const reprises = donnees("319252813").evenements.filter((e) => e.type === "reprise_fonds");
    expect(reprises.map((e) => e.date.slice(0, 4))).toEqual(["2015", "2016", "2018", "2019", "2019"]);
    expect(reprises.some((e) => /olonne/i.test(e.detail) && e.date.startsWith("2019"))).toBe(false);
    // Bongard Bazot sold in Nevers in 2012 (excluded) and bought in Moulins-Engilbert in 2022.
    expect(donnees("631880408").evenements.filter((e) => e.type === "reprise_fonds").map((e) => e.detail)).toEqual(["Moulins-Engilbert"]);
  });
  it("a change of legal form is not a change of name", () => {
    expect(donnees("631880408").evenements.some((e) => e.type === "denomination")).toBe(false);
  });
  it("city with the BODACC's accented spelling", () => {
    expect(donnees("631880408").ville).toBe("Saint-Péreuse");
  });
  it("sensitive notices discarded without a trace", () => {
    const brut = { results: [
      { dateparution: "2012-01-01", familleavis_lib: "Procédures collectives", commercant: "X", ville: "Lyon", jugement: "{}" },
      { dateparution: "2013-01-01", familleavis_lib: "Radiations", commercant: "X", ville: "Lyon" },
      { dateparution: "2014-01-01", familleavis_lib: "Dépôts des comptes", commercant: "X", ville: "Lyon" },
      { dateparution: "2015-01-01", familleavis_lib: "Procédures de conciliation", commercant: "X", ville: "Lyon" },
    ] };
    expect(normaliserAnnonces(brut, "123456789").evenements).toEqual([]);
  });
  it("no officer data in the maquette object", () => {
    const texte = JSON.stringify(donnees("794576231"));
    expect(texte).not.toMatch(/dirigeant|prenom|administration|prix/i);
  });
});
