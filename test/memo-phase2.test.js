// Mémorandum, phase 2 (24/11/2026) : fonctions pures. Photos (dimensions, filtre du site, placement par catégorie
// sans doublon, limite de 12), jugements de Claude (schémas photo et relecture, aucun chiffre touché), équipe
// dirigeante, remplissage et fusion des pages avec le sommaire recalculé, panneau d'amélioration. Données fictives.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { typeImage, dimensionsImage, raisonEcartPhoto, empreinte } from "../src/documents/images.js";
import { mesurerPhotos } from "../src/documents/site.js";
import { PHOTOS, PHOTOS_MAX } from "../src/config.js";
import { placementPhotos } from "../public/js/memo-format.js";
import { validerAnalysePhoto, validerRelecture, appliquerCorrection, validerParcours, chiffresNouveaux, memesChiffres, SCHEMA_PHOTO, SCHEMA_RELECTURE, CATEGORIES_PHOTO } from "../src/documents/jugements.js";
import { contenuRespecteConcision } from "../src/documents/concision.js";
import { normaliserEquipe, photosOrphelines, equipePourClaude, nomsEquipe, transitionEquipe, PERSONNES_MAX } from "../public/js/equipe.js";
import { surfaceCouverte, planFusion, numeroter, SEUIL_PAGE_VIDE } from "../public/js/memo-pages.js";
import { ameliorations, reponsePour, titreCourt, ETAPES_MODIFIABLES } from "../public/js/ameliorations.js";
import { termesInterdits, verifierAnonymat } from "../src/documents/anonymat.js";
import { faitsTeaser } from "../src/documents/teaser.js";

// ---------------------------------------------------------------- Images fictives (en-têtes seulement)
const png = (l, h) => { const o = new Uint8Array(33); o.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(o.buffer).setUint32(16, l); new DataView(o.buffer).setUint32(20, h); return o; };
const jpg = (l, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, l >> 8, l & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const webp = (l, h) => { const o = new Uint8Array(30); o.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]); const a = l - 1, b = h - 1; o.set([a & 255, (a >> 8) & 255, a >> 16, b & 255, (b >> 8) & 255, b >> 16], 24); return o; };

describe("images : type et dimensions lues dans l'en-tête", () => {
  it("PNG, JPEG et WebP ; SVG ou texte : non reconnus", () => {
    expect([typeImage(png(10, 10)), typeImage(jpg(10, 10)), typeImage(webp(10, 10))]).toEqual(["png", "jpg", "webp"]);
    expect(dimensionsImage(png(1600, 1067))).toEqual({ largeur: 1600, hauteur: 1067 });
    expect(dimensionsImage(jpg(1200, 800))).toEqual({ largeur: 1200, hauteur: 800 });
    expect(dimensionsImage(webp(2000, 1000))).toEqual({ largeur: 2000, hauteur: 1000 });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"></svg>');
    expect(typeImage(svg)).toBeNull();
    expect(dimensionsImage(svg)).toBeNull();
  });
  it("écarte les petites images, les bandeaux et ce qui n'est pas une photo", () => {
    const r = (l, h) => raisonEcartPhoto(l ? { largeur: l, hauteur: h } : null, PHOTOS.site);
    expect([r(1600, 1067), r(120, 120), r(1600, 300), r(600, 2000), r(null)]).toEqual([null, "petite", "bandeau", "bandeau", "format"]);
  });
});

