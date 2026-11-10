// Parcours de valorisation par l'API : droits d'accès, chiffres pré-remplis puis validés, liasse (Claude simulé),
// questionnaire, calcul. Le calcul complet reprend le cas d'essai de approfondie.test.js (valeurs de référence).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/claude.js", () => ({
  claudeDisponible: (env) => Boolean(env.ANTHROPIC_API_KEY),
  lireLiasse: vi.fn(),
}));
import { lireLiasse } from "../src/lib/claude.js";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler } from "../src/maquette/donnees.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "319252813"; // industrie (section C)
let env;

function appel(chemin, { methode = "GET", corps, cookie, brut } = {}) {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.9" };
  if (cookie) headers.cookie = cookie;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: brut ?? (corps ? JSON.stringify(corps) : undefined) }), env);
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
const pdf = (texte = "%PDF-1.4 liasse") => { const f = new FormData(); f.append("fichier", new File([texte], "liasse.pdf", { type: "application/pdf" })); return f; };

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  lireLiasse.mockReset();
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(`maquette:v1:${SIREN}`, JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("droits d'accès du parcours", () => {
  it.each([["GET", "financials"], ["POST", "uploads"], ["GET", "answers"], ["POST", "valuation"]])("%s %s : 401 sans session, 404 pour le dossier d'un autre", async (methode, sous) => {
    const a = await seConnecter("a@exemple.fr");
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${a.id}/${sous}`, { methode })).status).toBe(401);
    expect((await appel(`/api/dossiers/${a.id}/${sous}`, { methode, cookie: b.cookie })).status).toBe(404);
  });
});

describe("chiffres", () => {
  it("pré-remplis avec les comptes publics, à valider", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    const v = await (await appel(`/api/dossiers/${id}/financials`, { cookie })).json();
    const annees = Object.keys(v.exercices);
    expect(annees.length).toBeGreaterThan(0);
    const l = v.exercices[annees.at(-1)];
    expect(l.chiffre_affaires).toMatchObject({ source: "inpi", valide: false });
    expect(v.manquants[annees.at(-1)]).toContain("chiffre_affaires");
  });
  it("validation ligne par ligne : la valeur validée passe en « dirigeant » si elle change", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/financials`, { cookie });
    const v = await (await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: 2025, valeurs: { stocks: 200000 }, valider: true } })).json();
    expect(v.exercices["2025"].stocks).toEqual({ valeur: 200000, source: "dirigeant", valide: true });
  });
  it("refuse une année absurde", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: 1800, valeurs: {} } })).status).toBe(400);
  });
});

describe("liasse PDF", () => {
  it("sans clé Claude configurée : 503 explicite, rien n'est lu", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    const r = await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: pdf() });
    expect(r.status).toBe(503);
    expect(lireLiasse).not.toHaveBeenCalled();
  });
  it("refuse un fichier qui n'est pas un PDF", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: pdf("pas un pdf") })).status).toBe(415);
  });
  it("montants lus = propositions à valider ; une valeur déjà validée n'est jamais écrasée ; fichier rangé dans le dossier", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: 2025, valeurs: { stocks: 111 }, valider: true } });
    lireLiasse.mockResolvedValue({ exercices: [{ annee: 2025, date_cloture: "2025-12-31", champs: [
      { cle: "chiffre_affaires", valeur: 2400000, page: 2, libelle_lu: "Chiffre d'affaires net" },
      { cle: "stocks", valeur: 999999, page: 1, libelle_lu: "Stocks" },
    ] }], remarques: "" });
    const r = await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: pdf() });
    expect(r.status).toBe(200);
    const v = await r.json();
    expect(v.exercices["2025"].chiffre_affaires).toEqual({ valeur: 2400000, source: "liasse", valide: false });
    expect(v.exercices["2025"].stocks).toEqual({ valeur: 111, source: "dirigeant", valide: true });
    expect([...env.FILES.objets.keys()][0]).toMatch(new RegExp(`^dossiers/${id}/liasses/`));
    expect(v.lectures_restantes).toBe(5);
  });
  it("plafond de lectures par dossier", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    lireLiasse.mockResolvedValue({ exercices: [], remarques: "" });
    for (let i = 0; i < 6; i++) await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: pdf() });
    expect((await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: pdf() })).status).toBe(429);
  });
});

