// Questions du parcours guidé : une par écran, réponses rapides (choix) quand c'est possible, questions sautées
// quand elles ne s'appliquent pas. Chaque réponse est rangée dans l'étape du questionnaire complet correspondante.
import { ETAPES } from "./questionnaire.js";
import { T, avecTextes } from "./i18n.js";
// Textes des questions (titre, aide, chapitre, pourquoi, libellés) : src/contenu/<langue>/parcours.json (marqueur T).
// Les options des questions à choix sont les valeurs enregistrées (en français) ; libellés : libelleOption().
/** Périmètre de l'opération : réponses possibles (reprises telles quelles dans le schéma du mémorandum). */
export const DETENTION = { direct: "En direct, à titre personnel", holding: "Par une société holding", associes: "Avec d'autres associés" };
export const MURS = { societe: "À l'entreprise elle-même", dirigeant: "À vous ou à votre famille (souvent une SCI)", tiers: "À un propriétaire extérieur", aucun: "Pas de locaux en propre" };
export const MURS_CESSION = { inclus: "Oui, avec l'entreprise", bail: "Non, un bail sera proposé au repreneur", ouvert: "À discuter" };

// Chaque question : `chapitre` (où va la réponse dans le mémorandum) et `pourquoi` (ce qu'un repreneur y cherche).
// 20/11/2026 (PR « Parcours d'analyse : plus guidé, plus précis ») : 9 questions + le site = 10 écrans au lieu de 14.
// Dates clés et équipe d'abord : la lecture du site (une minute environ) se termine pendant ces deux écrans ; ses
// faits, son logo et ses photos sont validés juste après, puis l'activité est demandée avec les métiers lus.
// Chaque réponse gardée nourrit une section précise du mémorandum ; les champs retirés restent dans le questionnaire
// complet (« Pour aller plus loin »). Types : etiquettes (puces à cocher, liste enrichie par Passation et le
// dirigeant), phrase (texte proposé à partir des choix), multi (choix à icône, `max` réponses au plus), choix,
// montant / pourcentage (champ formaté + curseur), dates (lignes date / événement / précision), regions, top_clients,
// exceptionnels. `replie` : bloc facultatif replié sous un lien.
export const QUESTIONS = [
  { id: "histoire", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "activite", cle: "dates_cles", type: "dates" }] },
  { id: "equipe", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "dirigeant", cle: "encadrement", type: "choix", libelle: T, options: ["Oui, un ou plusieurs responsables", "En partie", "Non, tout passe par moi"] },
      { etape: "dirigeant", cle: "role_dirigeant", type: "multi", libelle: T, options: [["Commercial", "poignee"], ["Production", "usine"], ["Gestion", "graphe"], ["Achats", "euro"], ["Encadrement", "equipe"]] },
    ] },
  { id: "activite", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "activite", cle: "metiers", type: "etiquettes", libelle: T, aide: T, ajouter: T },
      { etape: "clients", cle: "type_clientele", type: "multi", libelle: T, options: [["Particuliers", "equipe"], ["Entreprises", "metier"], ["Collectivités", "balance"], ["Autres professionnels", "poignee"]] },
      { etape: "activite", cle: "description", type: "phrase", libelle: T, aide: T, requis: T },
    ] },
  { id: "distinctions", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "activite", cle: "distinctions", type: "multi", max: 3, options: [["Qualité", "qualite"], ["Sur mesure", "outil"], ["Délais", "horloge"], ["Équipements", "usine"], ["Certifications", "bouclier"], ["Relation client", "poignee"]] },
      { etape: "activite", cle: "certifications", type: "etiquettes", libelle: T, aide: T, ajouter: T },
    ] },
  { id: "clients", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "clients", cle: "part_premier_client", type: "pourcentage", libelle: T, aide: T, min: 0, max: 100, fraction: true },
      { etape: "activite", cle: "zone", type: "choix", libelle: T, options: ["Locale", "Régionale", "Nationale", "Internationale"] },
      { etape: "clients", cle: "regions", type: "regions", libelle: T, replie: T, facultatif: true },
      { etape: "clients", cle: "principaux", type: "top_clients", libelle: T, replie: T, facultatif: true },
    ] },
  // 24/11/2026 (part C): the questions that change the value (pay, rent, exceptional items, holding, walls, share sold)
  // left this list for the first stage, "Your valuation" (VALORISATION below); the keys of the answers are unchanged.
  { id: "operation", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "operation", cle: "calendrier", type: "choix", libelle: T, options: ["Moins de 6 mois", "6 à 12 mois", "1 à 2 ans", "Plus de 2 ans"] },
      { etape: "operation", cle: "motif", type: "choix", libelle: T, options: ["Départ à la retraite", "Nouveau projet", "Raisons personnelles", "Autre"] },
      { etape: "operation", cle: "accompagnement", type: "choix", libelle: T, options: ["3 mois", "6 mois", "12 mois", "Plus de 12 mois"] },
      { etape: "operation", cle: "repreneur", type: "multi", libelle: T, options: [["Dirigeant indépendant", "equipe"], ["Entreprise du secteur", "usine"], ["Fonds d'investissement", "euro"], ["Salariés", "poignee"], ["Indifférent", "valide"]] },
    ] },
  { id: "perspectives", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "perspectives", cle: "croissance", type: "pourcentage", libelle: T, aide: T, min: -20, max: 30, fraction: true },
      { etape: "perspectives", cle: "axes", type: "multi", max: 3, libelle: T, options: [["Nouveaux produits", "metier"], ["Nouvelles zones", "lieu"], ["Nouveaux clients", "poignee"], ["Plus de capacité", "usine"], ["Vente en ligne", "globe"], ["Rachat d'un concurrent", "croissance"]] },
    ] },
];

