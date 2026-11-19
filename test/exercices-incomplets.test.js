// FIN-01 (audit du 18/11/2026) : un exercice incomplet ne doit jamais entrer dans la valorisation avec des charges
// comptées à zéro. Avant le correctif, un exercice avec le seul CA (1 000 000 €) validé donnait un EBE normatif de
// 1 000 000 € et une valeur centrale de 5,6 M€. Valeurs attendues calculées à la main (détail en commentaire).
import { describe, it, expect } from "vitest";
import { assemblerEntree } from "../src/valuation/entree.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import { construireDatapack } from "../src/documents/datapack.js";
import HYP from "../src/data/hypotheses.json";

const valide = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { valeur: v, valide: true, source: "dirigeant" }]));

// Exercice 2025 complet, industrie (section C, multiples 4 / 5,6 / 7) :
// EBE = 1 000 000 − 400 000 − 200 000 − 20 000 − 230 000 = 150 000
// Dette nette = 120 000 − 80 000 = 40 000 ; BFR = 50 000 + 100 000 − 60 000 − 40 000 = 50 000 (écart au normatif : 0)
// Titres = 150 000 × (4 ; 5,6 ; 7) − 40 000 = 560 000 ; 800 000 ; 1 010 000
const complet2025 = valide({
  chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 200_000, impots_taxes: 20_000, charges_personnel: 230_000,
  stocks: 50_000, creances_clients: 100_000, tresorerie: 80_000, capitaux_propres: 300_000, emprunts: 120_000,
  dettes_fournisseurs: 60_000, dettes_fiscales_sociales: 40_000,
});
const caSeul = (ca) => valide({ chiffre_affaires: ca });
const calcul = (lignes) => {
  const { entree, H } = assemblerEntree({ section_naf: "C" }, lignes, {}, HYP);
  return { entree, H, r: valorisationApprofondie(entree, H) };
};
const proche = (a, b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("exercices incomplets (FIN-01)", () => {
  it("CA seul validé : aucun calcul, exercice signalé (et non plus 5,6 M€ de valeur)", () => {
    const { entree, r } = calcul({ 2025: caSeul(1_000_000) });
    expect(entree.exercices).toEqual([]);
    expect(entree.exercices_exclus.map((x) => x.annee)).toEqual([2025]);
    expect(r.statut).toBe("chiffres_absents");
    expect(r.alertes.join(" ")).toMatch(/2025 écarté/);
  });

  it("exercice complet seul : titres 560 000 / 800 000 / 1 010 000", () => {
    const { r } = calcul({ 2025: complet2025 });
    expect(r.ebe_normatif.valeur).toBe(150_000);
    expect(r.dette_nette.total).toBe(40_000);
    proche(r.multiples.titres.bas, 560_000);
    proche(r.multiples.titres.central, 800_000);
    proche(r.multiples.titres.haut, 1_010_000);
  });

  it("mixte (2025 complet + 2024 avec le seul CA) : 2024 écarté, mêmes résultats que 2025 seul", () => {
    const { entree, r } = calcul({ 2024: caSeul(900_000), 2025: complet2025 });
    expect(entree.exercices.map((x) => x.annee)).toEqual([2025]);
    expect(r.annees).toEqual([2025]);
    expect(r.ebe_normatif.valeur).toBe(150_000); // et non (150 000 + 900 000) / 2
    proche(r.multiples.titres.central, 800_000);
    expect(r.synthese.alertes.join(" ")).toMatch(/Exercice 2024 écarté/);
  });

  it("une ligne obligatoire non validée suffit à écarter l'exercice", () => {
    const l = structuredClone(complet2025);
    l.charges_externes.valide = false;
    const { entree } = calcul({ 2025: l });
    expect(entree.exercices_exclus).toEqual([{ annee: 2025, manquants: ["charges_externes"] }]);
  });

  it("valeur absente (null) ≠ vrai zéro : achats à 0 validés → exercice retenu, EBE 550 000", () => {
    const zero = structuredClone(complet2025);
    zero.achats_consommes.valeur = 0; // 1 000 000 − 0 − 200 000 − 20 000 − 230 000 = 550 000
    expect(calcul({ 2025: zero }).r.ebe_normatif.valeur).toBe(550_000);
    const absent = structuredClone(complet2025);
    absent.achats_consommes.valeur = null;
    expect(calcul({ 2025: absent }).entree.exercices).toEqual([]);
  });

  it("comptes publics : EBE publié validé à la place du détail des charges → retenu", () => {
    const l = structuredClone(complet2025);
    for (const k of ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"]) delete l[k];
    l.ebe = { valeur: 120_000, valide: true, source: "inpi" };
    const { r } = calcul({ 2025: l });
    expect(r.ebe_normatif.valeur).toBe(120_000);
  });

  it("moteur appelé directement avec un exercice partiel : écarté par le moteur lui-même", () => {
    const r = valorisationApprofondie({ secteur: "industrie", exercices: [{ annee: 2025, chiffre_affaires: 1_000_000 }] }, HYP);
    expect(r.statut).toBe("chiffres_absents");
    expect(r.alertes.join(" ")).toMatch(/EBE non déterminable/);
  });

  it("datapack (cas mixte) : seul 2025 figure, formules = moteur (EBE normatif 150 000, titres centraux 800 000)", () => {
    const { entree, H, r } = calcul({ 2024: caSeul(900_000), 2025: complet2025 });
    const wb = construireDatapack({ entreprise: { nom: "Exemple", siren: "000000000" }, entree, H, resultat: r, genereLe: new Date("2026-11-18") });
    const calc = wb.calculer();
    expect(calc.lire("1.1 Comptes", 2, 1)).toBe(2025);
    expect(calc.lire("1.1 Comptes", 2, 2)).not.toBe(2024);
    proche(calc.valeur("2.2 Multiples", "B3"), 150_000);
    proche(calc.valeur("2.2 Multiples", "C8"), 800_000);
  });
});
