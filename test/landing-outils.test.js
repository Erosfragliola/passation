// Page d'accueil : contrastes des couleurs (calculés depuis les feuilles de style), SIREN, format des fourchettes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sirenValide, nettoyerSiren, ressembleASiren, formaterSiren } from "../public/js/siren.js";
import { fourchette, multiple, remplir } from "../public/js/landing/estimation.js";

const css = ["styles.css", "landing.css"].map((f) => readFileSync(new URL(`../public/css/${f}`, import.meta.url), "utf8")).join("\n");
const jeton = (nom) => css.match(new RegExp(`--${nom}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
const luminance = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("contrastes (WCAG AA)", () => {
  // Valeurs de référence calculées à la main (formule WCAG 2.x) : ocre-texte #8E5530 sur crème #FBF6EC ≈ 5,58
  it("texte courant : 4,5:1 au moins", () => {
    for (const [texte, fond] of [["ocre-texte", "creme"], ["ocre-texte", "sable"], ["pierre-texte", "creme"], ["ocre-nuit", "espresso"],
      ["pierre-nuit", "espresso"], ["creme", "vert"], ["espresso", "creme"]]) {
      expect(contraste(jeton(texte), jeton(fond)), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste("#8E5530", "#FBF6EC")).toBeCloseTo(5.58, 1);
  });
  it("mots-clés en grand (ocre) : 3:1 au moins, et pas assez pour du texte courant", () => {
    expect(contraste(jeton("ocre"), jeton("creme"))).toBeGreaterThanOrEqual(3);
    expect(contraste(jeton("ocre"), jeton("creme"))).toBeLessThan(4.5);
  });
});

describe("SIREN", () => {
  it("clé de Luhn", () => {
    expect(sirenValide("552081317")).toBe(true);   // SIREN public d'EDF
    expect(sirenValide("552081318")).toBe(false);
    expect(sirenValide("55208131")).toBe(false);
  });
  it("espaces acceptés, y compris insécables", () => {
    expect(nettoyerSiren("552 081 317")).toBe("552081317");
    expect(ressembleASiren("552 081 317")).toBe(true);
    expect(ressembleASiren("Menuiserie 44")).toBe(false);
    expect(formaterSiren("552081317")).toBe("552 081 317");
  });
});

describe("format des montants", () => {
  it("en M€ avec une décimale dès 1 M€, espace insécable avant l'unité", () => {
    expect(fourchette(1.8e6, 2.4e6)).toBe("1,8 – 2,4 M€");
    expect(fourchette(663000, 1.2e6)).toBe("0,7 – 1,2 M€");
  });
  it("en k€ arrondis à la dizaine sous 1 M€", () => {
    expect(fourchette(152000, 228000)).toBe("150 – 230 k€");
  });
  it("multiples et modèles", () => {
    expect(multiple(5.6)).toBe("5,6");
    expect(multiple(4)).toBe("4");
    expect(remplir("comptes {exercice} ({x})", { exercice: 2024 })).toBe("comptes 2024 ({x})");
  });
});
