import { describe, it, expect } from "vitest";
import { etatParcours, lectureMemo, dateCourte, NB_PIECES, ETAPES_PARCOURS, pointsACompleter, libellePoints, partiesTeaserVides } from "../public/js/dossier-parcours.js";

// Dossiers fictifs. Les valeurs attendues sont comptées à la main à partir de ces données, pas tirées du code.
const ID = "00000000-0000-4000-8000-000000000001";
const dossier = (x = {}) => ({
  id: ID, estimation: { statut: "ok", exercice: 2023, bas: 310_000, haut: 520_000 }, checklist: [], documents: {},
  ...x,
  parcours: { exercices_complets: 0, exercices_attendus: 3, questionnaire: { faits: 0, total: 15, pct: 0 }, valorisation: null, ...(x.parcours || {}) },
});
const valo = { bas: 420_000, central: 490_000, haut: 560_000, ponderation: { multiples: 1, dcf: 0 } };
// 18/11/2026 à 10:00 heure de Paris (UTC+1) = 09:00 UTC : 1 794 960 000 s à minuit UTC + 9 × 3 600 = 1 794 992 400 s
const LE = 1_794_992_400;
const tousDocs = { memo: { version: 1, le: LE }, teaser: { version: 1, le: LE }, datapack: { version: 2, le: LE } };
const section = (cle, court, x = {}) => ({ cle, court, titre: court, redigee: true, a_completer: [], ...x });
const CHECKLIST_COMPLETE = ["statuts", "kbis", "pv-ag", "capital", "liasses", "situation", "emprunts", "balances", "organigramme", "registre", "contrats-cles", "accords", "clients", "contrats", "cgv", "baux", "equipements", "marques", "assurances", "litiges", "autorisations"];

describe("constantes", () => {
  it("21 pièces attendues (4 juridiques, 4 financières, 4 sociales, 3 commerciales, 6 actifs et risques)", () => expect(NB_PIECES).toBe(21));
  it("5 étapes, dans l'ordre", () => expect(ETAPES_PARCOURS.map(([, l]) => l)).toEqual(["Estimation", "Vos chiffres", "Vos réponses", "Rédaction", "Relecture et envoi"]));
  it("date en heure de Paris", () => {
    expect(dateCourte(LE)).toBe("18/11/2026");
    // 18/11 à 23:30 UTC (1 794 960 000 + 23,5 × 3 600 = 1 795 044 600) : déjà le 19/11 à Paris (00:30)
    expect(dateCourte(1_795_044_600)).toBe("19/11/2026");
    expect(dateCourte(null)).toBeNull();
  });
});

describe("dossier tout juste créé", () => {
  const e = etatParcours(dossier());
  it("Estimation faite, Vos chiffres en cours, le reste à venir", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "actuelle", "a-venir", "a-venir", "a-venir"]);
    expect(e.actuelle).toBe("chiffres");
    expect(e.etapes[0].href).toBe(`/espace/valorisation/?dossier=${ID}#chiffres`);
    expect(e.etapes[1].href).toBeNull();
  });
  it("action principale : confirmer les chiffres, vers le parcours guidé", () => {
    expect(e.action).toEqual({ texte: "Continuer : confirmer vos chiffres", href: `/espace/demarrer/?dossier=${ID}` });
  });
  it("À faire : chiffres, 15 questions, premières pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Confirmer vos 3 derniers exercices", "Répondre aux 15 questions", "Déposer vos premières pièces"]);
    expect(e.taches[2].detail).toBe("0 pièce sur 21");
    expect(e.taches[2].pieces).toBe(true);
  });
  it("documents tous à venir, avec ce qui les débloque ; pas d'action", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "a-venir", "a-venir", "a-venir"]);
    expect(e.documents[0].detail).toBe("Se débloque avec vos chiffres et vos réponses.");
    expect(e.documents[1].detail).toBe("Se débloque dès qu'un exercice est confirmé.");
    expect(e.documents.every((x) => x.actions.length === 0)).toBe(true);
  });
  it("valeur express, avec sa base", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valorisation express · comptes 2023", bas: 310_000, haut: 520_000 });
    expect(e.valeur.base).toMatch(/comptes publics et les multiples du secteur/);
  });
  it("dépôt des pièces replié", () => expect(e.pieces).toEqual({ fournies: 0, total: 21, ouvert: false }));
});

