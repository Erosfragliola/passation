// FIN-06 (audit du 18/11/2026) : une panne d'API publique n'est jamais une absence de données.
// Avant le correctif, une erreur INPI devenait « comptes confidentiels », mise en cache 24 h et copiée dans le dossier.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { chargerMaquette, CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";

const SIREN = "319252813";
const F = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
const reponse = (statut, corps = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });

/** Faux fetch : chaque source répond selon `etat` (« ok », un code HTTP, ou « vide » = 200 sans résultat). */
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

describe("chargerMaquette : panne ≠ absence de données", () => {
  it.each([[500], [429]])("INPI en HTTP %i (après nouvelles tentatives) : erreur propagée, pas de « comptes confidentiels »", async (code) => {
    const { f, appels } = fauxFetch({ inpi: code });
    await expect(chargerMaquette(SIREN, { fetch: f, attenteMs: 0 })).rejects.toThrow(`ratios INPI : HTTP ${code}`);
    expect(appels.inpi).toBe(4); // 429 et 5xx sont retentés
  });
  it("INPI répond sans exercice publié : vraie absence de comptes (comptes_confidentiels, sans marque de panne)", async () => {
    const { f } = fauxFetch({ inpi: "vide" });
    const d = await chargerMaquette(SIREN, { fetch: f, attenteMs: 0 });
    expect(d.comptes_confidentiels).toBe(true);
    expect(d.sources_partielles).toBeUndefined();
  });
  it("BODACC en panne : comptes conservés, réponse marquée partielle", async () => {
    const { f } = fauxFetch({ bodacc: 500 });
    const d = await chargerMaquette(SIREN, { fetch: f, attenteMs: 0 });
    expect(d.comptes_confidentiels).toBe(false);
    expect(d.sources_partielles).toEqual(["bodacc"]);
  });
});

describe("GET /api/maquette/:siren : rien d'erroné en cache", () => {
  let env;
  const appel = () => worker.fetch(new Request(`http://127.0.0.1:8787/api/maquette/${SIREN}`, { headers: { "cf-connecting-ip": "203.0.113.7" } }), env);
  const enCache = () => env.DB.prepare("SELECT key FROM api_cache WHERE key = ?").bind(CLE_MAQUETTE(SIREN)).first();
  beforeEach(() => { env = { DB: d1Memoire(), FILES: r2Memoire() }; vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("INPI en HTTP 500 : 502 « registres indisponibles », aucune écriture en cache", async () => {
    vi.stubGlobal("fetch", fauxFetch({ inpi: 500 }).f);
    const r = await appel();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe("source_indisponible");
    expect(await enCache()).toBeNull();
  }, 10_000);
  it("BODACC en panne : 200 avec l'estimation, mais pas mis en cache (sera relu au prochain appel)", async () => {
    vi.stubGlobal("fetch", fauxFetch({ bodacc: 500 }).f);
    const r = await appel();
    expect(r.status).toBe(200);
    expect((await r.json()).estimation.statut).toBe("ok");
    expect(await enCache()).toBeNull();
  }, 10_000);
  it("toutes les sources répondent : mis en cache sous la clé unique (CODE-04)", async () => {
    vi.stubGlobal("fetch", fauxFetch({}).f);
    expect((await appel()).status).toBe(200);
    expect(await enCache()).not.toBeNull();
  });
});