describe("filtre des photos du site, même sans dimensions dans la page", () => {
  it("garde les vraies photos, écarte pictogramme, bandeau, SVG et doublon (même fichier, autre adresse)", async () => {
    const photo = jpg(1600, 1000), autre = png(1200, 900);
    const fichiers = {
      "https://exemple-menuiserie.test/a.jpg": photo, "https://exemple-menuiserie.test/copie/a-large.jpg": photo,
      "https://exemple-menuiserie.test/picto.png": png(64, 64), "https://exemple-menuiserie.test/franchise.png": png(1600, 300),
      "https://exemple-menuiserie.test/dessin.svg": new TextEncoder().encode("<svg/>"), "https://exemple-menuiserie.test/b.png": autre,
    };
    const f = async (u) => (fichiers[u] ? new Response(fichiers[u], { status: 200 }) : new Response("", { status: 404 }));
    const r = await mesurerPhotos([...Object.keys(fichiers), "https://exemple-menuiserie.test/absente.jpg"], f);
    expect(r.photos).toEqual(["https://exemple-menuiserie.test/a.jpg", "https://exemple-menuiserie.test/b.png"]);
    expect(Object.fromEntries(r.ecartees.map((x) => [x.url.split("/").pop(), x.raison]))).toEqual({ "a-large.jpg": "doublon", "picto.png": "petite", "franchise.png": "bandeau", "dessin.svg": "format", "absente.jpg": "injoignable" });
    expect(await empreinte(photo)).toBe(await empreinte(jpg(1600, 1000)));
  });
});

describe("limite de 12 photos, définie une seule fois", () => {
  it("PHOTOS_MAX vaut 12, dans src/config.js et nulle part ailleurs", () => {
    expect(PHOTOS_MAX).toBe(12);
    expect(PHOTOS.max).toBe(12);
    const fichiers = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? fichiers(p) : p.endsWith(".js") ? [p] : []; });
    const racine = new URL("../", import.meta.url).pathname;
    const definitions = [...fichiers(join(racine, "src")), ...fichiers(join(racine, "public/js"))].filter((f) => /\bPHOTOS_MAX\s*=/.test(readFileSync(f, "utf8")));
    expect(definitions.map((f) => f.replace(racine, ""))).toEqual(["src/config.js"]);
  });
});

describe("placement des photos par catégorie", () => {
  const ph = (n, categorie, extra = {}) => ({ n, decision: categorie ? "utilise" : null, categorie, usage: extra.usage ?? null, analyse: { note: extra.note ?? 3 }, largeur: extra.largeur ?? 1600 });
  it("couverture, activité, réalisations, équipe : chaque photo une seule fois", () => {
    const l = [ph(0, "equipe"), ph(1, "atelier"), ph(2, "locaux", { note: 4 }), ph(3, "realisations"), ph(4, "realisations"), ph(5, "realisations"), ph(6, "produits"), ph(7, "exterieur", { note: 2 })];
    const r = placementPhotos(l);
    expect(r).toMatchObject({ couverture: 2, equipe: 0, realisations: [3, 4, 5], activite: [1, 6] });
    const toutes = [r.couverture, r.equipe, ...r.realisations, ...r.activite, ...r.ouvertures].filter((x) => x != null);
    expect(new Set(toutes).size).toBe(toutes.length);
    expect(r.ouvertures).toEqual([7]);
  });
  it("jamais en grand une photo trop petite ; jamais une photo « à éviter » ; l'ordre départage", () => {
    const r = placementPhotos([ph(0, "locaux", { largeur: 640, note: 5 }), ph(1, "locaux", { note: 3 }), ph(2, "exterieur", { usage: "eviter" }), ph(3, "atelier")]);
    expect(r.couverture).toBe(1);
    expect([r.couverture, ...r.activite, ...r.ouvertures]).not.toContain(2);
    expect(r.ouvertures).not.toContain(0);
  });
  it("réalisations : page seulement à partir de 3 ; sans jugement validé, jamais pour l'équipe", () => {
    expect(placementPhotos([ph(0, "realisations"), ph(1, "realisations")]).realisations).toEqual([]);
    const r = placementPhotos([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }]);
    expect(r).toMatchObject({ couverture: 0, activite: [1, 2], equipe: null, ouvertures: [3] });
  });
});