describe("estimation express impossible (comptes confidentiels)", () => {
  const e = etatParcours(dossier({ estimation: { statut: "comptes_absents" } }));
  it("pas de montant, une phrase et un lien vers la saisie", () => {
    expect(e.valeur.bas).toBeNull();
    expect(e.valeur.lien.href).toBe(`/espace/demarrer/?dossier=${ID}`);
  });
});

describe("dossier à moitié rempli : 3 exercices, 9 questions sur 15 (60 %), 8 pièces, pas encore rédigé", () => {
  const d = dossier({ checklist: CHECKLIST_COMPLETE.slice(0, 8), parcours: { exercices_complets: 3, questionnaire: { faits: 9, total: 15, pct: 60 } } });
  const e = etatParcours(d);
  it("Vos réponses en cours ; les deux premières étapes cochées et cliquables", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "actuelle", "a-venir", "a-venir"]);
    expect(e.etapes[1].href).toBe(`/espace/demarrer/?dossier=${ID}&etape=chiffres`);
  });
  it("action principale : 15 − 9 = 6 questions restantes", () => expect(e.action.texte).toBe("Continuer : 6 questions restantes"));
  it("À faire : 6 dernières questions, rédaction (60 % ≥ 40 %), 21 − 8 = 13 pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Répondre aux 6 dernières questions", "Lancer la rédaction", "Déposer 13 pièces manquantes"]);
    expect(e.taches[0].detail).toBe("9 sur 15 déjà faites");
    expect(e.taches[2].detail).toBe("8 pièces sur 21");
  });
  it("seul le datapack est prêt (un exercice confirmé suffit), à télécharger", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["a-venir", "pret", "a-venir", "a-venir"]);
    expect(e.documents[1].actions).toEqual([{ libelle: "Télécharger l'Excel", href: `/api/dossiers/${ID}/documents/datapack`, principal: true, telecharger: true }]);
    expect(e.documents[0].detail).toBe("Calculée à l'étape Rédaction, avec vos réponses.");
  });
  it("sous 40 % de réponses, la rédaction n'est pas proposée", () => {
    const f = etatParcours(dossier({ parcours: { exercices_complets: 3, questionnaire: { faits: 5, total: 15, pct: 33 } } }));
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "pieces"]);
  });
  it("un exercice sur trois : 2 exercices de plus, en premier", () => {
    const f = etatParcours(dossier({ parcours: { exercices_complets: 1, questionnaire: { faits: 14, total: 15, pct: 93 } } }));
    expect(f.taches[0]).toMatchObject({ titre: "Confirmer 2 exercices de plus", detail: "1 sur 3 confirmés" });
    expect(f.taches[1].titre).toBe("Répondre à la dernière question");
    expect(f.action.texte).toBe("Continuer : la dernière question");
  });
});

