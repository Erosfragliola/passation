import { describe, it, expect } from "vitest";
import {
  etatParcours, ecranFinal, explicationEcart, alertesDirigeant, resumeValorisation, lectureMemo, listeAnnees, dateCourte,
  pointsACompleter, libellePoints, partiesTeaserVides,
  NB_PIECES, ETAPES_PARCOURS, ETAPE_DE_L_ECRAN, etiquetteExpress, etiquetteTitres,
} from "../public/js/dossier-parcours.js";
import { NB_QUESTIONS } from "../public/js/parcours.js";
import LANDING from "../src/contenu/fr/accueil.json";

// Entirely fictitious files. The expected values are counted by hand from these data, not taken from the code.
const ID = "00000000-0000-4000-8000-000000000001";
const sp = (t) => String(t).replace(/\s/g, " "); // no-break spaces → spaces
const exo = (x = {}) => ({ dernier: 2024, dernier_complet: false, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [], ...x });
const dossier = (x = {}) => ({
  id: ID, estimation: { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 310_000, haut: 520_000 }, checklist: [], documents: {},
  ...x,
  parcours: { exercices: exo(), exercices_complets: 0, questions: { faits: 0, total: 14, pct: 0 }, valorisation: null, ...(x.parcours || {}) },
});
const valo = { bas: 420_000, haut: 560_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -110_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
// 18/11/2026 at 10:00 Paris time (UTC+1) = 09:00 UTC: 1,794,960,000 s at midnight UTC + 9 × 3,600 = 1,794,992,400 s
const LE = 1_794_992_400;
const tousDocs = { memo: { version: 1, le: LE }, teaser: { version: 1, le: LE }, datapack: { version: 2, le: LE } };
const section = (cle, court, x = {}) => ({ cle, court, titre: court, redigee: true, a_completer: [], ...x });
const CHECKLIST_COMPLETE = ["statuts", "kbis", "pv-ag", "capital", "liasses", "situation", "emprunts", "balances", "organigramme", "registre", "contrats-cles", "accords", "clients", "contrats", "cgv", "baux", "equipements", "marques", "assurances", "litiges", "autorisations"];
const memoComplet = { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe")] };
const toutFait = (x = {}) => dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE, ...x,
  parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), exercices_complets: 3, questions: { faits: 14, total: 14, pct: 100 }, valorisation: valo, ...(x.parcours || {}) } });

describe("constants: a single list of steps", () => {
  it("21 expected documents (4 legal, 4 financial, 4 employment, 3 commercial, 6 assets and risks)", () => expect(NB_PIECES).toBe(21));
  it("5 steps, in order, for the file page and the guided steps", () => {
    expect(ETAPES_PARCOURS.map(([, l]) => l)).toEqual(["Estimation", "Vos chiffres", "Vos réponses", "Rédaction", "Relecture et envoi"]);
  });
  it('each screen of the guided steps belongs to a step of this list; the website is a question of "Your answers"', () => {
    const cles = new Set(ETAPES_PARCOURS.map(([k]) => k));
    expect(Object.keys(ETAPE_DE_L_ECRAN).sort()).toEqual(["chiffres", "comptes", "pret", "questions", "redaction", "saisie", "site"]);
    for (const e of Object.values(ETAPE_DE_L_ECRAN)) expect(cles.has(e)).toBe(true);
    expect(ETAPE_DE_L_ECRAN.site).toBe("reponses");
    expect(ETAPE_DE_L_ECRAN.comptes).toBe(ETAPE_DE_L_ECRAN.chiffres); // "Your accounts" and "Your figures" merged
    expect(ETAPE_DE_L_ECRAN.pret).toBe("relecture");
  });
  it("same label for the quick estimate on the home page card and in the file", () => {
    expect(findCle(LANDING, "fourchette_titre")).toBe(etiquetteExpress());
    expect(etiquetteExpress()).toBe("Valeur d'entreprise estimée");
    expect(etiquetteTitres()).toBe("Valeur de vos titres");
  });
  it("date in Paris time", () => {
    expect(dateCourte(LE)).toBe("18/11/2026");
    // 18/11 at 23:30 UTC (1,794,960,000 + 23.5 × 3,600 = 1,795,044,600): already 19/11 in Paris (00:30)
    expect(dateCourte(1_795_044_600)).toBe("19/11/2026");
    expect(dateCourte(null)).toBeNull();
  });
  it("years in words", () => {
    expect(listeAnnees([2024])).toBe("2024");
    expect(listeAnnees([2024, 2023])).toBe("2023 et 2024");
    expect(listeAnnees([2024, 2022, 2023])).toBe("2022 à 2024");
    expect(listeAnnees([2024, 2019, 2021])).toBe("2019, 2021 et 2024");
  });
});
function findCle(o, cle) { for (const [k, v] of Object.entries(o || {})) { if (k === cle) return v; if (v && typeof v === "object") { const r = findCle(v, cle); if (r !== undefined) return r; } } return undefined; }

