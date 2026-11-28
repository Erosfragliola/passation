// Answers proposed in the guided flow: each proposal has a source, nothing is invented.
import { describe, it, expect } from "vitest";
import { propositions, croissanceProposee, clienteleDuSecteur, datesCles, SOURCES_PROPOSITION } from "../src/documents/propositions.js";
import { QUESTIONS } from "../public/js/parcours.js";

const menuiserie = { nom: "X", ville: "Nantes", code_postal: "44300", naf: "43.32A", section_naf: "F", date_creation: "1995-03-01", tranche_effectif: { code: "12" },
  evenements: [{ date: "2004-06-01", type: "transfert_siege", detail: "Nantes" }, { date: "2012-01-10", type: "denomination", ancien: "A", nouveau: "B" }] };

describe("réponses proposées", () => {
  it("croissance (curseur) : la croissance passée arrondie au point, bornée à −20 % / +30 % ; rien sans comptes", () => {
    expect(croissanceProposee(0.067)).toBe(0.07);  // 6,7 % → 7 %
    expect(croissanceProposee(0.081)).toBe(0.08);
    expect(croissanceProposee(-0.25)).toBe(-0.2);  // lower bound of the slider
    expect(croissanceProposee(0.5)).toBe(0.3);     // upper bound of the slider
    expect(croissanceProposee(null)).toBeNull();
  });
  it("clientèle d'après le secteur : commerce de détail → particuliers ; construction → entreprises", () => {
    expect(clienteleDuSecteur("47.71Z", "G")).toEqual(["Particuliers"]);
    expect(clienteleDuSecteur("43.32A", "F")).toEqual(["Entreprises"]);
    expect(clienteleDuSecteur("99.99Z", "U")).toBeNull();
  });
  it("dates clés tirées des registres : lignes date / événement / précision, source affichée", () => {
    const src = SOURCES_PROPOSITION.registres;
    expect(datesCles(menuiserie)).toEqual([
      { date: "1995", type: "creation", precision: "siège actuel à Nantes", source: src },
      { date: "06/2004", type: "transfert_siege", precision: "à Nantes", source: src },
      { date: "01/2012", type: "autre", precision: "changement de dénomination", source: src },
    ]);
  });
  it("un dossier sans site : propositions sourcées, aucune distinction inventée, aucun choix multiple « fréquent »", () => {
    const p = propositions({ entreprise: menuiserie, tcam: 0.067, reponses: {} });
    // Trade: the INSEE label of subclass 43.32A (naf-sous-classes.json), not that of division 43
    expect(p.activite.valeurs).toEqual({ "activite.metiers": ["Travaux de menuiserie bois et PVC"], "clients.type_clientele": ["Entreprises"] });
    expect(p.activite.source).toBe(SOURCES_PROPOSITION.registres);
    expect(p.activite.valeurs["activite.description"]).toBeUndefined();         // the sentence is written on screen, from the choices
    expect(p.distinctions).toBeUndefined();                                    // without a website, nothing is guessed
    expect(p.equipe.valeurs).toEqual({ "dirigeant.encadrement": "Oui, un ou plusieurs responsables" }); // band 12: 20 to 49 employees
    expect(p.clients.valeurs).toEqual({ "activite.zone": "Régionale", "clients.regions": ["Pays de la Loire"] });
    expect(p.perspectives).toEqual({ valeurs: { "perspectives.croissance": 0.07 }, source: SOURCES_PROPOSITION.comptes });
    expect(p.operation.source).toBe(SOURCES_PROPOSITION.frequent);            // frequent choice: always « to confirm »
    expect(p.operation.valeurs["operation.repreneur"]).toBeUndefined();       // no multiple choice pre-ticked without a source
  });
  it("avec un site validé : métiers lus, distinctions et certifications tirées des faits gardés seulement", () => {
    const site = { metiers: ["Menuiseries sur mesure"], faits: [{ id: 1, fait: "Menuiseries sur mesure en bois.", categorie: "activite", valide: true }, { id: 2, fait: "Entreprise certifiée Qualibat.", categorie: "qualite", valide: true }, { id: 3, fait: "Livraison rapide.", categorie: "autre", valide: false }] };
    const p = propositions({ entreprise: menuiserie, reponses: { site } });
    expect(p.activite.valeurs["activite.metiers"]).toEqual(["Menuiseries sur mesure"]);           // pre-ticked: read on the website
    expect(p.activite.autres).toEqual({ "activite.metiers": ["Travaux de menuiserie bois et PVC"] }); // proposed, unticked
    expect(p.activite.source).toBe(SOURCES_PROPOSITION.site);
    expect(p.distinctions.valeurs["activite.distinctions"]).toEqual(["Sur mesure", "Certifications"]); // « rapide »: fact removed, ignored
    expect(p.distinctions.valeurs["activite.certifications"]).toEqual(["Qualibat"]);
    expect(p.perspectives).toBeUndefined();
  });
  it("un fait contredit par les registres n'est pas utilisé tant que le dirigeant n'a pas tranché", () => {
    const fait = { id: 1, fait: "Fondée en 1982, qualité et finitions soignées.", categorie: "histoire", valide: true }; // registres : 1995
    expect(propositions({ entreprise: menuiserie, reponses: { site: { faits: [fait] } } }).distinctions).toBeUndefined();
    const tranche = propositions({ entreprise: menuiserie, reponses: { site: { faits: [{ ...fait, resolu: true }] } } });
    expect(tranche.distinctions.valeurs["activite.distinctions"]).toEqual(["Qualité"]);
  });
  it("chaque proposition correspond à une question et à des champs du parcours", () => {
    const p = propositions({ entreprise: menuiserie, tcam: 0.05, reponses: { site: { faits: [{ id: 1, fait: "Qualité et sur mesure", categorie: "qualite", valide: true }] } } });
    for (const [id, { valeurs, source }] of Object.entries(p)) {
      const q = QUESTIONS.find((x) => x.id === id);
      expect(q, id).toBeTruthy();
      expect(source).toBeTruthy();
      const champs = new Set([...q.champs, ...(q.suite?.champs || [])].map((c) => `${c.etape}.${c.cle}`));
      for (const k of Object.keys(valeurs)) expect(champs.has(k), `${id} ${k}`).toBe(true);
    }
  });
});
