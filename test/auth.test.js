import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
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

/** Demande un code et le récupère dans le journal de développement (mode local sans Brevo). */
async function demanderCode(email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const texte = espion.mock.calls.flat().join("\n");
  espion.mockRestore();
  return { r, code: texte.match(/Code de connexion pour \S+ : (\d{6})/)?.[1] };
}
const verifier = (email, code, siren = SIREN) => appel("/api/auth/code", { methode: "POST", corps: { email, code, siren } });
/** Code faux garanti différent du vrai. */
const autreCode = (code) => String((Number(code) + 1) % 1e6).padStart(6, "0");

async function seConnecter(email) {
  const { code } = await demanderCode(email);
  const r = await verifier(email, code);
  const d = await r.json();
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return { r, d, cookie, id: new URL(d.destination, BASE).searchParams.get("dossier") };
}

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  // Données publiques de l'entreprise déjà en cache (réponses réelles enregistrées) : aucun appel réseau.
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("connexion par code", () => {
  it("refuse une requête venant d'un autre site (CSRF)", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: "https://pirate.example" })).status).toBe(403);
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: null })).status).toBe(403);
    expect((await appel("/api/auth/code", { methode: "POST", corps: { email: "a@b.fr", code: "123456" }, origine: "https://pirate.example" })).status).toBe(403);
  });
  it("refuse une adresse invalide", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "pas-une-adresse" } })).status).toBe(400);
  });
  it("envoie un code à 6 chiffres et ne stocke que son empreinte", async () => {
    const { r, code } = await demanderCode("Dirigeant@Exemple.fr");
    expect(r.status).toBe(200);
    expect(code).toMatch(/^\d{6}$/);
    const ligne = env.DB.sqlite.prepare("SELECT code_hash, email FROM login_codes").get();
    expect(ligne.email).toBe("dirigeant@exemple.fr");
    expect(ligne.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(env.DB.sqlite.prepare("SELECT * FROM login_codes").all())).not.toContain(`"${code}"`);
  });
  it("le bon code ouvre une session (cookie HttpOnly, Secure, SameSite=Lax) et crée le dossier du SIREN", async () => {
    const { r, d } = await seConnecter("dirigeant@exemple.fr");
    expect(r.status).toBe(200);
    const c = r.headers.get("set-cookie");
    expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/Secure/); expect(c).toMatch(/SameSite=Lax/);
    expect(d.destination).toMatch(/^\/espace\/demarrer\/\?dossier=[0-9a-f-]{36}$/);
  });
  it("un code faux ne connecte pas et indique les essais restants", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    const r = await verifier("x@exemple.fr", autreCode(code));
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toMatchObject({ erreur: "code_incorrect", restants: 4 });
  });
  it("un code ne sert pas pour une autre adresse", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    await demanderCode("y@exemple.fr");
    expect((await verifier("y@exemple.fr", code)).headers.get("set-cookie")).toBeNull();
  });
  it("après 5 essais faux, le code est bloqué, même le bon", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    for (let i = 0; i < 4; i++) expect((await (await verifier("x@exemple.fr", autreCode(code))).json()).erreur).toBe("code_incorrect");
    expect((await (await verifier("x@exemple.fr", autreCode(code))).json()).erreur).toBe("code_bloque");
    const r = await verifier("x@exemple.fr", code);
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("le code ne sert qu'une fois", async () => {
    const { code } = await demanderCode("x@exemple.fr");
    expect((await verifier("x@exemple.fr", code)).status).toBe(200);
    const second = await verifier("x@exemple.fr", code);
    expect((await second.json()).erreur).toBe("code_expire");
    expect(second.headers.get("set-cookie")).toBeNull();
  });
  it("un nouveau code remplace l'ancien", async () => {
    const ancien = (await demanderCode("x@exemple.fr")).code;
    const nouveau = (await demanderCode("x@exemple.fr")).code;
    if (ancien !== nouveau) expect((await verifier("x@exemple.fr", ancien)).status).toBe(400);
    expect((await verifier("x@exemple.fr", nouveau)).status).toBe(200);
  });
  it("le code expire après 10 minutes", async () => {
    const { code } = await demanderCode("y@exemple.fr");
    env.DB.sqlite.exec("UPDATE login_codes SET expires_at = 1");
    expect((await (await verifier("y@exemple.fr", code)).json()).erreur).toBe("code_expire");
  });
  it("refuse un code mal formé", async () => {
    expect((await verifier("y@exemple.fr", "12ab56")).status).toBe(400);
    expect((await verifier("y@exemple.fr", "12345")).status).toBe(400);
  });
  it("le code dépend du secret serveur : une copie de la base ne permet pas de le retrouver par une empreinte simple", async () => {
    env.SESSION_SECRET = "secret-de-test";
    const { code } = await demanderCode("z@exemple.fr");
    const { id, code_hash } = env.DB.sqlite.prepare("SELECT id, code_hash FROM login_codes").get();
    const { empreinte } = await import("../src/lib/auth.js");
    expect(code_hash).not.toBe(await empreinte(`|${id}|${code}`));
    expect((await verifier("z@exemple.fr", code)).status).toBe(200);
  });
  it("en production sans service d'e-mail configuré, aucun code n'est affiché ni envoyé", async () => {
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    env.SESSION_SECRET = "secret-de-test"; // production correctement configurée, sauf l'envoi d'e-mails
    const r = await worker.fetch(new Request("https://passation.example/api/auth/request", { method: "POST",
      headers: { origin: "https://passation.example", "content-type": "application/json" }, body: JSON.stringify({ email: "z@exemple.fr" }) }), env);
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe("envoi_impossible");
    expect(espion.mock.calls.flat().join(" ")).not.toMatch(/\d{6}/);
    espion.mockRestore();
  });
  it("hors développement local sans SESSION_SECRET : API refusée (503), aucun code créé (SEC-07)", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await worker.fetch(new Request("https://passation.example/api/auth/request", { method: "POST",
      headers: { origin: "https://passation.example", "content-type": "application/json" }, body: JSON.stringify({ email: "z@exemple.fr" }) }), env);
    expect(r.status).toBe(503);
    const d = await r.json();
    expect(d.erreur).toBe("configuration_incomplete");
    expect(JSON.stringify(d)).not.toMatch(/SESSION_SECRET/); // pas de détail de configuration dans la réponse
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM login_codes").get().n).toBe(0);
    expect((await worker.fetch(new Request("https://passation.example/api/health"), env)).status).toBe(200);
    espion.mockRestore();
  });
  it("erreur interne (base indisponible) : JSON 500 générique, sans détail technique (SEC-08)", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = { prepare: () => { throw new Error("D1_ERROR: table secrète introuvable"); }, batch: async () => { throw new Error("D1"); } };
    const r = await appel("/api/me", { cookie: `passation_session=${"x".repeat(40)}` });
    expect(r.status).toBe(500);
    const texte = await r.text();
    expect(JSON.parse(texte).erreur).toBe("erreur_interne");
    expect(texte).not.toMatch(/D1|secrète/);
    espion.mockRestore();
  });
});

