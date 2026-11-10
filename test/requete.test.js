import { describe, it, expect } from "vitest";
import { requeteJson } from "../src/lib/requete.js";

const reponse = (status, corps = {}) => new Response(JSON.stringify(corps), { status, headers: { "retry-after": "0" } });

describe("nouvelles tentatives sur les API publiques", () => {
  it("réessaie après un 429 puis réussit", async () => {
    const suite = [reponse(429), reponse(429), reponse(200, { ok: 1 })];
    let appels = 0;
    const r = await requeteJson("http://x", "test", { fetch: async () => { appels++; return suite.shift(); }, attenteMs: 1 });
    expect(r).toEqual({ ok: 1 });
    expect(appels).toBe(3);
  });
  it("abandonne après le nombre maximal de tentatives", async () => {
    await expect(requeteJson("http://x", "test", { fetch: async () => reponse(429), attenteMs: 1, tentatives: 3 })).rejects.toThrow("HTTP 429");
  });
  it("ne réessaie pas une erreur 404", async () => {
    let appels = 0;
    await expect(requeteJson("http://x", "test", { fetch: async () => { appels++; return reponse(404); }, attenteMs: 1 })).rejects.toThrow("HTTP 404");
    expect(appels).toBe(1);
  });
});
