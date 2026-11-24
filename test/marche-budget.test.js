// Market research: time budget of rechercherMarche (110 s in total, 75 s per call, 2 calls at most, without
// automatic retry). Simulated Claude; the clock is advanced by hand to simulate the duration of the calls.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const creer = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor() { this.beta = { messages: { create: creer } }; } } }));
import { rechercherMarche, MARCHE_DUREE_MAX_MS } from "../src/lib/claude.js";

const env = { ANTHROPIC_API_KEY: "cle-de-test" };
const T0 = new Date("2026-11-18T10:00:00Z").getTime();
/** Simulated call that "lasts" s seconds and stops on stop_reason. */
const dure = (s, stop_reason) => async () => { vi.setSystemTime(Date.now() + s * 1000); return { stop_reason, content: [{ type: "text", text: '{"faits": []}' }] }; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); creer.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("time budget of the market research", () => {
  it("total budget of 110 s, below the two minutes announced", () => {
    expect(MARCHE_DUREE_MAX_MS).toBe(110_000);
  });
  it("first call limited to 75 s, without a retry by the client", async () => {
    creer.mockImplementationOnce(dure(5, "end_turn"));
    await rechercherMarche(env, {});
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][1]).toEqual({ timeout: 75_000, maxRetries: 0 });
  });
  it("second round: timeout reduced to the remaining time (110 − 60 = 50 s)", async () => {
    creer.mockImplementationOnce(dure(60, "pause_turn")).mockImplementationOnce(dure(10, "end_turn"));
    await rechercherMarche(env, {});
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls[1][1].timeout).toBe(50_000);
  });
  it('less than 15 s left after the first round (110 − 100 = 10 s): stop "recherche_trop_longue", no second call', async () => {
    creer.mockImplementationOnce(dure(100, "pause_turn"));
    await expect(rechercherMarche(env, {})).rejects.toThrow("recherche_trop_longue");
    expect(creer).toHaveBeenCalledTimes(1);
  });
  it("never more than two calls, even if Claude still asks to continue", async () => {
    creer.mockImplementation(dure(1, "pause_turn"));
    await expect(rechercherMarche(env, {})).rejects.toThrow("recherche_inachevee");
    expect(creer).toHaveBeenCalledTimes(2);
  });
});
