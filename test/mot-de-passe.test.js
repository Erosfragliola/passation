// Account with a password (part B, 24/11/2026): no range without a session, password hashed and salted, 15-minute
// block after 5 failures (account and IP), identical message whether or not the address exists, forgotten password
// that closes the other sessions, accounts created with a code only, password policy. No password is written here:
// each one is drawn at random on every run.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte, ticketPour, motDePasseAleatoire } from "./aide/connexion.js";
import { normaliserEntreprise, normaliserSuggestions } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { refusMotDePasse, hacherMotDePasse, verifierMotDePasse, egalTempsConstant } from "../src/lib/motdepasse.js";
import { MOT_DE_PASSE } from "../src/config.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "434436622";
let env, ip;

function appel(chemin, { methode = "GET", corps, cookie } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": ip, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
}
const connexion = (email, mot_de_passe) => appel("/api/auth/login", { methode: "POST", corps: { email, mot_de_passe } });
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

describe("password storage", () => {
  it("PBKDF2-SHA256, 100,000 iterations, 16-byte salt per account: two identical passwords give two different hashes", async () => {
    const mdp = motDePasseAleatoire();
    await creerCompte(appel, "a@exemple.fr", { motDePasse: mdp });
    await creerCompte(appel, "b@exemple.fr", { motDePasse: mdp });
    const lignes = env.DB.sqlite.prepare("SELECT password_hash FROM users ORDER BY email").all().map((l) => l.password_hash);
    for (const h of lignes) {
      const [algo, iterations, sel, hash] = h.split("$");
      expect(algo).toBe("pbkdf2-sha256");
      expect(Number(iterations)).toBe(100_000);
      expect(Buffer.from(sel, "base64")).toHaveLength(16);
      expect(Buffer.from(hash, "base64")).toHaveLength(32);
    }
    expect(lignes[0]).not.toBe(lignes[1]);
    const base = JSON.stringify([...env.DB.sqlite.prepare("SELECT * FROM users").all(), ...env.DB.sqlite.prepare("SELECT * FROM password_tickets").all()]);
    expect(base).not.toContain(mdp);
  });

  it("the hash matches the password and nothing else; comparison in constant time", async () => {
    const mdp = motDePasseAleatoire();
    const h = await hacherMotDePasse(mdp);
    expect(await verifierMotDePasse(mdp, h)).toBe(true);
    expect(await verifierMotDePasse(mdp + "x", h)).toBe(false);
    expect(await verifierMotDePasse(mdp, null)).toBe(false); // unknown account: same calculation, refused
    expect(await verifierMotDePasse(mdp, "md5$1$aa$bb")).toBe(false);
    expect(egalTempsConstant(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(egalTempsConstant(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(egalTempsConstant(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("never in a log or a response", async () => {
    const mdp = motDePasseAleatoire();
    const espions = ["log", "warn", "error", "info"].map((m) => vi.spyOn(console, m));
    const { r } = await creerCompte(appel, "a@exemple.fr", { motDePasse: mdp });
    const reponses = [await r.text(), await (await connexion("a@exemple.fr", mdp)).text(), await (await connexion("a@exemple.fr", mdp + "!")).text()];
    const journaux = espions.flatMap((e) => e.mock.calls.flat().map(String)).join("\n");
    espions.forEach((e) => e.mockRestore());
    expect(journaux).not.toContain(mdp);
    for (const t of reponses) expect(t).not.toContain(mdp);
  });
});

describe("number of iterations recorded in each hash: the target can change without breaking any account", () => {
  it("a hash at 100,000 stays verifiable when the target becomes 20,000, then is recalculated at the next sign-in", async () => {
    const { motDePasse } = await creerCompte(appel, "a@exemple.fr");
    const avant = env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash;
    expect(avant.split("$")[1]).toBe("100000");
    const cible = MOT_DE_PASSE.iterations;
    MOT_DE_PASSE.iterations = 20_000;
    try {
      expect(await verifierMotDePasse(motDePasse, avant)).toBe(true);
      expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(200);
      const apres = env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash;
      expect(apres.split("$")[1]).toBe("20000");
      expect(apres).not.toBe(avant); // new salt too
      expect(await verifierMotDePasse(motDePasse, apres)).toBe(true);
      // a wrong password never triggers a recalculation
      expect((await connexion("a@exemple.fr", motDePasse + "x")).status).toBe(401);
      expect(env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash).toBe(apres);
    } finally { MOT_DE_PASSE.iterations = cible; }
    // back to 100,000: recalculated again at the next sign-in
    expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash.split("$")[1]).toBe("100000");
  });
  it("a count above the maximum is refused (cost bounded)", async () => {
    const h = await hacherMotDePasse("essai-quelconque-1");
    const [a, , s, e] = h.split("$");
    expect(await verifierMotDePasse("essai-quelconque-1", [a, MOT_DE_PASSE.iterationsMax + 1, s, e].join("$"))).toBe(false);
  });
});

describe("password policy", () => {
  it("12 characters at least, refused if common", () => {
    expect(refusMotDePasse("a".repeat(5) + "b".repeat(6))).toBe("trop_court"); // 11 characters
    expect(refusMotDePasse("éèàù".repeat(3))).toBeNull(); // 12 characters, accents counted once each
    expect(refusMotDePasse("Motdepasse123")).toBe("trop_courant");
    expect(refusMotDePasse("1234 5678 9012")).toBe("trop_courant");
    expect(refusMotDePasse("aaaaaaaaaaaaaaa")).toBe("trop_courant");
    expect(refusMotDePasse("jean.dupont1", { email: "jean.dupont1@exemple.fr" })).toBe("trop_courant");
    expect(refusMotDePasse("x".repeat(MOT_DE_PASSE.longueurMax) + "y")).toBe("trop_long");
    expect(refusMotDePasse(motDePasseAleatoire())).toBeNull();
  });

  it("a refused password keeps the ticket: the owner corrects it without a new code", async () => {
    const ticket = await ticketPour(appel, "a@exemple.fr");
    const r1 = await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: "court" } });
    expect(r1.status).toBe(400);
    expect((await r1.json()).erreur).toBe("mot_de_passe_trop_court");
    const r2 = await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: "password1234" } });
    expect((await r2.json()).erreur).toBe("mot_de_passe_trop_courant");
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(0);
    const r3 = await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: motDePasseAleatoire() } });
    expect(r3.status).toBe(200);
    expect(r3.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });

  it("the ticket works once and expires", async () => {
    const ticket = await ticketPour(appel, "a@exemple.fr");
    expect((await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: motDePasseAleatoire() } })).status).toBe(200);
    const encore = await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: motDePasseAleatoire() } });
    expect((await encore.json()).erreur).toBe("ticket_expire");
    const t2 = await ticketPour(appel, "b@exemple.fr");
    env.DB.sqlite.exec("UPDATE password_tickets SET expires_at = 1");
    expect((await (await appel("/api/auth/password", { methode: "POST", corps: { ticket: t2, mot_de_passe: motDePasseAleatoire() } })).json()).erreur).toBe("ticket_expire");
  });
});