describe("jugement d'une photo : schéma et validation", () => {
  const base = { description: "Atelier avec stock de planches.", categorie: "atelier", note: 4, raison: "Nette.", usage: "activite", legende: "L'atelier de fabrication, vu depuis l'entrée principale du bâtiment", signalements: [] };
  it("le schéma liste tous les champs demandés", () => {
    expect(SCHEMA_PHOTO.required).toEqual(["description", "categorie", "note", "raison", "usage", "legende", "signalements"]);
    expect(SCHEMA_PHOTO.properties.categorie.enum).toEqual(CATEGORIES_PHOTO);
  });
  it("légende de 8 mots au plus ; note de 1 à 5 ; listes fermées", () => {
    const j = validerAnalysePhoto(base);
    expect(j.legende.split(" ").length).toBeLessThanOrEqual(8);
    expect(j.teaser).toBe(true);
    expect(validerAnalysePhoto({ ...base, note: 7 })).toBeNull();
    expect(validerAnalysePhoto({ ...base, categorie: "voiture" })).toBeNull();
    expect(validerAnalysePhoto({ ...base, description: "" })).toBeNull();
  });
  it("dessin ou publicité : à éviter ; élément identifiant : jamais proposé pour le teaser", () => {
    expect(validerAnalysePhoto({ ...base, signalements: ["dessin"] }).usage).toBe("eviter");
    const j = validerAnalysePhoto({ ...base, categorie: "locaux", usage: "couverture", signalements: ["identifiante", "inconnu"] });
    expect(j.signalements).toEqual(["identifiante"]);
    expect(j.teaser).toBe(false);
  });
});

describe("relecture critique : schéma, 10 remarques au plus, aucun chiffre touché", () => {
  const sections = [{ cle: "organisation", contenu: "L'équipe compte 23 salariés ; les compagnons ont une ancienneté moyenne élevée." }, { cle: "activite", contenu: "Ce savoir-faire constitue une barrière à l'entrée." }];
  const rq = (x) => ({ section: "organisation", type: "non_sourcee", titre: "Préciser l'ancienneté de l'équipe d'atelier dès maintenant", constat: "Non appuyé.", texte_actuel: "", texte_propose: "", importance: "conseille", ...x });
  it("le schéma demande page, type, correction proposée et importance", () => {
    expect(SCHEMA_RELECTURE.properties.remarques.items.required).toEqual(["section", "type", "titre", "constat", "texte_actuel", "texte_propose", "importance"]);
  });
  it("titres de 6 mots au plus, indispensables d'abord, 10 au plus, chapitre inconnu écarté", () => {
    const l = validerRelecture({ remarques: [...Array.from({ length: 12 }, () => rq()), rq({ importance: "indispensable" }), rq({ section: "inconnu" })] }, sections);
    expect(l).toHaveLength(10);
    expect(l[0].importance).toBe("indispensable");
    expect(l.every((r) => r.titre.split(" ").length <= 6 && r.statut === null)).toBe(true);
    expect(l.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, k) => `r${k + 1}`));
  });
  it("une correction qui change un chiffre est retirée ; une remarque « chiffre » n'a jamais de correction", () => {
    const [a, b, c] = validerRelecture({ remarques: [
      rq({ texte_actuel: "les compagnons ont une ancienneté moyenne élevée", texte_propose: "l'équipe d'atelier est en place" }),
      rq({ texte_actuel: "L'équipe compte 23 salariés", texte_propose: "L'équipe compte 25 salariés" }),
      rq({ type: "chiffre", texte_actuel: "23", texte_propose: "23" }),
    ] }, sections);
    expect(a.correction).toEqual({ texte_actuel: "les compagnons ont une ancienneté moyenne élevée", texte_propose: "l'équipe d'atelier est en place" });
    expect(b.correction).toBeNull();
    expect(c.correction).toBeNull();
  });
  it("« Oui, corriger » : remplacement exact, ou rien si le passage a changé ou si un chiffre bougerait", () => {
    const c = sections[0].contenu;
    expect(appliquerCorrection(c, { texte_actuel: "ancienneté moyenne élevée", texte_propose: "équipe en place" })).toBe("L'équipe compte 23 salariés ; les compagnons ont une équipe en place.");
    expect(appliquerCorrection(c, { texte_actuel: "texte absent", texte_propose: "x" })).toBeNull();
    expect(appliquerCorrection(c, { texte_actuel: "23 salariés", texte_propose: "24 salariés" })).toBeNull();
    expect(memesChiffres("1 200 k€ et 15,8 %", "15,8 % puis 1200 k€")).toBe(true);
  });
  it("la concision est recontrôlée après correction", () => {
    const ok = "Intro courte.\n\n- **Point** : Texte court.";
    expect(contenuRespecteConcision(ok)).toBe(true);
    expect(contenuRespecteConcision(`Intro courte.\n\n- **Point** : ${"Texte très long. ".repeat(30)}`)).toBe(false);
    expect(contenuRespecteConcision("Texte libre du dirigeant.", "Texte libre.")).toBe(false);
  });
});

