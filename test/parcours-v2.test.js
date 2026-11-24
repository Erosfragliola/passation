// Part C (24/11/2026): the flow in two stages, through the API. Files started in the former flow are read again without
// any loss (same answer keys); nothing that changes the value is validated in bulk or prepared in advance; the
// approval of the figures is written by the server only. Claude is not called.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/claude.js", async (original) => ({ ...(await original()), claudeDisponible: () => false }));
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte } from "./aide/connexion.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { propositions } from "../src/documents/propositions.js";
import { VALORISATION, etatValorisation, MURS } from "../public/js/parcours.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "319252813";
let env;
function appel(chemin, { methode = "GET", corps, cookie } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.9" };
  if (cookie) headers.cookie = cookie;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
}
const put = (id, etape, data, cookie) => appel(`/api/dossiers/${id}/answers/${etape}`, { methode: "PUT", corps: { data }, cookie });

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

// Fictitious figures, entered by the owner: one complete fiscal year (2024)
const EX = { chiffre_affaires: 900_000, achats_consommes: 300_000, charges_externes: 200_000, charges_personnel: 311_000, impots_taxes: 0,
  stocks: 40_000, creances_clients: 120_000, tresorerie: 260_000, capitaux_propres: 1_450_000, emprunts: 50_000, dettes_fournisseurs: 60_000, dettes_fiscales_sociales: 50_000, resultat_net: 276_000 };

describe("files started in the former flow: read again without loss", () => {
  // Answers as the former flow saved them (questions « Ce qu'il faut corriger », « Le périmètre de la cession »,
  // « Votre projet de cession »), screens marked as seen there
  const ANCIENNES = {
    dirigeant: { remuneration_dirigeant_reelle: 90_000, remuneration_normative: 60_000, encadrement: "En partie" },
    retraitements: { exceptionnel_signale: "Non", murs: MURS.dirigeant, murs_cession: "À discuter", loyer_paye: 24_000, loyer_marche: 30_000 },
    operation: { detention: "Par une société holding", part_cedee: "100 %", calendrier: "6 à 12 mois" },
    parcours: { vues: ["remuneration", "detention", "operation", "histoire"] },
  };
  it("same keys, same values; the new screens show them but count as done only once validated", async () => {
    const { cookie, id } = await creerCompte(appel, "a@exemple.fr", { siren: SIREN });
    for (const [etape, data] of Object.entries(ANCIENNES)) expect((await put(id, etape, data, cookie)).status).toBe(200);
    const { reponses } = await (await appel(`/api/dossiers/${id}/answers`, { cookie })).json();
    for (const [etape, data] of Object.entries(ANCIENNES)) expect(reponses[etape]).toEqual(data);
    // nothing to ask again: every required answer of the two screens is already there
    expect(etatValorisation(reponses)).toMatchObject({ retraitements: false, dette: false, validation: null });
    let detail = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(detail.parcours.etapes).toMatchObject({ retraitements: false, dette: false, validation: null });
    // the owner validates the two screens (same answers): done
    await put(id, "parcours", { vues: [...ANCIENNES.parcours.vues, "retraitements", "dette"] }, cookie);
    detail = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(detail.parcours.etapes).toMatchObject({ retraitements: true, dette: true });
    expect((await (await appel(`/api/dossiers/${id}/answers`, { cookie })).json()).reponses.dirigeant).toEqual(ANCIENNES.dirigeant);
  });
});

describe("restatements never validated in bulk", () => {
  it("no proposal touches an answer that changes the value", () => {
    const p = propositions({ entreprise: { naf: "16.23Z", section_naf: "C", tranche_effectif: { code: "11" }, code_postal: "13001", date_creation: "2001-01-01" }, tcam: 0.05, reponses: {} });
    const cles = Object.values(p).flatMap((x) => Object.keys(x.valeurs));
    const valeur = Object.values(VALORISATION).flat().map((c) => `${c.etape}.${c.cle}`);
    for (const k of valeur) expect(cles).not.toContain(k);
    expect(cles).toContain("operation.calendrier"); // questions of the memorandum are still prepared
  });
  it("a screen seen without its required answers is not done; answers without the screen validated are not done", () => {
    expect(etatValorisation({ parcours: { vues: ["retraitements"] } }).retraitements).toBe(false);
    const r = { dirigeant: { remuneration_dirigeant_reelle: 1, remuneration_normative: 1 }, retraitements: { murs: MURS.tiers, exceptionnel_signale: "Non" } };
    expect(etatValorisation(r).retraitements).toBe(false);
    expect(etatValorisation({ ...r, parcours: { vues: ["retraitements"] } }).retraitements).toBe(true);
    // walls owned by the owner: both rents required
    expect(etatValorisation({ ...r, retraitements: { ...r.retraitements, murs: MURS.dirigeant }, parcours: { vues: ["retraitements"] } }).retraitements).toBe(false);
  });
});

describe("« Je valide ces chiffres »: recorded by the server only", () => {
  it("refused while the value cannot be calculated; then recorded with its date and range", async () => {
    const { cookie, id } = await creerCompte(appel, "a@exemple.fr", { siren: SIREN });
    const avant = await appel(`/api/dossiers/${id}/valuation/validation`, { methode: "POST", cookie });
    expect(avant.status).toBe(409);
    expect((await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", corps: { annee: 2024, valeurs: EX, valider: true }, cookie })).status).toBe(200);
    const r = await appel(`/api/dossiers/${id}/valuation/validation`, { methode: "POST", cookie });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(Number.isFinite(d.validation.le)).toBe(true);
    expect(d.validation.bas).toBe(d.resultat.synthese.bas);
    const detail = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(detail.parcours.etapes.validation).toEqual({ le: d.validation.le });
    // net income 276,000 above EBITDA 89,000 (900,000 − 300,000 − 200,000 − 311,000): flagged, not blocking
    const ch = await (await appel(`/api/dossiers/${id}/financials`, { cookie })).json();
    expect(ch.controles[2024].map((c) => c.code)).toContain("resultat_net_ebe");
  });
  it("the browser cannot write the approval itself", async () => {
    const { cookie, id } = await creerCompte(appel, "a@exemple.fr", { siren: SIREN });
    expect((await put(id, "validation", { le: 1 }, cookie)).status).toBe(404);
  });
  it("another owner's file: 404", async () => {
    const a = await creerCompte(appel, "a@exemple.fr", { siren: SIREN });
    const b = await creerCompte(appel, "b@exemple.fr", { siren: SIREN });
    expect((await appel(`/api/dossiers/${a.id}/valuation/validation`, { methode: "POST", cookie: b.cookie })).status).toBe(404);
  });
});
