// Answers proposed in the guided steps: each proposal has a source, nothing is invented.
import { describe, it, expect } from "vitest";
import { propositions, croissanceProposee, clienteleDuSecteur, datesCles, SOURCES_PROPOSITION } from "../src/documents/propositions.js";
import { QUESTIONS } from "../public/js/parcours.js";

const menuiserie = { nom: "X", ville: "Nantes", code_postal: "44300", naf: "43.32A", section_naf: "F", date_creation: "1995-03-01", tranche_effectif: { code: "12" },
  evenements: [{ date: "2004-06-01", type: "transfert_siege", detail: "Nantes" }, { date: "2012-01-10", type: "denomination", ancien: "A", nouveau: "B" }] };

describe("proposed answers", () => {
  it("growth: the option closest to past growth; nothing without accounts", () => {
    expect(croissanceProposee(0.067)).toBe(0.05);   // |0,067 − 0,05| = 0,017 < |0,067 − 0,10| = 0,033
    expect(croissanceProposee(0.081)).toBe(0.1);
    expect(croissanceProposee(-0.2)).toBe(-0.05);
    expect(croissanceProposee(null)).toBeNull();
  });
  it("customers based on the industry: retail trade → individuals; construction → businesses", () => {
    expect(clienteleDuSecteur("47.71Z", "G")).toEqual(["Particuliers"]);
    expect(clienteleDuSecteur("43.32A", "F")).toEqual(["Entreprises"]);
    expect(clienteleDuSecteur("99.99Z", "U")).toBeNull();
  });
  it("key dates drawn from the registries: creation then public events", () => {
    expect(datesCles(menuiserie)).toEqual(["1995 : création de l'entreprise (siège actuel à Nantes)", "2004 : transfert du siège à Nantes", "2012 : changement de dénomination"]);
  });
  it("a file without a website: sourced proposals, no invented distinctive feature", () => {
    const p = propositions({ entreprise: menuiserie, tcam: 0.067, reponses: {} });
    expect(p.activite.source).toBe(SOURCES_PROPOSITION.registres);
    expect(p.activite.valeurs["activite.description"]).toMatch(/^Entreprise du secteur « Travaux de construction spécialisés » créée en 1995 à Nantes/);
    expect(p.activite.a_completer).toBe(true);                                // simple starting point: never approved in one click
    expect(p.distinctions).toBeUndefined();                                    // without a website, nothing is guessed
    expect(p.equipe.valeurs["dirigeant.encadrement"]).toBe("Oui, un ou plusieurs responsables"); // band 12: 20 to 49 employees
    expect(p.clients.valeurs).toEqual({ "activite.zone": "Régionale", "clients.regions": ["Pays de la Loire"], "clients.type_clientele": ["Entreprises"] });
    expect(p.perspectives).toEqual({ valeurs: { "perspectives.croissance": 0.05 }, source: SOURCES_PROPOSITION.comptes });
    expect(p.operation.source).toBe(SOURCES_PROPOSITION.frequent);            // common choice: always "to be confirmed"
  });
  it("with an approved website: description and distinctive features drawn from the ticked facts only", () => {
    const site = { faits: [{ fait: "Menuiseries sur mesure en bois.", categorie: "activite", valide: true }, { fait: "Entreprise certifiée Qualibat.", categorie: "qualite", valide: true }, { fait: "Livraison rapide.", categorie: "autre", valide: false }] };
    const p = propositions({ entreprise: menuiserie, reponses: { site } });
    expect(p.activite.valeurs["activite.description"]).toBe("Menuiseries sur mesure en bois. Entreprise certifiée Qualibat.");
    expect(p.distinctions.valeurs["activite.distinctions"]).toEqual(["Sur mesure", "Certifications"]); // "rapide": unapproved fact, ignored
    expect(p.distinctions.valeurs["activite.certifications"]).toBe("Entreprise certifiée Qualibat.");
    expect(p.perspectives).toBeUndefined();
  });
  it("each proposal corresponds to a question and to fields of the flow", () => {
    const p = propositions({ entreprise: menuiserie, tcam: 0.05, reponses: { site: { faits: [{ fait: "Qualité et sur mesure", categorie: "qualite", valide: true }] } } });
    for (const [id, { valeurs, source }] of Object.entries(p)) {
      const q = QUESTIONS.find((x) => x.id === id);
      expect(q, id).toBeTruthy();
      expect(source).toBeTruthy();
      const champs = new Set(q.champs.map((c) => `${c.etape}.${c.cle}`));
      for (const k of Object.keys(valeurs)) expect(champs.has(k), `${id} ${k}`).toBe(true);
    }
  });
});
