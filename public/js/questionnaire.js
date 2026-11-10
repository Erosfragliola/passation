// Questionnaire « Votre entreprise » : 5 écrans, sauvegarde automatique. Partagé par l'écran et le serveur.
// Types : euros, pct (saisi en %, stocké en fraction), jours, texte, oui_non, exceptionnels (liste).

export const ETAPES = [
  {
    cle: "dirigeant", titre: "Vous et votre rémunération",
    intro: "Pour comparer l'entreprise à une entreprise équivalente dirigée par un salarié, nous ramenons votre rémunération à un niveau « normal ».",
    questions: [
      { cle: "remuneration_dirigeant_reelle", type: "euros", libelle: "Votre rémunération annuelle réelle, charges sociales comprises", aide: "Salaire + charges + avantages payés par l'entreprise." },
      { cle: "remuneration_normative", type: "euros", libelle: "Ce que coûterait un directeur salarié pour vous remplacer, charges comprises", aide: "Votre estimation ; votre expert-comptable peut vous aider. Laissez vide si vous ne savez pas." },
      { cle: "role_dirigeant", type: "texte", libelle: "Ce que vous faites seul aujourd'hui (clients, production, gestion)", aide: "Sert à apprécier la dépendance de l'entreprise à votre personne." },
    ],
  },
  {
    cle: "retraitements", titre: "Loyer et éléments exceptionnels",
    intro: "Certains montants des comptes ne se répéteront pas chez un repreneur. Chaque ajustement doit être justifié.",
    questions: [
      { cle: "loyer_paye", type: "euros", libelle: "Loyer annuel payé, si les locaux vous appartiennent (ou à une SCI familiale)", aide: "Laissez vide si les locaux appartiennent à un tiers." },
      { cle: "loyer_marche", type: "euros", libelle: "Loyer annuel de marché pour des locaux équivalents" },
      { cle: "exceptionnels", type: "exceptionnels", libelle: "Charges ou produits exceptionnels inclus dans l'EBE", aide: "Montant positif : charge à réintégrer (l'EBE augmente). Négatif : produit à retirer." },
    ],
  },
  {
    cle: "clients", titre: "Vos clients",
    intro: "La concentration et la récurrence du chiffre d'affaires pèsent sur la valeur.",
    questions: [
      { cle: "part_premier_client", type: "pct", libelle: "Part du premier client dans le chiffre d'affaires" },
      { cle: "part_cinq_clients", type: "pct", libelle: "Part des cinq premiers clients" },
      { cle: "part_recurrente", type: "pct", libelle: "Part du chiffre d'affaires récurrent (contrats, abonnements, clients fidèles)" },
    ],
  },
  {
    cle: "perspectives", titre: "Vos perspectives sur 5 ans",
    intro: "Ces hypothèses alimentent le DCF. Sans réponse, nous partons de votre historique et l'indiquons.",
    questions: [
      { cle: "croissance", type: "pct", libelle: "Croissance annuelle moyenne du chiffre d'affaires attendue" },
      { cle: "marge_ebe", type: "pct", libelle: "Marge d'EBE visée (EBE / chiffre d'affaires)" },
      { cle: "investissements_pct", type: "pct", libelle: "Investissements annuels prévus, en % du chiffre d'affaires" },
    ],
  },
  {
    cle: "bilan", titre: "Dettes et actifs à préciser",
    intro: "Ces éléments ne se lisent pas toujours dans la liasse ; ils servent au passage de la valeur d'entreprise à la valeur de vos titres.",
    questions: [
      { cle: "comptes_courants_remboursables", type: "euros", libelle: "Comptes courants d'associés à rembourser" },
      { cle: "credit_bail_restant", type: "euros", libelle: "Crédit-bail : loyers restant dus" },
      { cle: "dividendes_a_verser", type: "euros", libelle: "Dividendes votés non encore versés" },
      { cle: "plus_values_latentes", type: "euros", libelle: "Plus-values latentes (immobilier, fonds de commerce) que vous pouvez justifier" },
      { cle: "frais_etablissement", type: "euros", libelle: "Frais d'établissement encore à l'actif" },
      { cle: "creances_douteuses", type: "euros", libelle: "Créances douteuses non provisionnées" },
      { cle: "actifs_hors_exploitation", type: "euros", libelle: "Actifs hors exploitation (trésorerie excédentaire, bien non utilisé)" },
      { cle: "capital_personnes_physiques", type: "oui_non", libelle: "Le capital est-il détenu à 75 % au moins par des personnes physiques ?", aide: "Conditionne le taux réduit d'IS de 15 % (avec un chiffre d'affaires ≤ 10 M€)." },
    ],
  },
];

/** Avancement du questionnaire : questions renseignées / total. */
export function avancementQuestionnaire(reponses = {}) {
  let total = 0, faits = 0;
  for (const e of ETAPES) for (const q of e.questions) {
    total++;
    const v = reponses[e.cle]?.[q.cle];
    if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) faits++;
  }
  return { faits, total, pct: Math.round((faits / total) * 100) };
}
