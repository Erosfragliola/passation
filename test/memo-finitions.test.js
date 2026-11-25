// Memorandum touch-ups of 25/11/2026: no page of requests to the owner in the document, summary without requests of its
// own, review corrections offered only when they can be applied, restatements justified from the owner's amounts, and
// a panel item when fewer than three fiscal years are presented. Expected values worked out by hand.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SECTIONS_MEMO, tableauEbeRetraite } from "../src/documents/memo.js";
import { pontEbe, ebeNormatif } from "../src/valuation/approfondie.js";
import { remarquesProposables } from "../src/routes/documents.js";
import { contenuRespecteConcision } from "../src/documents/concision.js";
import { ameliorations } from "../public/js/ameliorations.js";

const espaces = (s) => String(s).replace(/[  ]/g, " ");
const fichier = (chemin) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");

describe("no page of requests in the document", () => {
  it("the memorandum no longer builds an « Items to complete » page", () => {
    const js = fichier("../public/js/memo.js");
    expect(js).not.toMatch(/im-elements/);
    expect(js).not.toMatch(/memo\.js\.elements\./);
  });
  it("the summary has no request of its own (flag read by the memorandum route)", () => {
    const synthese = SECTIONS_MEMO.find((s) => s.cle === "synthese");
    expect(synthese.demandes).toBe(false);
    expect(synthese.consigne).toMatch(/laisse a_completer vide/);
    expect(SECTIONS_MEMO.filter((s) => s.demandes === false).map((s) => s.cle)).toEqual(["synthese"]);
  });
});

describe("review corrections offered only when they can be applied", () => {
  // Structured chapter: an introduction, then points « - **Title** : text » (240 characters at most per point)
  const point = "L'atelier travaille pour une clientèle de particuliers et d'entreprises de la région.";
  const contenu = `L'entreprise répare et entretient les véhicules de sa zone.\n\n- **Clientèle** : ${point}\n- **Atelier** : Un atelier équipé de deux cabines de peinture.`;
  const sections = [{ cle: "activite", contenu }];
  const remarque = (id, texte_propose, texte_actuel = point) => ({ id, section: "activite", type: "promotionnel", titre: "t", constat: "c", importance: "conseille", statut: null, correction: { texte_actuel, texte_propose } });

  it("the chapter of the example respects the lengths", () => expect(contenuRespecteConcision(contenu)).toBe(true));
  it("a short correction stays offered", () => {
    const r = remarquesProposables({ remarques: [remarque("r1", "L'atelier travaille pour des particuliers et des entreprises de la région.")] }, sections);
    expect(r.remarques[0].correction).not.toBeNull();
  });
  it("a correction that would make a point longer than 240 characters is not offered; the remark stays", () => {
    const long = `${point} ${"Cette clientèle fidèle revient régulièrement pour l'entretien et la carrosserie de ses véhicules. ".repeat(2)}`.trim();
    expect(long.length).toBeGreaterThan(240);
    const r = remarquesProposables({ remarques: [remarque("r1", long)] }, sections);
    expect(r.remarques).toHaveLength(1);
    expect(r.remarques[0].correction).toBeNull();
  });
  it("a correction whose passage changed is not offered", () => {
    const r = remarquesProposables({ remarques: [remarque("r1", "Autre texte.", "Un passage qui n'existe plus dans le chapitre.")] }, sections);
    expect(r.remarques[0].correction).toBeNull();
  });
  it("answered remarks and an empty review are left as they are", () => {
    const faite = { ...remarque("r1", "x"), statut: "corrigee" };
    expect(remarquesProposables({ remarques: [faite] }, sections).remarques[0]).toBe(faite);
    expect(remarquesProposables(null, sections)).toBeNull();
  });
});

describe("restatements justified from the owner's amounts", () => {
  // One fiscal year, as in the owner's file: EBITDA 1 645 000 − 600 000 − 300 000 − 30 000 − 489 000 = 226 000.
  // Owner's pay: 200 000 actual − 120 000 normalized = +80 000; rent: 60 000 paid − 48 000 market = +12 000.
  // Adjusted EBITDA: 226 000 + 80 000 + 12 000 = 318 000.
  const exercices = [{ annee: 2025, chiffre_affaires: 1_645_000, achats_consommes: 600_000, charges_externes: 300_000, impots_taxes: 30_000, charges_personnel: 489_000 }];
  const retraitements = { remuneration_dirigeant_reelle: 200_000, remuneration_normative: 120_000, loyer_paye: 60_000, loyer_marche: 48_000, exceptionnels: [] };
  const pont = pontEbe(exercices, retraitements);
  const t = tableauEbeRetraite({ exercices, retraitements }, { pont_ebe: pont, ebe_normatif: ebeNormatif(pont, "dernier") });

  it("bridge of the table", () => {
    expect(t.ebe_comptable).toEqual([226_000]);
    expect(t.retraitements.map((r) => r.valeurs[0])).toEqual([80_000, 12_000]);
    expect(t.ebe_retraite).toEqual([318_000]);
  });
  it("owner's pay and rent carry their basis, with the amounts entered", () => {
    expect(espaces(t.retraitements[0].justification)).toBe("Rémunération réelle du dirigeant, charges comprises : 200 k€ ; rémunération d'un dirigeant salarié qui le remplacerait : 120 k€ (montants déclarés par le dirigeant).");
    expect(espaces(t.retraitements[1].justification)).toBe("Loyer payé : 60 k€ ; loyer de marché pour des locaux comparables : 48 k€ (montants déclarés par le dirigeant).");
  });
  it("an exceptional item keeps the owner's own justification", () => {
    const r = { exceptionnels: [{ annee: 2025, libelle: "Litige", montant: 15_000, justification: "Non récurrent" }] };
    const p = pontEbe(exercices, r);
    const x = tableauEbeRetraite({ exercices, retraitements: r }, { pont_ebe: p });
    expect(x.retraitements[0].justification).toBe("Non récurrent");
  });
});

describe("panel: fewer than three fiscal years", () => {
  const etat = (annees) => ({ sections: [{ cle: "finances", redigee: true }], equipe: { personnes: [{ id: "p1" }] }, chiffres: { compte_resultat: { annees } } });
  const item = (annees) => ameliorations({ etat: etat(annees), reponses: {}, placement: { activite: ["x"], equipe: 0 } }).find((x) => x.id === "exercices");
  it("one fiscal year: « Add the previous fiscal years », essential, towards the figures", () => {
    expect(item([2025])).toMatchObject({ genre: "action", section: "finances", importance: "indispensable", action: "comptes" });
  });
  it("three fiscal years, or none yet: no item", () => {
    expect(item([2023, 2024, 2025])).toBeUndefined();
    expect(item([])).toBeUndefined();
  });
});
