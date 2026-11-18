// Datapack : les formules du classeur doivent redonner exactement les résultats du moteur (cas d'essai).
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { construireDatapack } from "../src/documents/datapack.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import { evaluer } from "../src/documents/formules.js";
import HYP from "../src/data/hypotheses.json";

const exercices = [
  { annee: 2023, chiffre_affaires: 2_000_000, autres_produits: 0, achats_consommes: 800_000, charges_externes: 300_000, impots_taxes: 40_000, charges_personnel: 600_000, dotations_amortissements: 60_000, stocks: 160_000, creances_clients: 340_000, dettes_fournisseurs: 210_000, dettes_fiscales_sociales: 130_000 },
  { annee: 2024, chiffre_affaires: 2_200_000, autres_produits: 0, achats_consommes: 880_000, charges_externes: 320_000, impots_taxes: 40_000, charges_personnel: 640_000, dotations_amortissements: 66_000, stocks: 180_000, creances_clients: 370_000, dettes_fournisseurs: 230_000, dettes_fiscales_sociales: 140_000 },
  { annee: 2025, chiffre_affaires: 2_400_000, autres_produits: 0, achats_consommes: 960_000, charges_externes: 340_000, impots_taxes: 40_000, charges_personnel: 680_000, dotations_amortissements: 72_000, stocks: 200_000, creances_clients: 400_000, dettes_fournisseurs: 250_000, dettes_fiscales_sociales: 150_000, tresorerie: 250_000, placements: 50_000, emprunts: 300_000, provisions_risques: 20_000, capitaux_propres: 900_000 },
];
// DCF activé à 40 % (option) : les formules du classeur couvrent les deux méthodes et la pondération
const base = {
  secteur: "industrie", exercices, ponderation: { multiples: 0.6, dcf: 0.4 },
  retraitements: { remuneration_dirigeant_reelle: 150_000, remuneration_normative: 100_000, loyer_paye: 60_000, loyer_marche: 48_000, exceptionnels: [{ annee: 2024, libelle: "Litige", montant: 20_000, justification: "Non récurrent" }] },
  complements: { comptes_courants_remboursables: 50_000, creances_douteuses: 10_000 },
  previsions: { croissance: 0.05, marge_ebe: 0.16, amortissements_pct: 0.03, investissements_pct: 0.03, bfr_jours: 30 },
  decotes: [{ cle: "dependance_dirigeant", pct: -0.1, justification: "x" }, { cle: "recurrence", pct: 0.05, justification: "y" }],
  primeTaille: 0.03, tauxReduit: false, modeEbe: "moyenne",
};
const entreprise = { nom: "Atelier Exemple", siren: "123456789", ville: "Lyon" };
function classeur(entree) {
  const resultat = valorisationApprofondie(entree, HYP);
  const wb = construireDatapack({ entreprise, entree, H: HYP, resultat, genereLe: new Date("2026-11-10") });
  return { wb, resultat, calc: wb.calculer() };
}
const proche = (a, b, tol = 0.01) => { expect(typeof a).toBe("number"); expect(Math.abs(a - b)).toBeLessThan(tol); };

describe("évaluateur de formules", () => {
  const lire = () => null;
  it("priorités, puissances, comparaisons, IF paresseux", () => {
    expect(evaluer("1+2*3^2", "F", lire)).toBe(19);
    expect(evaluer('IF(1>2,1/0,"ok")', "F", lire)).toBe("ok");
    expect(evaluer("AVERAGE(1,2,6)", "F", lire)).toBe(3);
    expect(() => evaluer("1/0", "F", lire)).toThrow("#DIV/0!");
  });
});

describe("datapack : formules = moteur", () => {
  it("9 onglets dans l'ordre du sommaire", () => {
    expect(classeur(base).wb.feuilles.map((f) => f.nom)).toEqual(["Couverture", "Comptes", "Retraitements", "Hypothèses", "Passage aux titres", "Multiples", "DCF", "ANCC", "Synthèse"]);
  });
  it("EBE normatif, dette nette, écart de BFR", () => {
    const { calc, resultat } = classeur(base);
    const ebeN = calc.lire("Retraitements", ...(() => { for (let r = 0; r < 40; r++) if (calc.lire("Retraitements", r, 0) === "EBE normatif") return [r, 1]; })());
    proche(ebeN, resultat.ebe_normatif.valeur);
    proche(calc.valeur("Passage aux titres", "B12"), 70_000);
    proche(calc.valeur("Passage aux titres", "B18"), resultat.bfr.ecart);
  });
  it("multiples, DCF (dont CMPC ± 1 pt et g ± 0,5 pt), ANCC, synthèse et sensibilités", () => {
    const { calc, resultat: r } = classeur(base);
    proche(calc.valeur("Multiples", "C8"), r.multiples.titres.central);
    proche(calc.valeur("Multiples", "B8"), r.multiples.titres.bas);
    proche(calc.valeur("DCF", "B8"), r.dcf.cmpc.valeur, 1e-12);
    proche(calc.valeur("DCF", "B27"), r.dcf.ve.central, 0.01);
    proche(calc.valeur("DCF", "B31"), r.dcf.titres.bas, 0.01);
    proche(calc.valeur("DCF", "D31"), r.dcf.titres.haut, 0.01);
    proche(calc.valeur("DCF", "B34"), r.sensibilites.croissance_terminale.moins_05pt, 0.01);
    proche(calc.valeur("DCF", "D34"), r.sensibilites.croissance_terminale.plus_05pt, 0.01);
    proche(calc.valeur("ANCC", "B8"), 890_000);
    proche(calc.valeur("Synthèse", "C11"), r.synthese.central, 0.01);
    proche(calc.valeur("Synthèse", "C11"), 2_244_253.18, 0.05); // référence indépendante (docs/valorisation-calculs.md)
    proche(calc.valeur("Synthèse", "B11"), r.synthese.bas, 0.01);
    proche(calc.valeur("Synthèse", "D11"), r.synthese.haut, 0.01);
    proche(calc.valeur("Synthèse", "B14"), r.sensibilites.multiple.moins);
  });
  it("taux réduit d'IS et EBE « dernier » : formules et moteur restent d'accord", () => {
    const { calc, resultat: r } = classeur({ ...base, tauxReduit: true, modeEbe: "dernier" });
    proche(calc.valeur("DCF", "B27"), r.dcf.ve.central, 0.01);
    proche(calc.valeur("Synthèse", "C11"), r.synthese.central, 0.01);
  });
  it("sans prime de taille : DCF « À compléter », synthèse sur les multiples seuls", () => {
    const { calc, resultat: r } = classeur({ ...base, primeTaille: null });
    expect(calc.valeur("DCF", "B8")).toBe("À compléter");
    expect(calc.valeur("Synthèse", "B9")).toBe(0);
    proche(calc.valeur("Synthèse", "C11"), r.synthese.central);
  });
  it("fichier .xlsx valide : archive avec classeur, styles, 9 feuilles, formules et valeurs en cache", () => {
    const { wb } = classeur(base);
    const zip = unzipSync(wb.octets());
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet9.xml"]));
    const synthese = strFromU8(zip["xl/worksheets/sheet9.xml"]);
    expect(synthese).toMatch(/<c r="C11" s="14"><f>[^<]+<\/f><v>2244253\.\d+<\/v><\/c>/);
    expect(strFromU8(zip["xl/workbook.xml"])).toContain('fullCalcOnLoad="1"');
  });
});
