import { describe, it, expect } from "vitest";
import { regionDe, fourchetteCA, fourchetteMarge, anciennete, termesInterdits, verifierAnonymat, nombresDuTexte, secteurDe } from "../src/documents/anonymat.js";

const ent = { nom: "LA FRAISERAIE SAS", ville: "Lempdes", code_postal: "63370", siren: "319252813" };
const interdits = termesInterdits(ent, [2_400_000, 380_000, 2_244_253], ["Confiture Maison"]);

describe("faits généraux", () => {
  it.each([["63370", "Auvergne-Rhône-Alpes"], ["75008", "Île-de-France"], ["20000", "Corse"], ["97400", "La Réunion"], ["59000", "Hauts-de-France"], ["abc", null]])("région de %s", (cp, r) => expect(regionDe(cp)).toBe(r));
  it("fourchettes de CA et de marge", () => {
    expect(fourchetteCA(2_400_000)).toBe("entre 2 M€ et 5 M€");
    expect(fourchetteCA(800_000)).toBe("moins de 1 M€");
    expect(fourchetteCA(60e6)).toBe("plus de 50 M€");
    expect(fourchetteMarge(0.158)).toBe("entre 15 et 20 %");
    expect(fourchetteMarge(-0.02)).toBe("négative");
  });
  it("ancienneté arrondie vers le bas", () => {
    expect(anciennete("1980-03-01", 2026)).toBe("plus de 40 ans");
    expect(anciennete("2014-01-01", 2026)).toBe("plus de 10 ans");
    expect(anciennete("2023-01-01", 2026)).toBe("moins de 5 ans");
  });
});

describe("contrôle d'anonymat", () => {
  it("texte générique accepté (bornes de fourchettes comprises)", () => {
    expect(verifierAnonymat("PME industrielle d'Auvergne-Rhône-Alpes, plus de 40 ans, CA entre 2 M€ et 5 M€, marge entre 15 et 20 %.", interdits)).toEqual([]);
  });
  it("nom, mot distinctif du nom, ville, SIREN, code postal refusés", () => {
    const p = verifierAnonymat("La Fraiseraie, à Lempdes (63370), SIREN 319 252 813", interdits);
    expect(p.map((x) => x.type)).toEqual(expect.arrayContaining(["nom", "identifiant"]));
    expect(p.find((x) => x.terme === "fraiseraie")).toBeTruthy();
    expect(p.find((x) => x.terme === "lempdes")).toBeTruthy();
    expect(p.find((x) => x.terme === "319252813")).toBeTruthy();
    expect(p.find((x) => x.terme === "63370")).toBeTruthy();
  });
  it("les mots génériques du nom (SAS, la) ne bloquent pas", () => {
    expect(verifierAnonymat("Une SAS familiale, la qualité avant tout.", interdits)).toEqual([]);
  });
  it("montants exacts refusés sous toutes leurs formes (à 1 % près)", () => {
    for (const t of ["CA de 2,4 M€", "2 400 000 €", "un EBE de 380 k€", "valeur 2,24 M€"]) expect(verifierAnonymat(t, interdits).some((x) => x.type === "montant")).toBe(true);
  });
  it("termes du site de l'entreprise (marques, produits) refusés", () => {
    expect(verifierAnonymat("Célèbre pour sa confiture maison", interdits).find((x) => x.terme === "confiture maison")).toBeTruthy();
  });
  it("lecture des nombres", () => {
    expect(nombresDuTexte("2,4 M€ et 380 k€ et 2 400 000 €").map((n) => n.valeur)).toEqual([2_400_000, 380_000, 2_400_000]);
  });
});

// Audit, point 9 : un seul libellé de secteur partout (division NAF), et le contrôle d'anonymat l'accepte.
describe("libellé unique du secteur", () => {
  it("magasin de vêtements (47.71Z) → « Commerce de détail », pas « Commerce, réparation d'automobiles et de motocycles »", () => {
    expect(secteurDe("47.71Z")).toBe("Commerce de détail");
  });
  it("menuiserie (16.23Z) → division 16, sans la clause « à l'exception de… »", () => {
    expect(secteurDe("16.23Z")).toBe("Travail du bois et fabrication d'articles en bois et en liège");
  });
  it("code absent ou inconnu → null", () => { expect(secteurDe(undefined)).toBeNull(); expect(secteurDe("00.00Z")).toBeNull(); });
  // Entreprise fictive dont le nom reprend un mot du secteur : « Travaux » reste permis, « Exemplaire » non
  const travaux = termesInterdits({ nom: "TRAVAUX EXEMPLAIRE SARL", ville: "Exempleville", code_postal: "99999", siren: "000000000", naf: "43.32A" });
  it("un mot du nom qui figure dans le libellé du secteur n'est pas interdit", () => {
    expect(travaux.mots).toContain("exemplaire");
    expect(travaux.mots).not.toContain("travaux");
  });
  it("le teaser peut nommer son secteur ; le nom de l'entreprise reste refusé", () => {
    expect(verifierAnonymat(`Une entreprise du secteur « ${secteurDe("43.32A")} » en Bretagne.`, travaux)).toEqual([]);
    expect(verifierAnonymat("Travaux Exemplaire recrute.", travaux).map((x) => x.terme)).toContain("exemplaire");
  });
});
