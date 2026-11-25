import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte } from "./aide/connexion.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { avancement, CLES_CHECKLIST } from "../public/js/dossier-regles.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "434436622";
let env;

function appel(chemin, { methode = "GET", corps, cookie, origine = BASE } = {}) {
  const headers = { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" };
  if (origine) headers.origin = origine;
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined, redirect: "manual" }), env);
}

/** Requests a code and retrieves it from the development log (local mode without Brevo). */
async function demanderCode(email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const texte = espion.mock.calls.flat().join("\n");
  espion.mockRestore();
  return { r, code: texte.match(/Code de connexion pour \S+ : (\d{6})/)?.[1] };
}
const verifier = (email, code, siren = SIREN) => appel("/api/auth/code", { methode: "POST", corps: { email, code, siren } });
/** Wrong code guaranteed to differ from the real one. */
const autreCode = (code) => String((Number(code) + 1) % 1e6).padStart(6, "0");

async function seConnecter(email) {
  const { r, cookie, id } = await creerCompte(appel, email, { siren: SIREN });
  return { r, d: await r.json(), cookie, id };
}

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  // The company's public data already cached (recorded real responses): no network call.
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("sign-in by code", () => {
  it("refuses a request coming from another site (CSRF)", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: "https://pirate.example" })).status).toBe(403);
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: null })).status).toBe(403);
    expect((await appel("/api/auth/code", { methode: "POST", corps: { email: "a@b.fr", code: "123456" }, origine: "https://pirate.example" })).status).toBe(403);
  });
  it("refuses an invalid address", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "pas-une-adresse" } })).status).toBe(400);
  });
  it("sends a 6-digit code and stores only its hash", async () => {
    const { r, code } = await demanderCode("Dirigeant@Exemple.fr");
    expect(r.status).toBe(200);
    expect(code).toMatch(/^\d{6}$/);
    const ligne = env.DB.sqlite.prepare("SELECT code_hash, email FROM login_codes").get();
    expect(ligne.email).toBe("dirigeant@exemple.fr");
    expect(ligne.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(env.DB.sqlite.prepare("SELECT * FROM login_codes").all())).not.toContain(`"${code}"`);
  });
  it("the right code only verifies the address: a ticket, no session, no account yet", async () => {
    const { code } = await demanderCode("dirigeant@exemple.fr");
    const r = await verifier("dirigeant@exemple.fr", code);
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    const d = await r.json();
    expect(d).toMatchObject({ ok: true, etape: "mot_de_passe" });
    expect(d.ticket.length).toBeGreaterThanOrEqual(40);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(0);
    // only the ticket's hash is stored
    expect(JSON.stringify(env.DB.sqlite.prepare("SELECT * FROM password_tickets").all())).not.toContain(d.ticket);
  });
  it("the password then opens a session (cookie HttpOnly, Secure, SameSite=Lax) and creates the SIREN's file", async () => {
    const { r, d } = await seConnecter("dirigeant@exemple.fr");
    expect(r.status).toBe(200);
    const c = r.headers.get("set-cookie");
    expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/Secure/); expect(c).toMatch(/SameSite=Lax/);
    expect(d.destination).toMatch(/^\/espace\/demarrer\/\?dossier=[0-9a-f-]{36}$/);
  });
  it("a wrong code does not sign in and shows the remaining attempts", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    const r = await verifier("x@exemple.fr", autreCode(code));
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toMatchObject({ erreur: "code_incorrect", restants: 4 });
  });
  it("a code does not work for another address", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    await demanderCode("y@exemple.fr");
    expect((await verifier("y@exemple.fr", code)).headers.get("set-cookie")).toBeNull();
  });
  it("after 5 wrong attempts, the code is blocked, even the right one", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    for (let i = 0; i < 4; i++) expect((await (await verifier("x@exemple.fr", autreCode(code))).json()).erreur).toBe("code_incorrect");
    expect((await (await verifier("x@exemple.fr", autreCode(code))).json()).erreur).toBe("code_bloque");
    const r = await verifier("x@exemple.fr", code);
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("the code works only once", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    expect((await verifier("x@exemple.fr", code)).status).toBe(200);
    const second = await verifier("x@exemple.fr", code);
    expect((await second.json()).erreur).toBe("code_expire");
    expect(second.headers.get("set-cookie")).toBeNull();
  });
  it("a new code replaces the old one", async () => {
    const ancien = (await demanderCode("x@exemple.fr")).code;
    const nouveau = (await demanderCode("x@exemple.fr")).code;
    if (ancien !== nouveau) expect((await verifier("x@exemple.fr", ancien)).status).toBe(400);
    expect((await verifier("x@exemple.fr", nouveau)).status).toBe(200);
  });
  it("the code expires after 10 minutes", async () => {
    const { code } = await demanderCode("y@exemple.fr");
    env.DB.sqlite.exec("UPDATE login_codes SET expires_at = 1");
    expect((await (await verifier("y@exemple.fr", code)).json()).erreur).toBe("code_expire");
  });
  it("refuses a malformed code", async () => {
    expect((await verifier("y@exemple.fr", "12ab56")).status).toBe(400);
    expect((await verifier("y@exemple.fr", "12345")).status).toBe(400);
  });
  it("the code depends on the server secret: a copy of the database does not allow finding it from a simple hash", async () => {
    env.SESSION_SECRET = "secret-de-test";
    const { code } = await demanderCode("z@exemple.fr");
    const { id, code_hash } = env.DB.sqlite.prepare("SELECT id, code_hash FROM login_codes").get();
    const { empreinte } = await import("../src/lib/auth.js");
    expect(code_hash).not.toBe(await empreinte(`|${id}|${code}`));
    expect((await verifier("z@exemple.fr", code)).status).toBe(200);
  });
  it("in production without a configured email service, no code is displayed or sent", async () => {
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    env.SESSION_SECRET = "secret-de-test"; // production correctly configured, except for sending emails
    const r = await worker.fetch(new Request("https://passation.example/api/auth/request", { method: "POST",
      headers: { origin: "https://passation.example", "content-type": "application/json" }, body: JSON.stringify({ email: "z@exemple.fr" }) }), env);
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe("envoi_impossible");
    expect(espion.mock.calls.flat().join(" ")).not.toMatch(/\d{6}/);
    espion.mockRestore();
  });
  it("outside local development without SESSION_SECRET: API refused (503), no code created (SEC-07)", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await worker.fetch(new Request("https://passation.example/api/auth/request", { method: "POST",
      headers: { origin: "https://passation.example", "content-type": "application/json" }, body: JSON.stringify({ email: "z@exemple.fr" }) }), env);
    expect(r.status).toBe(503);
    const d = await r.json();
    expect(d.erreur).toBe("configuration_incomplete");
    expect(JSON.stringify(d)).not.toMatch(/SESSION_SECRET/); // no configuration detail in the response
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM login_codes").get().n).toBe(0);
    expect((await worker.fetch(new Request("https://passation.example/api/health"), env)).status).toBe(200);
    espion.mockRestore();
  });
  it("internal error (database unavailable): generic JSON 500, without technical details (SEC-08)", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = { prepare: () => { throw new Error("D1_ERROR: secret table not found"); }, batch: async () => { throw new Error("D1"); } };
    const r = await appel("/api/me", { cookie: `passation_session=${"x".repeat(40)}` });
    expect(r.status).toBe(500);
    const texte = await r.text();
    expect(JSON.parse(texte).erreur).toBe("erreur_interne");
    expect(texte).not.toMatch(/D1|secret table/);
    espion.mockRestore();
  });
});

