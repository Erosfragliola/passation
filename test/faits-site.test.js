// Website facts (themes, essentials, contradictions with the registries), limit of choices, key dates, business
// sentence. Entirely fictitious data (public repository).
import { describe, it, expect } from "vitest";
import { faitsParTheme, faitsEssentiels, contradictions, faitsUtilisables, limiterChoix, lireDate, lignesDates, phraseActivite, nomLisible } from "../public/js/faits-site.js";
import { QUESTIONS } from "../public/js/parcours.js";
import { candidatsPhotos, cleImage } from "../src/documents/site.js";
import { activiteFine } from "../src/documents/naf.js";

const F = (id, categorie, fait, extra = {}) => ({ id, categorie, fait, valide: true, ...extra });
const entreprise = { date_creation: "1998-03-01", tranche_effectif: { code: "12" } }; // 20 to 49 employees

describe("limite « une à trois réponses »", () => {
  it("limiterChoix garde les trois premières, sans doublon", () => {
    expect(limiterChoix(["Qualité", "Sur mesure", "Délais", "Équipements", "Certifications", "Relation client"], 3)).toEqual(["Qualité", "Sur mesure", "Délais"]);
    expect(limiterChoix(["Qualité", "Qualité", "Délais"], 3)).toEqual(["Qualité", "Délais"]);
    expect(limiterChoix(null, 3)).toEqual([]);
    expect(limiterChoix(["a", "b"], undefined)).toEqual(["a", "b"]);
  });
  it("le parcours impose 3 au plus aux distinctions et aux axes de développement", () => {
    const champ = (id, cle) => QUESTIONS.find((q) => q.id === id).champs.find((c) => c.cle === cle);
    expect(champ("distinctions", "distinctions").max).toBe(3);
    expect(champ("perspectives", "axes").max).toBe(3);
  });
});

describe("faits du site", () => {
  const faits = [F(1, "produits", "Escaliers sur mesure."), F(2, "qualite", "Finitions à la main."), F(3, "clients", "Particuliers et architectes."), F(4, "histoire", "Entreprise familiale."), F(5, "activite", "Agencement de magasins."), F(6, "autre", "Présente sur les salons.")];
  it("regroupés par thème, dans l'ordre : activité, savoir-faire, clients et zone, histoire, autres", () => {
    expect(faitsParTheme(faits).map(([k, l]) => [k, l.map((f) => f.id)])).toEqual([["activite", [1, 5]], ["savoir_faire", [2]], ["clients_zone", [3]], ["histoire", [4]], ["autre", [6]]]);
  });
  it("4 faits essentiels : le premier de chaque thème principal d'abord", () => {
    expect(faitsEssentiels(faits, 4).map((f) => f.id)).toEqual([1, 2, 3, 4]);
    expect(faitsEssentiels(faits, 5).map((f) => f.id)).toEqual([1, 2, 3, 4, 5]); // then the next one of the first theme
  });
});

