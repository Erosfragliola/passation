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

describe("INPI : exercices (réponses réelles)", () => {
  it("un exercice confidentiel (CA = 0 dans la source) devient null, pas 0", () => {
    const ex = normaliserExercices(fx("512803552").inpi);
    const e2019 = ex.find((e) => e.annee === 2019);
    expect(e2019.publie).toBe(false);
    expect(e2019.ca).toBeNull();
    expect(donnees("512803552").ca.map((c) => c.annee)).toEqual([2018, 2023, 2024]);
  });
  it("une année par exercice, comptes complets préférés", () => {
    const annees = normaliserExercices(fx("434436622").inpi).map((e) => e.annee);
    expect(new Set(annees).size).toBe(annees.length);
  });
  it("« Publication simplifiee » garde ses chiffres", () => {
    expect(donnees("631880408").ca.find((c) => c.annee === 2023).valeur).toBe(25977485);
  });
  it("aucun exercice publié → comptes confidentiels", () => {
    const d = donnees("814672010");
    expect(d.comptes_confidentiels).toBe(true);
    expect(d.ca).toEqual([]);
  });
});

describe("BODACC : événements (réponses réelles)", () => {
  it("MK ENERGIES : créée à Charmes, s'installe à Reims puis à Saint-Léonard (transfert Reims → Reims ignoré)", () => {
    const d = donnees("794576231");
    expect(d.ville_creation).toBe("Charmes");
    expect(d.evenements.filter((e) => e.type === "transfert_siege").map((e) => e.detail)).toEqual(["Reims", "Saint-Léonard"]);
  });
  it("reprises de fonds : seulement quand l'entreprise est l'acheteuse", () => {
    // La Fraiseraie a acheté 5 fonds (2015-2019) et en a VENDU un aux Sables-d'Olonne en 2019 : la vente est exclue.
    const reprises = donnees("319252813").evenements.filter((e) => e.type === "reprise_fonds");
    expect(reprises.map((e) => e.date.slice(0, 4))).toEqual(["2015", "2016", "2018", "2019", "2019"]);
    expect(reprises.some((e) => /olonne/i.test(e.detail) && e.date.startsWith("2019"))).toBe(false);
    // Bongard Bazot a vendu à Nevers en 2012 (exclu) et acheté à Moulins-Engilbert en 2022.
    expect(donnees("631880408").evenements.filter((e) => e.type === "reprise_fonds").map((e) => e.detail)).toEqual(["Moulins-Engilbert"]);
  });
  it("un changement de forme juridique n'est pas un changement de nom", () => {
    expect(donnees("631880408").evenements.some((e) => e.type === "denomination")).toBe(false);
  });
  it("ville avec l'orthographe accentuée du BODACC", () => {
    expect(donnees("631880408").ville).toBe("Saint-Péreuse");
  });
  it("annonces sensibles écartées sans trace", () => {
    const brut = { results: [
      { dateparution: "2012-01-01", familleavis_lib: "Procédures collectives", commercant: "X", ville: "Lyon", jugement: "{}" },
      { dateparution: "2013-01-01", familleavis_lib: "Radiations", commercant: "X", ville: "Lyon" },
      { dateparution: "2014-01-01", familleavis_lib: "Dépôts des comptes", commercant: "X", ville: "Lyon" },
      { dateparution: "2015-01-01", familleavis_lib: "Procédures de conciliation", commercant: "X", ville: "Lyon" },
    ] };
    expect(normaliserAnnonces(brut, "123456789").evenements).toEqual([]);
  });
  it("aucune donnée de dirigeant dans l'objet maquette", () => {
    const texte = JSON.stringify(donnees("794576231"));
    expect(texte).not.toMatch(/dirigeant|prenom|administration|prix/i);
  });
});
