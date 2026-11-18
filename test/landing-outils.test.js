// Page d'accueil : contrastes des couleurs (calculés depuis les feuilles de style), SIREN, format des fourchettes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sirenValide, nettoyerSiren, ressembleASiren, formaterSiren } from "../public/js/siren.js";
import { fourchette, multiple, remplir, montant, positionRepere, moisSource } from "../public/js/landing/estimation.js";

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
  it("fonds crème (plus de sable) : texte courant et sur-titres à 4,5:1, mots-clés à 3:1", () => {
    // Panneaux et scène de l'histoire : --fond-panneau, et le dégradé --fond-scene jusque dans ses coins (#F1EBE1)
    const panneau = jeton("fond-panneau");
    expect(panneau).toBe("#F5F0E7");
    expect(css).not.toMatch(/#EDE5D9|carte-ocre/);
    for (const fond of [jeton("page"), panneau, "#F8F3EA", "#F1EBE1"]) {
      for (const texte of ["encre", "encre-2", "sur-titre"]) expect(contraste(jeton(texte), fond), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(jeton("ocre-clair"), fond), `ocre-clair sur ${fond}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("nouvelle structure : cartes verte (dont l'appel final), claire et panneaux crème, pied de page", () => {
    const vert = jeton("vert-carte"), clair = jeton("carte-claire");
    expect(vert).toBe("#1F3B2D");
    // Texte courant et petits textes : 4,5:1
    for (const [texte, fond] of [
      ["#F7F1EA", vert], ["#E3ECE5", vert], ["#CFE0D3", vert],           // carte verte : titres, texte, sur-titres
      ["#5E554B", clair], ["#7A5C42", clair], ["#5E554B", jeton("fond-panneau")], // cartes claires, étiquettes mono, panneaux
      ["#7A5C42", jeton("page")],                                         // sur-titres de section
      ["#CFC3B5", "#1E1A17"], ["#B8AD9F", "#1E1A17"], ["#1E1A17", "#EFE8DD"], // pied de page ; bouton secondaire
    ]) expect(contraste(texte, fond), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
    // Grands chiffres et mots en italique : 3:1
    for (const [texte, fond] of [["#E9C9A4", vert], ["#D9B48F", vert], ["#A8774A", clair], [jeton("ocre-nuit"), vert]]) {
      expect(contraste(texte, fond), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("étiquettes kraft (sur-titres) : texte lisible jusque sur le kraft le plus foncé", () => {
    // Mesuré sur kraft-recto.webp : #CBA26F en moyenne, #AE8B5E à un écart-type plus sombre ; texte #2E1F12
    expect(css).toMatch(/color: #2E1F12;\s*background: #CBA26F/);
    for (const fond of ["#CBA26F", "#AE8B5E"]) expect(contraste("#2E1F12", fond), `sur ${fond}`).toBeGreaterThanOrEqual(4.5);
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
  it("montant seul dans l'unité de sa fourchette (fiche de résultat)", () => {
    // 434436622 (estimation du 18/11/2026) : 293 234,7 / 399 865,5 / 488 724,5 € → 290 / 400 / 490 k€
    expect(montant(293234.7, 488724.5)).toBe("290 k€");
    expect(montant(399865.5, 488724.5)).toBe("400 k€");
    // Scénario fictif de docs/DEMO.md : 1 381 818 / 1 941 818 / 2 431 818 € → 1,4 / 1,9 / 2,4 M€
    expect(montant(1941818.18, 2431818.18)).toBe("1,9 M€");
    expect(montant(1381818.18, 2431818.18)).toBe("1,4 M€");
  });
  it("position de la valeur centrale sur la barre", () => {
    expect(positionRepere(293234.7, 399865.5, 488724.5)).toBeCloseTo(54.545, 2); // 106 630,8 / 195 489,8
    expect(positionRepere(1381818.18, 1941818.18, 2431818.18)).toBeCloseTo(53.333, 2); // 560 000 / 1 050 000
    expect(positionRepere(100, 100, 100)).toBe(50);
    expect(positionRepere(100, 300, 200)).toBe(100);
  });
  it("date de la référence des multiples", () => {
    expect(moisSource("croisement-2026-11")).toBe("novembre 2026");
    expect(moisSource("croisement-2027-01")).toBe("janvier 2027");
    expect(moisSource("")).toBeNull();
    expect(moisSource("croisement-2026-13")).toBeNull();
  });
  it("multiples et modèles", () => {
    expect(multiple(5.6)).toBe("5,6");
    expect(multiple(4)).toBe("4");
    expect(remplir("comptes {exercice} ({x})", { exercice: 2024 })).toBe("comptes 2024 ({x})");
  });
});

import { detailSuggestion } from "../public/js/landing/estimation.js";
import { libelleSalaries } from "../public/js/regles.js";
import { normaliserSuggestions } from "../src/sources/entreprise.js";
import fraiseraie from "./fixtures/319252813.json";

describe("suggestions", () => {
  it("tranches d'effectif : libellés INSEE", () => {
    expect(libelleSalaries("NN")).toBe("non employeuse");
    expect(libelleSalaries("00")).toBe("0 salarié");
    expect(libelleSalaries("01")).toBe("1 ou 2 salariés");
    expect(libelleSalaries("12")).toBe("20 à 49 salariés");
    expect(libelleSalaries("42")).toBe("1 000 à 1 999 salariés");
    expect(libelleSalaries("53")).toBe("10 000 salariés et plus");
    expect(libelleSalaries("99")).toBeNull();
  });
  it("date de création et tranche reprises de la réponse réelle de l'annuaire", () => {
    const [s] = normaliserSuggestions(fraiseraie.entreprise);
    expect(s).toMatchObject({ siren: "319252813", date_creation: "1980-04-01", tranche_effectif: "12", code_postal: "44210" });
  });
  it("ligne lisible : ville (département), année de création, effectif", () => {
    expect(detailSuggestion({ ville: "PORNIC", code_postal: "44210", date_creation: "1980-04-01", tranche_effectif: "12" }))
      .toBe("PORNIC (44) · créée en 1980 · 20 à 49 salariés");
    expect(detailSuggestion({ ville: "SAINT-DENIS", code_postal: "97400", date_creation: null, tranche_effectif: "NN" })).toBe("SAINT-DENIS (974)");
    expect(detailSuggestion({ ville: null, code_postal: null })).toBe("");
  });
});

import { uhd } from "../public/js/landing/video.js";

describe("vidéo du hero : définition", () => {
  it("1080p par défaut ; 2160p seulement à partir de 1 600 px de large, sur une connexion rapide", () => {
    expect(uhd(1440)).toBe(false);
    expect(uhd(1599)).toBe(false);
    expect(uhd(1600)).toBe(true);
    expect(uhd(2560, false)).toBe(false);
  });
});