describe("file just created (public accounts 2024 only, nothing confirmed)", () => {
  const e = etatParcours(dossier());
  it("Estimate done, Your figures in progress, the rest upcoming", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "actuelle", "a-venir", "a-venir", "a-venir"]);
    expect(e.actuelle).toBe("chiffres");
    expect(e.etapes[0].href).toBe(`/espace/valorisation/?dossier=${ID}#chiffres`);
    expect(e.etapes[1].href).toBeNull();
  });
  it("To do: the only required fiscal year, the 14 questions, the first documents", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Confirmer l'exercice 2024", `Répondre aux ${NB_QUESTIONS} questions`, "Déposer vos premières pièces"]);
    expect(e.taches[2].detail).toBe("0 pièce sur 21");
    expect(e.taches[2].pieces).toBe(true);
  });
  it("main action = first task, same label and same link", () => {
    expect(e.action).toMatchObject({ texte: "Confirmer l'exercice 2024", href: `/espace/demarrer/?dossier=${ID}&etape=chiffres` });
  });
  it("15 (file) + 10 (quick estimate) = 25%, not ready", () => {
    expect(e.avancement).toBe(25);
    expect(e.pret).toBe(false);
  });
  it("all documents upcoming, with what unlocks them; no action", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "a-venir", "a-venir", "a-venir"]);
    expect(e.documents[0].detail).toBe("Se débloque avec vos chiffres et vos réponses.");
    expect(e.documents[1].detail).toBe("Se débloque dès qu'un exercice est confirmé.");
    expect(e.documents.every((x) => x.actions.length === 0)).toBe(true);
  });
  it("quick range, labeled enterprise value, never a central value", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur d'entreprise estimée · comptes 2024", bas: 310_000, haut: 520_000, ecart: null });
    expect(e.valeur.base).toMatch(/avant dettes et trésorerie/);
    expect(e.valeur).not.toHaveProperty("central");
  });
  it("document upload collapsed", () => expect(e.pieces).toEqual({ fournies: 0, total: 21, ouvert: false }));
  it('no known fiscal year (confidential accounts): "Confirm your latest fiscal year", to the start of the flow', () => {
    const f = etatParcours(dossier({ estimation: { statut: "comptes_absents" }, parcours: { exercices: { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] } } }));
    expect(f.taches[0]).toMatchObject({ titre: "Confirmer votre dernier exercice", href: `/espace/demarrer/?dossier=${ID}` });
    expect(f.valeur.bas).toBeNull();
    expect(f.valeur.lien.href).toBe(`/espace/demarrer/?dossier=${ID}`);
    expect(f.avancement).toBe(15);
  });
});