describe("sign-in with email and password", () => {
  it("the right password opens a session; the SIREN's file is created", async () => {
    const { motDePasse } = await creerCompte(appel, "a@exemple.fr");
    const r = await appel("/api/auth/login", { methode: "POST", corps: { email: "A@Exemple.fr ", mot_de_passe: motDePasse, siren: SIREN } });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/^passation_session=.+HttpOnly; Secure; SameSite=Lax/);
    expect((await r.json()).destination).toMatch(/^\/espace\/demarrer\/\?dossier=/);
  });

  it("the same message and status whether or not the address exists", async () => {
    await creerCompte(appel, "connu@exemple.fr");
    const essai = motDePasseAleatoire();
    const existe = await connexion("connu@exemple.fr", essai);
    const inconnu = await connexion("inconnu@exemple.fr", essai);
    expect(existe.status).toBe(401);
    expect(inconnu.status).toBe(existe.status);
    expect(await inconnu.json()).toEqual(await existe.json());
    expect(existe.headers.get("set-cookie")).toBeNull();
  });

  it("after 5 failures, blocked for 15 minutes, even with the right password; the same for an unknown address", async () => {
    const { motDePasse } = await creerCompte(appel, "a@exemple.fr");
    for (let i = 1; i <= 4; i++) expect((await connexion("a@exemple.fr", motDePasse + i)).status).toBe(401);
    const cinquieme = await connexion("a@exemple.fr", motDePasse + 5);
    expect(cinquieme.status).toBe(429);
    expect((await cinquieme.json()).erreur).toBe("trop_echecs");
    ip = "198.51.100.1"; // another IP: the account itself is blocked
    const bloque = await connexion("a@exemple.fr", motDePasse);
    expect(bloque.status).toBe(429);
    expect(bloque.headers.get("set-cookie")).toBeNull();
    // 15 minutes later
    env.DB.sqlite.exec(`UPDATE login_failures SET bloque_jusqua = ${Math.floor(Date.now() / 1000) - 1}`);
    expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(200);
    // unknown address: blocked the same way (nothing reveals that the account does not exist)
    ip = "198.51.100.2";
    for (let i = 1; i <= 4; i++) expect((await connexion("personne@exemple.fr", motDePasse)).status).toBe(401);
    expect((await connexion("personne@exemple.fr", motDePasse)).status).toBe(429);
  });

  it("counted per IP too: 5 failures from one IP on different addresses block that IP", async () => {
    const { motDePasse } = await creerCompte(appel, "a@exemple.fr");
    for (let i = 1; i <= 5; i++) await connexion(`essai${i}@exemple.fr`, motDePasse);
    expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(429);
    ip = "198.51.100.3";
    expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(200);
  });

  it("a success resets the account's count", async () => {
    const { motDePasse } = await creerCompte(appel, "a@exemple.fr");
    for (let i = 1; i <= 4; i++) await connexion("a@exemple.fr", motDePasse + i);
    expect((await connexion("a@exemple.fr", motDePasse)).status).toBe(200);
    ip = "198.51.100.4";
    for (let i = 1; i <= 4; i++) expect((await connexion("a@exemple.fr", motDePasse + i)).status).toBe(401);
  });
});