describe("private routes", () => {
  it.each([["GET", "/api/me"], ["GET", "/api/dossiers"], ["GET", "/api/dossiers/00000000-0000-0000-0000-000000000000"],
    ["DELETE", "/api/dossiers/00000000-0000-0000-0000-000000000000"]])("%s %s → 401 sans connexion", async (methode, chemin) => {
    expect((await appel(chemin, { methode })).status).toBe(401);
  });

  it("/api/me returns the user and their file", async () => {
    const { cookie } = await seConnecter("a@exemple.fr");
    const moi = await (await appel("/api/me", { cookie })).json();
    expect(moi.email).toBe("a@exemple.fr");
    expect(moi.dossiers).toHaveLength(1);
    expect(moi.dossiers[0]).toMatchObject({ siren: SIREN, nom: "HABI PRO'" });
  });

  it("an owner can neither read, change nor delete another owner's file", async () => {
    const a = await seConnecter("a@exemple.fr");
    const idA = a.id;
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${idA}`, { cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { methode: "DELETE", cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { cookie: a.cookie })).status).toBe(200);
  });

  it("the checklist moves progress forward", async () => {
    const { id, cookie } = await seConnecter("a@exemple.fr");
    const avant = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(avant.avancement.preparation).toBe(0);
    expect(avant.avancement.valorisation).toBe(25); // quick estimate available
    const apres = await (await appel(`/api/dossiers/${id}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie })).json();
    expect(apres.checklist).toEqual(["kbis"]);
    expect(apres.avancement.preparation).toBe(Math.round(100 / CLES_CHECKLIST.size));
    expect((await appel(`/api/dossiers/${id}/checklist/inconnu`, { methode: "PUT", corps: { done: true }, cookie })).status).toBe(400);
  });

  it("deleting the file erases the data and the files", async () => {
    const { id, cookie } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie });
    await env.FILES.put(`dossiers/${id}/liasse.pdf`, "x");
    await env.FILES.put(`dossiers/autre/liasse.pdf`, "y");
    expect((await appel(`/api/dossiers/${id}`, { methode: "DELETE", cookie })).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM dossiers").get().n).toBe(0);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM checklist").get().n).toBe(0);
    expect([...env.FILES.objets.keys()]).toEqual(["dossiers/autre/liasse.pdf"]);
    expect((await appel(`/api/dossiers/${id}`, { cookie })).status).toBe(404);
  });

  it("signing out closes the session", async () => {
    const { cookie } = await seConnecter("a@exemple.fr");
    const r = await appel("/api/auth/logout", { methode: "POST", cookie });
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await appel("/api/me", { cookie })).status).toBe(401);
  });
});