describe("fiscal years: the latest required, the two previous ones optional", () => {
  it('latest fiscal year confirmed: "Your figures" ticked; 2023 and 2022 offered as optional, after what is required', () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true }), exercices_complets: 1 } }));
    expect(e.fait.chiffres).toBe(true);
    expect(e.etapes[1].etat).toBe("fait");
    expect(e.taches.map((t) => t.cle)).toEqual(["questions", "exercices", "pieces"]);
    expect(e.taches[1]).toMatchObject({ titre: "Ajouter 2023 et 2022 pour fiabiliser la fourchette (facultatif)", facultatif: true, href: `/espace/demarrer/?dossier=${ID}&etape=exercice` });
    // 15 + 10 + 25 = 50: previous fiscal years do not count in the percentage
    expect(e.avancement).toBe(50);
  });
  it("a single previous fiscal year is missing: only it is named", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [2022] }) } }));
    expect(e.taches.find((t) => t.cle === "exercices").titre).toBe("Ajouter 2022 pour fiabiliser la fourchette (facultatif)");
  });
  it('missing previous fiscal years block neither the percentage nor the "ready" status', () => {
    const e = etatParcours(toutFait({ parcours: { exercices: exo({ dernier_complet: true }) } }), memoComplet);
    expect(e.pret).toBe(true);
    expect(e.avancement).toBe(100);
    expect(e.taches.map((t) => t.cle)).toEqual(["exercices"]);
    expect(e.taches.every((t) => t.facultatif)).toBe(true);
  });
  it("latest fiscal year not confirmed: nothing about previous fiscal years while what is required is missing", () => {
    const e = etatParcours(dossier());
    expect(e.taches.some((t) => t.cle === "exercices")).toBe(false);
  });
});

