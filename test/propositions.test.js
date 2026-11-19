// Réponses proposées dans le parcours guidé : chaque proposition a une source, rien n'est inventé.
import { describe, it, expect } from "vitest";
import { propositions, croissanceProposee, clienteleDuSecteur, datesCles, SOURCES_PROPOSITION } from "../src/documents/propositions.js";
import { QUESTIONS } from "../public/js/parcours.js";

const menuiserie = { nom: "X", ville: "Nantes", code_postal: "44300", naf: "43.32A", section_naf: "F", date_creation: "1995-03-01", tranche_effectif: { code: "12" },
  evenements: [{ date: "2004-06-01", type: "transfert_siege", detail: "Nantes" }, { date: "2012-01-10", type: "denomination", ancien: "A", nouveau: "B" }] };

describe("réponses proposées", () => {
  it("croissance : l'option la plus proche de la croissance passée ; rien sans comptes", () => {
    expect(croissanceProposee(0.067)).toBe(0.05);   // |0,067 − 0,05| = 0,017 < |0,067 − 0,10| = 0,033
    expect(croissanceProposee(0.081)).toBe(0.1);
    expect(croissanceProposee(-0.2)).toBe(-0.05);
    expect(croissanceProposee(null)).toBeNull();
  });
  it("clientèle d'après le secteur : commerce de détail → particuliers ; construction → entreprises", () => {
    expect(clienteleDuSecteur("47.71Z", "G")).toEqual(["Particuliers"]);
    expect(clienteleDuSecteur("43.32A", "F")).toEqual(["Entreprises"]);
    expect(clienteleDuSecteur("99.99Z", "U")).toBeNull();
  });
  it("dates clés tirées des registres : création puis événements publics", () => {
    expect(datesCles(menuiserie)).toEqual(["1995 : création de l'entreprise (siège actuel à Nantes)", "2004 : transfert du siège à Nantes", "2012 : changement de dénomination"]);
  });
  it("un dossier sans site : propositions sourcées, aucune distinction inventée", () => {
    const p = propositions({ entreprise: menuiserie, tcam: 0.067, reponses: {} });
    expect(p.activite.source).toBe(SOURCES_PROPOSITION.registres);
    expect(p.activite.valeurs["activite.description"]).toMatch(/^Entreprise du secteur « Travaux de construction spécialisés » créée en 1995 à Nantes/);
    expect(p.activite.a_completer).toBe(true);                                // simple amorce : jamais validée d'un clic
    expect(p.distinctions).toBeUndefined();                                    // sans site, rien n'est deviné
    expect(p.equipe.valeurs["dirigeant.encadrement"]).toBe("Oui, un ou plusieurs responsables"); // tranche 12 : 20 à 49 salariés
    expect(p.clients.valeurs).toEqual({ "activite.zone": "Régionale", "clients.regions": ["Pays de la Loire"], "clients.type_clientele": ["Entreprises"] });
    expect(p.perspectives).toEqual({ valeurs: { "perspectives.croissance": 0.05 }, source: SOURCES_PROPOSITION.comptes });
    expect(p.operation.source).toBe(SOURCES_PROPOSITION.frequent);            // choix fréquent : toujours « à confirmer »
  });
  it("avec un site validé : description et distinctions tirées des faits cochés seulement", () => {
    const site = { faits: [{ fait: "Menuiseries sur mesure en bois.", categorie: "activite", valide: true }, { fait: "Entreprise certifiée Qualibat.", categorie: "qualite", valide: true }, { fait: "Livraison rapide.", categorie: "autre", valide: false }] };
    const p = propositions({ entreprise: menuiserie, reponses: { site } });
    expect(p.activite.valeurs["activite.description"]).toBe("Menuiseries sur mesure en bois. Entreprise certifiée Qualibat.");
    expect(p.distinctions.valeurs["activite.distinctions"]).toEqual(["Sur mesure", "Certifications"]); // « rapide » : fait non validé, ignoré
    expect(p.distinctions.valeurs["activite.certifications"]).toBe("Entreprise certifiée Qualibat.");
    expect(p.perspectives).toBeUndefined();
  });
  it("chaque proposition correspond à une question et à des champs du parcours", () => {
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
