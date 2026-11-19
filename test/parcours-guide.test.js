import { describe, it, expect } from "vitest";
import { memoDeverrouille } from "../src/documents/memo.js";
import { siteDepuisEmail, questionRepondue, requisManquants, questionsIncompletes, QUESTIONS, NB_QUESTIONS, avancementQuestions, questionsAPoser, vuesDe, POUR_ALLER_PLUS_LOIN } from "../public/js/parcours.js";
import { ETAPES } from "../public/js/questionnaire.js";

describe("parcours guidé", () => {
  it("site proposé depuis une adresse professionnelle, jamais depuis une messagerie grand public", () => {
    expect(siteDepuisEmail("jean@atelier-exemple.fr")).toBe("www.atelier-exemple.fr");
    for (const e of ["jean@gmail.com", "jean@orange.fr", "jean@hotmail.fr", "pas-un-email"]) expect(siteDepuisEmail(e)).toBeNull();
  });
  it("question répondue si tous ses champs le sont, ou si l'écran a été vu (réponse « passer »)", () => {
    const q = QUESTIONS.find((x) => x.id === "operation");
    expect(questionRepondue(q, { operation: { part_cedee: "100 %" } })).toBe(false);
    expect(questionRepondue(q, { operation: { part_cedee: "100 %", motif: "Autre", calendrier: "6 à 12 mois" } })).toBe(true);
    expect(questionRepondue(q, { operation: { part_cedee: "100 %" } }, ["operation"])).toBe(true);
  });
  // 17/11/2026 : un écran « vu » mais sans la réponse indispensable menait à un échec de rédaction sans issue
  it("une réponse indispensable au mémorandum doit être remplie, même si l'écran a été vu", () => {
    const op = QUESTIONS.find((x) => x.id === "operation"), act = QUESTIONS.find((x) => x.id === "activite");
    expect(questionRepondue(op, {}, ["operation"])).toBe(false);
    expect(requisManquants(op, {})).toEqual(["la part du capital cédée"]);
    expect(questionRepondue(act, { activite: { description: "   " } }, ["activite"])).toBe(false);
    expect(questionRepondue(act, { activite: { description: "Menuiserie sur mesure." } }, ["activite"])).toBe(true);
    expect(questionsIncompletes({ activite: { description: "x" } }).map((q) => q.id)).toEqual(["operation"]);
    expect(questionsIncompletes({ activite: { description: "x" }, operation: { part_cedee: "100 %" } })).toEqual([]);
  });
  it("les réponses indispensables du parcours sont exactement celles qu'exige le mémorandum côté serveur", () => {
    expect(questionsIncompletes({}).length).toBe(memoDeverrouille({}).manque.length);
    const complet = { activite: { description: "x" }, operation: { part_cedee: "100 %" } };
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
  const complet = { activite: { description: "Menuiserie sur mesure." }, operation: { part_cedee: "100 %", motif: "Autre", calendrier: "6 à 12 mois" } };
  it("les questions sont celles du parcours guidé, plus celle du site : 13 + 1 = 14", () => {
    expect(QUESTIONS.length).toBe(13);
    expect(NB_QUESTIONS).toBe(14);
  });
  it("plus aucune question ne sert aux flux actualisés (méthode écartée)", () => {
    for (const q of QUESTIONS) expect(`${q.titre} ${q.aide || ""} ${q.pourquoi || ""}`).not.toMatch(/DCF|flux actualisés|actualis/i);
    expect(QUESTIONS.some((q) => q.champs.some((c) => c.cle === "capital_personnes_physiques"))).toBe(false);
  });
  it("décompte : rien → 0 sur 14 ; site « pas de site » + opération complète → 2 sur 14 (14 %)", () => {
    expect(avancementQuestions({})).toEqual({ faits: 0, total: 14, pct: 0 });
    expect(avancementQuestions({ ...complet, site: { aucun: true } })).toEqual({ faits: 3, total: 14, pct: 21 }); // site, activité, opération : 3 / 14 = 21,4 %
    expect(avancementQuestions({ site: { aucun: true }, operation: complet.operation })).toEqual({ faits: 2, total: 14, pct: 14 });
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
    // Site renseigné, 11 écrans passés sur 13 : restent activité et distinctions (jamais vues) et opération, vue mais
    // sans la part du capital cédée, indispensable au mémorandum → 3
    expect(questionsAPoser({ site: { aucun: true }, parcours: { vues: QUESTIONS.slice(2).map((q) => q.id) } })).toEqual(["activite", "distinctions", "operation"]);
  });
  it("« Pour aller plus loin » : le reste du questionnaire complet, sans doublon avec le parcours ni question inutile", () => {
    const duParcours = new Set(QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])].map((c) => `${c.etape}.${c.cle}`)));
    const cles = POUR_ALLER_PLUS_LOIN.flatMap((e) => e.questions.map((q) => `${e.cle}.${q.cle}`));
    for (const k of cles) expect(duParcours.has(k)).toBe(false);
    expect(cles).not.toContain("bilan.capital_personnes_physiques");
    expect(cles).not.toContain("perspectives.investissements_pct");
    // activité 3 + atouts 2 + clients 2 + perspectives 1 + bilan 7 = 15, compté à la main dans questionnaire.js
    expect(cles.length).toBe(15);
    expect(ETAPES.flatMap((e) => e.questions).length).toBe(32); // le questionnaire complet reste intact (datapack, serveur)
  });
});