describe("half-filled file: 2024 confirmed, 6 questions out of 14, 8 documents", () => {
  // 6 / 14 = 42,9 % → 43 %
  const d = dossier({ checklist: CHECKLIST_COMPLETE.slice(0, 8), parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), exercices_complets: 1, questions: { faits: 6, total: 14, pct: 43 } } });
  const e = etatParcours(d);
  it("Your answers in progress; the first two steps ticked and clickable", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "actuelle", "a-venir", "a-venir"]);
    expect(e.etapes[1].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=chiffres`);
  });
  it("To do: 14 − 6 = 8 last questions, drafting (43% ≥ 40%), 21 − 8 = 13 documents", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Répondre aux 8 dernières questions", "Lancer la rédaction", "Déposer 13 pièces manquantes"]);
    expect(e.taches[0].detail).toBe("6 sur 14 déjà faites");
    expect(e.taches[2].detail).toBe("8 pièces sur 21");
    expect(e.questions).toEqual({ faits: 6, total: 14, restantes: 8 });
  });
  it('main action = "Answer the last 8 questions", to the questions', () => {
    expect(e.action).toMatchObject({ texte: "Répondre aux 8 dernières questions", href: `/espace/demarrer/?dossier=${ID}&etape=questions` });
  });
  it("15 + 10 + 25 + 15 × 0,43 = 56,45 → 56 %", () => expect(e.avancement).toBe(56));
  it("only the datapack is ready (one confirmed fiscal year is enough), to download", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "pret", "a-venir", "a-venir"]);
    expect(e.documents[1].actions).toEqual([{ libelle: "Télécharger l'Excel", href: `/api/dossiers/${ID}/documents/datapack`, principal: true, telecharger: true }]);
    expect(e.documents[0].detail).toBe("Calculée à l'étape Rédaction, avec vos réponses.");
  });
  it("below 40% of answers (5 / 14 = 36%), drafting is not offered", () => {
    const f = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), questions: { faits: 5, total: 14, pct: 36 } } }));
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "pieces"]);
  });
  it("a single remaining question", () => {
    const f = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), questions: { faits: 13, total: 14, pct: 93 } } }));
    expect(f.taches[0].titre).toBe("Répondre à la dernière question");
    expect(f.action.texte).toBe("Répondre à la dernière question");
  });
});

describe("file drafted, ready, with optional recommendations", () => {
  const d = toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 17), parcours: { valorisation_le: LE } });
  const memo = { photos: [], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée du responsable d'atelier"] }), section("marche", "Marché")] };
  const e = etatParcours(d, memo);
  it("four steps ticked, Review and sending in progress; ready and 100%", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "fait", "fait", "actuelle"]);
    expect(e.etapes[3].href).toBe(`/espace/documents/memo/?dossier=${ID}`);
    expect(e.pret).toBe(true);
    expect(e.avancement).toBe(100);
  });
  it("To do: photo (0 photos), 2 points of the Team chapter, 21 − 17 = 4 documents, all optional", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Ajouter une photo de l'atelier ou des produits", "Compléter 2 points du mémorandum", "Déposer 4 pièces manquantes"]);
    expect(e.taches.every((t) => t.facultatif)).toBe(true);
    expect(e.taches[1].detail).toBe("Indiqués « À compléter » : « Équipe »");
    expect(e.taches[1].href).toBe(`/espace/documents/memo/?dossier=${ID}#section-organisation`);
    expect(e.taches[0].href).toBe(`/espace/documents/memo/?dossier=${ID}#donnees`);
  });
  it('main action = the first task (no more "review the memorandum" contradicted by the list)', () => {
    expect(e.action).toMatchObject({ texte: "Ajouter une photo de l'atelier ou des produits", href: `/espace/documents/memo/?dossier=${ID}#donnees` });
  });
  it("memorandum to review, the three others ready, with their dates", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["pret", "pret", "pret", "a-relire"]);
    expect(e.documents[3].detail).toBe("Rédigé le 18/11/2026 · 2 points à compléter");
    expect(e.documents[1].detail).toBe("Mis à jour le 18/11/2026 · version 2");
    expect(e.documents[0].detail).toBe("Mise à jour le 18/11/2026");
    expect(e.documents[3].actions.map((a) => a.href)).toEqual([`/espace/documents/memo/?dossier=${ID}`, `/espace/documents/memo/?dossier=${ID}&imprimer=1`]);
  });
  it("value of the shares, based on the multiples only, without DCF or weighting", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur de vos titres", bas: 420_000, haut: 560_000, base: "Fondée sur les multiples d'EBE (excédent brut d'exploitation) de votre secteur, après dettes et trésorerie." });
    expect(e.valeur.base).not.toMatch(/DCF|pondér|méthodes/);
    expect(e.valeur).not.toHaveProperty("central");
  });
  it("the gap with the quick estimate is explained by the calculated amounts", () => {
    // €310–520K → €420–560K; same EBITDA (€80K); net cash €110K
    expect(sp(e.valeur.ecart)).toBe("Votre fourchette passe de 310 – 520 k€ à 420 – 560 k€ : comptes 2024 confirmés et trésorerie nette de 110 k€ ajoutée.");
  });
  it('final screen: "ready", with exactly the same tasks, presented as optional', () => {
    const f = ecranFinal(e);
    expect(f.titre).toBe("Votre dossier est prêt");
    expect(f.resteTitre).toBe("Pour aller plus loin (facultatif)");
    expect(f.reste).toBe(e.taches);
  });
  it('undrafted chapters: not ready (99% at most), "drafted", and the same list as the file page', () => {
    const f = etatParcours(d, { photos: [{}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] });
    expect(f.pret).toBe(false);
    expect(f.etapes[3].etat).toBe("actuelle");
    // 15 + 10 + 25 + 15 + 15 + 20 = 100, capped at 99 until drafting is finished
    expect(f.avancement).toBe(99);
    expect(f.taches[0]).toMatchObject({ titre: "Rédiger 2 chapitres du mémorandum", detail: "Chapitres : Marché, Clients" });
    expect(f.taches[1].titre).toBe("Ajouter une photo de l'équipe ou du site");
    const final = ecranFinal(f);
    expect(final.titre).toBe("Votre dossier est rédigé");
    expect(final.resteTitre).toBe("Ce qui reste à faire");
    expect(final.reste.map((t) => t.titre)).toEqual(f.taches.map((t) => t.titre));
    expect(final.aide).toMatch(/99 %/);
  });
  it("three tasks at most", () => {
    const f = etatParcours(toutFait({ parcours: { questions: { faits: 13, total: 14, pct: 93 } } }), { photos: [], sections: [section("marche", "Marché", { redigee: false, a_completer: ["Taille du marché"] })] });
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "chapitres", "photo"]);
  });
});

