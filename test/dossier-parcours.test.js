import { describe, it, expect } from "vitest";
import {
  etatParcours, ecranFinal, explicationEcart, alertesDirigeant, resumeValorisation, lectureMemo, listeAnnees, dateCourte,
  pointsACompleter, libellePoints, partiesTeaserVides, nomQuestion,
  NB_PIECES, ETAPES_PARCOURS, TEMPS, ETAPE_DE_L_ECRAN, etiquetteExpress, etiquetteTitres,
} from "../public/js/dossier-parcours.js";
import { NB_QUESTIONS, QUESTIONS } from "../public/js/parcours.js";
import LANDING from "../src/contenu/fr/accueil.json";

// Entirely fictitious files. The expected values are counted by hand from these data, not taken from the code.
// 24/11/2026 (part C): two stages, « Your valuation » (figures, adjustments, net debt and scope, value) then
// « Your memorandum » (company, photos and logo, management team, drafting and review).
const ID = "00000000-0000-4000-8000-000000000001";
const sp = (t) => String(t).replace(/\s/g, " "); // no-break spaces → spaces
const titreQ = (id) => QUESTIONS.find((q) => q.id === id).titre;
const exo = (x = {}) => ({ dernier: 2024, dernier_complet: false, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [], ...x });
const RIEN = { exercices_passes: false, retraitements: false, dette: false, validation: null, photos: false, equipe: false };
// 18/11/2026 at 10:00 Paris time (UTC+1) = 09:00 UTC: 1,794,960,000 s at midnight UTC + 9 × 3,600 = 1,794,992,400 s
const LE = 1_794_992_400;
const VALIDE = { exercices_passes: false, retraitements: true, dette: true, validation: { le: LE } };
const dossier = (x = {}) => ({
  id: ID, estimation: { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 310_000, haut: 520_000 }, checklist: [], documents: {},
  ...x,
  parcours: { exercices: exo(), exercices_complets: 0, questions: { faits: 0, total: NB_QUESTIONS, pct: 0, restantes: ["site", ...QUESTIONS.map((q) => q.id)] }, valorisation: null, ...(x.parcours || {}), etapes: { ...RIEN, ...(x.parcours?.etapes || {}) } },
});
const valo = { bas: 420_000, haut: 560_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -110_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
const tousDocs = { memo: { version: 1, le: LE }, teaser: { version: 1, le: LE }, datapack: { version: 2, le: LE } };
const section = (cle, court, x = {}) => ({ cle, court, titre: court, redigee: true, a_completer: [], ...x });
const CHECKLIST_COMPLETE = ["statuts", "kbis", "pv-ag", "capital", "liasses", "situation", "emprunts", "balances", "organigramme", "registre", "contrats-cles", "accords", "clients", "contrats", "cgv", "baux", "equipements", "marques", "assurances", "litiges", "autorisations"];
const memoComplet = { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe")] };
const trois = exo({ dernier_complet: true, recommandes_manquants: [] });
/** First stage done (3 fiscal years, adjustments, debt, approved value), memorandum not started. */
const valorise = (x = {}) => dossier({ ...x, parcours: { exercices: trois, exercices_complets: 3, valorisation: valo, ...(x.parcours || {}), etapes: { ...VALIDE, ...(x.parcours?.etapes || {}) } } });
const toutFait = (x = {}) => dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE, ...x,
  parcours: { exercices: trois, exercices_complets: 3, questions: { faits: NB_QUESTIONS, total: NB_QUESTIONS, pct: 100, restantes: [] }, valorisation: valo, ...(x.parcours || {}),
    etapes: { ...VALIDE, photos: true, equipe: true, ...(x.parcours?.etapes || {}) } } });

