import { describe, it, expect } from "vitest";
import { lireCache, ecrireCache } from "../src/lib/cache.js";
import { verifierDebit } from "../src/lib/ratelimit.js";

const dbEnPanne = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1 en panne"); }, run: async () => { throw new Error("D1 en panne"); } }) }) };

describe("robustesse si la base D1 ne répond pas", () => {
  it("le cache renvoie null et l'écriture ne lève pas d'erreur", async () => {
    expect(await lireCache(dbEnPanne, "x")).toBeNull();
    await expect(ecrireCache(dbEnPanne, "x", { a: 1 })).resolves.toBeUndefined();
  });
  it("la limite de débit laisse passer", async () => {
    const r = await verifierDebit(dbEnPanne, new Request("http://x"), {}, "test", 5);
    expect(r.autorise).toBe(true);
  });
});
