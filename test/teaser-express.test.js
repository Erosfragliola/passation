// Écran de résultat : nom de code (code NAF seulement), secteur (division NAF de l'INSEE), teaser express anonyme.
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

describe("nom de code", () => {
  it("premier préfixe NAF qui correspond, dans l'ordre de la liste", () => {
    expect(nomDeCode("10.71A")).toBe("Levain");
    expect(nomDeCode("43.32A")).toBe("Chêne");     // avant 41, 42, 43 → Granit
    expect(nomDeCode("43.21A")).toBe("Granit");
    expect(nomDeCode("16.23Z")).toBe("Chêne");
    expect(nomDeCode("31.09B")).toBe("Chêne");
    expect(nomDeCode("69.20Z")).toBe("Boussole");
    expect(nomDeCode("70.22Z")).toBe("Sextant");
    expect(nomDeCode("95.25Z")).toBe("Rouage");
    expect(nomDeCode("01.11Z")).toBe("Sillon");
    expect(projet("56.10A")).toBe("Projet Tablée");
  });
  it("sans correspondance : un nom de repli, toujours le même pour un même code NAF", () => {
    expect(regles.repli).toContain(nomDeCode("10.52Z"));
    expect(nomDeCode("10.52Z")).toBe(nomDeCode("10.52z"));
    expect(regles.repli).toContain(nomDeCode(null));
  });
  it("ne dépend que du code NAF : deux sociétés du même code ont le même nom", () => {
    expect(nomDeCode.length).toBe(1);
  });
});

describe("secteur : division NAF rév. 2 (INSEE)", () => {
  it("88 divisions, source citée", () => {
    expect(Object.keys(divisions.divisions)).toHaveLength(88);
    expect(divisions._source).toMatch(/INSEE.*naf2008_liste_n2\.xls.*12\/11\/2026/);
  });
  it("libellé officiel, sans la clause « à l'exception de… »", () => {
    expect(secteurDe("43.32A")).toBe("Travaux de construction spécialisés");
    expect(secteurDe("16.23Z")).toBe("Travail du bois et fabrication d'articles en bois et en liège");
    expect(secteurDe("47.11B")).toBe("Commerce de détail");
    expect(secteurDe("70.22Z")).toBe("Activités des sièges sociaux ; conseil de gestion");
    expect(secteurDe(null)).toBeNull();
    expect(secteurDe("00.00Z")).toBeNull();
  });
});

describe("teaser express (réponse réelle enregistrée : LA FRAISERAIE SAS)", () => {
  const d = assembler(normaliserEntreprise(fraiseraie.entreprise, "319252813"), normaliserExercices(fraiseraie.inpi), normaliserAnnonces(fraiseraie.bodacc, "319252813", "1980-04-01"));
  const r = teaserExpress(d);
  it("faits anonymes calculés par le code", () => {
    // 10.52Z → division 10 ; code postal 44210 → Pays de la Loire ; tranche 12 → 20 à 49 salariés
    expect(r.teaser.secteur).toBe("Industries alimentaires");
    expect(r.teaser.region).toBe("Pays de la Loire");
    expect(r.teaser.effectif).toBe("20 à 49 salariés");
    // Créée en 1980 : paliers de 10 ans au-delà de 20 ans (anonymat.js)
    const n = new Date().getFullYear() - 1980;
    expect(r.teaser.anciennete).toBe(`plus de ${Math.floor(n / 10) * 10} ans`);
  });
  it("ni nom, ni ville, ni SIREN, ni chiffre", () => {
    const texte = JSON.stringify(r);
    expect(texte).not.toMatch(/FRAISERAIE|PORNIC|Pornic|319252813|44210/);
    expect(r.nom_de_code).toBe(nomDeCode("10.52Z"));
  });
});