describe("constantes : deux temps, une seule liste d'étapes", () => {
  it("21 pièces attendues (4 juridiques, 4 financières, 4 sociales, 3 commerciales, 6 actifs et risques)", () => expect(NB_PIECES).toBe(21));
  it("8 étapes en deux temps, dans l'ordre, pour la page du dossier et le parcours guidé", () => {
    expect(TEMPS.map((x) => x.titre)).toEqual(["Votre valorisation", "Votre mémorandum"]);
    expect(ETAPES_PARCOURS.map(([, l]) => l)).toEqual(["Vos chiffres", "Retraitements", "Dette nette et périmètre", "Votre valeur",
      "Votre entreprise", "Photos et logo", "Équipe dirigeante", "Rédaction et relecture"]);
  });
  it("chaque écran du parcours guidé appartient à une étape de cette liste", () => {
    const cles = new Set(ETAPES_PARCOURS.map(([k]) => k));
    for (const e of Object.values(ETAPE_DE_L_ECRAN)) expect(cles.has(e)).toBe(true);
    expect(ETAPE_DE_L_ECRAN.exercices).toBe("chiffres"); // the two earlier fiscal years belong to « Your figures »
    expect(ETAPE_DE_L_ECRAN.site).toBe("entreprise");
    expect(ETAPE_DE_L_ECRAN.questions).toBe("entreprise");
    expect([ETAPE_DE_L_ECRAN.retraitements, ETAPE_DE_L_ECRAN.dette, ETAPE_DE_L_ECRAN.valeur]).toEqual(["retraitements", "dette", "valeur"]);
    expect(ETAPE_DE_L_ECRAN.photos).toBe("photos");
    expect(ETAPE_DE_L_ECRAN.equipe).toBe("equipe");
  });
  it("même étiquette pour l'estimation express sur la fiche de l'accueil et dans le dossier", () => {
    expect(findCle(LANDING, "fourchette_titre")).toBe(etiquetteExpress());
    expect(etiquetteExpress()).toBe("Valeur d'entreprise estimée");
    expect(etiquetteTitres()).toBe("Valeur de vos titres");
  });
  it("date en heure de Paris", () => {
    expect(dateCourte(LE)).toBe("18/11/2026");
    // 18/11 at 23:30 UTC (1,794,960,000 + 23.5 × 3,600 = 1,795,044,600): already 19/11 in Paris (00:30)
    expect(dateCourte(1_795_044_600)).toBe("19/11/2026");
    expect(dateCourte(null)).toBeNull();
  });
  it("années en clair", () => {
    expect(listeAnnees([2024])).toBe("2024");
    expect(listeAnnees([2024, 2023])).toBe("2023 et 2024");
    expect(listeAnnees([2024, 2022, 2023])).toBe("2022 à 2024");
    expect(listeAnnees([2024, 2019, 2021])).toBe("2019, 2021 et 2024");
  });
  it("une question se nomme par son titre ; le site aussi", () => {
    expect(nomQuestion("perspectives")).toBe(titreQ("perspectives"));
    expect(nomQuestion("site")).toBe("Votre site internet");
  });
});
function findCle(o, cle) { for (const [k, v] of Object.entries(o || {})) { if (k === cle) return v; if (v && typeof v === "object") { const r = findCle(v, cle); if (r !== undefined) return r; } } return undefined; }

describe("dossier tout juste créé (comptes publics 2024 seulement, rien de confirmé)", () => {
  const e = etatParcours(dossier());
  it("Vos chiffres en cours, le reste à venir ; les deux temps séparés", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["actuelle", "a-venir", "a-venir", "a-venir", "a-venir", "a-venir", "a-venir", "a-venir"]);
    expect(e.actuelle).toBe("chiffres");
    expect(e.temps.map((x) => [x.cle, x.etapes.length, x.fait])).toEqual([["valorisation", 4, false], ["memo", 4, false]]);
    expect(e.etapes.every((x) => x.href === null)).toBe(true);
  });
  it("À faire : le premier temps, dans l'ordre ; rien du mémorandum tant que les chiffres ne sont pas validés", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Confirmer l'exercice 2024", "Corriger vos comptes : rémunération, loyer, exceptionnels", "Indiquer votre dette nette et le périmètre de la cession"]);
    expect(e.taches.some((t) => ["questions", "photos", "equipe", "redaction"].includes(t.cle))).toBe(false);
  });
  it("action principale = première tâche, même libellé et même lien", () => {
    expect(e.action).toMatchObject({ texte: "Confirmer l'exercice 2024", href: `/espace/demarrer/?dossier=${ID}&etape=chiffres` });
  });
  it("1 (dossier ouvert) sur 9 = 11 %, pas prêt", () => {
    expect(e.avancement).toBe(11);
    expect(e.pret).toBe(false);
  });
  it("documents tous à venir, avec ce qui les débloque ; le mémorandum après la validation", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "a-venir", "a-venir", "a-venir"]);
    expect(e.documents[1].detail).toBe("Se débloque dès qu'un exercice est confirmé.");
    expect(e.documents[3].detail).toBe("Rédigé après la validation de vos chiffres");
    expect(e.documents.every((x) => x.actions.length === 0)).toBe(true);
  });
  it("fourchette express, étiquetée valeur d'entreprise, jamais de valeur centrale", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur d'entreprise estimée · comptes 2024", bas: 310_000, haut: 520_000, ecart: null });
    expect(e.valeur.base).toMatch(/avant dettes et trésorerie/);
    expect(e.valeur).not.toHaveProperty("central");
  });
  it("dépôt des pièces replié", () => expect(e.pieces).toEqual({ fournies: 0, total: 21, ouvert: false }));
  it("aucun exercice connu (comptes confidentiels) : « Confirmer votre dernier exercice », vers le début du parcours", () => {
    const f = etatParcours(dossier({ estimation: { statut: "comptes_absents" }, parcours: { exercices: { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] } } }));
    expect(f.taches[0]).toMatchObject({ titre: "Confirmer votre dernier exercice", href: `/espace/demarrer/?dossier=${ID}` });
    expect(f.valeur.bas).toBeNull();
    expect(f.valeur.lien.href).toBe(`/espace/demarrer/?dossier=${ID}`);
  });
});

