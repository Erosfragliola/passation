import { describe, it, expect } from "vitest";
import { memoDeverrouille } from "../src/documents/memo.js";
import { siteDepuisEmail, questionRepondue, requisManquants, questionsIncompletes, QUESTIONS, NB_QUESTIONS, avancementQuestions, questionsAPoser, vuesDe, POUR_ALLER_PLUS_LOIN, VALORISATION, manquesValorisation } from "../public/js/parcours.js";
import { ETAPES } from "../public/js/questionnaire.js";

describe("parcours guidé", () => {
  it("site proposé depuis une adresse professionnelle, jamais depuis une messagerie grand public", () => {
    expect(siteDepuisEmail("jean@atelier-exemple.fr")).toBe("www.atelier-exemple.fr");
    for (const e of ["jean@gmail.com", "jean@orange.fr", "jean@hotmail.fr", "pas-un-email"]) expect(siteDepuisEmail(e)).toBeNull();
  });
  it("question répondue si tous ses champs le sont, ou si l'écran a été vu (réponse « passer »)", () => {
    const q = QUESTIONS.find((x) => x.id === "operation");
    expect(questionRepondue(q, { operation: { motif: "Autre" } })).toBe(false);
    expect(questionRepondue(q, { operation: { motif: "Autre", calendrier: "6 à 12 mois", accompagnement: "6 mois", repreneur: ["Indifférent"] } })).toBe(true);
    expect(questionRepondue(q, { operation: { motif: "Autre" } }, ["operation"])).toBe(true);
  });
  // 17/11/2026 : un écran « vu » mais sans la réponse indispensable menait à un échec de rédaction sans issue
  it("une réponse indispensable au mémorandum doit être remplie, même si l'écran a été vu", () => {
    const act = QUESTIONS.find((x) => x.id === "activite");
    expect(questionRepondue(act, { activite: { description: "   " } }, ["activite"])).toBe(false);
    expect(questionRepondue(act, { activite: { description: "Menuiserie sur mesure." } }, ["activite"])).toBe(true);
    expect(questionsIncompletes({}).map((q) => q.id)).toEqual(["activite"]);
    expect(questionsIncompletes({ activite: { description: "x" } })).toEqual([]);
    // La part du capital cédée est demandée dans le premier temps (« Dette nette et périmètre »), indispensable
    expect(manquesValorisation("dette", {}).map((c) => c.cle)).toEqual(["detention", "part_cedee"]);
  });
  it("les réponses indispensables du parcours sont exactement celles qu'exige le mémorandum côté serveur", () => {
    // le mémorandum exige la description (question du mémorandum) et la part cédée (premier temps, validé avant lui)
    // … and the approval of the figures, recorded by the server at the end of the first stage
    expect(questionsIncompletes({}).length + manquesValorisation("dette", {}).filter((c) => c.cle === "part_cedee").length + 1).toBe(memoDeverrouille({}).manque.length);
    expect(memoDeverrouille({ activite: { description: "x" }, operation: { part_cedee: "100 %" } }).ok).toBe(false);
    const complet = { activite: { description: "x" }, operation: { part_cedee: "100 %" }, validation: { le: 1 } };
    expect(memoDeverrouille(complet).ok).toBe(true);
    expect(questionsIncompletes(complet)).toEqual([]);
  });
  // 10 depuis le mémorandum « banque d'affaires » (17/11/2026, accord du dirigeant) : détention des titres et cinq premiers clients
  it("16 questions au plus, chacune rangée dans une étape du questionnaire complet", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(16);
    const etapes = new Set(["activite", "operation", "dirigeant", "retraitements", "clients", "perspectives", "bilan"]);
    for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) expect(etapes.has(c.etape)).toBe(true);
  });
});