describe("équipe dirigeante", () => {
  const p = (x) => ({ id: "abc12345", nom: "Bernard Exemple", role: "fondateur", anciennete: 28, experience: 34, formation: "cap_bep", experiences: [{ type: "formation", precision: "Compagnons du devoir, 6 ans" }], apres: "accompagne", mois: 6, ...x });
  it("4 personnes au plus, listes fermées, 3 expériences au plus, personne sans nom ignorée", () => {
    const e = normaliserEquipe({ personnes: [p(), p({ id: "b2c3d4e5", role: "pirate", formation: "x", apres: "?", experiences: Array(5).fill({ type: "encadrement" }) }), p({ id: "c3d4e5f6", nom: "" }), ...["d4e5f6g7", "e5f6g7h8", "f6g7h8i9"].map((id) => p({ id }))] });
    expect(e.personnes).toHaveLength(PERSONNES_MAX);
    expect(e.personnes[1]).toMatchObject({ role: null, formation: null, apres: null, mois: null });
    expect(e.personnes[1].experiences).toHaveLength(3);
  });
  it("la photo n'est jamais prise du navigateur : seulement celle enregistrée avec le consentement", () => {
    const ancien = { personnes: [{ ...p(), photo: { cle: "dossiers/d1/equipe/abc.jpg", type: "image/jpeg", consentement_le: 1 } }] };
    const pirate = normaliserEquipe({ personnes: [{ ...p(), photo: { cle: "dossiers/AUTRE/photos/x.jpg" } }, { ...p({ id: "z9y8x7w6", nom: "Nadia Exemple" }), photo: { cle: "dossiers/AUTRE/y.jpg" } }] }, ancien);
    expect(pirate.personnes[0].photo.cle).toBe("dossiers/d1/equipe/abc.jpg");
    expect(pirate.personnes[1].photo).toBeUndefined();
    expect(photosOrphelines(ancien, { personnes: [] })).toEqual([ancien.personnes[0].photo]);
  });
  it("Claude ne reçoit ni photo ni consentement ; transition écrite par le code", () => {
    const e = normaliserEquipe({ personnes: [p(), p({ id: "b2c3d4e5", nom: "Nadia Exemple", role: "raf", apres: "reste", mois: null })] }, { personnes: [{ ...p(), photo: { cle: "x" } }] });
    expect(JSON.stringify(equipePourClaude(e))).not.toMatch(/photo|consentement|Bernard|Nadia/);
    expect(transitionEquipe(e)).toBe("1 dirigeant sur 2 reste ; accompagnement de la transition : 6 mois");
  });
  it("parcours rédigé : refusé s'il contient un chiffre absent des réponses de la personne", () => {
    const l = equipePourClaude(normaliserEquipe({ personnes: [p()] }));
    expect(validerParcours([{ id: "abc12345", texte: "CAP, six ans de compagnonnage." }, { id: "inconnu", texte: "x" }], l)).toEqual({ abc12345: "CAP, six ans de compagnonnage." });
    expect(validerParcours([{ id: "abc12345", texte: "Diplômé en 1992, 40 salariés encadrés." }], l)).toEqual({});
    expect(chiffresNouveaux("28 ans dans l'entreprise", l[0])).toEqual([]);
  });
});