describe("les trois derniers exercices sont demandés (défaut 8 du 24/11/2026)", () => {
  it("dernier exercice confirmé, deux précédents absents : « Vos chiffres » pas fini ; tâche indispensable, vers l'écran des exercices", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true }), exercices_complets: 1 } }));
    expect(e.fait.chiffres).toBe(false);
    expect(e.taches[0]).toMatchObject({ cle: "exercices", titre: "Ajouter vos exercices 2022 et 2023", href: `/espace/demarrer/?dossier=${ID}&etape=exercices` });
    expect(e.taches[0].facultatif).toBeUndefined();
  });
  it("un seul exercice précédent manque : il est seul nommé", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [2022] }) } }));
    expect(e.taches[0].titre).toBe("Ajouter vos exercices 2022");
  });
  it("passés en connaissance de cause : « Vos chiffres » fait, on continue (retraitements)", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true }), etapes: { exercices_passes: true } } }));
    expect(e.fait.chiffres).toBe(true);
    expect(e.actuelle).toBe("retraitements");
    expect(e.etapes[0]).toMatchObject({ etat: "fait", href: `/espace/demarrer/?dossier=${ID}&etape=chiffres` });
  });
});

describe("premier temps : retraitements, dette, valeur à valider", () => {
  it("valeur calculée mais pas validée : étape « Votre valeur » en cours, document à vérifier, en-tête qui le dit", () => {
    const e = etatParcours(dossier({ parcours: { exercices: trois, valorisation: valo, etapes: { retraitements: true, dette: true } } }));
    expect(e.actuelle).toBe("valeur");
    expect(e.taches[0]).toMatchObject({ cle: "valeur", titre: "Vérifier et valider votre valeur", href: `/espace/demarrer/?dossier=${ID}&etape=valeur` });
    expect(sp(e.taches[0].detail)).toBe("Calculée : 420 – 560 k€ ; à vérifier ligne par ligne");
    expect(e.documents[0]).toMatchObject({ etat: "a-relire", detail: "Calculée, à vérifier et valider" });
    expect(e.valeur.base).toMatch(/à valider/);
    // Audit of 25/11/2026: no « Vérifier et valider » link in the value card; the « Next step » card leads there
    expect(e.valeur.lien).toBeNull();
    expect(e.prochaine).toMatchObject({ cas: "reprendre", href: `/espace/demarrer/?dossier=${ID}&etape=valeur` });
    expect(e.taches.some((t) => t.cle === "questions")).toBe(false); // the memorandum waits for the approval
    // 1 + 3 steps done (figures, adjustments, debt) out of 9 = 44.4 → 44%
    expect(e.avancement).toBe(44);
  });
  it("le passage de l'estimation express à la valeur des titres est calculé (montré sur « Votre valeur » seulement)", () => {
    const e = etatParcours(valorise());
    // €310K – €520K → €420K – €560K; same EBITDA (€80K); net cash €110K
    expect(sp(e.valeur.ecart)).toBe("Votre fourchette passe de 310 – 520 k€ à 420 – 560 k€ : comptes 2024 confirmés et trésorerie nette de 110 k€ ajoutée.");
  });
});

