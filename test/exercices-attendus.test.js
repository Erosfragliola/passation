// Fiscal years requested from the owner (audit of 19/11/2026: the INPI published 2019, 2021 and 2024; the valuation page
// requested 11 required lines for 2019 and 2021, the file page "2 more fiscal years"). Fictitious data.
import { describe, it, expect } from "vitest";
import { CHAMPS, exercicesAttendus, anneesAReprendre } from "../public/js/champs-financiers.js";

const valide = (valeur) => ({ valeur, source: "dirigeant", valide: true });
/** Complete fiscal year: all required items approved (fictitious amounts). */
const complet = () => Object.fromEntries(CHAMPS.filter((c) => c.obligatoire).map((c) => [c.cle, valide(100_000)]));
const inpi = (ca) => ({ chiffre_affaires: { valeur: ca, source: "inpi", valide: false } });

describe("expected fiscal years", () => {
  it("the latest is required; the two previous ones optional; older isolated INPI years ignored", () => {
    expect(exercicesAttendus({ 2019: inpi(900_000), 2021: inpi(1_000_000), 2024: complet() })).toEqual({
      dernier: 2024, dernier_complet: true, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [2021, 2019],
    });
  });
  it("latest fiscal year known only from the public accounts: not confirmed", () => {
    expect(exercicesAttendus({ 2024: inpi(1_200_000) })).toMatchObject({ dernier: 2024, dernier_complet: false });
  });
  it("2024 and 2023 complete, 2022 missing: only 2022 is still offered", () => {
    expect(exercicesAttendus({ 2023: complet(), 2024: complet() }).recommandes_manquants).toEqual([2022]);
  });
  it("2022 started but incomplete: still offered", () => {
    expect(exercicesAttendus({ 2022: inpi(800_000), 2023: complet(), 2024: complet() }).recommandes_manquants).toEqual([2022]);
  });
  it("a fiscal year without any amount does not count; no fiscal year → latest unknown", () => {
    expect(exercicesAttendus({ 2025: {}, 2024: complet() }).dernier).toBe(2024);
    expect(exercicesAttendus({})).toEqual({ dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] });
  });
});

describe("public accounts reused when the file is opened", () => {
  it("2019, 2021, 2024 → 2024 only (2022 and 2023 not published)", () => expect(anneesAReprendre([2019, 2021, 2024])).toEqual([2024]));
  it("2022, 2023, 2024 → all three", () => expect(anneesAReprendre([2024, 2022, 2023])).toEqual([2022, 2023, 2024]));
  it("2020, 2021, 2023, 2024 → 2023 et 2024", () => expect(anneesAReprendre([2020, 2021, 2023, 2024])).toEqual([2023, 2024]));
  it("nothing → nothing", () => expect(anneesAReprendre([])).toEqual([]));
});