describe("dossier rédigé, à relire", () => {
  const d = dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE.slice(0, 17),
    parcours: { exercices_complets: 3, questionnaire: { faits: 15, total: 15, pct: 100 }, valorisation: valo, valorisation_le: LE } });
  const memo = { photos: [], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe", { a_completer: ["Nombre de salariés", "Date d'arrivée du responsable d'atelier"] }), section("marche", "Marché")] };
  const e = etatParcours(d, memo);
  it("quatre étapes cochées, Relecture et envoi en cours", () => {
    expect(e.etapes.map((x) => x.etat)).toEqual(["fait", "fait", "fait", "fait", "actuelle"]);
    expect(e.etapes[3].href).toBe(`/espace/documents/memo/?dossier=${ID}`);
  });
  it("action principale : relire le mémorandum (2 éléments à compléter)", () => expect(e.action).toEqual({ texte: "Continuer : relire le mémorandum", href: `/espace/documents/memo/?dossier=${ID}` }));
  it("À faire : photo (0 photo), 2 éléments du chapitre Équipe, 21 − 17 = 4 pièces", () => {
    expect(e.taches.map((t) => t.titre)).toEqual(["Ajouter une photo de l'atelier ou des produits", "Compléter 2 points du mémorandum", "Déposer 4 pièces manquantes"]);
    expect(e.taches[1].detail).toBe("Indiqués « À compléter » : « Équipe »");
    expect(e.taches[1].href).toBe(`/espace/documents/memo/?dossier=${ID}#section-organisation`);
    expect(e.taches[0].href).toBe(`/espace/documents/memo/?dossier=${ID}#donnees`);
  });
  it("mémorandum à relire, les trois autres prêts, avec leurs dates", () => {
    expect(e.documents.map((x) => x.etat)).toEqual(["pret", "pret", "pret", "a-relire"]);
    expect(e.documents[3].detail).toBe("Rédigé le 18/11/2026 · 2 points à compléter");
    expect(e.documents[1].detail).toBe("Mis à jour le 18/11/2026 · version 2");
    expect(e.documents[0].detail).toBe("Mise à jour le 18/11/2026");
    expect(e.documents[3].actions.map((a) => a.href)).toEqual([`/espace/documents/memo/?dossier=${ID}`, `/espace/documents/memo/?dossier=${ID}&imprimer=1`]);
  });
  it("valeur des titres fondée sur les multiples (pondération 1/0)", () => {
    expect(e.valeur).toMatchObject({ etiquette: "Valeur des titres", bas: 420_000, haut: 560_000, base: "Fondée sur les multiples ; DCF disponible en option." });
  });
  it("avec le DCF à 40 % : 60 % multiples, 40 % DCF", () => {
    const f = etatParcours({ ...d, parcours: { ...d.parcours, valorisation: { ...valo, ponderation: { multiples: 0.6, dcf: 0.4 } } } }, memo);
    expect(f.valeur.base).toBe("Fondée sur les multiples (60 %) et le DCF (40 %).");
  });
  it("chapitres non rédigés : comptés et nommés, avant les photos", () => {
    const f = etatParcours(d, { photos: [{}], sections: [section("synthese", "Synthèse"), section("marche", "Marché", { redigee: false }), section("clients", "Clients", { redigee: false })] });
    expect(f.taches[0]).toMatchObject({ titre: "Rédiger 2 chapitres du mémorandum", detail: "Chapitres : Marché, Clients" });
    expect(f.taches[1].titre).toBe("Ajouter une photo de l'équipe ou du site");
  });
  it("trois tâches au plus", () => {
    const f = etatParcours({ ...d, parcours: { ...d.parcours, questionnaire: { faits: 14, total: 15, pct: 93 } } }, { photos: [], sections: [section("marche", "Marché", { redigee: false, a_completer: ["Taille du marché"] })] });
    expect(f.taches.map((t) => t.cle)).toEqual(["questions", "chapitres", "photo"]);
  });
  it("une question facultative restante ne fait pas reculer le fil", () => {
    const f = etatParcours({ ...d, parcours: { ...d.parcours, questionnaire: { faits: 14, total: 15, pct: 93 } } }, memo);
    expect(f.actuelle).toBe("relecture");
  });
});

describe("tout est prêt", () => {
  const d = dossier({ documents: tousDocs, checklist: CHECKLIST_COMPLETE,
    parcours: { exercices_complets: 3, questionnaire: { faits: 15, total: 15, pct: 100 }, valorisation: valo } });
  const e = etatParcours(d, { photos: [{}, {}], sections: [section("synthese", "Synthèse"), section("organisation", "Équipe")] });
  it("aucune tâche, documents prêts, relire et envoyer", () => {
    expect(e.taches).toEqual([]);
    expect(e.documents.map((x) => x.etat)).toEqual(["pret", "pret", "pret", "pret"]);
    expect(e.action).toEqual({ texte: "Continuer : relire et envoyer votre dossier", href: `/espace/demarrer/?dossier=${ID}&etape=pret` });
    expect(e.pieces).toEqual({ fournies: 21, total: 21, ouvert: false });
  });
  it("sans date de valorisation : « Prête »", () => expect(e.documents[0].detail).toBe("Prête"));
  it("s'il ne manque que des pièces, le dépôt s'ouvre de lui-même", () => {
    const f = etatParcours({ ...d, checklist: CHECKLIST_COMPLETE.slice(0, 20) }, { photos: [{}, {}], sections: [] });
    expect(f.taches.map((t) => t.titre)).toEqual(["Déposer 1 pièce manquante"]);
    expect(f.pieces.ouvert).toBe(true);
  });
  it("une clé de checklist inconnue n'est pas comptée", () => {
    const f = etatParcours({ ...d, checklist: ["statuts", "inconnue"] });
    expect(f.pieces.fournies).toBe(1);
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
    parcours: { exercices_complets: 3, questionnaire: { faits: 15, total: 15, pct: 100 }, valorisation: valo } });
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