// 24/11/2026: never a silent change of state. A file drafted before the two stages keeps its answers and gets a
// banner that leads to the screen concerned; figures changed after their approval are « to approve again ».
describe("bandeaux : nouvelle étape pour les anciens dossiers, chiffres modifiés depuis la validation", () => {
  it("dossier rédigé avant les deux temps (mémorandum et teaser, rien de validé) : bandeau « Nouvelle étape », vers le premier écran à faire", () => {
    const e = etatParcours(dossier({ documents: tousDocs, parcours: { exercices: trois, valorisation: valo, questions: { faits: NB_QUESTIONS, total: NB_QUESTIONS, pct: 100, restantes: [] } } }), memoComplet);
    expect(e.pret).toBe(false);
    expect(e.nouvelleEtape).toEqual({ genre: "nouvelle", texte: "Nouvelle étape : vérifiez et validez vos chiffres. Vos réponses sont conservées.",
      bouton: "Corriger vos comptes : rémunération, loyer, exceptionnels", href: `/espace/demarrer/?dossier=${ID}&etape=retraitements` });
    expect(e.action.href).toBe(e.nouvelleEtape.href);
  });
  it("nouveau dossier, ou dossier validé : pas de bandeau", () => {
    expect(etatParcours(dossier()).nouvelleEtape).toBeNull();
    expect(etatParcours(toutFait(), memoComplet).nouvelleEtape).toBeNull();
  });
  it("chiffres modifiés depuis la validation : « à revalider » partout, bandeau vers « Votre valeur », plus prêt", () => {
    const e = etatParcours(toutFait({ parcours: { etapes: { validation: { le: LE, a_jour: false } } } }), memoComplet);
    expect(e.fait.valeur).toBe(false);
    expect(e.pret).toBe(false);
    expect(e.taches[0]).toMatchObject({ cle: "valeur", titre: "Modifiés depuis votre validation : à revalider", detail: "Validés le 18/11/2026 ; vos chiffres ont changé depuis", href: `/espace/demarrer/?dossier=${ID}&etape=valeur` });
    expect(e.nouvelleEtape).toMatchObject({ genre: "revalider", href: `/espace/demarrer/?dossier=${ID}&etape=valeur` });
    expect(e.nouvelleEtape.texte).toMatch(/modifiés depuis votre validation du 18\/11\/2026/);
    expect(e.documents[0]).toMatchObject({ etat: "a-relire", detail: "Modifiés depuis votre validation : à revalider" });
  });
  it("validation à jour : rien de signalé", () => {
    const e = etatParcours(toutFait({ parcours: { etapes: { validation: { le: LE, a_jour: true } } } }), memoComplet);
    expect([e.pret, e.nouvelleEtape]).toEqual([true, null]);
  });
});

describe("second temps : le mémorandum, après la validation des chiffres", () => {
  const restantes = ["histoire", "equipe", "activite", "clients", "perspectives"];
  const e = etatParcours(valorise({ checklist: CHECKLIST_COMPLETE.slice(0, 8), parcours: { questions: { faits: 3, total: NB_QUESTIONS, pct: 38, restantes } } }));
  it("premier temps coché, « Votre entreprise » en cours", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "fait", "fait", "actuelle", "a-venir", "a-venir", "a-venir"]);
    expect(e.valorisationFaite).toBe(true);
    expect(e.etapes[3].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=valeur`);
  });
  it("les questions restantes sont nommées", () => {
    expect(e.taches[0].titre).toBe("Répondre aux 5 dernières questions");
    expect(e.taches[0].detail).toBe(`Restent : ${restantes.map((id) => `« ${titreQ(id)} »`).join(", ")}`);
    expect(e.questions).toMatchObject({ faits: 3, total: NB_QUESTIONS, restantes: 5 });
  });
  it("une seule question restante : nommée (défaut 9 du 24/11/2026), même texte pour l'action", () => {
    const f = etatParcours(valorise({ parcours: { questions: { faits: NB_QUESTIONS - 1, total: NB_QUESTIONS, pct: 88, restantes: ["perspectives"] } } }));
    expect(f.taches[0].titre).toBe(`Répondre à la question « ${titreQ("perspectives")} »`);
    expect(f.action.texte).toBe(f.taches[0].titre);
  });
  it("questions faites : photos et logo, puis équipe, puis rédaction", () => {
    const f = etatParcours(valorise({ parcours: { questions: { faits: NB_QUESTIONS, total: NB_QUESTIONS, pct: 100, restantes: [] } } }));
    expect(f.taches.map((t) => t.cle)).toEqual(["photos", "equipe", "redaction"]);
    expect(f.taches[0].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=photos`);
    // 1 + 5 steps out of 9 = 66.7 → 67%
    expect(f.avancement).toBe(67);
  });
  it("sous 40 % de réponses, la rédaction n'est pas proposée", () => {
    const f = etatParcours(valorise({ parcours: { questions: { faits: 2, total: NB_QUESTIONS, pct: 25, restantes: ["a", "b", "c", "d", "e", "f"] }, etapes: { photos: true, equipe: true } } }));
    expect(f.taches.some((t) => t.cle === "redaction")).toBe(false);
  });
});