// Audit du 19/11/2026 : « Question 1 sur 15 », puis « 8 réponses préparées », puis 32 questions sur la page du dossier
describe("une seule notion de « questions »", () => {
  // Écrans « activité » et « projet de cession » remplis en entier (tous leurs champs non facultatifs)
  const complet = { activite: { description: "Menuiserie sur mesure.", metiers: ["Escaliers"] }, clients: { type_clientele: ["Particuliers"] },
    operation: { part_cedee: "100 %", motif: "Autre", calendrier: "6 à 12 mois", accompagnement: "6 mois", repreneur: ["Indifférent"] } };
  // 20/11/2026 (PR « Parcours d'analyse : plus guidé, plus précis ») : 14 écrans → 10
  // 24/11/2026 (partie C) : rémunération, loyer, exceptionnels, détention, murs et part cédée passent dans le premier
  // temps, « Votre valorisation » ; les questions sont celles du mémorandum : 7 + le site = 8
  it("les questions sont celles du mémorandum, plus celle du site : 7 + 1 = 8", () => {
    expect(QUESTIONS.length).toBe(7);
    expect(NB_QUESTIONS).toBe(8);
    expect(QUESTIONS.map((q) => q.id)).toEqual(["histoire", "equipe", "activite", "distinctions", "clients", "operation", "perspectives"]);
    const valeur = new Set(Object.values(VALORISATION).flat().map((c) => `${c.etape}.${c.cle}`));
    for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) expect(valeur.has(`${c.etape}.${c.cle}`)).toBe(false);
  });
  it("plus aucune question ne sert aux flux actualisés (méthode écartée)", () => {
    for (const q of QUESTIONS) expect(`${q.titre} ${q.aide || ""} ${q.pourquoi || ""}`).not.toMatch(/DCF|flux actualisés|actualis/i);
    expect(QUESTIONS.some((q) => q.champs.some((c) => c.cle === "capital_personnes_physiques"))).toBe(false);
  });
  it("décompte : rien → 0 sur 8 ; site « pas de site » + opération complète → 2 sur 8 (25 %)", () => {
    expect(avancementQuestions({})).toMatchObject({ faits: 0, total: 8, pct: 0 });
    expect(avancementQuestions({ ...complet, site: { aucun: true } })).toMatchObject({ faits: 3, total: 8, pct: 38 }); // site, activité, opération : 3 / 8 = 37,5 %
    expect(avancementQuestions({ site: { aucun: true }, operation: complet.operation })).toMatchObject({ faits: 2, total: 8, pct: 25 });
  });
  it("un bloc replié facultatif (régions, cinq premiers clients) ne retient pas l'écran « Vos clients »", () => {
    const clients = QUESTIONS.find((q) => q.id === "clients");
    expect(questionRepondue(clients, { clients: { part_premier_client: 0.2 }, activite: { zone: "Régionale" } })).toBe(true);
    expect(questionRepondue(clients, { clients: { part_premier_client: 0.2 } })).toBe(false); // zone manquante
  });
  it("un écran passé, enregistré dans « parcours.vues », compte comme répondu (même décompte au serveur et dans le parcours)", () => {
    const r = { operation: { part_cedee: "100 %" }, parcours: { vues: ["operation", "histoire"] } };
    expect(vuesDe(r)).toEqual(["operation", "histoire"]);
    expect(avancementQuestions(r).faits).toBe(2);
    expect(vuesDe({ parcours: { vues: "x" } })).toEqual([]);
  });
  it("« Question N sur M » : M = questions encore à montrer, égal aux « dernières questions » de la page du dossier", () => {
    expect(questionsAPoser({})).toEqual(["site", ...QUESTIONS.map((q) => q.id)]);
    for (const r of [{}, complet, { ...complet, site: { url: "www.exemple.fr" } }, { site: { aucun: true }, parcours: { vues: QUESTIONS.slice(2).map((q) => q.id) } }]) {
      const a = avancementQuestions(r);
      expect(questionsAPoser(r).length).toBe(a.total - a.faits);
    }
    // Site renseigné, 5 écrans passés sur 7 : restent dates clés et équipe (jamais vues), puis activité, vue mais sans
    // sa réponse indispensable (description de l'activité) → 3, nommées par la page du dossier
    const r = { site: { aucun: true }, parcours: { vues: QUESTIONS.slice(2).map((q) => q.id) } };
    expect(questionsAPoser(r)).toEqual(["histoire", "equipe", "activite"]);
    expect(avancementQuestions(r).restantes).toEqual(["histoire", "equipe", "activite"]);
  });
  it("« Pour aller plus loin » : le reste du questionnaire complet, sans doublon avec le parcours ni question inutile", () => {
    const duParcours = new Set(QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])].map((c) => `${c.etape}.${c.cle}`)));
    const cles = POUR_ALLER_PLUS_LOIN.flatMap((e) => e.questions.map((q) => `${e.cle}.${q.cle}`));
    for (const k of cles) expect(duParcours.has(k)).toBe(false);
    expect(cles).not.toContain("bilan.capital_personnes_physiques");
    expect(cles).not.toContain("perspectives.investissements_pct");
    // activité 3 + atouts 2 + dirigeant 1 (ancienneté de l'équipe, retirée du parcours le 20/11/2026) + clients 2
    // + perspectives 1 + bilan 3 = 12, compté à la main dans questionnaire.js. Les 4 éléments de dette (comptes
    // courants, crédit-bail, dividendes, actifs hors exploitation) et les retraitements ne sont plus que dans le
    // premier temps (24/11/2026 : un seul endroit, plus d'onglet « facultatif »)
    const valeur = new Set(Object.values(VALORISATION).flat().map((c) => `${c.etape}.${c.cle}`));
    for (const k of cles) expect(valeur.has(k)).toBe(false);
    expect(cles.length).toBe(12);
    expect(cles).toContain("dirigeant.anciennete_equipe");
    expect(ETAPES.flatMap((e) => e.questions).length).toBe(33); // 32 + l'ancienneté de l'équipe (datapack, serveur intacts)
  });
});