// Audit of 19/11/2026: "Your file is ready" at the end of the flow, then 86%, "19 last questions" and
// "Confirm 2 more fiscal years" on the file page
describe("a single state for the guided steps and the file page", () => {
  it("drafted but two questions left: neither ready nor 100% on both sides, same count", () => {
    const e = etatParcours(toutFait({ parcours: { questions: { faits: 12, total: 14, pct: 86 } } }), memoComplet);
    expect(e.pret).toBe(false);
    // 15 + 10 + 25 + 15 × 0,86 + 15 + 20 = 97,9 → 98
    expect(e.avancement).toBe(98);
    const f = ecranFinal(e);
    expect(f.titre).toBe("Votre dossier est rédigé");
    expect(f.reste[0].titre).toBe("Répondre aux 2 dernières questions");
    expect(e.action.texte).toBe("Répondre aux 2 dernières questions");
  });
  it('everything required done: 100% and "ready" on both sides', () => {
    const e = etatParcours(toutFait(), memoComplet);
    expect([e.pret, e.avancement, ecranFinal(e).titre]).toEqual([true, 100, "Votre dossier est prêt"]);
  });
  it('no task: "Review and send your file", upload collapsed', () => {
    const e = etatParcours(toutFait(), memoComplet);
    expect(e.taches).toEqual([]);
    expect(e.action).toMatchObject({ texte: "Relire et envoyer votre dossier", href: `/espace/demarrer/?dossier=${ID}&etape=pret` });
    expect(e.pieces).toEqual({ fournies: 21, total: 21, ouvert: false });
    expect(ecranFinal(e).resteTitre).toBeNull();
  });
  it('without a valuation date: "Ready"', () => expect(etatParcours(toutFait(), memoComplet).documents[0].detail).toBe("Prête"));
  it("if only documents are missing: the main button opens the upload area, which also opens by itself", () => {
    const f = etatParcours(toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 20) }), memoComplet);
    expect(f.taches.map((t) => t.titre)).toEqual(["Déposer 1 pièce manquante"]);
    expect(f.action).toMatchObject({ texte: "Déposer 1 pièce manquante", href: "#checklist", pieces: true });
    expect(f.pieces.ouvert).toBe(true);
  });
  it("an unknown checklist key is not counted", () => {
    expect(etatParcours(dossier({ checklist: ["statuts", "inconnue"] })).pieces.fournies).toBe(1);
  });
  it.each([
    ["nouveau", dossier(), null],
    ["à moitié", dossier({ parcours: { exercices: exo({ dernier_complet: true }), questions: { faits: 6, total: 14, pct: 43 } } }), null],
    ["rédaction à lancer", dossier({ parcours: { exercices: exo({ dernier_complet: true }), questions: { faits: 14, total: 14, pct: 100 } } }), null],
    ["teaser manquant", toutFait({ documents: { memo: tousDocs.memo, datapack: tousDocs.datapack } }), memoComplet],
    ["prêt avec recommandations", toutFait({ checklist: [] }), { photos: [], sections: [section("a", "A", { a_completer: ["x"] })] }],
  ])("prochaine action = première tâche (%s)", (_, d, memo) => {
    const e = etatParcours(d, memo);
    expect(e.taches.length).toBeGreaterThan(0);
    expect(e.action.texte).toBe(e.taches[0].titre);
    expect(e.action.href).toBe(e.taches[0].href);
  });
  it('teaser missing: "Finish drafting", to the Drafting step of the guided steps', () => {
    const e = etatParcours(toutFait({ documents: { memo: tousDocs.memo, datapack: tousDocs.datapack } }), memoComplet);
    expect(e.pret).toBe(false);
    expect(e.taches[0]).toMatchObject({ titre: "Terminer la rédaction", href: `/espace/demarrer/?dossier=${ID}&etape=redaction` });
  });
});

