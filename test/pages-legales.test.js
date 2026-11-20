// Pages légales : identité de l'éditeur lue dans src/contenu/cles.json (rubrique « legal »), lignes vides retirées,
// bandeau « Brouillon » tant que la relecture n'est pas datée, limites d'usage = constantes de src/config.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { texte, condition } from "../src/contenu/rendu.js";
import { CLAUDE_QUOTAS, EXPRESS_RATE_LIMIT, LIASSE, MARCHE, DURATIONS, CODE_ESSAIS_MAX } from "../src/config.js";

const lireJson = (p) => JSON.parse(readFileSync(new URL(`../src/contenu/${p}`, import.meta.url), "utf8"));
const page = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const LANGUES = ["fr", "en"];
const vide = { legal: { raison_sociale: "", forme: "", capital: "", rcs: "", adresse: "", directeur_publication: "", contact: "", relu_le: "" } };
const rempli = { legal: { raison_sociale: "Exemple SAS", forme: "SAS", capital: "1 000 €", rcs: "RCS Exemple 000 000 018", adresse: "1 rue de l’Exemple, 00000 Exempleville", directeur_publication: "Prénom Nom", contact: "contact@exemple.fr", relu_le: "2026-11-25" } };

describe("pages légales", () => {
  it.each([["mentions-legales.html", "mentions_legales"], ["confidentialite.html", "confidentialite"], ["cgu.html", "cgu"]])("%s : toutes les clés citées existent dans les deux langues", (f, espace) => {
    const cles = [...page(f).matchAll(/data-t(?:-html)?="([^"]+)"/g)].map((m) => m[1]).filter((k) => !k.startsWith("commun."));
    for (const l of LANGUES) { const d = lireJson(`${l}/${espace}.json`); for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy(); }
  });
  it("le bandeau « Brouillon » disparaît dès que la relecture est datée (legal.relu_le), sur les trois pages", () => {
    for (const f of ["mentions-legales.html", "confidentialite.html", "cgu.html"]) {
      expect(page(f).match(/data-sinon="legal\.relu_le"/g)?.length, f).toBe(2);
    }
    expect(condition(vide, "legal.relu_le")).toBe(false);
    expect(condition(rempli, "legal.relu_le")).toBe(true);
  });
  it("éditeur : une ligne par information renseignée, rien d'inventé quand cles.json est vide", () => {
    for (const l of LANGUES) {
      const d = lireJson(`${l}/mentions_legales.json`);
      expect(texte({ ...d, cles: vide }, "editeur_raison_sociale")).toBe(null);
      expect(texte({ ...d, cles: rempli }, "editeur_raison_sociale")).toContain("Exemple SAS");
      expect(texte({ ...d, cles: rempli }, "editeur_contact")).toContain("contact@exemple.fr");
      expect(d.hebergeur).toContain("101 Townsend Street, San Francisco, CA 94107");
    }
  });
  it("aucun « À compléter » restant pour l'hébergeur, les limites d'usage, les tarifs et le droit applicable", () => {
    for (const l of LANGUES) {
      const ml = lireJson(`${l}/mentions_legales.json`), cg = lireJson(`${l}/cgu.json`);
      for (const v of [ml.hebergeur, cg.limites_usage_appliquent_pour_garantir, cg.tarifs, cg.droit_applicable]) expect(v).not.toMatch(/compléter|to be completed/i);
    }
  });
  it("les limites d'usage et durées affichées sont celles de src/config.js", () => {
    const cg = lireJson("fr/cgu.json").limites_usage_appliquent_pour_garantir;
    expect(cg).toContain(`${EXPRESS_RATE_LIMIT.requetesParHeureParIP} valorisations express par heure`);
    expect(cg).toContain(`${CLAUDE_QUOTAS.dossiersParUtilisateur} dossiers par compte`);
    expect(cg).toContain(`${CLAUDE_QUOTAS.traitementsParJourParUtilisateur} traitements automatiques par jour`);
    expect(cg).toContain(`${LIASSE.lecturesMaxParDossier} lectures de liasse (${LIASSE.fichiersMax} fichiers de ${LIASSE.tailleMax / 1024 / 1024} Mo`);
    expect(cg).toContain(`${MARCHE.etudesMaxParDossier} études de marché`);
    const co = lireJson("fr/confidentialite.json").durees_conservation;
    expect(co).toContain(`${DURATIONS.codeConnexion / 60} minutes (${CODE_ESSAIS_MAX} essais`);
    expect(co).toContain(`${DURATIONS.session / 86400} jours`);
    expect(co).toContain(`${DURATIONS.apiCache / 3600} heures`);
  });
});
