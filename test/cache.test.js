import { describe, it, expect } from "vitest";
import { lireCache, ecrireCache } from "../src/lib/cache.js";
import { verifierDebit } from "../src/lib/ratelimit.js";

const dbEnPanne = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1 en panne"); }, run: async () => { throw new Error("D1 en panne"); } }) }) };

describe("robustness if the D1 database does not respond", () => {
  it("the cache returns null and writing does not throw an error", async () => {
    expect(await lireCache(dbEnPanne, "x")).toBeNull();
    await expect(ecrireCache(dbEnPanne, "x", { a: 1 })).resolves.toBeUndefined();
  });
  it("the rate limit lets requests through", async () => {
    const r = await verifierDebit(dbEnPanne, new Request("http://x"), {}, "test", 5);
    expect(r.autorise).toBe(true);
  });
});
