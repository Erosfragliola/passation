// Access to the file (25/11/2026): account required after the SIREN, created and opened with the 6-digit code only.
// No range without a session (checked on the server, not only on screen); the code opens the session and creates the
// account on first use; the same answer to the code request whether or not the address has an account. Single use,
// 10 minutes and 5 attempts: test/auth.test.js.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte, demanderCode } from "./aide/connexion.js";
import { normaliserEntreprise, normaliserSuggestions } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "434436622";
let env, ip;

function appel(chemin, { methode = "GET", corps, cookie } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": ip, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
}
const fixture = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  ip = "203.0.113.20";
  const e = normaliserEntreprise(fixture.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(fixture.inpi), normaliserAnnonces(fixture.bodacc, SIREN, e.date_creation));
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), t).run();
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)")
    .bind("recherche:v2:habi pro", JSON.stringify(normaliserSuggestions(fixture.entreprise).filter((s) => s.actif)), t).run();
});

describe("no range without a valid session (checked on the server, not only on screen)", () => {
  it("GET /api/maquette/:siren: public card without any amount; full data once signed in", async () => {
    const { cookie } = await creerCompte(appel, "dirigeant@exemple.fr");
    const prive = await (await appel(`/api/maquette/${SIREN}`, { cookie })).json();
    expect(prive.estimation.statut).toBe("ok"); // the fixture has published accounts: a real range exists
    const montants = [...prive.ca, ...prive.ebe].map((x) => x.valeur).concat([prive.estimation.bas, prive.estimation.haut, prive.estimation.central])
      .filter((v) => Number.isFinite(v) && Math.abs(v) >= 1000);
    expect(montants.length).toBeGreaterThan(2);

    const r = await appel(`/api/maquette/${SIREN}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    const texte = await r.text(), d = JSON.parse(texte);
    expect(d.estimation).toBeNull();
    expect(d.estimation_masquee).toBe(true);
    expect(d).not.toHaveProperty("ca");
    expect(d).not.toHaveProperty("ebe");
    for (const v of montants) {
      expect(texte).not.toContain(String(v));
      expect(texte).not.toContain(String(Math.round(v)));
    }
    // what the public card shows is still there
    expect(d).toMatchObject({ siren: SIREN, nom: prive.nom, nom_de_code: prive.nom_de_code, teaser: prive.teaser });
    expect(d.exercices_publies).toEqual([...new Set(prive.ca.map((x) => x.annee))].sort());
  });

  it("an invalid or expired session cookie counts as no session", async () => {
    const { cookie } = await creerCompte(appel, "dirigeant@exemple.fr");
    expect((await (await appel(`/api/maquette/${SIREN}`, { cookie: "passation_session=" + "x".repeat(43) })).json()).estimation).toBeNull();
    env.DB.sqlite.exec("UPDATE sessions SET expires_at = 1");
    expect((await (await appel(`/api/maquette/${SIREN}`, { cookie })).json()).estimation).toBeNull();
  });

  it("POST /api/estimation (unpublished accounts): 401 without a session, a range with one", async () => {
    const corps = { section_naf: "C", ca: 1_200_000, ebe: 150_000 };
    const r = await appel("/api/estimation", { methode: "POST", corps });
    expect(r.status).toBe(401);
    expect(await r.text()).not.toMatch(/"(bas|haut|central)"/);
    const { cookie } = await creerCompte(appel, "dirigeant@exemple.fr");
    const ok = await (await appel("/api/estimation", { methode: "POST", corps, cookie })).json();
    expect(ok.estimation.statut).toBe("ok");
  });

  it("GET /api/company/search returns no amount", async () => {
    const texte = await (await appel("/api/company/search?q=HABI%20PRO")).text();
    expect(JSON.parse(texte).suggestions.length).toBeGreaterThan(0);
    expect(texte).not.toMatch(/"(ca|ebe|chiffre_d_affaires|resultat_net|finances|estimation|bas|haut)"/);
  });
});

describe("account created and opened with the code only", () => {
  it("first code: account created, session opened (HttpOnly, Secure, SameSite=Lax), file of the SIREN created", async () => {
    const { r, cookie, id } = await creerCompte(appel, "dirigeant@exemple.fr", { siren: SIREN });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(1);
    expect((await (await appel("/api/me", { cookie })).json()).email).toBe("dirigeant@exemple.fr");
  });
  it("sign out, then sign in again with a new code: the same account and the same file, nothing else to give", async () => {
    const premier = await creerCompte(appel, "dirigeant@exemple.fr", { siren: SIREN });
    await appel("/api/auth/logout", { methode: "POST", cookie: premier.cookie });
    expect((await appel("/api/me", { cookie: premier.cookie })).status).toBe(401);
    const second = await creerCompte(appel, "Dirigeant@Exemple.fr", { siren: SIREN });
    expect(second.r.status).toBe(200);
    expect(second.id).toBe(premier.id);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(1);
    expect((await (await appel("/api/me", { cookie: second.cookie })).json()).dossiers).toHaveLength(1);
  });
  it("the code request answers the same whether or not the address has an account", async () => {
    await creerCompte(appel, "connu@exemple.fr");
    const a = (await demanderCode(appel, "connu@exemple.fr")).r, b = (await demanderCode(appel, "inconnu@exemple.fr")).r;
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });
  it("the routes of the former password flow no longer exist", async () => {
    for (const chemin of ["/api/auth/password", "/api/auth/login", "/api/auth/changer"]) expect((await appel(chemin, { methode: "POST", corps: {} })).status).toBe(404);
  });
  it("no table or column of the former password flow in the schema", () => {
    const tables = env.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((x) => x.name);
    expect(tables).not.toContain("password_tickets");
    expect(tables).not.toContain("login_failures");
    expect(env.DB.sqlite.prepare("PRAGMA table_info(users)").all().map((c) => c.name)).not.toContain("password_hash");
  });
});