describe("routes privées", () => {
  it.each([["GET", "/api/me"], ["GET", "/api/dossiers"], ["GET", "/api/dossiers/00000000-0000-0000-0000-000000000000"],
    ["DELETE", "/api/dossiers/00000000-0000-0000-0000-000000000000"]])("%s %s → 401 sans connexion", async (methode, chemin) => {
    expect((await appel(chemin, { methode })).status).toBe(401);
  });

  it("/api/me renvoie l'utilisateur et son dossier", async () => {
    const { cookie } = await seConnecter("a@exemple.fr");
    const moi = await (await appel("/api/me", { cookie })).json();
    expect(moi.email).toBe("a@exemple.fr");
    expect(moi.dossiers).toHaveLength(1);
    expect(moi.dossiers[0]).toMatchObject({ siren: SIREN, nom: "HABI PRO'" });
  });

  it("un dirigeant ne peut ni lire, ni modifier, ni supprimer le dossier d'un autre", async () => {
    const a = await seConnecter("a@exemple.fr");
    const idA = a.id;
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${idA}`, { cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { methode: "DELETE", cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { cookie: a.cookie })).status).toBe(200);
  });

  it("la checklist fait progresser l'avancement", async () => {
    const { id, cookie } = await seConnecter("a@exemple.fr");
    const avant = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(avant.avancement.preparation).toBe(0);
    expect(avant.avancement.valorisation).toBe(25); // estimation express disponible
    const apres = await (await appel(`/api/dossiers/${id}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie })).json();
    expect(apres.checklist).toEqual(["kbis"]);
    expect(apres.avancement.preparation).toBe(Math.round(100 / CLES_CHECKLIST.size));
    expect((await appel(`/api/dossiers/${id}/checklist/inconnu`, { methode: "PUT", corps: { done: true }, cookie })).status).toBe(400);
  });

  it("supprimer le dossier efface les données et les fichiers", async () => {
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

  it("la déconnexion ferme la session", async () => {
    const { cookie } = await seConnecter("a@exemple.fr");
    const r = await appel("/api/auth/logout", { methode: "POST", cookie });
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await appel("/api/me", { cookie })).status).toBe(401);
  });
});

describe("avancement", () => {
  // Pondérations : identifiée 15, express 10, un exercice 20 (+5 pour les trois), questionnaire 15, approfondie 15, documents 20
  it("blocs inchangés ; global = étapes du parcours, sans partir de zéro", () => {
    expect(avancement({})).toEqual({ global: 15, chiffres: 0, valorisation: 0, documents: 0, preparation: 0 });
    expect(avancement({ estimation_express: true }).global).toBe(25);
    // 15 + 10 + 20 + 15 × 0,5 = 52,5 → 53
    expect(avancement({ estimation_express: true, chiffres_valides: 1 / 3, questionnaire_pct: 50 }).global).toBe(53);
    // la checklist ne compte pas dans le global : 15 + 10 + 25 + 20 = 70
    expect(avancement({ estimation_express: true, chiffres_valides: 1, documents: 3, checklist: new Set(CLES_CHECKLIST) }))
      .toEqual({ global: 70, chiffres: 100, valorisation: 25, documents: 100, preparation: 100 });
    expect(avancement({ estimation_express: true, chiffres_valides: 1, questionnaire_pct: 100, valorisation_approfondie: true, documents: 3 }).global).toBe(100);
  });
});