describe("dossier rédigé, prêt, avec des recommandations facultatives", () => {
  const d = toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 17), parcours: { valorisation_le: LE } });
  const memo = { photos: [], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée du responsable d'atelier"] }), section("marche", "Marché")] };
  const e = etatParcours(d, memo);
  it("les huit étapes cochées ; prêt et 100 %", () => {
    expect(e.etapes.every((x) => x.etat === "fait")).toBe(true);
    expect(e.etapes[7].href).toBe(`/espace/documents/memo/?dossier=${ID}`);
    expect(e.pret).toBe(true);
    expect(e.avancement).toBe(100);
  });
  it("À faire : photo (0 photo), 2 points du chapitre Équipe, 21 − 17 = 4 pièces, tous facultatifs", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Ajouter une photo de l'atelier ou des produits", "Compléter 2 points du mémorandum", "Déposer 4 pièces manquantes"]);
    expect(e.taches.every((t) => t.facultatif)).toBe(true);
    expect(e.taches[1].detail).toBe("Indiqués « À compléter » : « Équipe »");
    expect(e.taches[1].href).toBe(`/espace/documents/memo/?dossier=${ID}#section-organisation`);
    expect(e.taches[0].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=photos`);
  });
  it("action principale : dossier prêt, tâches toutes facultatives → « Relire et envoyer votre dossier » (écran final)", () => {
    expect(e.action).toMatchObject({ texte: "Relire et envoyer votre dossier", bouton: "Relire et envoyer", href: `/espace/demarrer/?dossier=${ID}&etape=pret`, cle: "relecture" });
    expect(e.secondaires.map((x) => x.titre)).toEqual(["Ajouter une photo de l'atelier ou des produits", "Compléter 2 points du mémorandum"]); // 2 at most
  });
  it("mémorandum à relire, les trois autres prêts, avec leurs dates", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["pret", "pret", "pret", "a-relire"]);
    expect(e.documents[3].detail).toBe("Rédigé le 18/11/2026 · 2 points à compléter");
    expect(e.documents[1].detail).toBe("Mis à jour le 18/11/2026 · version 2");
    expect(e.documents[0].detail).toBe("Validée le 18/11/2026");
    expect(e.documents[3].actions.map((a) => a.href)).toEqual([`/espace/documents/memo/?dossier=${ID}`, `/espace/documents/memo/?dossier=${ID}&imprimer=1`]);
  });
  it("valeur des titres, fondée sur les multiples seuls, sans DCF ni pondération", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur de vos titres", bas: 420_000, haut: 560_000, base: "Multiples d'EBE de votre secteur, après dettes et trésorerie." });
    expect(e.valeur.base).not.toMatch(/DCF|pondér|méthodes/);
    expect(e.valeur).not.toHaveProperty("central");
  });
  it("écran final : « prêt », avec exactement les mêmes tâches, présentées comme facultatives", () => {
    const f = ecranFinal(e);
    expect(f.titre).toBe("Votre dossier est prêt");
    expect(f.resteTitre).toBe("Pour aller plus loin (facultatif)");
    expect(f.reste).toBe(e.taches);
  });
  it("chapitres non rédigés : pas prêt (99 % au plus), ce qui reste est nommé, la même liste que la page du dossier", () => {
    const f = etatParcours(d, { photos: [{}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] });
    expect(f.pret).toBe(false);
    expect(f.etapes[7].etat).toBe("actuelle");
    // 1 + 7 steps out of 9 = 88.9 → 89%
    expect(f.avancement).toBe(89);
    expect(f.taches[0]).toMatchObject({ titre: "Rédiger 2 chapitres du mémorandum", detail: "Chapitres : Marché, Clients" });
    const final = ecranFinal(f);
    expect(final.titre).toBe("Votre dossier est rédigé : il reste 1 étape");
    expect(final.aide).toBe("Prochaine étape : Rédiger 2 chapitres du mémorandum.");
    expect(final.reste.map((t) => t.titre)).toEqual(f.taches.map((t) => t.titre));
  });
  it("trois tâches au plus", () => {
    const f = etatParcours(toutFait({ parcours: { questions: { faits: NB_QUESTIONS - 1, total: NB_QUESTIONS, pct: 88, restantes: ["perspectives"] } } }), { photos: [], sections: [section("marche", "Marché", { redigee: false, a_completer: ["Taille du marché"] })] });
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "chapitres", "photo"]);
  });
});

// Defect 9 of 24/11/2026: « Your file is drafted », « 99% of the flow » and « Answer the last question »
describe("un seul état pour le parcours guidé et la page du dossier ; l'écran final ne se contredit pas", () => {
  it("rédigé mais une question restante : ni prêt ni 100 %, la question nommée des deux côtés", () => {
    const e = etatParcours(toutFait({ parcours: { questions: { faits: NB_QUESTIONS - 1, total: NB_QUESTIONS, pct: 88, restantes: ["perspectives"] } } }), memoComplet);
    expect(e.pret).toBe(false);
    // 1 + 7 steps + 0.88 (questions pro rata) = 8.88 out of 9 = 98.7 → 99% (never 100 until it is ready)
    expect(e.avancement).toBe(99);
    const f = ecranFinal(e);
    const attendu = `Répondre à la question « ${titreQ("perspectives")} »`;
    expect(f.titre).toBe("Votre dossier est rédigé : il reste 1 étape");
    expect(f.aide).toBe(`Prochaine étape : ${attendu}.`);
    expect(f.reste[0].titre).toBe(attendu);
    expect(e.action.texte).toBe(attendu);
    expect(`${f.titre} ${f.aide}`).not.toMatch(/dernière question/);
  });
  it("tout fait : 100 % et « prêt » des deux côtés", () => {
    const e = etatParcours(toutFait(), memoComplet);
    expect([e.pret, e.avancement, ecranFinal(e).titre]).toEqual([true, 100, "Votre dossier est prêt"]);
  });
  it("aucune tâche : « Relire et envoyer votre dossier », dépôt replié", () => {
    const e = etatParcours(toutFait(), memoComplet);
    expect(e.taches).toEqual([]);
    expect(e.action).toMatchObject({ texte: "Relire et envoyer votre dossier", href: `/espace/demarrer/?dossier=${ID}&etape=pret` });
    expect(e.pieces).toEqual({ fournies: 21, total: 21, ouvert: false });
    expect(ecranFinal(e).resteTitre).toBeNull();
  });
  it("s'il ne manque que des pièces (facultatif) : le dépôt s'ouvre de lui-même, le bouton principal reste « Relire et envoyer »", () => {
    const f = etatParcours(toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 20) }), memoComplet);
    expect(f.taches.map((t) => t.titre)).toEqual(["Déposer 1 pièce manquante"]);
    expect(f.action).toMatchObject({ texte: "Relire et envoyer votre dossier", cle: "relecture", pieces: false });
    expect(f.pieces.ouvert).toBe(true);
  });
  it("une clé de checklist inconnue n'est pas comptée", () => {
    expect(etatParcours(dossier({ checklist: ["statuts", "inconnue"] })).pieces.fournies).toBe(1);
  });
  it("teaser manquant : « Terminer la rédaction », vers l'étape Rédaction du parcours guidé", () => {
    const e = etatParcours(toutFait({ documents: { memo: tousDocs.memo, datapack: tousDocs.datapack } }), memoComplet);
    expect(e.pret).toBe(false);
    expect(e.taches[0]).toMatchObject({ titre: "Terminer la rédaction", href: `/espace/demarrer/?dossier=${ID}&etape=redaction` });
  });
  it.each([
    ["nouveau", dossier(), null],
    ["exercices à ajouter", dossier({ parcours: { exercices: exo({ dernier_complet: true }) } }), null],
    ["valeur à valider", dossier({ parcours: { exercices: trois, valorisation: valo, etapes: { retraitements: true, dette: true } } }), null],
    ["mémorandum à moitié", valorise({ parcours: { questions: { faits: 3, total: NB_QUESTIONS, pct: 38, restantes: ["a"] } } }), null],
    ["teaser manquant", toutFait({ documents: { memo: tousDocs.memo, datapack: tousDocs.datapack } }), memoComplet],
    ["prêt avec recommandations", toutFait({ checklist: [] }), { photos: [], sections: [section("a", "A", { a_completer: ["x"] })] }],
  ])("prochaine action = première tâche indispensable, sinon « Relire et envoyer » (%s)", (_, d, memo) => {
    const e = etatParcours(d, memo);
    expect(e.taches.length).toBeGreaterThan(0);
    const indispensable = e.taches.find((x) => !x.facultatif);
    expect(e.action.texte).toBe(indispensable ? indispensable.titre : "Relire et envoyer votre dossier");
    expect(e.action.href).toBe(indispensable ? indispensable.href : `/espace/demarrer/?dossier=${ID}&etape=pret`);
    expect(new Set(e.taches.filter((x) => x.facultatif).map((x) => x.cle)).has(e.action.cle)).toBe(false);
    expect(e.secondaires.length).toBeLessThanOrEqual(2);
  });
});

describe("explication de l'écart entre l'estimation express et la valorisation", () => {
  const est = { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 290_000, haut: 490_000 };
  it("trésorerie nette ajoutée : 290 + 260 = 550 ; 490 + 260 = 750", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -260_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart(est, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et trésorerie nette de 260 k€ ajoutée.");
  });
  it("EBE retraité, décotes, dettes et fonds de roulement : chaque cause nommée avec son montant", () => {
    // Quick: EBITDA €100K × 4 to 6 = €400K – €600K. Detailed: normalized EBITDA €120K × 4 to 6 × 0.9 − €50K − €20K
    //   low = 432 − 70 = €362K → « 360 »; high = 648 − 70 = €578K → « 580 »
    const e2 = { ...est, agregat: 100_000, bas: 400_000, haut: 600_000 };
    const v = { bas: 362_000, haut: 578_000, annees: [2022, 2023, 2024], ebe_normatif: 120_000, dette_nette: 50_000, facteur_decotes: 0.9, ecart_bfr: -20_000, hors_exploitation: 0 };
    expect(sp(explicationEcart(e2, v))).toBe("Votre fourchette passe de 400 – 600 k€ à 360 – 580 k€ : comptes 2022 à 2024 confirmés, excédent brut d'exploitation (EBE) retenu de 120 k€ au lieu de 100 k€, décotes de 10 % appliquées, dettes nettes de 50 k€ déduites et besoin en fonds de roulement inférieur à la normale : −20 k€.");
  });
  it("express calculée sur le chiffre d'affaires (EBE négatif) : dit simplement que l'EBE est maintenant utilisé", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 120_000, dette_nette: 0, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart({ ...est, methode: "multiple_ca", agregat: 2_000_000 }, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et calcul sur l'excédent brut d'exploitation (EBE) au lieu du chiffre d'affaires.");
  });
  it("même fourchette affichée, ou estimation express absente : pas de phrase", () => {
    expect(explicationEcart(est, { bas: 291_000, haut: 488_000, annees: [2024] })).toBeNull(); // €290K – €490K on both sides
    expect(explicationEcart({ statut: "comptes_absents" }, { bas: 1, haut: 2 })).toBeNull();
    expect(explicationEcart(est, null)).toBeNull();
  });
});

describe("valorisation affichée au dirigeant", () => {
  it("résumé du moteur : fourchette et ce qui l'explique, sans valeur centrale", () => {
    const r = { annees: [2024], synthese: { bas: 1, central: 2, haut: 3, plancher_ancc: 4 }, ebe_normatif: { valeur: 5 }, dette_nette: { total: -6 }, pont_titres: { facteur_decotes: 0.95, ecart_bfr: 7, hors_exploitation: 0 } };
    expect(resumeValorisation(r)).toEqual({ bas: 1, haut: 3, plancher_ancc: 4, annees: [2024], ebe_normatif: 5, dette_nette: -6, facteur_decotes: 0.95, ecart_bfr: 7, hors_exploitation: 0 });
    expect(resumeValorisation({ synthese: { bas: null, haut: null } })).toBeNull();
  });
  it("alertes : celles des flux actualisés retirées, celle de la valeur centrale reformulée sur la fourchette", () => {
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

describe("lecture du mémorandum", () => {
  it("compte chapitres non rédigés, éléments à compléter et photos", () => {
    const l = lectureMemo({ photos: [{}], sections: [section("a", "A", { redigee: false }), section("b", "B", { a_completer: ["x", "y"] }), section("c", "C", { a_completer: ["z"] })] });
    expect(l.nonRedigees.map((s) => s.cle)).toEqual(["a"]);
    expect(l.nbACompleter).toBe(3);
    expect(l.photos).toBe(1);
  });
  it("mémorandum absent → null", () => expect(lectureMemo(null)).toBeNull());
});

// PR #14 (audit, points 15 and 16): an empty document is not « ready »; a single count of the points to complete.
describe("teaser et mémorandum vides ou incomplets", () => {
  const teaser = (...contenus) => ({ teaser: { sections: ["accroche", "activite", "chiffres", "atouts", "operation"].map((cle, i) => ({ cle, titre: cle, contenu: contenus[i] ?? "" })) } });
  const plein = teaser("Texte", "Texte", "Texte", "Texte", "Texte");
  it("teaser aux 5 parties vides → incomplet, 5 parties sur 5 à rédiger, action Rédiger", () => {
    const e = etatParcours(toutFait(), memoComplet, teaser());
    expect(e.documents[2]).toMatchObject({ etat: "incomplet", detail: "5 parties sur 5 à rédiger" });
    expect(e.documents[2].actions).toEqual([{ libelle: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}`, principal: true }]);
  });
  it("une partie « À compléter » et une partie d'espaces comptent comme vides : 2 sur 5", () => {
    expect(etatParcours(toutFait(), memoComplet, teaser("Texte", "À compléter", "   ", "Texte", "Texte")).documents[2].detail).toBe("2 parties sur 5 à rédiger");
  });
  it("teaser aux 5 parties rédigées → prêt, avec « Télécharger en PDF »", () => {
    const d = etatParcours(toutFait(), memoComplet, plein).documents[2];
    expect(d.etat).toBe("pret");
    expect(d.actions.map((a) => a.libelle)).toEqual(["Ouvrir", "Télécharger en PDF"]);
  });
  it("teaser incomplet : tâche « Rédiger 2 parties du teaser », action principale identique, dossier pas « prêt »", () => {
    const e = etatParcours(toutFait(), memoComplet, teaser("Texte", "Texte", "Texte", "", ""));
    expect(e.taches[0]).toEqual({ cle: "teaser", titre: "Rédiger 2 parties du teaser", detail: "Parties vides : atouts, operation", action: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}` });
    expect(e.action.texte).toBe("Rédiger 2 parties du teaser");
    expect(e.pret).toBe(false);
  });
  it("mémorandum créé mais 2 chapitres sur 3 non rédigés → incomplet, pas « à relire »", () => {
    const e = etatParcours(toutFait(), { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] }, plein);
    expect(e.documents[3]).toMatchObject({ etat: "incomplet", detail: "2 chapitres sur 3 à rédiger" });
  });
  it("teaser non lu (null) : pas de faux « incomplet »", () => expect(etatParcours(toutFait(), memoComplet, null).documents[2].etat).toBe("pret"));
  it("partiesTeaserVides : rien à lire → aucune partie", () => expect(partiesTeaserVides(null)).toEqual([]));
});

describe("décompte unique des points à compléter", () => {
  // 2 points in « Team » + 1 in « Market » = 3, each counted once
  const memo = { sections: [section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée"] }), section("marche", "Marché", { a_completer: ["Taille du marché"] }), section("synthese", "Synthèse")] };
  it("liste « chapitre : point », dans l'ordre des chapitres", () => {
    expect(pointsACompleter(memo)).toEqual(["Équipe : Nombre de salariés", "Équipe : Date d'arrivée", "Marché : Taille du marché"]);
  });
  it("même nombre pour la page du dossier (lectureMemo) et les tâches", () => expect(lectureMemo(memo).nbACompleter).toBe(pointsACompleter(memo).length));
  it("même formulation", () => { expect(libellePoints(1)).toBe("1 point à compléter"); expect(libellePoints(4)).toBe("4 points à compléter"); });
  it("47 points : même nombre dans le document, la tâche et l'écran final (une seule fonction de décompte)", () => {
    const memo47 = { photos: [{}, {}], sections: [section("synthese", "Synthèse", { a_completer: Array.from({ length: 40 }, (_, k) => `p${k}`) }), section("marche", "Marché", { a_completer: Array.from({ length: 7 }, (_, k) => `m${k}`) })] };
    const e = etatParcours(toutFait({ checklist: CHECKLIST_COMPLETE }), memo47);
    expect(e.documents.find((x) => x.cle === "memo").badge).toBe("47 points à compléter");
    expect(e.taches.find((x) => x.cle === "a-completer").titre).toBe("Compléter 47 points du mémorandum");
    expect(ecranFinal(e).reste.find((x) => x.cle === "a-completer").titre).toBe("Compléter 47 points du mémorandum");
  });
});
