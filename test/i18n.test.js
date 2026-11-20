// Site bilingue : dictionnaires (mêmes clés), t(), pluriels, repli sur le français, adresses et langue des requêtes.
import { describe, it, expect } from "vitest";
import { t, lien, installerDictionnaire, valeur } from "../public/js/i18n.js";
import { avecLangue, decouper, adresse, langueDeRequete, completerParFrancais } from "../src/i18n.js";
import { comparer } from "../scripts/i18n-check.mjs";

describe("fichiers de traduction", () => {
  it("mêmes clés en anglais et en français, aucune valeur anglaise vide là où le français en a une", () => {
    expect(comparer().erreurs).toEqual([]);
  });
});

describe("t()", () => {
  installerDictionnaire("fr", { essai: { bonjour: "Bonjour {nom}", seul_fr: "Seulement en français", pieces: { one: "{n} pièce", other: "{n} pièces" } } });
  installerDictionnaire("en", { essai: { bonjour: "Hello {nom}", seul_fr: "", pieces: { one: "{n} document", other: "{n} documents" } } });
  it("langue de la requête, repères remplacés", () => {
    expect(avecLangue("en", () => t("essai.bonjour", { nom: "Ada" }))).toBe("Hello Ada");
    expect(avecLangue("fr", () => t("essai.bonjour", { nom: "Ada" }))).toBe("Bonjour Ada");
  });
  it("sans langue connue : français", () => expect(t("essai.bonjour", { nom: "Ada" })).toBe("Bonjour Ada"));
  it("traduction absente ou vide : le texte français, jamais la clé", () => {
    expect(avecLangue("en", () => t("essai.seul_fr"))).toBe("Seulement en français");
    expect(avecLangue("en", () => valeur("essai.seul_fr"))).toBe("Seulement en français");
  });
  it("pluriels selon la langue (0 est singulier en français, pluriel en anglais)", () => {
    expect(avecLangue("fr", () => [0, 1, 2].map((n) => t("essai.pieces", { n })))).toEqual(["0 pièce", "1 pièce", "2 pièces"]);
    expect(avecLangue("en", () => [0, 1, 2].map((n) => t("essai.pieces", { n })))).toEqual(["0 documents", "1 document", "2 documents"]);
  });
  it("repère sans valeur laissé tel quel", () => expect(avecLangue("en", () => t("essai.bonjour"))).toBe("Hello {nom}"));
});

describe("adresses", () => {
  it("lien() : préfixe /fr en français, rien en anglais ni sans langue connue ; API et ressources inchangées", () => {
    expect(avecLangue("fr", () => [lien("/"), lien("/espace/?dossier=1#chiffres"), lien("/api/me"), lien("/fr/cgu"), lien("https://x.fr/")]))
      .toEqual(["/fr/", "/fr/espace/?dossier=1#chiffres", "/api/me", "/fr/cgu", "https://x.fr/"]);
    expect(avecLangue("en", () => lien("/espace/"))).toBe("/espace/");
    expect(lien("/espace/")).toBe("/espace/");
  });
  it("decouper() et adresse()", () => {
    expect(decouper("/fr/cgu")).toEqual({ langue: "fr", chemin: "/cgu" });
    expect(decouper("/fr")).toEqual({ langue: "fr", chemin: "/" });
    expect(decouper("/fr/")).toEqual({ langue: "fr", chemin: "/" });
    expect(decouper("/francais")).toEqual({ langue: "en", chemin: "/francais" });
    expect(decouper("/espace/")).toEqual({ langue: "en", chemin: "/espace/" });
    expect([adresse("/", "fr"), adresse("/cgu", "fr"), adresse("/cgu", "en")]).toEqual(["/fr/", "/fr/cgu", "/cgu"]);
  });
});

describe("langue d'une requête", () => {
  const req = (chemin, entetes = {}) => new Request(`https://passation.example${chemin}`, { headers: entetes });
  it("page : l'adresse fait foi (le cookie ne change rien)", () => {
    expect(langueDeRequete(req("/fr/cgu", { cookie: "langue=en" }))).toBe("fr");
    expect(langueDeRequete(req("/cgu", { cookie: "langue=fr" }))).toBe("en");
  });
  it("API : la page d'origine, puis le cookie, sinon inconnue", () => {
    expect(langueDeRequete(req("/api/me", { referer: "https://passation.example/fr/espace/" }))).toBe("fr");
    expect(langueDeRequete(req("/api/me", { referer: "https://passation.example/espace/", cookie: "langue=fr" }))).toBe("en");
    expect(langueDeRequete(req("/api/me", { referer: "https://ailleurs.example/fr/", cookie: "langue=fr" }))).toBe("fr");
    expect(langueDeRequete(req("/api/me"))).toBeNull();
  });
});

describe("repli sur le français", () => {
  it("valeur anglaise vide ou absente : française ; listes anglaises vides : françaises", () => {
    const fr = { a: "Un", b: "Deux", l: ["x", "y"], o: { c: "Trois" } };
    expect(completerParFrancais("en", fr, { a: "One", b: "", l: [], o: {} })).toEqual({ a: "One", b: "Deux", l: ["x", "y"], o: { c: "Trois" } });
  });
});
