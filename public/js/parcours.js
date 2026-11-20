// Questions of the guided steps: one per screen, quick answers (choices) when possible, questions skipped
// when they do not apply. Each answer is stored in the corresponding step of the full questionnaire.
import { ETAPES } from "./questionnaire.js";
import { T, avecTextes } from "./i18n.js";
// Texts of the questions (title, help, chapter, why, labels): src/contenu/<language>/parcours.json (marker T).
// The options of choice questions are the saved values (in French); labels: libelleOption().
/** Scope of the deal: possible answers (used as they are in the memorandum's schema). */
export const DETENTION = { direct: "En direct, à titre personnel", holding: "Par une société holding", associes: "Avec d'autres associés" };
export const MURS = { societe: "À l'entreprise elle-même", dirigeant: "À vous ou à votre famille (souvent une SCI)", tiers: "À un propriétaire extérieur", aucun: "Pas de locaux en propre" };
export const MURS_CESSION = { inclus: "Oui, avec l'entreprise", bail: "Non, un bail sera proposé au repreneur", ouvert: "À discuter" };

// Each question: `chapitre` (where the answer goes in the memorandum) and `pourquoi` (what a buyer looks for in it).
export const QUESTIONS = [
  { id: "activite", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "activite", cle: "description", type: "texte", requis: T }] },
  { id: "distinctions", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "activite", cle: "distinctions", type: "multi", options: [["Qualité", "qualite"], ["Sur mesure", "outil"], ["Délais", "horloge"], ["Équipements", "usine"], ["Certifications", "bouclier"], ["Relation client", "poignee"]] },
      { etape: "activite", cle: "certifications", type: "ligne", libelle: T, exemple: T },
    ] },
  { id: "equipe", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "dirigeant", cle: "encadrement", type: "choix", libelle: T, options: ["Oui, un ou plusieurs responsables", "En partie", "Non, tout passe par moi"] },
      { etape: "dirigeant", cle: "role_dirigeant", type: "multi", libelle: T, options: [["Commercial", "poignee"], ["Production", "usine"], ["Gestion", "graphe"], ["Achats", "euro"], ["Encadrement", "equipe"]] },
      { etape: "dirigeant", cle: "anciennete_equipe", type: "choix", libelle: T, options: ["Moins de 3 ans", "3 à 10 ans", "Plus de 10 ans"] },
    ] },
  { id: "histoire", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "activite", cle: "dates_cles", type: "texte" }] },
  { id: "operation", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "operation", cle: "part_cedee", type: "choix", libelle: T, options: ["100 %", "Majoritaire", "Minoritaire", "À définir"], requis: T },
      { etape: "operation", cle: "motif", type: "choix", libelle: T, options: ["Départ à la retraite", "Nouveau projet", "Raisons personnelles", "Autre"] },
      { etape: "operation", cle: "calendrier", type: "choix", libelle: T, options: ["Moins de 6 mois", "6 à 12 mois", "1 à 2 ans", "Plus de 2 ans"] },
    ] },
  { id: "remuneration", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "dirigeant", cle: "remuneration_dirigeant_reelle", type: "euros", libelle: T },
      { etape: "dirigeant", cle: "remuneration_normative", type: "euros", libelle: T },
    ] },
  { id: "detention", titre: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "operation", cle: "detention", type: "choix", options: Object.values(DETENTION) }] },
  { id: "locaux", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "retraitements", cle: "murs", type: "choix", options: Object.values(MURS) }],
    suite: { si: (r) => r.retraitements?.murs === MURS.dirigeant, champs: [
      { etape: "retraitements", cle: "murs_cession", type: "choix", libelle: T, options: Object.values(MURS_CESSION) },
      { etape: "retraitements", cle: "loyer_paye", type: "euros", libelle: T },
      { etape: "retraitements", cle: "loyer_marche", type: "euros", libelle: T },
    ] } },
  { id: "exceptionnel", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "retraitements", cle: "exceptionnel_signale", type: "choix", options: ["Oui", "Non"] }],
    suite: { si: (r) => r.retraitements?.exceptionnel_signale === "Oui", champs: [{ etape: "retraitements", cle: "exceptionnels", type: "exceptionnels" }] } },
  { id: "clients", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "clients", cle: "type_clientele", type: "multi", libelle: T, options: [["Particuliers", "equipe"], ["Entreprises", "metier"], ["Collectivités", "balance"], ["Autres professionnels", "poignee"]] },
      { etape: "clients", cle: "part_premier_client", type: "curseur", libelle: T },
      { etape: "activite", cle: "zone", type: "choix", libelle: T, options: ["Locale", "Régionale", "Nationale", "Internationale"] },
      { etape: "clients", cle: "regions", type: "regions", libelle: T },
    ] },
  { id: "principaux_clients", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [{ etape: "clients", cle: "principaux", type: "top_clients" }] },
  { id: "perspectives", titre: T, aide: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "perspectives", cle: "croissance", type: "valeurs", libelle: T, options: [["−5 %", -0.05], ["0 %", 0], ["+5 %", 0.05], ["+10 %", 0.1], ["+15 %", 0.15]] },
      { etape: "perspectives", cle: "axes", type: "multi", libelle: T, options: [["Nouveaux produits", "metier"], ["Nouvelles zones", "lieu"], ["Nouveaux clients", "poignee"], ["Plus de capacité", "usine"], ["Vente en ligne", "globe"], ["Rachat d'un concurrent", "croissance"]] },
    ] },
  { id: "cession", titre: T,
    chapitre: T, pourquoi: T,
    champs: [
      { etape: "operation", cle: "accompagnement", type: "choix", libelle: T, options: ["3 mois", "6 mois", "12 mois", "Plus de 12 mois"] },
      { etape: "operation", cle: "repreneur", type: "multi", libelle: T, options: [["Dirigeant indépendant", "equipe"], ["Entreprise du secteur", "usine"], ["Fonds d'investissement", "euro"], ["Salariés", "poignee"], ["Indifférent", "valide"]] },
    ] },
];

