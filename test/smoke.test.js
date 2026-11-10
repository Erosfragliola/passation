import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { MODELS } from "../src/config.js";

describe("squelette", () => {
  it("répond sur /api/health", async () => {
    const res = await worker.fetch(new Request("http://x/api/health"), { APP_NAME: "Passation" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, app: "Passation" });
  });

  it("renvoie 404 JSON sur une route API inconnue", async () => {
    const res = await worker.fetch(new Request("http://x/api/nimporte"), {});
    expect(res.status).toBe(404);
  });

  it("centralise les deux modèles", () => {
    expect(MODELS).toEqual({ deep: "claude-sonnet-5-5", fast: "claude-haiku-5-5" });
  });
});
