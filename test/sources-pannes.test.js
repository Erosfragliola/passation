// FIN-06 (audit of 18/11/2026): a public API outage is never an absence of data.
// Before the fix, an INPI error became "confidential accounts", cached for 24 hours and copied into the file.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { chargerMaquette, CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";

const SIREN = "319252813";
const F = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
const reponse = (statut, corps = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

/** Fake fetch: each source responds according to `etat` ("ok", an HTTP code, or "vide" = 200 without a result). */
function fauxFetch(etat) {
  const appels = { inpi: 0, bodacc: 0, entreprise: 0 };
  const f = async (url) => {
    const u = String(url);
    const src = u.includes("ratios_inpi_bce") ? "inpi" : u.includes("bodacc") ? "bodacc" : "entreprise";
    appels[src]++;
    const e = etat[src] ?? "ok";
    if (e === "ok") return reponse(200, F[src]);
    if (e === "vide") return reponse(200, { total_count: 0, results: [] });
    return reponse(e);
  };
  return { f, appels };
}

describe("chargerMaquette: outage ≠ absence of data", () => {
  it.each([[500], [429]])("INPI en HTTP %i (après nouvelles tentatives) : erreur propagée, pas de « comptes confidentiels »", async (code) => {
    const { f, appels } = fauxFetch({ inpi: code });
    await expect(chargerMaquette(SIREN, { fetch: f, attenteMs: 0 })).rejects.toThrow(`ratios INPI : HTTP ${code}`);
    expect(appels.inpi).toBe(4); // 429 and 5xx are retried
  });
  it("INPI responds without a published fiscal year: real absence of accounts (comptes_confidentiels, without an outage mark)", async () => {
    const { f } = fauxFetch({ inpi: "vide" });
    const d = await chargerMaquette(SIREN, { fetch: f, attenteMs: 0 });
    expect(d.comptes_confidentiels).toBe(true);
    expect(d.sources_partielles).toBeUndefined();
  });
  it("BODACC down: accounts kept, response marked partial", async () => {
    const { f } = fauxFetch({ bodacc: 500 });
    const d = await chargerMaquette(SIREN, { fetch: f, attenteMs: 0 });
    expect(d.comptes_confidentiels).toBe(false);
    expect(d.sources_partielles).toEqual(["bodacc"]);
  });
});

describe("GET /api/maquette/:siren: nothing wrong in the cache", () => {
  let env;
  const appel = () => worker.fetch(new Request(`http://127.0.0.1:8787/api/maquette/${SIREN}`, { headers: { "cf-connecting-ip": "203.0.113.7" } }), env);
  const enCache = () => env.DB.prepare("SELECT key FROM api_cache WHERE key = ?").bind(CLE_MAQUETTE(SIREN)).first();
  beforeEach(() => { env = { DB: d1Memoire(), FILES: r2Memoire() }; vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('INPI at HTTP 500: 502 "registries unavailable", nothing written to the cache', async () => {
    vi.stubGlobal("fetch", fauxFetch({ inpi: 500 }).f);
    const r = await appel();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe("source_indisponible");
    expect(await enCache()).toBeNull();
  }, 10_000);
  it("BODACC down: 200 with the public card, but not cached (will be read again on the next call)", async () => {
    vi.stubGlobal("fetch", fauxFetch({ bodacc: 500 }).f);
    const r = await appel();
    expect(r.status).toBe(200);
    // Without a session the range is masked since 24/11/2026 (test/acces-par-code.test.js); the published accounts are read
    const d = await r.json();
    expect(d).toMatchObject({ estimation: null, estimation_masquee: true });
    expect(d.exercices_publies.length).toBeGreaterThan(0);
    expect(await enCache()).toBeNull();
  }, 10_000);
  it("all sources respond: cached under the single key (CODE-04)", async () => {
    vi.stubGlobal("fetch", fauxFetch({}).f);
    expect((await appel()).status).toBe(200);
    expect(await enCache()).not.toBeNull();
  });
});
