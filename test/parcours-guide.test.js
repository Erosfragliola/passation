import { describe, it, expect } from "vitest";
import { memoDeverrouille } from "../src/documents/memo.js";
import { siteDepuisEmail, questionRepondue, requisManquants, questionsIncompletes, QUESTIONS, NB_QUESTIONS, avancementQuestions, questionsAPoser, vuesDe, POUR_ALLER_PLUS_LOIN } from "../public/js/parcours.js";
import { ETAPES } from "../public/js/questionnaire.js";

describe("guided steps", () => {
  it("website suggested from a professional address, never from a consumer email provider", () => {
    expect(siteDepuisEmail("jean@atelier-exemple.fr")).toBe("www.atelier-exemple.fr");
    for (const e of ["jean@gmail.com", "jean@orange.fr", "jean@hotmail.fr", "pas-un-email"]) expect(siteDepuisEmail(e)).toBeNull();
  });
  it('question answered if all its fields are, or if the screen has been seen ("skip" answer)', () => {
    const q = QUESTIONS.find((x) => x.id === "operation");
    expect(questionRepondue(q, { operation: { part_cedee: "100 %" } })).toBe(false);
    expect(questionRepondue(q, { operation: { part_cedee: "100 %", motif: "Autre", calendrier: "6 à 12 mois", accompagnement: "6 mois", repreneur: ["Indifférent"] } })).toBe(true);
    expect(questionRepondue(q, { operation: { part_cedee: "100 %" } }, ["operation"])).toBe(true);
  });
  // 17/11/2026: a screen "seen" but without the required answer led to a drafting failure with no way out
  it("an answer required for the memorandum must be filled in, even if the screen has been seen", () => {
    const op = QUESTIONS.find((x) => x.id === "operation"), act = QUESTIONS.find((x) => x.id === "activite");
    expect(questionRepondue(op, {}, ["operation"])).toBe(false);
    expect(requisManquants(op, {})).toEqual(["la part du capital cédée"]);
    expect(questionRepondue(act, { activite: { description: "   " } }, ["activite"])).toBe(false);
    expect(questionRepondue(act, { activite: { description: "Menuiserie sur mesure." } }, ["activite"])).toBe(true);
    expect(questionsIncompletes({ activite: { description: "x" } }).map((q) => q.id)).toEqual(["operation"]);
    expect(questionsIncompletes({ activite: { description: "x" }, operation: { part_cedee: "100 %" } })).toEqual([]);
  });
  it("the required answers of the flow are exactly those the memorandum requires on the server side", () => {
    expect(questionsIncompletes({}).length).toBe(memoDeverrouille({}).manque.length);
    const complet = { activite: { description: "x" }, operation: { part_cedee: "100 %" } };
    expect(memoDeverrouille(complet).ok).toBe(true);
    expect(questionsIncompletes(complet)).toEqual([]);
  });
  // 10 since the "investment bank" memorandum (17/11/2026, owner's approval): holding of the shares and top five customers
  it("16 questions at most, each stored in a step of the full questionnaire", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(16);
    const etapes = new Set(["activite", "operation", "dirigeant", "retraitements", "clients", "perspectives", "bilan"]);
    for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) expect(etapes.has(c.etape)).toBe(true);
  });
});

// Audit of 19/11/2026: "Question 1 of 15", then "8 prepared answers", then 32 questions on the file page
describe('a single notion of "questions"', () => {
  const complet = { activite: { description: "Menuiserie sur mesure." }, operation: { part_cedee: "100 %", motif: "Autre", calendrier: "6 à 12 mois" } };
  it("the questions are those of the guided steps, plus the website one: 13 + 1 = 14", () => {
    expect(QUESTIONS.length).toBe(13);
    expect(NB_QUESTIONS).toBe(14);
  });
  it("no question serves the discounted cash flows any more (method left out)", () => {
    for (const q of QUESTIONS) expect(`${q.titre} ${q.aide || ""} ${q.pourquoi || ""}`).not.toMatch(/DCF|flux actualisés|actualis/i);
    expect(QUESTIONS.some((q) => q.champs.some((c) => c.cle === "capital_personnes_physiques"))).toBe(false);
  });
  it('count: nothing → 0 of 14; website "no website" + complete deal → 2 of 14 (14%)', () => {
    expect(avancementQuestions({})).toEqual({ faits: 0, total: 14, pct: 0 });
    expect(avancementQuestions({ ...complet, site: { aucun: true } })).toEqual({ faits: 3, total: 14, pct: 21 }); // website, business, deal: 3 / 14 = 21.4%
    expect(avancementQuestions({ site: { aucun: true }, operation: complet.operation })).toEqual({ faits: 2, total: 14, pct: 14 });
  });
  it('a skipped screen, saved in "parcours.vues", counts as answered (same count on the server and in the flow)', () => {
    const r = { operation: { part_cedee: "100 %" }, parcours: { vues: ["operation", "histoire"] } };
    expect(vuesDe(r)).toEqual(["operation", "histoire"]);
    expect(avancementQuestions(r).faits).toBe(2);
    expect(vuesDe({ parcours: { vues: "x" } })).toEqual([]);
  });
  it('"Question N of M": M = questions still to show, equal to the "last questions" of the file page', () => {
    expect(questionsAPoser({})).toEqual(["site", ...QUESTIONS.map((q) => q.id)]);
    for (const r of [{}, complet, { ...complet, site: { url: "www.exemple.fr" } }, { site: { aucun: true }, parcours: { vues: QUESTIONS.slice(2).map((q) => q.id) } }]) {
      const a = avancementQuestions(r);
      expect(questionsAPoser(r).length).toBe(a.total - a.faits);
    }
    // Website filled in, 11 screens skipped out of 13: what remains is business and distinctive features (never seen) and deal, seen but
    // without the share of capital sold, required for the memorandum → 3
    expect(questionsAPoser({ site: { aucun: true }, parcours: { vues: QUESTIONS.slice(2).map((q) => q.id) } })).toEqual(["activite", "distinctions", "operation"]);
  });
  it('"Going further": the rest of the full questionnaire, without duplicates with the flow or useless questions', () => {
    const duParcours = new Set(QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])].map((c) => `${c.etape}.${c.cle}`)));
    const cles = POUR_ALLER_PLUS_LOIN.flatMap((e) => e.questions.map((q) => `${e.cle}.${q.cle}`));
    for (const k of cles) expect(duParcours.has(k)).toBe(false);
    expect(cles).not.toContain("bilan.capital_personnes_physiques");
    expect(cles).not.toContain("perspectives.investissements_pct");
    // business 3 + strengths 2 + customers 2 + outlook 1 + balance sheet 7 = 15, counted by hand in questionnaire.js
    expect(cles.length).toBe(15);
    expect(ETAPES.flatMap((e) => e.questions).length).toBe(32); // the full questionnaire stays intact (datapack, server)
  });
});

