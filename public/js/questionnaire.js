// Questionnaire complet (8 étapes), partagé par l'écran et le serveur. Le dirigeant n'en voit que la partie absente
// du parcours guidé, facultative : POUR_ALLER_PLUS_LOIN (parcours.js).
// Types : euros, pct (saisi en %, stocké en fraction), texte, oui_non, choix (options), regions (cases), exceptionnels (liste).
// Textes (titre, intro, libellé, aide) : src/contenu/<langue>/questionnaire.json, lus à chaque accès (marqueur T) dans la
// langue de la page ou de la requête. Les options des questions à choix sont les valeurs enregistrées (en français) :
// leur libellé affiché passe par libelleOption().
import { valeur, T, avecTextes } from "./i18n.js";
/** Libellé affiché d'une réponse à choix (la valeur enregistrée reste la valeur française). */
export const libelleOption = (cle, v) => valeur(`questionnaire.options.${cle}`)?.[v] ?? v;
/** Précision affichée sous une réponse à choix multiples (« finitions, matériaux »), ou null. */
export const detailOption = (cle, v) => valeur(`questionnaire.details.${cle}`)?.[v] ?? null;

export const ETAPES = [
  {
    cle: "activite", titre: T,
    intro: T,
    questions: [
      { cle: "description", type: "texte", libelle: T, aide: T },
      { cle: "produits_services", type: "texte", libelle: T },
      { cle: "clientele", type: "texte", libelle: T },
      { cle: "zone", type: "choix", libelle: T, options: ["Locale", "Régionale", "Nationale", "Internationale"] },
      { cle: "equipe", type: "texte", libelle: T },
    ],
  },
  {
    cle: "atouts", titre: T,
    intro: T,
    questions: [
      { cle: "forces", type: "texte", libelle: T },
      { cle: "developpement", type: "texte", libelle: T },
    ],
  },
  {
    cle: "operation", titre: T,
    intro: T,
    questions: [
      { cle: "part_cedee", type: "choix", libelle: T, options: ["100 %", "Majoritaire", "Minoritaire", "À définir"] },
      { cle: "motif", type: "texte", libelle: T, aide: T },
      { cle: "accompagnement", type: "texte", libelle: T, aide: T },
      { cle: "calendrier", type: "texte", libelle: T },
    ],
  },
  {
    cle: "dirigeant", titre: T,
    intro: T,
    questions: [
      { cle: "remuneration_dirigeant_reelle", type: "euros", libelle: T, aide: T },
      { cle: "remuneration_normative", type: "euros", libelle: T, aide: T },
      { cle: "role_dirigeant", type: "texte", libelle: T, aide: T },
    ],
  },
  {
    cle: "retraitements", titre: T,
    intro: T,
    questions: [
      { cle: "loyer_paye", type: "euros", libelle: T, aide: T },
      { cle: "loyer_marche", type: "euros", libelle: T },
      { cle: "exceptionnels", type: "exceptionnels", libelle: T, aide: T },
    ],
  },
  {
    cle: "clients", titre: T,
    intro: T,
    questions: [
      { cle: "part_premier_client", type: "pct", libelle: T },
      { cle: "part_cinq_clients", type: "pct", libelle: T },
      { cle: "part_recurrente", type: "pct", libelle: T },
      { cle: "regions", type: "regions", libelle: T, aide: T },
    ],
  },
  {
    cle: "perspectives", titre: T,
    intro: T,
    questions: [
      { cle: "croissance", type: "pct", libelle: T },
      { cle: "marge_ebe", type: "pct", libelle: T },
      { cle: "investissements_pct", type: "pct", libelle: T },
    ],
  },
  {
    cle: "bilan", titre: T,
    intro: T,
    questions: [
      { cle: "comptes_courants_remboursables", type: "euros", libelle: T },
      { cle: "credit_bail_restant", type: "euros", libelle: T },
      { cle: "dividendes_a_verser", type: "euros", libelle: T },
      { cle: "plus_values_latentes", type: "euros", libelle: T },
      { cle: "frais_etablissement", type: "euros", libelle: T },
      { cle: "creances_douteuses", type: "euros", libelle: T },
      { cle: "actifs_hors_exploitation", type: "euros", libelle: T },
      { cle: "capital_personnes_physiques", type: "oui_non", libelle: T, aide: T },
    ],
  },
];

for (const e of ETAPES) {
  avecTextes(e, `questionnaire.etapes.${e.cle}`);
  for (const q of e.questions) avecTextes(q, `questionnaire.etapes.${e.cle}.questions.${q.cle}`);
}

/** Régions métropolitaines (découpage de 2016), pour la question « regions » et la carte du mémorandum. */
export const REGIONS = ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur"];
