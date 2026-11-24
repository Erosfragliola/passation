import { describe, it, expect } from "vitest";
import { regionDe, fourchetteCA, fourchetteMarge, anciennete, termesInterdits, verifierAnonymat, nombresDuTexte, secteurDe } from "../src/documents/anonymat.js";

const ent = { nom: "LA FRAISERAIE SAS", ville: "Lempdes", code_postal: "63370", siren: "319252813" };
const interdits = termesInterdits(ent, [2_400_000, 380_000, 2_244_253], ["Confiture Maison"]);

describe("general facts", () => {
  it.each([["63370", "Auvergne-Rhône-Alpes"], ["75008", "Île-de-France"], ["20000", "Corse"], ["97400", "La Réunion"], ["59000", "Hauts-de-France"], ["abc", null]])("région de %s", (cp, r) => expect(regionDe(cp)).toBe(r));
  it("revenue and margin ranges", () => {
    expect(fourchetteCA(2_400_000)).toBe("entre 2 M€ et 5 M€");
    expect(fourchetteCA(800_000)).toBe("moins de 1 M€");
    expect(fourchetteCA(60e6)).toBe("plus de 50 M€");
    expect(fourchetteMarge(0.158)).toBe("entre 15 et 20 %");
    expect(fourchetteMarge(-0.02)).toBe("négative");
  });
  it("age rounded down", () => {
    expect(anciennete("1980-03-01", 2026)).toBe("plus de 40 ans");
    expect(anciennete("2014-01-01", 2026)).toBe("plus de 10 ans");
    expect(anciennete("2023-01-01", 2026)).toBe("moins de 5 ans");
  });
});

describe("anonymity check", () => {
  it("generic text accepted (range bounds included)", () => {
    expect(verifierAnonymat("PME industrielle d'Auvergne-Rhône-Alpes, plus de 40 ans, CA entre 2 M€ et 5 M€, marge entre 15 et 20 %.", interdits)).toEqual([]);
  });
  it("name, distinctive word of the name, city, SIREN, postal code refused", () => {
    const p = verifierAnonymat("La Fraiseraie, à Lempdes (63370), SIREN 319 252 813", interdits);
    expect(p.map((x) => x.type)).toEqual(expect.arrayContaining(["nom", "identifiant"]));
    expect(p.find((x) => x.terme === "fraiseraie")).toBeTruthy();
    expect(p.find((x) => x.terme === "lempdes")).toBeTruthy();
    expect(p.find((x) => x.terme === "319252813")).toBeTruthy();
    expect(p.find((x) => x.terme === "63370")).toBeTruthy();
  });
  it("generic words of the name (SAS, la) do not block", () => {
    expect(verifierAnonymat("Une SAS familiale, la qualité avant tout.", interdits)).toEqual([]);
  });
  it("exact amounts refused in all their forms (to within 1%)", () => {
    for (const t of ["CA de 2,4 M€", "2 400 000 €", "un EBE de 380 k€", "valeur 2,24 M€"]) expect(verifierAnonymat(t, interdits).some((x) => x.type === "montant")).toBe(true);
  });
  it("terms from the company's website (brands, products) refused", () => {
    expect(verifierAnonymat("Célèbre pour sa confiture maison", interdits).find((x) => x.terme === "confiture maison")).toBeTruthy();
  });
  it("reading numbers", () => {
    expect(nombresDuTexte("2,4 M€ et 380 k€ et 2 400 000 €").map((n) => n.valeur)).toEqual([2_400_000, 380_000, 2_400_000]);
  });
});

// Audit, point 9: a single industry label everywhere (NAF division), and the anonymity check accepts it.
describe("single industry label", () => {
  it(`clothing store (47.71Z) → "Commerce de détail", not "Commerce, réparation d'automobiles et de motocycles"`, () => {
    expect(secteurDe("47.71Z")).toBe("Commerce de détail");
  });
  it(`joinery (16.23Z) → division 16, without the "à l'exception de…" clause`, () => {
    expect(secteurDe("16.23Z")).toBe("Travail du bois et fabrication d'articles en bois et en liège");
  });
  it("missing or unknown code → null", () => { expect(secteurDe(undefined)).toBeNull(); expect(secteurDe("00.00Z")).toBeNull(); });
  // Fictitious company whose name contains a word of the industry: "Travaux" stays allowed, "Exemplaire" does not
  const travaux = termesInterdits({ nom: "TRAVAUX EXEMPLAIRE SARL", ville: "Exempleville", code_postal: "99999", siren: "000000000", naf: "43.32A" });
  it("a word of the name that appears in the industry label is not forbidden", () => {
    expect(travaux.mots).toContain("exemplaire");
    expect(travaux.mots).not.toContain("travaux");
  });
  it("the teaser can name its industry; the company's name is still refused", () => {
    expect(verifierAnonymat(`Une entreprise du secteur « ${secteurDe("43.32A")} » en Bretagne.`, travaux)).toEqual([]);
    expect(verifierAnonymat("Travaux Exemplaire recrute.", travaux).map((x) => x.terme)).toContain("exemplaire");
  });
});
