import { describe, it, expect } from "vitest";
import {
  etatParcours, ecranFinal, explicationEcart, alertesDirigeant, resumeValorisation, lectureMemo, listeAnnees, dateCourte,
  NB_PIECES, ETAPES_PARCOURS, ETAPE_DE_L_ECRAN, ETIQUETTE_EXPRESS, ETIQUETTE_TITRES, pointsACompleter, libellePoints, partiesTeaserVides,
} from "../public/js/dossier-parcours.js";
import { NB_QUESTIONS } from "../public/js/parcours.js";
import LANDING from "../src/contenu/landing.json";

// Dossiers entièrement fictifs. Les valeurs attendues sont comptées à la main à partir de ces données, pas tirées du code.
const ID = "00000000-0000-4000-8000-000000000001";
const sp = (t) => String(t).replace(/\s/g, " "); // espaces insécables → espaces
const exo = (x = {}) => ({ dernier: 2024, dernier_complet: false, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [], ...x });
const dossier = (x = {}) => ({
  id: ID, estimation: { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 310_000, haut: 520_000 }, checklist: [], documents: {},
  ...x,
  parcours: { exercices: exo(), exercices_complets: 0, questions: { faits: 0, total: 14, pct: 0 }, valorisation: null, ...(x.parcours || {}) },
});
const valo = { bas: 420_000, haut: 560_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -110_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
// 18/11/2026 à 10:00 heure de Paris (UTC+1) = 09:00 UTC : 1 794 960 000 s à minuit UTC + 9 × 3 600 = 1 794 992 400 s
const LE = 1_794_992_400;
const tousDocs = { memo: { version: 1, le: LE }, teaser: { version: 1, le: LE }, datapack: { version: 2, le: LE } };
const section = (cle, court, x = {}) => ({ cle, court, titre: court, redigee: true, a_completer: [], ...x });
const CHECKLIST_COMPLETE = ["statuts", "kbis", "pv-ag", "capital", "liasses", "situation", "emprunts", "balances", "organigramme", "registre", "contrats-cles", "accords", "clients", "contrats", "cgv", "baux", "equipements", "marques", "assurances", "litiges", "autorisations"];
const memoComplet = { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe")] };
const toutFait = (x = {}) => dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE, ...x,
  parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), exercices_complets: 3, questions: { faits: 14, total: 14, pct: 100 }, valorisation: valo, ...(x.parcours || {}) } });

describe("constantes : une seule liste d'étapes", () => {
  it("21 pièces attendues (4 juridiques, 4 financières, 4 sociales, 3 commerciales, 6 actifs et risques)", () => expect(NB_PIECES).toBe(21));
  it("5 étapes, dans l'ordre, pour la page du dossier et le parcours guidé", () => {
    expect(ETAPES_PARCOURS.map(([, l]) => l)).toEqual(["Estimation", "Vos chiffres", "Vos réponses", "Rédaction", "Relecture et envoi"]);
  });
  it("chaque écran du parcours guidé appartient à une étape de cette liste ; le site est une question de « Vos réponses »", () => {
    const cles = new Set(ETAPES_PARCOURS.map(([k]) => k));
    expect(Object.keys(ETAPE_DE_L_ECRAN).sort()).toEqual(["chiffres", "comptes", "pret", "questions", "redaction", "saisie", "site"]);
    for (const e of Object.values(ETAPE_DE_L_ECRAN)) expect(cles.has(e)).toBe(true);
    expect(ETAPE_DE_L_ECRAN.site).toBe("reponses");
    expect(ETAPE_DE_L_ECRAN.comptes).toBe(ETAPE_DE_L_ECRAN.chiffres); // « Vos comptes » et « Vos chiffres » fusionnés
    expect(ETAPE_DE_L_ECRAN.pret).toBe("relecture");
  });
  it("même étiquette pour l'estimation express sur la fiche de l'accueil et dans le dossier", () => {
    expect(findCle(LANDING, "fourchette_titre")).toBe(ETIQUETTE_EXPRESS);
    expect(ETIQUETTE_EXPRESS).toBe("Valeur d'entreprise estimée");
    expect(ETIQUETTE_TITRES).toBe("Valeur de vos titres");
  });
  it("date en heure de Paris", () => {
    expect(dateCourte(LE)).toBe("18/11/2026");
    // 18/11 à 23:30 UTC (1 794 960 000 + 23,5 × 3 600 = 1 795 044 600) : déjà le 19/11 à Paris (00:30)
    expect(dateCourte(1_795_044_600)).toBe("19/11/2026");
    expect(dateCourte(null)).toBeNull();
  });
  it("années en clair", () => {
    expect(listeAnnees([2024])).toBe("2024");
    expect(listeAnnees([2024, 2023])).toBe("2023 et 2024");
    expect(listeAnnees([2024, 2022, 2023])).toBe("2022 à 2024");
    expect(listeAnnees([2024, 2019, 2021])).toBe("2019, 2021 et 2024");
  });
});
function findCle(o, cle) { for (const [k, v] of Object.entries(o || {})) { if (k === cle) return v; if (v && typeof v === "object") { const r = findCle(v, cle); if (r !== undefined) return r; } } return undefined; }