describe("teaser : jamais de nom, de photo ni de parcours individuel", () => {
  const reponses = { activite: { description: "Fabrication de menuiseries sur mesure." }, equipe: { personnes: [{ id: "abc12345", nom: "Bernard Exemple", role: "fondateur", formation: "cap_bep", experiences: [{ type: "formation", precision: "Compagnons du devoir" }], apres: "reste" }] } };
  const entreprise = { nom: "MENUISERIE EXEMPLE", ville: "Exempleville", code_postal: "44000", naf: "16.23Z", date_creation: "1998-03-01" };
  it("les faits du teaser ne contiennent ni l'équipe ni ses photos", () => {
    const f = JSON.stringify(faitsTeaser({ entreprise, resultat: null, entree: { exercices: [] }, reponses }));
    expect(f).not.toMatch(/Bernard|Compagnons|abc12345|photo/i);
  });
  it("un nom de l'équipe dans le texte du teaser est refusé par le contrôle d'anonymat", () => {
    const interdits = termesInterdits(entreprise, [], nomsEquipe(reponses.equipe));
    expect(verifierAnonymat("Une équipe de direction en place.", interdits)).toEqual([]);
    expect(verifierAnonymat("Bernard Exemple dirige l'atelier depuis 28 ans.", interdits).map((x) => x.terme)).toContain("bernard exemple");
    expect(verifierAnonymat("Le fondateur, Bernard, reste.", interdits).map((x) => x.terme)).toContain("bernard");
  });
});

describe("remplissage mesuré à la surface, fusion des pages, sommaire recalculé", () => {
  const zone = { left: 0, top: 0, width: 640, height: 360 };
  it("surface couverte : 0 page vide, 1 page pleine, une moitié : 0,5", () => {
    expect(surfaceCouverte(zone, [])).toBe(0);
    expect(surfaceCouverte(zone, [{ left: 0, top: 0, right: 640, bottom: 360 }])).toBe(1);
    expect(surfaceCouverte(zone, [{ left: 0, top: 0, right: 320, bottom: 360 }])).toBeCloseTo(0.5, 2);
    // Une page centrée verticalement (texte au milieu, rien au-dessus ni au-dessous) n'est pas « pleine »
    expect(surfaceCouverte(zone, [{ left: 0, top: 160, right: 640, bottom: 200 }])).toBeLessThan(SEUIL_PAGE_VIDE);
  });
  it("une page sous 16 % est fusionnée avec la suivante de la même partie (sinon la précédente), une seule fois", () => {
    const pages = [
      { partie: 4, fusionnable: true, couverture: 0.53 }, { partie: 4, fusionnable: true, couverture: 0.31 }, { partie: 4, fusionnable: true, couverture: 0.08 },
      { partie: 4, fusionnable: true, couverture: 0.18 }, { partie: 5, fusionnable: false, couverture: 1 }, { partie: 5, fusionnable: true, couverture: 0.26 }, { partie: 5, fusionnable: true, couverture: 0.03 },
    ];
    expect(planFusion(pages)).toEqual([[2, 3], [5, 6]]);
    expect(planFusion([{ partie: 1, fusionnable: true, couverture: 0.1 }, { partie: 2, fusionnable: true, couverture: 0.5 }])).toEqual([]);
  });
  it("numérotation « partie.page » et pages du sommaire recalculées après fusion (24 → 22 pages)", () => {
    const avant = [{ type: "hors" }, { type: "hors" }, { type: "ouverture", partie: 4 }, { type: "page", sections: ["finances"] }, { type: "page", sections: ["finances"] }, { type: "page", sections: ["finances"] },
      { type: "ouverture", partie: 5 }, { type: "page", sections: ["perspectives"] }, { type: "page", sections: ["perspectives"], suite: true }, { type: "page", sections: ["operation"] }];
    const r1 = numeroter(avant);
    expect(r1.numeros).toEqual([null, null, null, "4.1", "4.2", "4.3", null, "5.1", "5.1", "5.2"]);
    expect(r1.pageDe).toEqual({ finances: 4, perspectives: 8, operation: 10 });
    // Fusion : 4.2 + 4.3, et la suite de 5.1 revient sur sa page ; le chapitre « operation » remonte d'autant
    const apres = [avant[0], avant[1], avant[2], avant[3], { type: "page", sections: ["finances"] }, avant[6], { type: "page", sections: ["perspectives"] }, avant[9]];
    const r2 = numeroter(apres);
    expect(r2.numeros).toEqual([null, null, null, "4.1", "4.2", null, "5.1", "5.2"]);
    expect(r2.pageDe).toEqual({ finances: 4, perspectives: 7, operation: 8 });
    expect(r2.ouvertures).toEqual({ 4: 3, 5: 6 });
  });
});