describe("explanation of the gap between the quick estimate and the valuation", () => {
  const est = { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 290_000, haut: 490_000 };
  it("net cash added: 290 + 260 = 550; 490 + 260 = 750", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -260_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart(est, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et trésorerie nette de 260 k€ ajoutée.");
  });
  it("adjusted EBITDA, discounts, debts and working capital: each cause named with its amount", () => {
    // Quick: EBITDA €100K × 4 to 6 = €400–600K. Detailed: normalized EBITDA €120K × 4 to 6 × 0.9 − €50K − €20K
    //   low = 432 − 70 = €362K → "360"; high = 648 − 70 = €578K → "580"
    const e2 = { ...est, agregat: 100_000, bas: 400_000, haut: 600_000 };
    const v = { bas: 362_000, haut: 578_000, annees: [2022, 2023, 2024], ebe_normatif: 120_000, dette_nette: 50_000, facteur_decotes: 0.9, ecart_bfr: -20_000, hors_exploitation: 0 };
    expect(sp(explicationEcart(e2, v))).toBe("Votre fourchette passe de 400 – 600 k€ à 360 – 580 k€ : comptes 2022 à 2024 confirmés, excédent brut d'exploitation (EBE) retenu de 120 k€ au lieu de 100 k€, décotes de 10 % appliquées, dettes nettes de 50 k€ déduites et besoin en fonds de roulement inférieur à la normale : −20 k€.");
  });
  it("quick estimate calculated on revenue (negative EBITDA): simply says that EBITDA is now used", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 120_000, dette_nette: 0, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart({ ...est, methode: "multiple_ca", agregat: 2_000_000 }, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et calcul sur l'excédent brut d'exploitation (EBE) au lieu du chiffre d'affaires.");
  });
  it("same displayed range, or no quick estimate: no sentence", () => {
    expect(explicationEcart(est, { bas: 291_000, haut: 488_000, annees: [2024] })).toBeNull(); // €290–490K on both sides
    expect(explicationEcart({ statut: "comptes_absents" }, { bas: 1, haut: 2 })).toBeNull();
    expect(explicationEcart(est, null)).toBeNull();
  });
});

describe("valuation displayed to the owner", () => {
  it("engine summary: range and what explains it, without a central value", () => {
    const r = { annees: [2024], synthese: { bas: 1, central: 2, haut: 3, plancher_ancc: 4 }, ebe_normatif: { valeur: 5 }, dette_nette: { total: -6 }, pont_titres: { facteur_decotes: 0.95, ecart_bfr: 7, hors_exploitation: 0 } };
    expect(resumeValorisation(r)).toEqual({ bas: 1, haut: 3, plancher_ancc: 4, annees: [2024], ebe_normatif: 5, dette_nette: -6, facteur_decotes: 0.95, ecart_bfr: 7, hors_exploitation: 0 });
    expect(resumeValorisation({ synthese: { bas: null, haut: null } })).toBeNull();
  });
  it("alerts: those of the discounted cash flows removed, the central-value one reworded on the range", () => {
    expect(alertesDirigeant([
      "DCF à compléter : prime de taille.",
      "La valeur terminale représente plus de 80 % du DCF : résultat très sensible aux hypothèses de long terme.",
      "Synthèse sur les multiples. Le DCF est proposé en option : renseignez la prime de taille dans « Affiner » si votre conseil le souhaite.",
      "La valeur centrale est inférieure à l'actif net corrigé : l'ANCC sert de plancher de négociation.",
      "Exercices non consécutifs : les moyennes portent sur les exercices disponibles.",
    ])).toEqual([
      "Une partie de la fourchette est inférieure à l'actif net corrigé : celui-ci sert de plancher de négociation.",
      "Exercices non consécutifs : les moyennes portent sur les exercices disponibles.",
    ]);
  });
});