describe("questionnaire et calcul", () => {
  it("étape inconnue refusée ; réponses relues", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/answers/pirate`, { methode: "PUT", cookie, corps: { data: {} } })).status).toBe(404);
    await appel(`/api/dossiers/${id}/answers/clients`, { methode: "PUT", cookie, corps: { data: { part_premier_client: 0.2 } } });
    const r = await (await appel(`/api/dossiers/${id}/answers`, { cookie })).json();
    expect(r.reponses.clients.part_premier_client).toBe(0.2);
  });

  it("calcul complet par l'API : multiples identiques à la référence (2 001 585,45), DCF calculé, avancement à jour", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/financials`, { cookie });
    for (const a of [2020, 2021, 2022, 2023, 2024]) await appel(`/api/dossiers/${id}/financials/${a}`, { methode: "DELETE", cookie }); // on retire les comptes publics
    const ex = {
      2023: { chiffre_affaires: 2000000, autres_produits: 0, achats_consommes: 800000, charges_externes: 300000, impots_taxes: 40000, charges_personnel: 600000, dotations_amortissements: 60000, stocks: 160000, creances_clients: 340000, dettes_fournisseurs: 210000, dettes_fiscales_sociales: 130000, tresorerie: 180000, emprunts: 380000, capitaux_propres: 700000 },
      2024: { chiffre_affaires: 2200000, autres_produits: 0, achats_consommes: 880000, charges_externes: 320000, impots_taxes: 40000, charges_personnel: 640000, dotations_amortissements: 66000, stocks: 180000, creances_clients: 370000, dettes_fournisseurs: 230000, dettes_fiscales_sociales: 140000, tresorerie: 210000, emprunts: 340000, capitaux_propres: 800000 },
      2025: { chiffre_affaires: 2400000, autres_produits: 0, achats_consommes: 960000, charges_externes: 340000, impots_taxes: 40000, charges_personnel: 680000, dotations_amortissements: 72000, stocks: 200000, creances_clients: 400000, dettes_fournisseurs: 250000, dettes_fiscales_sociales: 150000, tresorerie: 250000, placements: 50000, emprunts: 300000, provisions_risques: 20000, capitaux_propres: 900000 },
    };
    for (const [annee, valeurs] of Object.entries(ex)) await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: Number(annee), valeurs, valider: true } });
    const etapes = {
      dirigeant: { remuneration_dirigeant_reelle: 150000, remuneration_normative: 100000 },
      retraitements: { loyer_paye: 60000, loyer_marche: 48000, exceptionnels: [{ annee: 2024, libelle: "Litige fournisseur", montant: 20000, justification: "Non récurrent" }] },
      perspectives: { croissance: 0.05, marge_ebe: 0.16, investissements_pct: 0.03 },
      bilan: { comptes_courants_remboursables: 50000, creances_douteuses: 10000, capital_personnes_physiques: "non" },
      reglages: { prime_taille: 0.03, decotes: [{ cle: "dependance_dirigeant", pct: -0.1, justification: "Seul commercial" }, { cle: "recurrence", pct: 0.05, justification: "Contrats annuels" }] },
    };
    for (const [etape, data] of Object.entries(etapes)) expect((await appel(`/api/dossiers/${id}/answers/${etape}`, { methode: "PUT", cookie, corps: { data } })).status).toBe(200);
    // Le DCF du cas d'essai prend amortissements 3 % et BFR 30 jours : ici, issus de l'historique validé
    // (moyenne dotations / CA = 3 % exactement ; BFR normatif 29,83 j), d'où un DCF légèrement différent.
    const v = await (await appel(`/api/dossiers/${id}/valuation`, { methode: "POST", cookie })).json();
    expect(v.resultat.multiples.titres.central).toBeCloseTo(2_001_585.45, 1);
    expect(v.resultat.dcf.statut).toBe("ok");
    expect(v.resultat.dcf.hypotheses.amortissements_pct).toMatchObject({ valeur: 0.03, origine: "moyenne historique des dotations / CA" });
    expect(v.entree.tauxReduit).toBe(false);
    const d = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(d.avancement.valorisation).toBe(100);
    expect(d.parcours.exercices_complets).toBe(3);
    expect((await (await appel(`/api/dossiers/${id}/valuation`, { cookie })).json()).resultat.synthese.central).toBeCloseTo(v.resultat.synthese.central, 2);
  });
});
