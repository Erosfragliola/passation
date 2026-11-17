// Règles du dossier (module pur, partagé entre le Worker, le navigateur et les tests) :
// checklist « Votre préparation » et calcul de l'avancement (par bloc, et global selon les étapes du parcours).

/** Pièces habituellement demandées par un repreneur lors de l'audit d'acquisition. Liste indicative. */
export const CHECKLIST = [
  { groupe: "Juridique", items: [
    ["statuts", "Statuts à jour"],
    ["kbis", "Extrait Kbis récent"],
    ["pv-ag", "Procès-verbaux des assemblées des 3 dernières années"],
    ["capital", "Répartition du capital et pacte d'associés éventuel"],
  ] },
  { groupe: "Financier", items: [
    ["liasses", "Liasses fiscales et comptes annuels des 3 derniers exercices"],
    ["situation", "Situation intermédiaire de l'exercice en cours"],
    ["emprunts", "Détail des emprunts, crédits-bails et garanties données"],
    ["balances", "Balances âgées clients et fournisseurs"],
  ] },
  { groupe: "Social", items: [
    ["organigramme", "Organigramme"],
    ["registre", "Registre unique du personnel"],
    ["contrats-cles", "Contrats de travail des personnes clés"],
    ["accords", "Accords d'entreprise et convention collective applicable"],
  ] },
  { groupe: "Commercial", items: [
    ["clients", "Chiffre d'affaires par client (principaux clients)"],
    ["contrats", "Contrats clients et fournisseurs importants"],
    ["cgv", "Conditions générales de vente"],
  ] },
  { groupe: "Actifs et risques", items: [
    ["baux", "Baux commerciaux et titres de propriété éventuels"],
    ["equipements", "Inventaire des équipements principaux"],
    ["marques", "Marques, brevets et noms de domaine"],
    ["assurances", "Attestations d'assurance"],
    ["litiges", "Litiges en cours ou passés récents"],
    ["autorisations", "Autorisations, agréments et certifications"],
  ] },
];
export const CLES_CHECKLIST = new Set(CHECKLIST.flatMap((g) => g.items.map(([k]) => k)));

/**
 * Avancement de 0 à 100 par bloc, et global : les étapes du parcours guidé, pondérées. Le dirigeant ne part pas de
 * zéro : le dossier existe, donc l'entreprise est identifiée (15) ; première valeur express (10) ; un exercice
 * confirmé (20) et les trois (5 de plus) ; questionnaire (15, au prorata) ; valorisation approfondie (15) ; documents
 * (20, au prorata des 3). La checklist « Votre préparation » reste à part : elle n'entre pas dans le global.
 * @param d { estimation_express: bool, chiffres_valides: 0..1, questionnaire_pct: 0..100, valorisation_approfondie: bool,
 *            documents: n (0..3), checklist: Set de clés cochées }
 */
export function avancement(d) {
  const preparation = Math.round(100 * [...(d.checklist || [])].filter((k) => CLES_CHECKLIST.has(k)).length / CLES_CHECKLIST.size);
  const part = Math.min(1, Math.max(0, d.chiffres_valides || 0));
  const chiffres = Math.round(100 * part);
  const valorisation = d.valorisation_approfondie ? 100 : d.estimation_express ? 25 : 0;
  const nDocs = Math.min(3, d.documents || 0);
  const documents = Math.round(100 * nDocs / 3);
  const q = Math.min(100, Math.max(0, d.questionnaire_pct || 0));
  const global = Math.round(15 + (d.estimation_express ? 10 : 0) + (part > 0 ? 20 : 0) + (part >= 1 ? 5 : 0)
    + 15 * q / 100 + (d.valorisation_approfondie ? 15 : 0) + 20 * nDocs / 3);
  return { global, chiffres, valorisation, documents, preparation };
}