describe("progress", () => {
  // Weights: identified 15, first value (quick or detailed) 10, latest fiscal year confirmed 25 (the only
  // required one), questions of the flow 15, detailed 15, documents 20
  it("overall = steps of the flow, without starting from zero; previous fiscal years do not count", () => {
    expect(avancement({})).toEqual({ global: 15, chiffres: 0, valorisation: 0, documents: 0, preparation: 0 });
    expect(avancement({ estimation_express: true }).global).toBe(25);
    // 15 + 10 + 25 + 15 × 0,5 = 57,5 → 58
    expect(avancement({ estimation_express: true, dernier_exercice: true, questions_pct: 50 }).global).toBe(58);
    // the checklist does not count in the overall figure: 15 + 10 + 25 + 20 = 70
    expect(avancement({ estimation_express: true, dernier_exercice: true, documents: 3, checklist: new Set(CLES_CHECKLIST) }))
      .toEqual({ global: 70, chiffres: 100, valorisation: 25, documents: 100, preparation: 100 });
    expect(avancement({ estimation_express: true, dernier_exercice: true, questions_pct: 100, valorisation_approfondie: true, documents: 3 }).global).toBe(100);
    // confidential accounts (no quick estimate): the detailed valuation is enough to reach 100
    expect(avancement({ dernier_exercice: true, questions_pct: 100, valorisation_approfondie: true, documents: 3 }).global).toBe(100);
  });
});