for (const q of QUESTIONS) {
  avecTextes(q, `parcours.questions.${q.id}`);
  for (const c of [...q.champs, ...(q.suite?.champs || [])]) avecTextes(c, `parcours.questions.${q.id}.champs.${c.cle}`);
}

// ---------------------------------------------------------------- First stage: "Your valuation" (24/11/2026)
// Two screens of answers that change the value, each validated as a whole by the owner and never pre-answered:
// restatements (pay, rent, exceptional items; leasing explained) and net debt and scope. Same answer keys as before
// (dirigeant.*, retraitements.*, bilan.*, operation.*): files already started keep their answers.
// `si`: field shown only when the condition holds; `requis`: needed for the screen to count as done.
const mursAVous = (r) => r.retraitements?.murs === MURS.dirigeant;
export const VALORISATION = {
  retraitements: [
    { etape: "dirigeant", cle: "remuneration_dirigeant_reelle", libelle: T, aide: T, type: "montant", max: 250000, requis: true },
    { etape: "dirigeant", cle: "remuneration_normative", libelle: T, aide: T, type: "montant", max: 250000, requis: true },
    { etape: "retraitements", cle: "murs", libelle: T, aide: T, type: "choix", options: Object.values(MURS), requis: true },
    { etape: "retraitements", cle: "loyer_paye", libelle: T, type: "montant", max: 200000, requis: true, si: mursAVous },
    { etape: "retraitements", cle: "loyer_marche", libelle: T, aide: T, type: "montant", max: 200000, requis: true, si: mursAVous },
    { etape: "retraitements", cle: "exceptionnel_signale", libelle: T, aide: T, type: "choix", options: ["Oui", "Non"], requis: true },
    { etape: "retraitements", cle: "exceptionnels", libelle: T, aide: T, type: "exceptionnels", si: (r) => r.retraitements?.exceptionnel_signale === "Oui" },
  ],
  dette: [
    { etape: "bilan", cle: "comptes_courants_remboursables", libelle: T, aide: T, type: "montant", max: 5000000 },
    { etape: "bilan", cle: "credit_bail_restant", libelle: T, aide: T, type: "montant", max: 5000000 },
    { etape: "bilan", cle: "dividendes_a_verser", libelle: T, aide: T, type: "montant", max: 5000000 },
    { etape: "bilan", cle: "actifs_hors_exploitation", libelle: T, aide: T, type: "montant", max: 5000000 },
    { etape: "operation", cle: "detention", libelle: T, type: "choix", options: Object.values(DETENTION), requis: true },
    { etape: "retraitements", cle: "murs_cession", libelle: T, type: "choix", options: Object.values(MURS_CESSION), requis: true, si: mursAVous },
    { etape: "operation", cle: "part_cedee", libelle: T, type: "choix", options: ["100 %", "Majoritaire", "Minoritaire", "À définir"], requis: true },
  ],
};
for (const [ecran, champs] of Object.entries(VALORISATION)) for (const c of champs) avecTextes(c, `parcours.valorisation.${ecran}.champs.${c.cle}`);

const rempli = (v) => v != null && v !== "" && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length);
/** Fields of a valuation screen shown for these answers. */
export const champsVisibles = (ecran, r = {}) => VALORISATION[ecran].filter((c) => !c.si || c.si(r));
/** Required answers of a valuation screen still empty (field definitions). */
export const manquesValorisation = (ecran, r = {}) => champsVisibles(ecran, r).filter((c) => c.requis && !rempli(r[c.etape]?.[c.cle]));
/**
 * Where the first stage stands, from the saved answers only (same rule for the guided steps, the file page and the
 * server). A screen is done only once the owner has validated it ("vues") and its required answers are filled: an
 * answer given in the former flow is shown again on the screen, never counted as validated.
 */
export function etatValorisation(r = {}, vues = vuesDe(r)) {
  return {
    exercices_passes: vues.includes("exercices_passes"),
    retraitements: vues.includes("retraitements") && !manquesValorisation("retraitements", r).length,
    dette: vues.includes("dette") && !manquesValorisation("dette", r).length,
    validation: Number.isFinite(r.validation?.le) ? { le: r.validation.le } : null,
  };
}
/** Réponses indispensables au mémorandum encore vides sur cet écran (libellés), quel que soit le passage du dirigeant. */
export const requisManquants = (q, r) => q.champs.filter((c) => c.requis && !rempli(r[c.etape]?.[c.cle])).map((c) => c.requis);
/**
 * Une question est-elle répondue ? Les réponses facultatives laissées vides comptent comme répondues si l'écran a été
 * vu ; les réponses indispensables au mémorandum (« requis ») doivent toujours être remplies.
 */
