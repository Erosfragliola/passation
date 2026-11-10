import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler } from "../src/maquette/donnees.js";
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

/** Demande un lien et récupère, dans le journal de développement, l'URL envoyée. */
async function demanderLien(email, siren = SIREN) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await appel("/api/auth/request", { methode: "POST", corps: { email, siren } });
  const texte = espion.mock.calls.flat().join("\n");
  espion.mockRestore();
  const lien = texte.match(/http:\/\/127\.0\.0\.1:8787\/api\/auth\/verify\?[^\s]+/)?.[0];
  return { r, lien };
}
async function seConnecter(email) {
  const { lien } = await demanderLien(email);
  const r = await appel(new URL(lien).pathname + new URL(lien).search);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return { r, cookie };
}

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  // Données publiques de l'entreprise déjà en cache (réponses réelles enregistrées) : aucun appel réseau.
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(`maquette:v1:${SIREN}`, JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("lien magique", () => {
  it("refuse une requête venant d'un autre site (CSRF)", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: "https://pirate.example" })).status).toBe(403);
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "a@b.fr" }, origine: null })).status).toBe(403);
  });
  it("refuse une adresse invalide", async () => {
    expect((await appel("/api/auth/request", { methode: "POST", corps: { email: "pas-une-adresse" } })).status).toBe(400);
  });
  it("stocke seulement l'empreinte du jeton, jamais le jeton", async () => {
    const { r, lien } = await demanderLien("Dirigeant@Exemple.fr");
    expect(r.status).toBe(200);
    const jeton = new URL(lien).searchParams.get("token");
    const ligne = env.DB.sqlite.prepare("SELECT token_hash, email FROM magic_tokens").get();
    expect(ligne.email).toBe("dirigeant@exemple.fr");
    expect(ligne.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ligne.token_hash).not.toContain(jeton);
  });
  it("ouvre une session avec un cookie HttpOnly, Secure, SameSite=Lax et crée le dossier du SIREN", async () => {
    const { r } = await seConnecter("dirigeant@exemple.fr");
    expect(r.status).toBe(302);
    const c = r.headers.get("set-cookie");
    expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/Secure/); expect(c).toMatch(/SameSite=Lax/);
    expect(r.headers.get("location")).toMatch(/^\/espace\/\?dossier=[0-9a-f-]{36}$/);
  });
  it("le lien ne sert qu'une fois", async () => {
    const { lien } = await demanderLien("x@exemple.fr");
    const chemin = new URL(lien).pathname + new URL(lien).search;
    expect((await appel(chemin)).status).toBe(302);
    const second = await appel(chemin);
    expect(second.headers.get("location")).toContain("/connexion?erreur=lien_expire");
    expect(second.headers.get("set-cookie")).toBeNull();
  });
  it("le lien expire après 15 minutes", async () => {
    const { lien } = await demanderLien("y@exemple.fr");
    env.DB.sqlite.exec("UPDATE magic_tokens SET expires_at = 1");
    const r = await appel(new URL(lien).pathname + new URL(lien).search);
    expect(r.headers.get("location")).toContain("erreur=lien_expire");
  });
  it("en production sans service d'e-mail configuré, aucun lien n'est affiché ni envoyé", async () => {
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await worker.fetch(new Request("https://passation.example/api/auth/request", { method: "POST",
      headers: { origin: "https://passation.example", "content-type": "application/json" }, body: JSON.stringify({ email: "z@exemple.fr" }) }), env);
    expect(r.status).toBe(503);
    expect(espion.mock.calls.flat().join(" ")).not.toContain("verify?token");
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
    const idA = new URL(a.r.headers.get("location"), BASE).searchParams.get("dossier");
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${idA}`, { cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { methode: "DELETE", cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${idA}`, { cookie: a.cookie })).status).toBe(200);
  });

  it("la checklist fait progresser l'avancement", async () => {
    const { r, cookie } = await seConnecter("a@exemple.fr");
    const id = new URL(r.headers.get("location"), BASE).searchParams.get("dossier");
    const avant = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(avant.avancement.preparation).toBe(0);
    expect(avant.avancement.valorisation).toBe(25); // estimation express disponible
    const apres = await (await appel(`/api/dossiers/${id}/checklist/kbis`, { methode: "PUT", corps: { done: true }, cookie })).json();
    expect(apres.checklist).toEqual(["kbis"]);
    expect(apres.avancement.preparation).toBe(Math.round(100 / CLES_CHECKLIST.size));
    expect((await appel(`/api/dossiers/${id}/checklist/inconnu`, { methode: "PUT", corps: { done: true }, cookie })).status).toBe(400);
  });

  it("supprimer le dossier efface les données et les fichiers", async () => {
    const { r, cookie } = await seConnecter("a@exemple.fr");
    const id = new URL(r.headers.get("location"), BASE).searchParams.get("dossier");
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
  it("moyenne des 4 blocs", () => {
    expect(avancement({})).toEqual({ global: 0, chiffres: 0, valorisation: 0, documents: 0, preparation: 0 });
    expect(avancement({ estimation_express: true, chiffres_valides: 1, documents: 3, checklist: new Set(CLES_CHECKLIST) }))
      .toEqual({ global: 81, chiffres: 100, valorisation: 25, documents: 100, preparation: 100 });
  });
});