describe("contradictions site / registres", () => {
  it("année de création : « créée en 1982 » contre 1998 aux registres → à vérifier", () => {
    const f = [F(1, "histoire", "Menuiserie Exemple a été créée en 1982 par le père de l'actuel dirigeant."), F(2, "histoire", "Depuis 1998, au service des particuliers."), F(3, "activite", "Escaliers en chêne.")];
    expect(contradictions(f, entreprise)).toEqual([{ id: 1, type: "creation", site: 1982, registre: 1998 }]);
  });
  it("effectif hors de la tranche INSEE : 12 salariés contre 20 à 49 → à vérifier ; 25 salariés : cohérent", () => {
    expect(contradictions([F(1, "equipe", "Une équipe de 12 salariés.")], entreprise)).toEqual([{ id: 1, type: "effectif", site: 12, registre: [20, 49] }]);
    expect(contradictions([F(1, "equipe", "Une équipe de 25 salariés.")], entreprise)).toEqual([]);
  });
  it("sans date ni tranche aux registres : rien n'est signalé", () => {
    expect(contradictions([F(1, "histoire", "Créée en 1982.")], {})).toEqual([]);
    expect(contradictions([F(1, "equipe", "12 salariés.")], { tranche_effectif: { code: "NN" } })).toEqual([]);
  });
  it("un fait contredit n'est pas utilisé tant que le dirigeant n'a pas tranché ; un fait retiré jamais", () => {
    const f = [F(1, "histoire", "Créée en 1982."), F(2, "activite", "Escaliers."), F(3, "activite", "Parquets.", { valide: false })];
    expect(faitsUtilisables(f, entreprise).map((x) => x.id)).toEqual([2]);
    expect(faitsUtilisables([{ ...f[0], resolu: true }, f[1]], entreprise).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("dates clés", () => {
  it("formats acceptés : année, mois/année, date complète ; le reste est refusé", () => {
    expect(lireDate("2016")).toMatchObject({ annee: 2016, mois: null, texte: "2016" });
    expect(lireDate("3/2016")).toMatchObject({ annee: 2016, mois: 3, texte: "03/2016" });
    expect(lireDate("15/03/2016")).toMatchObject({ annee: 2016, mois: 3, jour: 15, texte: "15/03/2016" });
    expect(lireDate("2016-03-15").texte).toBe("15/03/2016");
    for (const x of ["", "16", "13/2016", "31/02/2016", "1700", "mars 2016"]) expect(lireDate(x), x).toBeNull();
  });
  it("l'ancien format (texte « une ligne par date ») est relu en lignes", () => {
    expect(lignesDates("1998 : création à Exempleville\n06/2011 – transfert du siège\nune ligne sans date")).toEqual([
      { date: "1998", type: "autre", precision: "création à Exempleville", source: null },
      { date: "06/2011", type: "autre", precision: "transfert du siège", source: null },
      { date: "", type: "autre", precision: "une ligne sans date", source: null },
    ]);
  });
});

describe("phrase d'activité proposée", () => {
  it("assemble les choix du dirigeant, sans mot ajouté", () => {
    expect(phraseActivite({ nom: "MENUISERIE EXEMPLE", metiers: ["Escaliers sur mesure", "Portes intérieures", "RGE pose"], clients: ["Particuliers", "Autres professionnels"], l: "fr" }))
      .toBe("Menuiserie Exemple : escaliers sur mesure, portes intérieures et RGE pose, pour des particuliers et d'autres professionnels.");
    expect(phraseActivite({ nom: "MENUISERIE EXEMPLE", metiers: ["Staircases"], clients: ["Individuals"], l: "en" })).toBe("Menuiserie Exemple: staircases, for individuals.");
    expect(phraseActivite({ nom: "X", metiers: [], clients: ["Particuliers"], l: "fr" })).toBe("");
  });
  it("raison sociale en capitales rendue lisible ; un nom déjà en casse mixte est gardé", () => {
    expect(nomLisible("ATELIER DU BOIS SARL")).toBe("Atelier Du Bois SARL");
    expect(nomLisible("Atelier du Bois")).toBe("Atelier du Bois");
  });
});

describe("libellé d'activité le plus fin (C2)", () => {
  it("sous-classe NAF en français (INSEE), classe NACE en anglais (Eurostat) ; code inconnu → null", () => {
    expect(activiteFine("16.23Z", "fr")).toBe("Fabrication de charpentes et d'autres menuiseries");
    expect(activiteFine("45.20A", "fr")).toBe("Entretien et réparation de véhicules automobiles légers");
    expect(activiteFine("16.23Z", "en")).toBe("Manufacture of other builders' carpentry and joinery");
    expect(activiteFine("1623Z", "fr")).toBeNull();
    expect(activiteFine("99.99Z", "fr")).toBeNull();
  });
});

describe("photos du site : filtre à la lecture", () => {
  const base = new URL("https://menuiserie-exemple.fr/");
  const html = `
    <img src="/img/logo-menuiserie.png" width="300" height="120" alt="Logo">
    <img src="/img/picto-livraison.svg" alt="">
    <img src="/img/bandeau-accueil.jpg" width="1900" height="400" alt="Bienvenue">
    <img src="/img/vignette.jpg" width="240" height="160">
    <img src="/img/escalier-chene-300x200.jpg" srcset="/img/escalier-chene-300x200.jpg 300w, /img/escalier-chene-1200x800.jpg 1200w" alt="Escalier en chêne">
    <img src="/img/escalier-chene.jpg" width="900" height="600" alt="Escalier">
    <img src="/img/photo-divers.jpg" width="1000" height="700">
    <img src="/uploads/notre-atelier.jpg" width="1200" height="800" alt="Notre atelier">
    <img src="data:image/png;base64,AAAA" width="800" height="600">
    <img class="icon-check" src="/img/check.png" width="800" height="800">`;
  it("écarte logo, pictogramme SVG, bandeau (1 900 × 400), petite image (240 px), data:, icône ; doublons fusionnés", () => {
    const c = candidatsPhotos(html, base);
    expect(c).toEqual([
      "https://menuiserie-exemple.fr/uploads/notre-atelier.jpg",            // « atelier »: real photo, first
      "https://menuiserie-exemple.fr/img/escalier-chene-1200x800.jpg",      // srcset: the largest; « escalier-chene.jpg » is the same file
      "https://menuiserie-exemple.fr/img/photo-divers.jpg",
    ]);
  });
  it("même fichier en plusieurs tailles → même clé de doublon", () => {
    expect(cleImage("https://x.fr/a/photo-300x200.jpg")).toBe(cleImage("https://x.fr/a/photo.jpg"));
    expect(cleImage("https://x.fr/a/photo@2x.jpg")).toBe(cleImage("https://x.fr/a/photo.jpg"));
    expect(cleImage("https://x.fr/a/photo-scaled.jpg")).toBe(cleImage("https://x.fr/a/photo.jpg"));
    expect(cleImage("https://x.fr/a/autre.jpg")).not.toBe(cleImage("https://x.fr/a/photo.jpg"));
  });
});

// Placement of the memorandum's photos: by approved category, without duplicates (test/photos.test.js,
// placementPhotos).
