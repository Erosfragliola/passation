import { describe, it, expect } from "vitest";
import { memoDeverrouille } from "../src/documents/memo.js";
import { siteDepuisEmail, questionRepondue, requisManquants, questionsIncompletes, QUESTIONS } from "../public/js/parcours.js";

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
  it("10 questions au plus, chacune rangée dans une étape du questionnaire complet", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(10);
    const etapes = new Set(["activite", "operation", "dirigeant", "retraitements", "clients", "perspectives", "bilan"]);
    for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) expect(etapes.has(c.etape)).toBe(true);
  });
});