describe("panneau d'amélioration", () => {
  const etat = {
    sections: [{ cle: "organisation", redigee: true, a_completer: ["Préciser l'effectif par fonction et l'ancienneté de chacun"] }, { cle: "operation", redigee: true, a_completer: ["Préciser l'effectif par fonction et l'ancienneté de chacun"] }],
    relecture: { remarques: [{ id: "r1", section: "organisation", type: "non_sourcee", titre: "Préciser l'ancienneté", importance: "indispensable", correction: { texte_actuel: "a", texte_propose: "b" }, statut: null }, { id: "r2", section: "operation", type: "chiffre", titre: "Vérifier l'emprunt de 2025", importance: "conseille", correction: null, statut: "ecartee" }] },
    equipe: { personnes: [] }, photos: [], marche: { faits: [], essais_restants: 3 },
  };
  const reponses = { operation: { part_cedee: "100 %" }, dirigeant: { encadrement: "En partie" } };
  const liste = ameliorations({ etat, reponses, placement: { activite: [] } });
  it("titres de 6 mots au plus, indispensables d'abord, remarques écartées absentes, demandes en double une seule fois", () => {
    expect(liste.every((x) => titreCourt(x.titre) === x.titre && x.titre.replace("…", "").split(" ").length <= 6)).toBe(true);
    expect(liste[0].importance).toBe("indispensable");
    expect(liste.some((x) => x.remarque?.id === "r2")).toBe(false);
    expect(liste.filter((x) => x.genre === "proposition")).toHaveLength(1);
    expect(liste.find((x) => x.id === "encadrement")).toBeUndefined(); // déjà répondu
    expect(liste.find((x) => x.id === "accompagnement")).toMatchObject({ genre: "qcm", options: ["3 mois", "6 mois", "12 mois", "Plus de 12 mois"] });
  });
  it("« Ignorer » : l'amélioration écartée n'apparaît plus, rien d'autre ne change", () => {
    const sans = ameliorations({ etat, reponses, placement: { activite: [] }, ignores: ["accompagnement"] });
    expect(sans.map((x) => x.id)).toEqual(liste.map((x) => x.id).filter((x) => x !== "accompagnement"));
  });
  it("« Valider » : une seule étape écrite, la clé visée seulement, jamais un chiffre", () => {
    const qcm = liste.find((x) => x.id === "accompagnement");
    expect(reponsePour(qcm, "6 mois", reponses)).toEqual({ etape: "operation", data: { part_cedee: "100 %", accompagnement: "6 mois" } });
    expect(reponsePour(qcm, "18 mois (choix libre)", reponses)).toBeNull();
    const prop = liste.find((x) => x.genre === "proposition");
    const r = reponsePour(prop, "  Trois compagnons, un apprenti.  ", reponses);
    expect(r).toEqual({ etape: "complements", data: { organisation: [{ demande: prop.demande, reponse: "Trois compagnons, un apprenti." }] } });
    expect(reponsePour(prop, "   ", reponses)).toBeNull();
    for (const x of liste) for (const e of ["financials", "retraitements", "clients", "perspectives", "bilan"]) expect(ETAPES_MODIFIABLES.has(e)).toBe(false), expect(x.etape ?? "operation").not.toBe(e);
  });
});
