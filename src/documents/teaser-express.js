// Quick teaser, shown with the estimate on the home page: anonymous facts calculated by the code, with the same
// rules as the file's teaser (anonymat.js): industry at the NAF division level, region, age in bands,
// INSEE headcount band. Never a name, a city, a SIREN or an exact figure.
import { regionDe, anciennete, secteurDe } from "./anonymat.js";
import { libelleSalaries } from "../../public/js/regles.js";
import { nomDeCode } from "./nom-de-code.js";

export { secteurDe }; // single industry label, defined in anonymat.js

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
