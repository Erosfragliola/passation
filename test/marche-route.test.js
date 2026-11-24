// Étude de marché par l'API : jamais deux études à la fois pour un dossier (409 pendant l'exécution), une demande en
// double ne consomme pas de quota, et un échec libère le verrou. Claude et l'annuaire sont simulés.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/claude.js", async (original) => ({
  ...(await original()),
  claudeDisponible: (env) => Boolean(env.ANTHROPIC_API_KEY),
  rechercherMarche: vi.fn(),
}));
vi.mock("../src/sources/secteur.js", async (original) => ({
  ...(await original()),
  compterSecteur: async () => { throw new Error("annuaire hors ligne (test)"); },
}));
import { rechercherMarche } from "../src/lib/claude.js";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "319252813";
let env;

function appel(chemin, { methode = "GET", corps, cookie } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.9" };
  if (cookie) headers.cookie = cookie;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
}
async function seConnecter(email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const code = espion.mock.calls.flat().join("\n").match(/Code de connexion pour \S+ : (\d{6})/)[1];
  espion.mockRestore();
  const r = await appel("/api/auth/code", { methode: "POST", corps: { email, code, siren: SIREN } });
  const d = await r.json();
  return { cookie: r.headers.get("set-cookie").split(";")[0], id: new URL(d.destination, BASE).searchParams.get("dossier") };
}
const etat = async (id) => JSON.parse((await env.DB.prepare("SELECT data_json FROM answers WHERE dossier_id = ? AND step = 'marche'").bind(id).first())?.data_json ?? "{}");
const quotaUtilise = async () => (await env.DB.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits WHERE bucket LIKE 'jour-claude:%'").first()).n;
/** Promesse réglable de l'extérieur : l'étude « tourne » tant qu'on ne la termine pas. */
const enAttente = () => { let fin; const p = new Promise((ok, ko) => { fin = { ok, ko }; }); return { p, fin }; };

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire(), ANTHROPIC_API_KEY: "cle-de-test" };
  rechercherMarche.mockReset();
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("étude de marché : une seule à la fois", () => {
  it("une deuxième demande pendant l'exécution reçoit 409, sans relancer de recherche ni consommer de quota", async () => {
    const { cookie, id } = await seConnecter("marche@exemple.fr");
    const url = `/api/dossiers/${id}/documents/memo/marche`;
    const etude = enAttente();
    rechercherMarche.mockReturnValueOnce(etude.p);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const premiere = appel(url, { methode: "POST", cookie });
    await vi.waitFor(() => expect(rechercherMarche).toHaveBeenCalledTimes(1));
    expect((await etat(id)).en_cours).toBeGreaterThan(0);
    expect(await quotaUtilise()).toBe(1);

    const seconde = await appel(url, { methode: "POST", cookie });
    expect(seconde.status).toBe(409);
    expect((await seconde.json()).erreur).toBe("en_cours");
    expect(rechercherMarche).toHaveBeenCalledTimes(1);
    expect(await quotaUtilise()).toBe(1); // le 409 est répondu avant le décompte du quota

    etude.fin.ok({ faits: [], urls: [] });
    expect((await premiere).status).toBe(200);
    const fin = await etat(id);
    expect(fin.en_cours).toBeNull();
    expect(fin.essais).toBe(1);
    expect(fin.date).toBeGreaterThan(0);
  });

  it("un échec (durée dépassée) libère le verrou, compte un essai et répond 502 ; une nouvelle demande est acceptée", async () => {
    const { cookie, id } = await seConnecter("marche2@exemple.fr");
    const url = `/api/dossiers/${id}/documents/memo/marche`;
    vi.spyOn(console, "log").mockImplementation(() => {});
    rechercherMarche.mockRejectedValueOnce(new Error("recherche_trop_longue"));
    const r = await appel(url, { methode: "POST", cookie });
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe("recherche_echouee");
    const apres = await etat(id);
    expect(apres.en_cours).toBeNull();
    expect(apres.essais).toBe(1);

    rechercherMarche.mockResolvedValueOnce({ faits: [], urls: [] });
    expect((await appel(url, { methode: "POST", cookie })).status).toBe(200);
    expect((await etat(id)).essais).toBe(2);
  });

  it("un verrou de plus de 180 s (traitement interrompu) n'empêche pas une nouvelle étude", async () => {
    const { cookie, id } = await seConnecter("marche3@exemple.fr");
    const t = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, 'marche', ?, ?)").bind(id, JSON.stringify({ en_cours: t - 181, essais: 0 }), t).run();
    rechercherMarche.mockResolvedValueOnce({ faits: [], urls: [] });
    expect((await appel(`/api/dossiers/${id}/documents/memo/marche`, { methode: "POST", cookie })).status).toBe(200);
  });
});
