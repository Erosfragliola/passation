// Teaser express, affiché dès l'estimation sur la page d'accueil : faits anonymes calculés par le code, aux mêmes
// règles que le teaser du dossier (anonymat.js) : secteur au niveau de la division NAF, région, ancienneté par
// paliers, tranche d'effectif INSEE. Jamais de nom, de ville, de SIREN ni de chiffre exact.
import { regionDe, anciennete, secteurDe } from "./anonymat.js";
import { libelleSalaries } from "../../public/js/regles.js";
import { nomDeCode } from "./nom-de-code.js";

export { secteurDe }; // libellé unique du secteur, défini dans anonymat.js

export function teaserExpress(d) {
  return {
    nom_de_code: nomDeCode(d.naf),
    teaser: {
      secteur: secteurDe(d.naf),
      region: regionDe(d.code_postal),
      anciennete: anciennete(d.date_creation),
      effectif: d.tranche_effectif?.code ? libelleSalaries(d.tranche_effectif.code) : null,
    },
  };
}
