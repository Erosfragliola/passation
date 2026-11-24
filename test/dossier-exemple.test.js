// The sample file of the demonstration (scripts/dossier-exemple.mjs, docs/DEMO.md) stays complete with the two-stage
// flow: its first stage is validated in its own data (adjustments, net debt and scope, value), and its neutral
// adjustments leave the expected results of docs/DEMO.md unchanged. Entirely fictitious figures.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/claude.js", async (original) => ({ ...(await original()), claudeDisponible: () => false }));
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte } from "./aide/connexion.js";
import { CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { SIREN_EXEMPLE, ENTREPRISE_EXEMPLE, REPONSES_EXEMPLE, remplirDossierExemple } from "../scripts/dossier-exemple.mjs";
import { etatParcours } from "../public/js/dossier-parcours.js";
import { etatValorisation } from "../public/js/parcours.js";

const BASE = "http://127.0.0.1:8787";
let env;
function appel(chemin, { methode = "GET", corps, cookie } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.30" };
  if (cookie) headers.cookie = cookie;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
}

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN_EXEMPLE), JSON.stringify(ENTREPRISE_EXEMPLE), 4102444800).run();
});

describe("sample file of the demonstration", () => {
  it("its validation (adjustments, net debt, value) is in its own data, and its first stage is complete", () => {
    expect(etatValorisation(REPONSES_EXEMPLE)).toMatchObject({ exercices_passes: true, retraitements: true, dette: true });
  });

  it("filled through the API: first stage validated, memorandum unlocked, expected results of docs/DEMO.md", async () => {
    const { cookie, id } = await creerCompte(appel, "demo@exemple.fr", { siren: SIREN_EXEMPLE });
    const a = (chemin, o = {}) => appel(chemin, { ...o, cookie });
    const v = await remplirDossierExemple(a, id);
    // docs/DEMO.md: multiples 4 / 7 × normalized EBITDA of 350,000 → 1,381,818 – 2,431,818 (neutral adjustments)
    expect(Math.round(v.resultat.synthese.bas)).toBe(1_381_818);
    expect(Math.round(v.resultat.synthese.haut)).toBe(2_431_818);
    expect(v.resultat.ebe_normatif.valeur).toBe(350_000);
    const d = await (await a(`/api/dossiers/${id}`)).json();
    expect(d.parcours.etapes).toMatchObject({ exercices_passes: true, retraitements: true, dette: true, validation: { le: v.validation.le } });
    const e = etatParcours(d);
    expect(e.valorisationFaite).toBe(true);
    expect(e.temps[0].fait).toBe(true);
    expect(e.nouvelleEtape).toBeNull(); // nothing to approve again
    const memo = await (await a(`/api/dossiers/${id}/documents/memo`)).json();
    expect(memo.deverrouille).toEqual({ ok: true, manque: [] });
  });
});
