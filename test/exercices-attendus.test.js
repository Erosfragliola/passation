// Exercices demandés au dirigeant (audit du 19/11/2026 : l'INPI publiait 2019, 2021 et 2024 ; la page valorisation
// réclamait 11 lignes obligatoires pour 2019 et 2021, la page du dossier « 2 exercices de plus »). Données fictives.
import { describe, it, expect } from "vitest";
import { CHAMPS, exercicesAttendus, anneesAReprendre } from "../public/js/champs-financiers.js";

const valide = (valeur) => ({ valeur, source: "dirigeant", valide: true });
/** Exercice complet : tous les postes obligatoires validés (montants fictifs). */
const complet = () => Object.fromEntries(CHAMPS.filter((c) => c.obligatoire).map((c) => [c.cle, valide(100_000)]));
const inpi = (ca) => ({ chiffre_affaires: { valeur: ca, source: "inpi", valide: false } });

describe("exercices attendus", () => {
  it("le dernier est indispensable ; les deux précédents facultatifs ; les années INPI isolées plus anciennes ignorées", () => {
    expect(exercicesAttendus({ 2019: inpi(900_000), 2021: inpi(1_000_000), 2024: complet() })).toEqual({
      dernier: 2024, dernier_complet: true, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [2021, 2019],
    });
  });
  it("dernier exercice connu seulement par les comptes publics : pas confirmé", () => {
    expect(exercicesAttendus({ 2024: inpi(1_200_000) })).toMatchObject({ dernier: 2024, dernier_complet: false });
  });
  it("2024 et 2023 complets, 2022 absent : seul 2022 reste proposé", () => {
    expect(exercicesAttendus({ 2023: complet(), 2024: complet() }).recommandes_manquants).toEqual([2022]);
  });
  it("2022 commencé mais incomplet : encore proposé", () => {
    expect(exercicesAttendus({ 2022: inpi(800_000), 2023: complet(), 2024: complet() }).recommandes_manquants).toEqual([2022]);
  });
  it("un exercice sans aucun montant ne compte pas ; aucun exercice → dernier inconnu", () => {
    expect(exercicesAttendus({ 2025: {}, 2024: complet() }).dernier).toBe(2024);
    expect(exercicesAttendus({})).toEqual({ dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] });
  });
});

describe("comptes publics repris à l'ouverture du dossier", () => {
  it("2019, 2021, 2024 → 2024 seul (2022 et 2023 non publiés)", () => expect(anneesAReprendre([2019, 2021, 2024])).toEqual([2024]));
  it("2022, 2023, 2024 → les trois", () => expect(anneesAReprendre([2024, 2022, 2023])).toEqual([2022, 2023, 2024]));
  it("2020, 2021, 2023, 2024 → 2023 et 2024", () => expect(anneesAReprendre([2020, 2021, 2023, 2024])).toEqual([2023, 2024]));
  it("rien → rien", () => expect(anneesAReprendre([])).toEqual([]));
});