describe("dossier tout juste créé (comptes publics 2024 seulement, rien de confirmé)", () => {
  const e = etatParcours(dossier());
  it("Estimation faite, Vos chiffres en cours, le reste à venir", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "actuelle", "a-venir", "a-venir", "a-venir"]);
    expect(e.actuelle).toBe("chiffres");
    expect(e.etapes[0].href).toBe(`/espace/valorisation/?dossier=${ID}#chiffres`);
    expect(e.etapes[1].href).toBeNull();
  });
  it("À faire : le seul exercice indispensable, les 14 questions, les premières pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Confirmer l'exercice 2024", `Répondre aux ${NB_QUESTIONS} questions`, "Déposer vos premières pièces"]);
    expect(e.taches[2].detail).toBe("0 pièce sur 21");
    expect(e.taches[2].pieces).toBe(true);
  });
  it("action principale = première tâche, même libellé et même lien", () => {
    expect(e.action).toMatchObject({ texte: "Confirmer l'exercice 2024", href: `/espace/demarrer/?dossier=${ID}&etape=chiffres` });
  });
  it("15 (dossier) + 10 (estimation express) = 25 %, pas prêt", () => {
    expect(e.avancement).toBe(25);
    expect(e.pret).toBe(false);
  });
  it("documents tous à venir, avec ce qui les débloque ; pas d'action", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "a-venir", "a-venir", "a-venir"]);
    expect(e.documents[0].detail).toBe("Se débloque avec vos chiffres et vos réponses.");
    expect(e.documents[1].detail).toBe("Se débloque dès qu'un exercice est confirmé.");
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
    expect(f.avancement).toBe(15);
  });
});

describe("exercices : le dernier indispensable, les deux précédents facultatifs", () => {
  it("dernier exercice confirmé : « Vos chiffres » coché ; 2023 et 2022 proposés en facultatif, après l'indispensable", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true }), exercices_complets: 1 } }));
    expect(e.fait.chiffres).toBe(true);
    expect(e.etapes[1].etat).toBe("fait");
    expect(e.taches.map((t) => t.cle)).toEqual(["questions", "exercices", "pieces"]);
    expect(e.taches[1]).toMatchObject({ titre: "Ajouter 2023 et 2022 pour fiabiliser la fourchette (facultatif)", facultatif: true, href: `/espace/demarrer/?dossier=${ID}&etape=exercice` });
    // 15 + 10 + 25 = 50 : les exercices précédents n'entrent pas dans le pourcentage
    expect(e.avancement).toBe(50);
  });
  it("un seul exercice précédent manque : il est seul nommé", () => {
    const e = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [2022] }) } }));
    expect(e.taches.find((t) => t.cle === "exercices").titre).toBe("Ajouter 2022 pour fiabiliser la fourchette (facultatif)");
  });
  it("les exercices précédents absents ne bloquent ni le pourcentage ni le statut « prêt »", () => {
    const e = etatParcours(toutFait({ parcours: { exercices: exo({ dernier_complet: true }) } }), memoComplet);
    expect(e.pret).toBe(true);
    expect(e.avancement).toBe(100);
    expect(e.taches.map((t) => t.cle)).toEqual(["exercices"]);
    expect(e.taches.every((t) => t.facultatif)).toBe(true);
  });
  it("dernier exercice non confirmé : rien sur les exercices précédents tant que l'indispensable manque", () => {
    const e = etatParcours(dossier());
    expect(e.taches.some((t) => t.cle === "exercices")).toBe(false);
  });
});

