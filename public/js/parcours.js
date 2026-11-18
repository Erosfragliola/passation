// Questions du parcours guidé : une par écran, réponses rapides (choix) quand c'est possible, questions sautées
// quand elles ne s'appliquent pas. Chaque réponse est rangée dans l'étape du questionnaire complet correspondante.
/** Périmètre de l'opération : réponses possibles (reprises telles quelles dans le schéma du mémorandum). */
export const DETENTION = { direct: "En direct, à titre personnel", holding: "Par une société holding", associes: "Avec d'autres associés" };
export const MURS = { societe: "À l'entreprise elle-même", dirigeant: "À vous ou à votre famille (souvent une SCI)", tiers: "À un propriétaire extérieur", aucun: "Pas de locaux en propre" };
export const MURS_CESSION = { inclus: "Oui, avec l'entreprise", bail: "Non, un bail sera proposé au repreneur", ouvert: "À discuter" };

export const QUESTIONS = [
  { id: "activite", titre: "En quelques phrases, que fait votre entreprise ?", aide: "Nous avons préparé un brouillon à partir de votre site, s'il existe : corrigez-le librement.",
    champs: [{ etape: "activite", cle: "description", type: "texte", requis: "la description de votre activité" }] },
  { id: "operation", titre: "Que souhaitez-vous céder, et quand ?",
    champs: [
      { etape: "operation", cle: "part_cedee", type: "choix", libelle: "Part du capital", options: ["100 %", "Majoritaire", "Minoritaire", "À définir"], requis: "la part du capital cédée" },
      { etape: "operation", cle: "motif", type: "choix", libelle: "Motif", options: ["Départ à la retraite", "Nouveau projet", "Raisons personnelles", "Autre"] },
      { etape: "operation", cle: "calendrier", type: "choix", libelle: "Calendrier souhaité", options: ["Moins de 6 mois", "6 à 12 mois", "1 à 2 ans", "Plus de 2 ans"] },
    ] },
  { id: "remuneration", titre: "Votre rémunération", aide: "Pour comparer avec ce que coûterait un dirigeant salarié. Charges sociales comprises, par an.",
    champs: [
      { etape: "dirigeant", cle: "remuneration_dirigeant_reelle", type: "euros", libelle: "Ce que vous coûtez à l'entreprise" },
      { etape: "dirigeant", cle: "remuneration_normative", type: "euros", libelle: "Ce que coûterait un directeur pour vous remplacer (laissez vide si vous ne savez pas)" },
    ] },
  { id: "detention", titre: "Comment détenez-vous les parts de l'entreprise ?", aide: "Pour décrire le périmètre de l'opération dans le mémorandum.",
    champs: [{ etape: "operation", cle: "detention", type: "choix", options: Object.values(DETENTION) }] },
  { id: "locaux", titre: "À qui appartiennent les murs de l'entreprise ?", aide: "Un repreneur pose toujours la question : achète-t-il aussi les murs, ou devient-il locataire ?",
    champs: [{ etape: "retraitements", cle: "murs", type: "choix", options: Object.values(MURS) }],
    suite: { si: (r) => r.retraitements?.murs === MURS.dirigeant, champs: [
      { etape: "retraitements", cle: "murs_cession", type: "choix", libelle: "Les murs font-ils partie de la cession ?", options: Object.values(MURS_CESSION) },
      { etape: "retraitements", cle: "loyer_paye", type: "euros", libelle: "Loyer annuel payé par l'entreprise" },
      { etape: "retraitements", cle: "loyer_marche", type: "euros", libelle: "Loyer annuel de marché pour des locaux équivalents" },
    ] } },
  { id: "exceptionnel", titre: "Une charge ou un produit exceptionnel a-t-il pesé sur vos derniers comptes ?", aide: "Par exemple : un litige, un sinistre, une subvention ponctuelle.",
    champs: [{ etape: "retraitements", cle: "exceptionnel_signale", type: "choix", options: ["Oui", "Non"] }],
    suite: { si: (r) => r.retraitements?.exceptionnel_signale === "Oui", champs: [{ etape: "retraitements", cle: "exceptionnels", type: "exceptionnels" }] } },
  { id: "clients", titre: "Vos clients",
    champs: [
      { etape: "clients", cle: "part_premier_client", type: "curseur", libelle: "Part du premier client dans le chiffre d'affaires" },
      { etape: "activite", cle: "zone", type: "choix", libelle: "Zone commerciale", options: ["Locale", "Régionale", "Nationale", "Internationale"] },
      { etape: "clients", cle: "regions", type: "regions", libelle: "Régions de vos principaux clients" },
    ] },
  { id: "principaux_clients", titre: "Vos cinq premiers clients", aide: "Sans aucun nom : ils apparaîtront comme « Client 1 » à « Client 5 ». Une estimation suffit ; laissez vide ce que vous ne savez pas.",
    champs: [{ etape: "clients", cle: "principaux", type: "top_clients" }] },
  { id: "perspectives", titre: "Comment voyez-vous l'évolution du chiffre d'affaires dans les 5 prochaines années ?", aide: "Une estimation annuelle moyenne suffit.",
    champs: [{ etape: "perspectives", cle: "croissance", type: "valeurs", options: [["−5 %", -0.05], ["0 %", 0], ["+5 %", 0.05], ["+10 %", 0.1], ["+15 %", 0.15]] }] },
  { id: "capital", titre: "Le capital est-il détenu à 75 % au moins par des personnes physiques ?", aide: "Cela détermine le taux d'impôt sur les sociétés utilisé (taux réduit de 15 % possible).",
    champs: [{ etape: "bilan", cle: "capital_personnes_physiques", type: "valeurs", options: [["Oui", "oui"], ["Non", "non"], ["Je ne sais pas", "non"]] }] },
];

const rempli = (v) => v != null && v !== "" && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length);
/** Réponses indispensables au mémorandum encore vides sur cet écran (libellés), quel que soit le passage du dirigeant. */
export const requisManquants = (q, r) => q.champs.filter((c) => c.requis && !rempli(r[c.etape]?.[c.cle])).map((c) => c.requis);
/**
 * Une question est-elle répondue ? Les réponses facultatives laissées vides comptent comme répondues si l'écran a été
 * vu ; les réponses indispensables au mémorandum (« requis ») doivent toujours être remplies.
 */
export function questionRepondue(q, r, vues = []) {
  if (requisManquants(q, r).length) return false;
  if (vues.includes(q.id)) return true;
  return q.champs.every((c) => rempli(r[c.etape]?.[c.cle]));
}
/** Questions dont une réponse indispensable manque (l'ordre du parcours). */
export const questionsIncompletes = (r) => QUESTIONS.filter((q) => requisManquants(q, r).length);

/** Adresse de site proposée à partir d'une adresse e-mail professionnelle (jamais pour une messagerie grand public). */
const MESSAGERIES = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "aol.com", "protonmail.com", "proton.me", "gmx.fr", "gmx.com", "bbox.fr", "numericable.fr", "club-internet.fr", "exemple.fr"]);
export function siteDepuisEmail(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!d || MESSAGERIES.has(d) || !d.includes(".")) return null;
  return `www.${d.replace(/^www\./, "")}`;
}
