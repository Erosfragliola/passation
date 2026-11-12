// Teaser express, affiché dès l'estimation sur la page d'accueil : faits anonymes calculés par le code, aux mêmes
// règles que le teaser du dossier (anonymat.js) : secteur au niveau de la division NAF, région, ancienneté par
// paliers, tranche d'effectif INSEE. Jamais de nom, de ville, de SIREN ni de chiffre exact.
import divisions from "../data/naf-divisions.json";
import { regionDe, anciennete } from "./anonymat.js";
import { libelleSalaries } from "../../public/js/regles.js";
import { nomDeCode } from "./nom-de-code.js";

/** Libellé lisible : la division NAF officielle, sans la clause « à l'exception de… ». */
export function secteurDe(naf) {
  const l = divisions.divisions[String(naf || "").slice(0, 2)];
  return l ? l.split(", à l'exception")[0] : null;
}

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
