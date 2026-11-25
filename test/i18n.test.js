// Bilingual site: dictionaries (same keys), t(), plurals, French fallback, addresses and language of requests.
import { describe, it, expect } from "vitest";
import { t, lien, installerDictionnaire, valeur } from "../public/js/i18n.js";
import { avecLangue, decouper, adresse, langueDeRequete, completerParFrancais } from "../src/i18n.js";
import { comparer } from "../scripts/i18n-check.mjs";

describe("translation files", () => {
  it("same keys in English and French, no empty English value where the French has one", () => {
    expect(comparer().erreurs).toEqual([]);
  });
});

describe("t()", () => {
  installerDictionnaire("fr", { essai: { bonjour: "Bonjour {nom}", seul_fr: "Seulement en français", pieces: { one: "{n} pièce", other: "{n} pièces" } } });
  installerDictionnaire("en", { essai: { bonjour: "Hello {nom}", seul_fr: "", pieces: { one: "{n} document", other: "{n} documents" } } });
  it("language of the request, placeholders replaced", () => {
    expect(avecLangue("en", () => t("essai.bonjour", { nom: "Ada" }))).toBe("Hello Ada");
    expect(avecLangue("fr", () => t("essai.bonjour", { nom: "Ada" }))).toBe("Bonjour Ada");
  });
  it("without a known language: French", () => expect(t("essai.bonjour", { nom: "Ada" })).toBe("Bonjour Ada"));
  it("missing or empty translation: the French text, never the key", () => {
    expect(avecLangue("en", () => t("essai.seul_fr"))).toBe("Seulement en français");
    expect(avecLangue("en", () => valeur("essai.seul_fr"))).toBe("Seulement en français");
  });
  it("plurals according to the language (0 is singular in French, plural in English)", () => {
    expect(avecLangue("fr", () => [0, 1, 2].map((n) => t("essai.pieces", { n })))).toEqual(["0 pièce", "1 pièce", "2 pièces"]);
    expect(avecLangue("en", () => [0, 1, 2].map((n) => t("essai.pieces", { n })))).toEqual(["0 documents", "1 document", "2 documents"]);
  });
  it("placeholder without a value left as is", () => expect(avecLangue("en", () => t("essai.bonjour"))).toBe("Hello {nom}"));
});

describe("addresses", () => {
  it("lien(): /fr prefix in French, nothing in English or without a known language; API and resources unchanged", () => {
    expect(avecLangue("fr", () => [lien("/"), lien("/espace/?dossier=1#chiffres"), lien("/api/me"), lien("/fr/cgu"), lien("https://x.fr/")]))
      .toEqual(["/fr/", "/fr/espace/?dossier=1#chiffres", "/api/me", "/fr/cgu", "https://x.fr/"]);
    expect(avecLangue("en", () => lien("/espace/"))).toBe("/espace/");
    expect(lien("/espace/")).toBe("/espace/");
  });
  it("decouper() and adresse()", () => {
    expect(decouper("/fr/cgu")).toEqual({ langue: "fr", chemin: "/cgu" });
    expect(decouper("/fr")).toEqual({ langue: "fr", chemin: "/" });
    expect(decouper("/fr/")).toEqual({ langue: "fr", chemin: "/" });
    expect(decouper("/francais")).toEqual({ langue: "en", chemin: "/francais" });
    expect(decouper("/espace/")).toEqual({ langue: "en", chemin: "/espace/" });
    expect([adresse("/", "fr"), adresse("/cgu", "fr"), adresse("/cgu", "en")]).toEqual(["/fr/", "/fr/cgu", "/cgu"]);
  });
});

describe("language of a request", () => {
  const req = (chemin, entetes = {}) => new Request(`https://passation.example${chemin}`, { headers: entetes });
  it("page: the address decides (the cookie changes nothing)", () => {
    expect(langueDeRequete(req("/fr/cgu", { cookie: "langue=en" }))).toBe("fr");
    expect(langueDeRequete(req("/cgu", { cookie: "langue=fr" }))).toBe("en");
  });
  it("API: the originating page, then the cookie, otherwise unknown", () => {
    expect(langueDeRequete(req("/api/me", { referer: "https://passation.example/fr/espace/" }))).toBe("fr");
    expect(langueDeRequete(req("/api/me", { referer: "https://passation.example/espace/", cookie: "langue=fr" }))).toBe("en");
    expect(langueDeRequete(req("/api/me", { referer: "https://ailleurs.example/fr/", cookie: "langue=fr" }))).toBe("fr");
    expect(langueDeRequete(req("/api/me"))).toBeNull();
  });
});

describe("French fallback", () => {
  it("empty or missing English value: French; empty English lists: French", () => {
    const fr = { a: "Un", b: "Deux", l: ["x", "y"], o: { c: "Trois" } };
    expect(completerParFrancais("en", fr, { a: "One", b: "", l: [], o: {} })).toEqual({ a: "One", b: "Deux", l: ["x", "y"], o: { c: "Trois" } });
  });
});

// Each key cited literally in the code (t("a.b"), tr("a.b")) exists in the French dictionary: otherwise the page
// would display the key itself. Built keys (t(`a.${x}`)) are checked by their prefix.
import { readdirSync, readFileSync } from "node:fs";
import { SOURCES } from "../src/i18n.js";
import { lireNombreSaisi } from "../public/js/i18n.js";
describe("keys cited in the code", () => {
  const fichiers = (d) => readdirSync(new URL(`../${d}`, import.meta.url), { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`);
  const code = [...fichiers("public/js"), ...fichiers("src")].map((f) => [f, readFileSync(new URL(`../${f}`, import.meta.url), "utf8")]);
  const lire = (o, c) => c.split(".").reduce((v, k) => (v == null ? undefined : v[k]), o);
  it("all present in French", () => {
    const absentes = [];
    for (const [f, s] of code) {
      for (const m of s.matchAll(/\b(?:t|tr)\(\s*"([a-z_0-9]+(?:\.[a-zA-Z_0-9-]+)+)"/g)) if (lire(SOURCES.fr, m[1]) === undefined) absentes.push(`${f} : ${m[1]}`);
      for (const m of s.matchAll(/\b(?:t|tr)\(\s*`([a-z_0-9]+(?:\.[a-zA-Z_0-9-]+)*)\.\$\{/g)) if (lire(SOURCES.fr, m[1]) === undefined) absentes.push(`${f} : ${m[1]}.…`);
    }
    expect(absentes).toEqual([]);
  });
});

describe("entered numbers", () => {
  it("decimal comma in French, thousands separator in English", () => {
    expect(lireNombreSaisi("1 234,5", "fr")).toBe(1234.5);
    expect(lireNombreSaisi("1 250 000 €", "fr")).toBe(1250000);
    expect(lireNombreSaisi("1,234.5", "en")).toBe(1234.5);
    expect(lireNombreSaisi("€1,250,000", "en")).toBe(1250000);
    expect(lireNombreSaisi("", "en")).toBeNull();
    expect(lireNombreSaisi("abc", "fr")).toBeNaN();
  });
});