export function questionRepondue(q, r, vues = []) {
  if (requisManquants(q, r).length) return false;
  if (vues.includes(q.id)) return true;
  return q.champs.filter((c) => !c.facultatif).every((c) => rempli(r[c.etape]?.[c.cle]));
}
/** Questions dont une réponse indispensable manque (l'ordre du parcours). */
export const questionsIncompletes = (r) => QUESTIONS.filter((q) => requisManquants(q, r).length);

// ---------------------------------------------------------------- Une seule notion de « questions »
// Les questions du dirigeant sont celles du parcours guidé, plus celle du site internet (posée en premier, dans
// l'étape « Vos réponses »). Le total est le même partout : parcours guidé, page du dossier, serveur.
/** Le site a-t-il une réponse (adresse donnée, ou « pas de site ») ? */
const siteRepondu = (r = {}) => Boolean(r.site?.url || r.site?.aucun);
export const NB_QUESTIONS = QUESTIONS.length + 1;
/**
 * Position of a question screen among every screen of « Your company » (the website first, then the questions in
 * order), whatever is already answered: « Question 3 of 8 » stays the same after a pause (audit of 25/11/2026; the
 * counter used to count only the questions left, « 1 of 6 » then « 1 of 5 »). null for an unknown screen.
 */
export function positionQuestion(cle) {
  const i = cle === "site" ? 0 : QUESTIONS.findIndex((q) => q.id === cle) + 1;
  return i >= 0 && (cle === "site" || i > 0) ? { n: i + 1, total: NB_QUESTIONS } : null;
}
/** Écrans vus (« Passer » compte comme une réponse), enregistrés dans l'étape « parcours » des réponses. */
export const vuesDe = (r = {}) => (Array.isArray(r.parcours?.vues) ? r.parcours.vues.filter((x) => typeof x === "string") : []);
/** Questions répondues sur le total, et leur pourcentage (pour l'avancement global). */
export function avancementQuestions(r = {}, vues = vuesDe(r)) {
  const faits = QUESTIONS.filter((q) => questionRepondue(q, r, vues)).length + (siteRepondu(r) ? 1 : 0);
  // restantes: identifiers of the questions still without an answer, so that every screen can name them
  return { faits, total: NB_QUESTIONS, pct: Math.round((100 * faits) / NB_QUESTIONS), restantes: questionsAPoser(r, vues) };
}
/**
 * Questions qui restent à montrer, dans l'ordre du parcours : « site » d'abord s'il n'a pas de réponse, puis les
 * identifiants des questions sans réponse. Le compteur « Question N sur M » du parcours guidé compte cette liste :
 * les questions déjà répondues, pré-remplies et validées, ou passées n'y sont pas.
 */
export function questionsAPoser(r = {}, vues = vuesDe(r)) {
  return [...(siteRepondu(r) ? [] : ["site"]), ...QUESTIONS.filter((q) => !questionRepondue(q, r, vues)).map((q) => q.id)];
}

/** Adresse de site proposée à partir d'une adresse e-mail professionnelle (jamais pour une messagerie grand public). */
const MESSAGERIES = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "aol.com", "protonmail.com", "proton.me", "gmx.fr", "gmx.com", "bbox.fr", "numericable.fr", "club-internet.fr", "exemple.fr"]);
/** Questions du questionnaire complet absentes du parcours guidé : facultatives (« Pour aller plus loin »), hors du
 *  pourcentage et de « À faire maintenant ». Celles qui ne servaient qu'aux flux actualisés (méthode écartée, rien
 *  ne les affiche) ne sont plus posées. */
// The restatements and the net-debt items are asked in the first stage only (a single place since 24/11/2026)
const CLES_DU_PARCOURS = new Set([...QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])]), ...Object.values(VALORISATION).flat()].map((c) => `${c.etape}.${c.cle}`));
const SANS_USAGE = new Set(["perspectives.investissements_pct", "bilan.capital_personnes_physiques"]);
// Copie des étapes avec leurs accesseurs (les textes restent lus dans la langue courante, pas figés au chargement).
export const POUR_ALLER_PLUS_LOIN = ETAPES
  .map((e) => Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(e),
    questions: { value: e.questions.filter((q) => !CLES_DU_PARCOURS.has(`${e.cle}.${q.cle}`) && !SANS_USAGE.has(`${e.cle}.${q.cle}`)), enumerable: true } }))
  .filter((e) => e.questions.length);

export function siteDepuisEmail(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!d || MESSAGERIES.has(d) || !d.includes(".")) return null;
  return `www.${d.replace(/^www\./, "")}`;
}