describe("dossier à moitié rempli : 2024 confirmé, 6 questions sur 14, 8 pièces", () => {
  // 6 / 14 = 42,9 % → 43 %
  const d = dossier({ checklist: CHECKLIST_COMPLETE.slice(0, 8), parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), exercices_complets: 1, questions: { faits: 6, total: 14, pct: 43 } } });
  const e = etatParcours(d);
  it("Vos réponses en cours ; les deux premières étapes cochées et cliquables", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "actuelle", "a-venir", "a-venir"]);
    expect(e.etapes[1].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=chiffres`);
  });
  it("À faire : 14 − 6 = 8 dernières questions, rédaction (43 % ≥ 40 %), 21 − 8 = 13 pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Répondre aux 8 dernières questions", "Lancer la rédaction", "Déposer 13 pièces manquantes"]);
    expect(e.taches[0].detail).toBe("6 sur 14 déjà faites");
    expect(e.taches[2].detail).toBe("8 pièces sur 21");
    expect(e.questions).toEqual({ faits: 6, total: 14, restantes: 8 });
  });
  it("action principale = « Répondre aux 8 dernières questions », vers les questions", () => {
    expect(e.action).toMatchObject({ texte: "Répondre aux 8 dernières questions", href: `/espace/demarrer/?dossier=${ID}&etape=questions` });
  });
  it("15 + 10 + 25 + 15 × 0,43 = 56,45 → 56 %", () => expect(e.avancement).toBe(56));
  it("seul le datapack est prêt (un exercice confirmé suffit), à télécharger", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "pret", "a-venir", "a-venir"]);
    expect(e.documents[1].actions).toEqual([{ libelle: "Télécharger l'Excel", href: `/api/dossiers/${ID}/documents/datapack`, principal: true, telecharger: true }]);
    expect(e.documents[0].detail).toBe("Calculée à l'étape Rédaction, avec vos réponses.");
  });
  it("sous 40 % de réponses (5 / 14 = 36 %), la rédaction n'est pas proposée", () => {
    const f = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), questions: { faits: 5, total: 14, pct: 36 } } }));
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "pieces"]);
  });
  it("une seule question restante", () => {
    const f = etatParcours(dossier({ parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), questions: { faits: 13, total: 14, pct: 93 } } }));
    expect(f.taches[0].titre).toBe("Répondre à la dernière question");
    expect(f.action.texte).toBe("Répondre à la dernière question");
  });
});

describe("dossier rédigé, prêt, avec des recommandations facultatives", () => {
  const d = toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 17), parcours: { valorisation_le: LE } });
  const memo = { photos: [], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée du responsable d'atelier"] }), section("marche", "Marché")] };
  const e = etatParcours(d, memo);
  it("quatre étapes cochées, Relecture et envoi en cours ; prêt et 100 %", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "fait", "fait", "actuelle"]);
    expect(e.etapes[3].href).toBe(`/espace/documents/memo/?dossier=${ID}`);
    expect(e.pret).toBe(true);
    expect(e.avancement).toBe(100);
  });
  it("action principale : la première tâche, qui mène au mémorandum (règle de #15)", () => {
    expect(e.action).toMatchObject({ texte: e.taches[0].titre, href: e.taches[0].href });
    expect(e.action.href).toContain(`/espace/documents/memo/?dossier=${ID}`);
  });
  it("À faire : photo (0 photo), 2 éléments du chapitre Équipe, 21 − 17 = 4 pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Ajouter une photo de l'atelier ou des produits", "Compléter 2 points du mémorandum", "Déposer 4 pièces manquantes"]);
    expect(e.taches[1].detail).toBe("Indiqués « À compléter » : « Équipe »");
    expect(e.taches[1].href).toBe(`/espace/documents/memo/?dossier=${ID}#section-organisation`);
    expect(e.taches[0].href).toBe(`/espace/documents/memo/?dossier=${ID}#donnees`);
  });
  it("action principale = la première tâche (plus de « relire le mémorandum » contredit par la liste)", () => {
    expect(e.action).toMatchObject({ texte: "Ajouter une photo de l'atelier ou des produits", href: `/espace/documents/memo/?dossier=${ID}#donnees` });
  });
  it("mémorandum à relire, les trois autres prêts, avec leurs dates", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["pret", "pret", "pret", "a-relire"]);
    expect(e.documents[3].detail).toBe("Rédigé le 18/11/2026 · 2 points à compléter");
    expect(e.documents[1].detail).toBe("Mis à jour le 18/11/2026 · version 2");
    expect(e.documents[0].detail).toBe("Mise à jour le 18/11/2026");
    expect(e.documents[3].actions.map((a) => a.href)).toEqual([`/espace/documents/memo/?dossier=${ID}`, `/espace/documents/memo/?dossier=${ID}&imprimer=1`]);
  });
  it("valeur des titres, fondée sur les multiples seuls, sans DCF ni pondération", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur de vos titres", bas: 420_000, haut: 560_000, base: "Fondée sur les multiples d'EBE (excédent brut d'exploitation) de votre secteur, après dettes et trésorerie." });
    expect(e.valeur.base).not.toMatch(/DCF|pondér|méthodes/);
    expect(e.valeur).not.toHaveProperty("central");
  });
  it("l'écart avec l'estimation express est expliqué par les montants calculés", () => {
    // 310 – 520 k€ → 420 – 560 k€ ; EBE identique (80 k€) ; trésorerie nette 110 k€
    expect(sp(e.valeur.ecart)).toBe("Votre fourchette passe de 310 – 520 k€ à 420 – 560 k€ : comptes 2024 confirmés et trésorerie nette de 110 k€ ajoutée.");
  });
  it("écran final : « prêt », avec exactement les mêmes tâches, présentées comme facultatives", () => {
    const f = ecranFinal(e);
    expect(f.titre).toBe("Votre dossier est prêt");
    expect(f.resteTitre).toBe("Pour aller plus loin (facultatif)");
    expect(f.reste).toBe(e.taches);
  });
  it("chapitres non rédigés : pas prêt (99 % au plus), « rédigé », et la même liste que la page du dossier", () => {
    const f = etatParcours(d, { photos: [{}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] });
    expect(f.pret).toBe(false);
    expect(f.etapes[3].etat).toBe("actuelle");
    // 15 + 10 + 25 + 15 + 15 + 20 = 100, plafonné à 99 tant que la rédaction n'est pas finie
    expect(f.avancement).toBe(99);
    expect(f.taches[0]).toMatchObject({ titre: "Rédiger 2 chapitres du mémorandum", detail: "Chapitres : Marché, Clients" });
    expect(f.taches[1].titre).toBe("Ajouter une photo de l'équipe ou du site");
    const final = ecranFinal(f);
    expect(final.titre).toBe("Votre dossier est rédigé");
    expect(final.resteTitre).toBe("Ce qui reste à faire");
    expect(final.reste.map((t) => t.titre)).toEqual(f.taches.map((t) => t.titre));
    expect(final.aide).toMatch(/99 %/);
  });
  it("trois tâches au plus", () => {
    const f = etatParcours(toutFait({ parcours: { questions: { faits: 13, total: 14, pct: 93 } } }), { photos: [], sections: [section("marche", "Marché", { redigee: false, a_completer: ["Taille du marché"] })] });
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "chapitres", "photo"]);
  });
});

