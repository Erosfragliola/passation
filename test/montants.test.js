// Montants du parcours guidé : séparateurs de milliers de la langue, valeur enregistrée brute, bornes du curseur.
// Valeurs attendues écrites à la main (espace fine insécable U+202F en français, comme Intl.NumberFormat fr-FR).
import { describe, it, expect } from "vitest";
import { formaterSaisie, texteMontant, lireMontant, bornesCurseur } from "../public/js/montants.js";

const fine = " ", insec = " ";

describe("montants : formatage en direct", () => {
  it("français : « 1234567 » → « 1 234 567 » ; anglais : « 1,234,567 »", () => {
    expect(formaterSaisie("1234567", { l: "fr" })).toBe(`1${fine}234${fine}567`);
    expect(formaterSaisie("1234567", { l: "en" })).toBe("1,234,567");
  });
  it("ce qui a déjà été mis en forme, ou tapé avec espaces et symboles, reste le même nombre", () => {
    expect(formaterSaisie(`1${fine}234${fine}5678`, { l: "fr" })).toBe(`12${fine}345${fine}678`);
    expect(formaterSaisie("€1,234,5678", { l: "en" })).toBe("12,345,678");
    expect(formaterSaisie("96 000 €", { l: "fr" })).toBe(`96${fine}000`);
  });
  it("partie décimale seulement si permise ; zéros de tête retirés ; vide reste vide ; signe moins gardé", () => {
    expect(formaterSaisie("12,5", { l: "fr", decimales: 1 })).toBe("12,5");
    expect(formaterSaisie("12.57", { l: "en", decimales: 1 })).toBe("12.5");
    expect(formaterSaisie("12,5", { l: "fr" })).toBe("12");
    expect(formaterSaisie("007", { l: "fr" })).toBe("7");
    expect(formaterSaisie("", { l: "fr" })).toBe("");
    expect(formaterSaisie("-15000", { l: "fr" })).toBe(`-15${fine}000`);
  });
  it("relecture : le texte formaté redonne le nombre brut enregistré", () => {
    expect(lireMontant(formaterSaisie("1234567", { l: "fr" }), "fr")).toBe(1234567);
    expect(lireMontant(formaterSaisie("1234567", { l: "en" }), "en")).toBe(1234567);
    expect(lireMontant("12,5", "fr")).toBe(12.5);
    expect(lireMontant("", "fr")).toBeNull();
    expect(Number.isNaN(lireMontant("abc", "fr"))).toBe(true);
  });
  it("montant affiché, unité comprise : « 1 234 567 € » / « €1,234,567 » ; « 12,5 % » / « 12.5% »", () => {
    expect(texteMontant(1234567, "€", "fr")).toBe(`1${fine}234${fine}567${insec}€`);
    expect(texteMontant(1234567, "€", "en")).toBe("€1,234,567");
    expect(texteMontant(12.5, "%", "fr")).toBe(`12,5${insec}%`);
    expect(texteMontant(12.5, "%", "en")).toBe("12.5%");
    expect(texteMontant(null, "€", "fr")).toBe("");
  });
});

describe("montants : curseur", () => {
  it("pas rond (≈ 1/200 de l'écart) ; 0 à 250 000 € → pas de 2 000 € ; 0 à 100 % → pas de 0,5", () => {
    expect(bornesCurseur({ min: 0, max: 250000 })).toEqual({ min: 0, max: 250000, pas: 2000 }); // 1 250 → 2 000
    expect(bornesCurseur({ min: 0, max: 100 })).toEqual({ min: 0, max: 100, pas: 0.5 });
    expect(bornesCurseur({ min: -20, max: 30 })).toEqual({ min: -20, max: 30, pas: 0.5 }); // 50 / 200 = 0,25 → 0,5
  });
  it("une valeur au-delà de la borne haute élargit le curseur (jamais tronquée)", () => {
    expect(bornesCurseur({ min: 0, max: 250000, valeur: 410000 }).max).toBe(410000); // pas 5 000 : 410 000 est un multiple
  });
});
