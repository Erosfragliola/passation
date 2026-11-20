import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { MODELS } from "../src/config.js";

describe("skeleton", () => {
  it("responds on /api/health", async () => {
    const res = await worker.fetch(new Request("http://x/api/health"), { APP_NAME: "Passation" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, app: "Passation" });
  });

  it("returns a JSON 404 on an unknown API route", async () => {
    const res = await worker.fetch(new Request("http://x/api/nimporte"), { SESSION_SECRET: "secret-de-test" }); // non-local host: secret required (SEC-07)
    expect(res.status).toBe(404);
  });

  it("centralizes the two models", () => {
    expect(MODELS).toEqual({ deep: "claude-sonnet-5-5", fast: "claude-haiku-5-5" });
  });
});