for (const q of QUESTIONS) {
  avecTextes(q, `parcours.questions.${q.id}`);
  for (const c of [...q.champs, ...(q.suite?.champs || [])]) avecTextes(c, `parcours.questions.${q.id}.champs.${c.cle}`);
}

const rempli = (v) => v != null && v !== "" && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length);
/** Answers required for the memorandum still empty on this screen (labels), whatever the owner's path. */
export const requisManquants = (q, r) => q.champs.filter((c) => c.requis && !rempli(r[c.etape]?.[c.cle])).map((c) => c.requis);
/**
 * Is a question answered? Optional answers left empty count as answered if the screen has been
 * seen; answers required for the memorandum ("requis") must always be filled in.
 */
export function questionRepondue(q, r, vues = []) {
  if (requisManquants(q, r).length) return false;
  if (vues.includes(q.id)) return true;
  return q.champs.every((c) => rempli(r[c.etape]?.[c.cle]));
}
/** Questions with a missing required answer (in the order of the flow). */
export const questionsIncompletes = (r) => QUESTIONS.filter((q) => requisManquants(q, r).length);

// ---------------------------------------------------------------- A single notion of "questions"
// The owner's questions are those of the guided steps, plus the website question (asked first, in the
// "Your answers" step). The total is the same everywhere: guided steps, file page, server.
/** Does the website have an answer (address given, or "no website")? */
const siteRepondu = (r = {}) => Boolean(r.site?.url || r.site?.aucun);
export const NB_QUESTIONS = QUESTIONS.length + 1;
/** Screens seen ("Skip" counts as an answer), saved in the "parcours" step of the answers. */
export const vuesDe = (r = {}) => (Array.isArray(r.parcours?.vues) ? r.parcours.vues.filter((x) => typeof x === "string") : []);
/** Questions answered out of the total, and their percentage (for overall progress). */
export function avancementQuestions(r = {}, vues = vuesDe(r)) {
  const faits = QUESTIONS.filter((q) => questionRepondue(q, r, vues)).length + (siteRepondu(r) ? 1 : 0);
  return { faits, total: NB_QUESTIONS, pct: Math.round((100 * faits) / NB_QUESTIONS) };
}
/**
 * Questions still to show, in the order of the flow: "site" first if it has no answer, then the
 * identifiers of the unanswered questions. The "Question N of M" counter of the guided steps counts this list:
 * questions already answered, prefilled and approved, or skipped are not in it.
 */
export function questionsAPoser(r = {}, vues = vuesDe(r)) {
  return [...(siteRepondu(r) ? [] : ["site"]), ...QUESTIONS.filter((q) => !questionRepondue(q, r, vues)).map((q) => q.id)];
}

/** Website address suggested from a professional email address (never for a consumer email provider). */
const MESSAGERIES = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "aol.com", "protonmail.com", "proton.me", "gmx.fr", "gmx.com", "bbox.fr", "numericable.fr", "club-internet.fr", "exemple.fr"]);
/** Questions of the full questionnaire missing from the guided steps: optional ("Going further"), outside the
 *  percentage and "To do now". Those that only served the discounted cash flows (method left out, nothing
 *  displays them) are no longer asked. */
const CLES_DU_PARCOURS = new Set(QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])].map((c) => `${c.etape}.${c.cle}`)));
const SANS_USAGE = new Set(["perspectives.investissements_pct", "bilan.capital_personnes_physiques"]);
// Copy of the steps with their accessors (texts are still read in the current language, not frozen at load time).
export const POUR_ALLER_PLUS_LOIN = ETAPES
  .map((e) => Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(e),
    questions: { value: e.questions.filter((q) => !CLES_DU_PARCOURS.has(`${e.cle}.${q.cle}`) && !SANS_USAGE.has(`${e.cle}.${q.cle}`)), enumerable: true } }))
  .filter((e) => e.questions.length);

export function siteDepuisEmail(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!d || MESSAGERIES.has(d) || !d.includes(".")) return null;
  return `www.${d.replace(/^www\./, "")}`;
}