// Audit du 19/11/2026 : « Votre dossier est prêt » en fin de parcours, puis 86 %, « 19 dernières questions » et
// « Confirmer 2 exercices de plus » sur la page du dossier
describe("un seul état pour le parcours guidé et la page du dossier", () => {
  it("rédigé mais deux questions restantes : ni prêt ni 100 % des deux côtés, même décompte", () => {
    const e = etatParcours(toutFait({ parcours: { questions: { faits: 12, total: 14, pct: 86 } } }), memoComplet);
    expect(e.pret).toBe(false);
    // 15 + 10 + 25 + 15 × 0,86 + 15 + 20 = 97,9 → 98
    expect(e.avancement).toBe(98);
    const f = ecranFinal(e);
    expect(f.titre).toBe("Votre dossier est rédigé");
    expect(f.reste[0].titre).toBe("Répondre aux 2 dernières questions");
    expect(e.action.texte).toBe("Répondre aux 2 dernières questions");
  });
  it("tout l'indispensable fait : 100 % et « prêt » des deux côtés", () => {
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
  it("sans date de valorisation : « Prête »", () => expect(etatParcours(toutFait(), memoComplet).documents[0].detail).toBe("Prête"));
  it("s'il ne manque que des pièces : le bouton principal ouvre le dépôt, qui s'ouvre aussi de lui-même", () => {
    const f = etatParcours(toutFait({ checklist: CHECKLIST_COMPLETE.slice(0, 20) }), memoComplet);
    expect(f.taches.map((t) => t.titre)).toEqual(["Déposer 1 pièce manquante"]);
    expect(f.action).toMatchObject({ texte: "Déposer 1 pièce manquante", href: "#checklist", pieces: true });
    expect(f.pieces.ouvert).toBe(true);
  });
  it("une clé de checklist inconnue n'est pas comptée", () => {
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
  it("teaser manquant : « Terminer la rédaction », vers l'étape Rédaction du parcours guidé", () => {
    const e = etatParcours(toutFait({ documents: { memo: tousDocs.memo, datapack: tousDocs.datapack } }), memoComplet);
    expect(e.pret).toBe(false);
    expect(e.taches[0]).toMatchObject({ titre: "Terminer la rédaction", href: `/espace/demarrer/?dossier=${ID}&etape=redaction` });
  });
});

describe("explication de l'écart entre l'estimation express et la valorisation", () => {
  const est = { statut: "ok", exercice: 2024, methode: "multiple_ebe", agregat: 80_000, bas: 290_000, haut: 490_000 };
  it("trésorerie nette ajoutée : 290 + 260 = 550 ; 490 + 260 = 750", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 80_000, dette_nette: -260_000, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart(est, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et trésorerie nette de 260 k€ ajoutée.");
  });
  it("EBE retraité, décotes, dettes et fonds de roulement : chaque cause nommée avec son montant", () => {
    // Express : EBE 100 k€ × 4 à 6 = 400 – 600 k€. Approfondie : EBE normatif 120 k€ × 4 à 6 × 0,9 − 50 k€ − 20 k€
    //   bas = 432 − 70 = 362 k€ → « 360 » ; haut = 648 − 70 = 578 k€ → « 580 »
    const e2 = { ...est, agregat: 100_000, bas: 400_000, haut: 600_000 };
    const v = { bas: 362_000, haut: 578_000, annees: [2022, 2023, 2024], ebe_normatif: 120_000, dette_nette: 50_000, facteur_decotes: 0.9, ecart_bfr: -20_000, hors_exploitation: 0 };
    expect(sp(explicationEcart(e2, v))).toBe("Votre fourchette passe de 400 – 600 k€ à 360 – 580 k€ : comptes 2022 à 2024 confirmés, excédent brut d'exploitation (EBE) retenu de 120 k€ au lieu de 100 k€, décotes de 10 % appliquées, dettes nettes de 50 k€ déduites et besoin en fonds de roulement inférieur à la normale : −20 k€.");
  });
  it("express calculée sur le chiffre d'affaires (EBE négatif) : dit simplement que l'EBE est maintenant utilisé", () => {
    const v = { bas: 550_000, haut: 750_000, annees: [2024], ebe_normatif: 120_000, dette_nette: 0, facteur_decotes: 1, ecart_bfr: 0, hors_exploitation: 0 };
    expect(sp(explicationEcart({ ...est, methode: "multiple_ca", agregat: 2_000_000 }, v))).toBe("Votre fourchette passe de 290 – 490 k€ à 550 – 750 k€ : comptes 2024 confirmés et calcul sur l'excédent brut d'exploitation (EBE) au lieu du chiffre d'affaires.");
  });
  it("même fourchette affichée, ou estimation express absente : pas de phrase", () => {
    expect(explicationEcart(est, { bas: 291_000, haut: 488_000, annees: [2024] })).toBeNull(); // 290 – 490 k€ des deux côtés
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

// Audit, points 15 et 16 : un document vide n'est pas « prêt » ; un seul décompte des points à compléter.
describe("teaser et mémorandum vides ou incomplets", () => {
  const d = dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE,
    parcours: { exercices: exo({ dernier_complet: true, recommandes_manquants: [] }), exercices_complets: 3, questions: { faits: 14, total: 14, pct: 100 }, valorisation: valo } }); // format de #15
  const memoComplet = { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe")] };
  const teaser = (...contenus) => ({ teaser: { sections: ["accroche", "activite", "chiffres", "atouts", "operation"].map((cle, i) => ({ cle, titre: cle, contenu: contenus[i] ?? "" })) } });
  const plein = teaser("Texte", "Texte", "Texte", "Texte", "Texte");
  it("teaser aux 5 parties vides → incomplet, 5 parties sur 5 à rédiger, action Rédiger", () => {
    const e = etatParcours(d, memoComplet, teaser());
    expect(e.documents[2]).toMatchObject({ etat: "incomplet", detail: "5 parties sur 5 à rédiger" });
    expect(e.documents[2].actions).toEqual([{ libelle: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}`, principal: true }]);
  });
  it("une partie « À compléter » et une partie d'espaces comptent comme vides : 2 sur 5", () => {
    const e = etatParcours(d, memoComplet, teaser("Texte", "À compléter", "   ", "Texte", "Texte"));
    expect(e.documents[2].detail).toBe("2 parties sur 5 à rédiger");
  });
  it("teaser aux 5 parties rédigées → prêt", () => expect(etatParcours(d, memoComplet, plein).documents[2].etat).toBe("pret"));
  it("teaser incomplet : une tâche « Rédiger 2 parties du teaser » et « Continuer » mène au teaser, pas « Tout est fait »", () => {
    const e = etatParcours(d, memoComplet, teaser("Texte", "Texte", "Texte", "", ""));
    expect(e.taches).toEqual([{ cle: "teaser", titre: "Rédiger 2 parties du teaser", detail: "Parties vides : atouts, operation", action: "Rédiger", href: `/espace/documents/teaser/?dossier=${ID}` }]);
    // Règle de #15 : l'action principale reprend exactement la première tâche (même libellé, même lien) ; elle mène au teaser
    expect(e.action).toMatchObject({ texte: "Rédiger 2 parties du teaser", href: `/espace/documents/teaser/?dossier=${ID}` });
  });
  it("mémorandum créé mais 2 chapitres sur 3 non rédigés → incomplet, pas « à relire »", () => {
    const e = etatParcours(d, { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] }, plein);
    expect(e.documents[3]).toMatchObject({ etat: "incomplet", detail: "2 chapitres sur 3 à rédiger" });
  });
  it("partiesTeaserVides : rien à lire → aucune partie", () => expect(partiesTeaserVides(null)).toEqual([]));
});

describe("décompte unique des points à compléter", () => {
  // 2 points dans « Équipe » + 1 dans « Marché » = 3, comptés une fois chacun
  const memo = { sections: [section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée"] }), section("marche", "Marché", { a_completer: ["Taille du marché"] }), section("synthese", "Synthèse")] };
  it("liste « chapitre : point », dans l'ordre des chapitres", () => {
    expect(pointsACompleter(memo)).toEqual(["Équipe : Nombre de salariés", "Équipe : Date d'arrivée", "Marché : Taille du marché"]);
  });
  it("même nombre pour la page du dossier (lectureMemo) et l'écran final", () => expect(lectureMemo(memo).nbACompleter).toBe(pointsACompleter(memo).length));
  it("même formulation", () => {
    expect(libellePoints(1)).toBe("1 point à compléter");
    expect(libellePoints(4)).toBe("4 points à compléter");
  });
});
