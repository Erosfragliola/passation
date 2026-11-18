// FIN-04 (audit du 18/11/2026) : les réglages hors bornes sont refusés avec un message, jamais corrigés en silence.
// Avant le correctif, une décote de −150 % donnait une valeur des titres négative (−840 000 €).
import { describe, it, expect } from "vitest";
import { erreursEtape, erreursReponses } from "../src/valuation/validation.js";
import { assemblerEntree } from "../src/valuation/entree.js";
import { valorisationApprofondie } from "../src/valuation/approfondie.js";
import HYP from "../src/data/hypotheses.json";

const complet = Object.fromEntries(Object.entries({
  chiffre_affaires: 2_000_000, achats_consommes: 800_000, charges_externes: 500_000, impots_taxes: 0, charges_personnel: 400_000,
  stocks: 0, creances_clients: 0, tresorerie: 0, capitaux_propres: 100_000, emprunts: 0, dettes_fournisseurs: 0, dettes_fiscales_sociales: 0,
}).map(([k, v]) => [k, { valeur: v, valide: true }]));

describe("validation des réglages (FIN-04)", () => {
  it("valeurs dans les bornes : aucune erreur", () => {
    expect(erreursEtape("reglages", { prime_taille: 0.03, poids_multiples: 0.6, croissance_terminale: 0.02, decotes: [{ cle: "dependance_dirigeant", pct: -0.1 }, { cle: "recurrence", pct: 0.15 }] }, HYP)).toEqual([]);
    expect(erreursEtape("perspectives", { croissance: 0.05, marge_ebe: 0.12, investissements_pct: 0.03 }, HYP)).toEqual([]);
  });
  it("bornes incluses, valeurs absentes ignorées", () => {
    expect(erreursEtape("reglages", { poids_multiples: 1, prime_taille: 0, decotes: [{ cle: "taille", pct: -0.3 }] }, HYP)).toEqual([]);
    expect(erreursEtape("reglages", { prime_taille: null, croissance_terminale: "" }, HYP)).toEqual([]);
  });
  it("décote de −150 % refusée (bornes du facteur : −30 % à 0 %)", () => {
    const e = erreursEtape("reglages", { decotes: [{ cle: "taille", pct: -1.5 }] }, HYP);
    expect(e).toHaveLength(1);
    expect(e[0].message).toMatch(/−?-?150 %.*hors des bornes.*-30 %.*0 %/);
  });
  it("poids de 300 % refusé ; décote inconnue refusée ; prime saisie en % (3 au lieu de 0,03) refusée", () => {
    expect(erreursEtape("reglages", { poids_multiples: 3 }, HYP)[0].champ).toBe("reglages.poids_multiples");
    expect(erreursEtape("reglages", { decotes: [{ cle: "inventee", pct: 0.1 }] }, HYP)[0].message).toMatch(/inconnue/);
    expect(erreursEtape("reglages", { prime_taille: 3 }, HYP)[0].message).toMatch(/fraction/);
  });
  it("texte au lieu d'un nombre refusé ; montant négatif refusé là où il n'a pas de sens", () => {
    expect(erreursEtape("perspectives", { croissance: "beaucoup" }, HYP)[0].message).toMatch(/n'est pas un nombre/);
    expect(erreursEtape("bilan", { credit_bail_restant: -10_000 }, HYP)[0].message).toMatch(/négatif/);
    expect(erreursEtape("bilan", { plus_values_latentes: -10_000 }, HYP)).toEqual([]); // moins-value latente admise
  });
  it("réglages hors bornes déjà enregistrés : calcul refusé (statut explicite), pas de valeur corrigée en silence", () => {
    const { entree, H } = assemblerEntree({ section_naf: "C" }, { 2025: complet }, { reglages: { decotes: [{ cle: "taille", pct: -1.5 }], poids_multiples: 3 } }, HYP);
    const r = valorisationApprofondie(entree, H);
    expect(r.statut).toBe("hypotheses_invalides");
    expect(r.synthese).toBeUndefined();
    expect(r.alertes).toHaveLength(2);
    expect(erreursReponses({ reglages: { poids_multiples: 3 } }, HYP)).toHaveLength(1);
  });
});