describe("reading the memorandum", () => {
  it("counts undrafted chapters, elements to complete and photos", () => {
    const l = lectureMemo({ photos: [{}], sections: [section("a", "A", { redigee: false }), section("b", "B", { a_completer: ["x", "y"] }), section("c", "C", { a_completer: ["z"] })] });
    expect(l.nonRedigees.map((s) => s.cle)).toEqual(["a"]);
    expect(l.nbACompleter).toBe(3);
    expect(l.photos).toBe(1);
  });
  it("memorandum missing → null", () => expect(lectureMemo(null)).toBeNull());
});

// PR #14 (audit, points 15 and 16), reinstated after the merge with PR #15: an empty document is not "ready";
// a single count of the points to complete.
describe("empty or incomplete teaser and memorandum", () => {
  const teaser = (...contenus) => ({ teaser: { sections: ["accroche", "activite", "chiffres", "atouts", "operation"].map((cle, i) => ({ cle, titre: cle, contenu: contenus[i] ?? "" })) } });
  const plein = teaser("Texte", "Texte", "Texte", "Texte", "Texte");
  it("teaser with 5 empty parts → incomplete, 5 parts out of 5 to draft, Draft action", () => {
    const e = etatParcours(toutFait(), memoComplet, teaser());
    expect(e.documents[2]).toMatchObject({ etat: "incomplet", detail: "5 parties sur 5 à rédiger" });
    expect(e.documents[2].actions).toEqual([{ libelle: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}`, principal: true }]);
  });
  it('an "À compléter" part and a part of spaces count as empty: 2 out of 5', () => {
    expect(etatParcours(toutFait(), memoComplet, teaser("Texte", "À compléter", "   ", "Texte", "Texte")).documents[2].detail).toBe("2 parties sur 5 à rédiger");
  });
  it('teaser with 5 drafted parts → ready, with "Download as PDF"', () => {
    const d = etatParcours(toutFait(), memoComplet, plein).documents[2];
    expect(d.etat).toBe("pret");
    expect(d.actions.map((a) => a.libelle)).toEqual(["Ouvrir", "Télécharger en PDF"]);
  });
  it('incomplete teaser: task "Draft 2 parts of the teaser", identical main action, file not "ready"', () => {
    const e = etatParcours(toutFait(), memoComplet, teaser("Texte", "Texte", "Texte", "", ""));
    expect(e.taches[0]).toEqual({ cle: "teaser", titre: "Rédiger 2 parties du teaser", detail: "Parties vides : atouts, operation", action: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}` });
    expect(e.action.texte).toBe("Rédiger 2 parties du teaser");
    expect(e.pret).toBe(false);
  });
  it('memorandum created but 2 chapters out of 3 undrafted → incomplete, not "to review"', () => {
    const e = etatParcours(toutFait(), { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] }, plein);
    expect(e.documents[3]).toMatchObject({ etat: "incomplet", detail: "2 chapitres sur 3 à rédiger" });
  });
  it('teaser not read (null): no false "incomplete"', () => expect(etatParcours(toutFait(), memoComplet, null).documents[2].etat).toBe("pret"));
  it("partiesTeaserVides: nothing to read → no part", () => expect(partiesTeaserVides(null)).toEqual([]));
});

describe("single count of the points to complete", () => {
  // 2 points in "Team" + 1 in "Market" = 3, each counted once
  const memo = { sections: [section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée"] }), section("marche", "Marché", { a_completer: ["Taille du marché"] }), section("synthese", "Synthèse")] };
  it('list "chapter: point", in the order of the chapters', () => {
    expect(pointsACompleter(memo)).toEqual(["Équipe : Nombre de salariés", "Équipe : Date d'arrivée", "Marché : Taille du marché"]);
  });
  it("same number for the file page (lectureMemo) and the tasks", () => expect(lectureMemo(memo).nbACompleter).toBe(pointsACompleter(memo).length));
  it("same wording", () => { expect(libellePoints(1)).toBe("1 point à compléter"); expect(libellePoints(4)).toBe("4 points à compléter"); });
});
