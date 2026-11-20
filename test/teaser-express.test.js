// Result screen: code name (NAF code only), industry (INSEE NAF division), anonymous quick teaser.
import { describe, it, expect } from "vitest";
import { nomDeCode, projet } from "../src/documents/nom-de-code.js";
import { secteurDe, teaserExpress } from "../src/documents/teaser-express.js";
import divisions from "../src/data/naf-divisions.json";
import regles from "../src/data/noms-de-code.json";
import { assembler } from "../src/maquette/donnees.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import fraiseraie from "./fixtures/319252813.json";

describe("code name", () => {
  it("first matching NAF prefix, in the order of the list", () => {
    expect(nomDeCode("10.71A")).toBe("Levain");
    expect(nomDeCode("43.32A")).toBe("Chêne");     // before 41, 42, 43 → Granit
    expect(nomDeCode("43.21A")).toBe("Granit");
    expect(nomDeCode("16.23Z")).toBe("Chêne");
    expect(nomDeCode("31.09B")).toBe("Chêne");
    expect(nomDeCode("69.20Z")).toBe("Boussole");
    expect(nomDeCode("70.22Z")).toBe("Sextant");
    expect(nomDeCode("95.25Z")).toBe("Rouage");
    expect(nomDeCode("01.11Z")).toBe("Sillon");
    expect(projet("56.10A")).toBe("Projet Tablée");
  });
  it("no match: a fallback name, always the same for the same NAF code", () => {
    expect(regles.repli).toContain(nomDeCode("10.52Z"));
    expect(nomDeCode("10.52Z")).toBe(nomDeCode("10.52z"));
    expect(regles.repli).toContain(nomDeCode(null));
  });
  it("depends only on the NAF code: two companies with the same code have the same name", () => {
    expect(nomDeCode.length).toBe(1);
  });
});

describe("industry: NAF Rev. 2 division (INSEE)", () => {
  it("88 divisions, source cited", () => {
    expect(Object.keys(divisions.divisions)).toHaveLength(88);
    expect(divisions._source).toMatch(/INSEE.*naf2008_liste_n2\.xls.*12\/11\/2026/);
  });
  it(`official label, without the "à l'exception de…" clause`, () => {
    expect(secteurDe("43.32A")).toBe("Travaux de construction spécialisés");
    expect(secteurDe("16.23Z")).toBe("Travail du bois et fabrication d'articles en bois et en liège");
    expect(secteurDe("47.11B")).toBe("Commerce de détail");
    expect(secteurDe("70.22Z")).toBe("Activités des sièges sociaux ; conseil de gestion");
    expect(secteurDe(null)).toBeNull();
    expect(secteurDe("00.00Z")).toBeNull();
  });
});

describe("quick teaser (recorded real response: LA FRAISERAIE SAS)", () => {
  const d = assembler(normaliserEntreprise(fraiseraie.entreprise, "319252813"), normaliserExercices(fraiseraie.inpi), normaliserAnnonces(fraiseraie.bodacc, "319252813", "1980-04-01"));
  const r = teaserExpress(d);
  it("anonymous facts calculated by the code", () => {
    // 10.52Z → division 10; postal code 44210 → Pays de la Loire; band 12 → 20 to 49 employees
    expect(r.teaser.secteur).toBe("Industries alimentaires");
    expect(r.teaser.region).toBe("Pays de la Loire");
    expect(r.teaser.effectif).toBe("20 à 49 salariés");
    // Created in 1980: 10-year bands beyond 20 years (anonymat.js)
    const n = new Date().getFullYear() - 1980;
    expect(r.teaser.anciennete).toBe(`plus de ${Math.floor(n / 10) * 10} ans`);
  });
  it("no name, city, SIREN or figure", () => {
    const texte = JSON.stringify(r);
    expect(texte).not.toMatch(/FRAISERAIE|PORNIC|Pornic|319252813|44210/);
    expect(r.nom_de_code).toBe(nomDeCode("10.52Z"));
  });
});
