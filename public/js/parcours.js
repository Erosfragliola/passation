// Questions du parcours guidé : une par écran, réponses rapides (choix) quand c'est possible, questions sautées
// quand elles ne s'appliquent pas. Chaque réponse est rangée dans l'étape du questionnaire complet correspondante.
export const QUESTIONS = [
  { id: "activite", titre: "En quelques phrases, que fait votre entreprise ?", aide: "Nous avons préparé un brouillon à partir de votre site, s'il existe : corrigez-le librement.",
    champs: [{ etape: "activite", cle: "description", type: "texte" }] },
  { id: "operation", titre: "Que souhaitez-vous céder, et quand ?",
    champs: [
      { etape: "operation", cle: "part_cedee", type: "choix", libelle: "Part du capital", options: ["100 %", "Majoritaire", "Minoritaire", "À définir"] },
      { etape: "operation", cle: "motif", type: "choix", libelle: "Motif", options: ["Départ à la retraite", "Nouveau projet", "Raisons personnelles", "Autre"] },
      { etape: "operation", cle: "calendrier", type: "choix", libelle: "Calendrier souhaité", options: ["Moins de 6 mois", "6 à 12 mois", "1 à 2 ans", "Plus de 2 ans"] },
    ] },
  { id: "remuneration", titre: "Votre rémunération", aide: "Pour comparer avec ce que coûterait un dirigeant salarié. Charges sociales comprises, par an.",
    champs: [
      { etape: "dirigeant", cle: "remuneration_dirigeant_reelle", type: "euros", libelle: "Ce que vous coûtez à l'entreprise" },
      { etape: "dirigeant", cle: "remuneration_normative", type: "euros", libelle: "Ce que coûterait un directeur pour vous remplacer (laissez vide si vous ne savez pas)" },
    ] },
  { id: "locaux", titre: "Les locaux appartiennent-ils à vous ou à votre famille (SCI) ?",
    champs: [{ etape: "retraitements", cle: "locaux_proprietaire", type: "choix", options: ["Oui", "Non"] }],
    suite: { si: (r) => r.retraitements?.locaux_proprietaire === "Oui", champs: [
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
  { id: "perspectives", titre: "Comment voyez-vous l'évolution du chiffre d'affaires dans les 5 prochaines années ?", aide: "Une estimation annuelle moyenne suffit.",
    champs: [{ etape: "perspectives", cle: "croissance", type: "valeurs", options: [["−5 %", -0.05], ["0 %", 0], ["+5 %", 0.05], ["+10 %", 0.1], ["+15 %", 0.15]] }] },
  { id: "capital", titre: "Le capital est-il détenu à 75 % au moins par des personnes physiques ?", aide: "Cela détermine le taux d'impôt sur les sociétés utilisé (taux réduit de 15 % possible).",
    champs: [{ etape: "bilan", cle: "capital_personnes_physiques", type: "valeurs", options: [["Oui", "oui"], ["Non", "non"], ["Je ne sais pas", "non"]] }] },
];

/** Une question est-elle répondue ? (les réponses vides « je ne sais pas » comptent comme répondues si l'écran a été vu) */
export function questionRepondue(q, r, vues = []) {
  if (vues.includes(q.id)) return true;
  return q.champs.every((c) => { const v = r[c.etape]?.[c.cle]; return v != null && v !== "" && !(Array.isArray(v) && !v.length); });
}

/** Adresse de site proposée à partir d'une adresse e-mail professionnelle (jamais pour une messagerie grand public). */
const MESSAGERIES = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "aol.com", "protonmail.com", "proton.me", "gmx.fr", "gmx.com", "bbox.fr", "numericable.fr", "club-internet.fr", "exemple.fr"]);
export function siteDepuisEmail(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!d || MESSAGERIES.has(d) || !d.includes(".")) return null;
  return `www.${d.replace(/^www\./, "")}`;
}
