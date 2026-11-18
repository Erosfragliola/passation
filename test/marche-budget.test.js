// Étude de marché : budget de temps de rechercherMarche (110 s en tout, 75 s par appel, 2 appels au plus, sans
// nouvelle tentative automatique). Claude simulé ; l'horloge est avancée à la main pour simuler la durée des appels.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const creer = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor() { this.beta = { messages: { create: creer } }; } } }));
import { rechercherMarche, MARCHE_DUREE_MAX_MS } from "../src/lib/claude.js";

const env = { ANTHROPIC_API_KEY: "cle-de-test" };
const T0 = new Date("2026-11-18T10:00:00Z").getTime();
/** Appel simulé qui « dure » s secondes et s'arrête sur stop_reason. */
const dure = (s, stop_reason) => async () => { vi.setSystemTime(Date.now() + s * 1000); return { stop_reason, content: [{ type: "text", text: '{"faits": []}' }] }; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); creer.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("budget de temps de l'étude de marché", () => {
  it("budget total de 110 s, sous les deux minutes annoncées", () => {
    expect(MARCHE_DUREE_MAX_MS).toBe(110_000);
  });
  it("premier appel limité à 75 s, sans nouvelle tentative du client", async () => {
    creer.mockImplementationOnce(dure(5, "end_turn"));
    await rechercherMarche(env, {});
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][1]).toEqual({ timeout: 75_000, maxRetries: 0 });
  });
  it("second tour : délai réduit au temps restant (110 − 60 = 50 s)", async () => {
    creer.mockImplementationOnce(dure(60, "pause_turn")).mockImplementationOnce(dure(10, "end_turn"));
    await rechercherMarche(env, {});
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls[1][1].timeout).toBe(50_000);
  });
  it("moins de 15 s restantes après le premier tour (110 − 100 = 10 s) : arrêt « recherche_trop_longue », pas de second appel", async () => {
    creer.mockImplementationOnce(dure(100, "pause_turn"));
    await expect(rechercherMarche(env, {})).rejects.toThrow("recherche_trop_longue");
    expect(creer).toHaveBeenCalledTimes(1);
  });
  it("jamais plus de deux appels, même si Claude demande encore à continuer", async () => {
    creer.mockImplementation(dure(1, "pause_turn"));
    await expect(rechercherMarche(env, {})).rejects.toThrow("recherche_inachevee");
    expect(creer).toHaveBeenCalledTimes(2);
  });
});