describe("forgotten password", () => {
  it("code, then new password: every other session is closed, the old password no longer works", async () => {
    const { cookie: sessionA, motDePasse: ancien } = await creerCompte(appel, "a@exemple.fr");
    const autre = await connexion("a@exemple.fr", ancien);
    const sessionB = autre.headers.get("set-cookie").split(";")[0];
    expect((await appel("/api/me", { cookie: sessionA })).status).toBe(200);
    expect((await appel("/api/me", { cookie: sessionB })).status).toBe(200);

    const { cookie: sessionC, motDePasse: nouveau } = await creerCompte(appel, "a@exemple.fr");
    expect((await appel("/api/me", { cookie: sessionA })).status).toBe(401);
    expect((await appel("/api/me", { cookie: sessionB })).status).toBe(401);
    expect((await appel("/api/me", { cookie: sessionC })).status).toBe(200);
    expect((await connexion("a@exemple.fr", ancien)).status).toBe(401);
    expect((await connexion("a@exemple.fr", nouveau)).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(1);
  });

  it("the code request answers the same whether or not the address has an account", async () => {
    await creerCompte(appel, "connu@exemple.fr");
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = await appel("/api/auth/request", { methode: "POST", corps: { email: "connu@exemple.fr" } });
    const b = await appel("/api/auth/request", { methode: "POST", corps: { email: "inconnu@exemple.fr" } });
    espion.mockRestore();
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });
});

describe("accounts created before passwords (code only)", () => {
  it("cannot sign in with a password; code then password keeps the account and its file", async () => {
    // State of an account and a file created before migration 0004: no password
    const t = Math.floor(Date.now() / 1000);
    env.DB.sqlite.prepare("INSERT INTO users (id, email, created_at, last_login_at) VALUES ('u-ancien', 'ancien@exemple.fr', ?, ?)").run(t - 86400, t - 86400);
    env.DB.sqlite.prepare("INSERT INTO dossiers (id, user_id, siren, company_json, code_name, status, created_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000001', 'u-ancien', ?, '{}', 'Chêne', 'ouvert', ?, ?)").run(SIREN, t, t);
    env.DB.sqlite.prepare("INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES ('00000000-0000-4000-8000-000000000001', 'remuneration', '{\"dirigeant\":\"oui\"}', ?)").run(t);

    const essai = await connexion("ancien@exemple.fr", motDePasseAleatoire());
    expect(essai.status).toBe(401);
    expect((await essai.json()).erreur).toBe("identifiants_invalides"); // same message as for any wrong password

    const { cookie, motDePasse } = await creerCompte(appel, "ancien@exemple.fr");
    const moi = await (await appel("/api/me", { cookie })).json();
    expect(moi.email).toBe("ancien@exemple.fr");
    expect(moi.dossiers.map((d) => d.id)).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(env.DB.sqlite.prepare("SELECT id FROM users").all()).toEqual([{ id: "u-ancien" }]);
    expect(env.DB.sqlite.prepare("SELECT data_json FROM answers").get().data_json).toBe('{"dirigeant":"oui"}');
    expect((await connexion("ancien@exemple.fr", motDePasse)).status).toBe(200);
  });
});

describe("change of password from the owner's space", () => {
  const changer = (cookie, actuel, nouveau) => appel("/api/auth/changer", { methode: "POST", corps: { actuel, nouveau }, cookie });
  it("current password, then the new one: every other session closed, this one kept; old password refused, new accepted", async () => {
    const { cookie: ici, motDePasse: ancien } = await creerCompte(appel, "a@exemple.fr");
    const ailleurs = (await connexion("a@exemple.fr", ancien)).headers.get("set-cookie").split(";")[0];
    const nouveau = motDePasseAleatoire();
    const r = await changer(ici, ancien, nouveau);
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain(nouveau);
    expect((await appel("/api/me", { cookie: ici })).status).toBe(200);
    expect((await appel("/api/me", { cookie: ailleurs })).status).toBe(401);
    expect((await connexion("a@exemple.fr", ancien)).status).toBe(401);
    expect((await connexion("a@exemple.fr", nouveau)).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash).not.toContain(nouveau);
  });
  it("wrong current password, too short or identical: refused, nothing changed, no session closed", async () => {
    const { cookie, motDePasse } = await creerCompte(appel, "a@exemple.fr");
    const autre = (await connexion("a@exemple.fr", motDePasse)).headers.get("set-cookie").split(";")[0];
    const avant = env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash;
    expect((await (await changer(cookie, motDePasse + "x", motDePasseAleatoire())).json()).erreur).toBe("actuel_incorrect");
    expect((await (await changer(cookie, motDePasse, "court")).json()).erreur).toBe("mot_de_passe_trop_court");
    expect((await (await changer(cookie, motDePasse, motDePasse)).json()).erreur).toBe("identique");
    expect(env.DB.sqlite.prepare("SELECT password_hash FROM users").get().password_hash).toBe(avant);
    expect((await appel("/api/me", { cookie: autre })).status).toBe(200);
  });
  it("a stolen session cannot try passwords: 5 wrong current passwords → blocked like at sign-in", async () => {
    const { cookie, motDePasse } = await creerCompte(appel, "a@exemple.fr");
    for (let i = 1; i <= 4; i++) expect((await changer(cookie, motDePasse + i, motDePasseAleatoire())).status).toBe(400);
    expect((await changer(cookie, motDePasse + 5, motDePasseAleatoire())).status).toBe(429);
    expect((await changer(cookie, motDePasse, motDePasseAleatoire())).status).toBe(429);
  });
  it("without a session: 401", async () => {
    expect((await changer(null, "x", motDePasseAleatoire())).status).toBe(401);
  });
});
