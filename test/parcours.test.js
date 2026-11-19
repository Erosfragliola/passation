// Parcours de valorisation par l'API : droits d'accès, chiffres pré-remplis puis validés, liasse (Claude simulé),
// questionnaire, calcul. Le calcul complet reprend le cas d'essai de approfondie.test.js (valeurs de référence).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/claude.js", () => ({
  claudeDisponible: (env) => Boolean(env.ANTHROPIC_API_KEY),
  lireLiasse: vi.fn(),
  redigerTeaser: vi.fn(),
  extraireSite: vi.fn(),
  redigerSectionMemo: vi.fn(),
  cleRefusee: (e) => e?.status === 401 || e?.status === 403,
  MESSAGE_CLE_REFUSEE: "clé refusée",
}));
import { lireLiasse, redigerTeaser, extraireSite, redigerSectionMemo } from "../src/lib/claude.js";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";

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
  redigerTeaser.mockReset();
  extraireSite.mockReset();
  redigerSectionMemo.mockReset();
  vi.unstubAllGlobals();
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
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
  // Audit du 19/11/2026 : l'INPI publiait 2019, 2021 et 2024 ; la page valorisation réclamait 2019 et 2021
  it("comptes publics non consécutifs : seul le dernier est repris ; dernier exercice indispensable, deux précédents facultatifs", async () => {
    // Montants fictifs : seules les années comptent ici
    const d = JSON.parse(env.DB.sqlite.prepare("SELECT payload_json FROM api_cache").get().payload_json);
    d.ca = [{ annee: 2019, valeur: 900_000 }, { annee: 2021, valeur: 1_000_000 }, { annee: 2024, valeur: 1_200_000 }];
    d.ebe = [{ annee: 2019, valeur: 90_000 }, { annee: 2021, valeur: 100_000 }, { annee: 2024, valeur: 120_000 }];
    env.DB.sqlite.prepare("UPDATE api_cache SET payload_json = ?").run(JSON.stringify(d));
    const { cookie, id } = await seConnecter("a@exemple.fr");
    const v = await (await appel(`/api/dossiers/${id}/financials`, { cookie })).json();
    expect(Object.keys(v.exercices)).toEqual(["2024"]);
    const detail = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(detail.parcours.exercices).toEqual({ dernier: 2024, dernier_complet: false, recommandes: [2023, 2022], recommandes_manquants: [2023, 2022], anciens: [] });
    // Les questions du parcours guidé (13) et celle du site : 14, aucune faite
    expect(detail.parcours.questions).toEqual({ faits: 0, total: 14, pct: 0 });
    // 15 (dossier) + 10 (estimation express) = 25
    expect(detail.avancement.global).toBe(25);
  });
  it("écrans vus du parcours guidé enregistrés : « Passer » compte comme une réponse, côté serveur aussi", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/site`, { methode: "PUT", cookie, corps: { data: { aucun: true } } });
    expect((await appel(`/api/dossiers/${id}/answers/parcours`, { methode: "PUT", cookie, corps: { data: { vues: ["remuneration", "histoire"] } } })).status).toBe(200);
    const detail = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    // site + 2 écrans passés = 3 sur 14 ; 3 / 14 = 21,4 % → 21
    expect(detail.parcours.questions).toEqual({ faits: 3, total: 14, pct: 21 });
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

  it("réglages hors bornes refusés à l'enregistrement (400, message explicite), rien n'est enregistré (FIN-04)", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    const r = await appel(`/api/dossiers/${id}/answers/reglages`, { methode: "PUT", cookie, corps: { data: { decotes: [{ cle: "taille", pct: -1.5 }], poids_multiples: 3 } } });
    expect(r.status).toBe(400);
    const d = await r.json();
    expect(d.erreur).toBe("hypothese_invalide");
    expect(d.erreurs.map((x) => x.champ).sort()).toEqual(["reglages.decotes.taille", "reglages.poids_multiples"]);
    expect((await (await appel(`/api/dossiers/${id}/answers`, { cookie })).json()).reponses.reglages).toBeUndefined();
    expect((await appel(`/api/dossiers/${id}/answers/reglages`, { methode: "PUT", cookie, corps: { data: { poids_multiples: 0.5 } } })).status).toBe(200);
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

describe("datapack", () => {
  it("409 tant qu'aucun exercice n'est validé ; ensuite fichier Excel versionné, rangé dans le dossier, compté dans l'avancement", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/datapack`, { cookie })).status).toBe(409);
    await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: 2025, valeurs: { chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 200_000, charges_personnel: 250_000, stocks: 50_000, creances_clients: 100_000, tresorerie: 80_000, capitaux_propres: 300_000, emprunts: 50_000, dettes_fournisseurs: 60_000, dettes_fiscales_sociales: 40_000 }, valider: true } });
    const r = await appel(`/api/dossiers/${id}/documents/datapack`, { cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    expect(r.headers.get("content-disposition")).toMatch(/datapack-.*-v1\.xlsx/);
    const octets = new Uint8Array(await r.arrayBuffer());
    expect([octets[0], octets[1]]).toEqual([0x50, 0x4b]); // signature zip « PK »
    expect([...env.FILES.objets.keys()]).toContain(`dossiers/${id}/documents/datapack-v1.xlsx`);
    const d = await (await appel(`/api/dossiers/${id}`, { cookie })).json();
    expect(d.documents.datapack.version).toBe(1);
    expect(d.avancement.documents).toBe(33);
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/datapack`, { cookie: b.cookie })).status).toBe(404);
  });
});

describe("teaser anonymisé", () => {
  const propre = { accroche: "PME industrielle familiale à transmettre", activite: "Fabrication alimentaire artisanale.", chiffres: "Chiffre d'affaires entre 2 M€ et 5 M€.", atouts: ["Savoir-faire reconnu", "Clientèle fidèle"], operation: "Cession de 100 % du capital." };
  async function prepare() {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const s = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${s.id}/answers/activite`, { methode: "PUT", cookie: s.cookie, corps: { data: { description: "Nous fabriquons des confitures." } } });
    return s;
  }
  it("503 sans clé, 409 tant que l'activité n'est pas décrite", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie })).status).toBe(503);
    env.ANTHROPIC_API_KEY = "cle-de-test";
    expect((await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie })).status).toBe(409);
  });
  it("faits envoyés à Claude sans nom, ville, SIREN ni montant exact ; teaser enregistré avec un nom de code", async () => {
    const { cookie, id } = await prepare();
    redigerTeaser.mockResolvedValue(propre);
    const r = await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.nom_de_code).toMatch(/^Projet /);
    expect(d.teaser.sections.map((x) => x.cle)).toEqual(["accroche", "activite", "chiffres", "atouts", "operation"]);
    const faits = JSON.stringify(redigerTeaser.mock.calls[0][1]);
    expect(faits).not.toMatch(/FRAISERAIE|319252813/i);
    expect(faits).toContain("Industries alimentaires"); // division NAF 10, libellé unique du secteur (audit, point 9)
    expect((await (await appel(`/api/dossiers/${id}/documents/teaser`, { cookie })).json()).teaser.version).toBe(1);
  });
  it("première version identifiante → seconde tentative avec consigne ; si encore identifiante → 422, rien d'enregistré", async () => {
    const { cookie, id } = await prepare();
    redigerTeaser.mockResolvedValueOnce({ ...propre, accroche: "La Fraiseraie à vendre" }).mockResolvedValueOnce(propre);
    expect((await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie })).status).toBe(200);
    expect(redigerTeaser.mock.calls[1][2]).toContain("fraiseraie");
    redigerTeaser.mockReset();
  extraireSite.mockReset();
  redigerSectionMemo.mockReset();
  vi.unstubAllGlobals();
    redigerTeaser.mockResolvedValue({ ...propre, activite: "Siège : SIREN 319 252 813" });
    const r = await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie });
    expect(r.status).toBe(422);
    expect((await r.json()).problemes[0].type).toBe("identifiant");
    expect((await (await appel(`/api/dossiers/${id}/documents/teaser`, { cookie })).json()).teaser.version).toBe(1);
  });
  it("modification d'une section : contrôlée, marquée « modifiée » ; dossier d'un autre : 404", async () => {
    const { cookie, id } = await prepare();
    redigerTeaser.mockResolvedValue(propre);
    await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie });
    expect((await appel(`/api/dossiers/${id}/documents/teaser/sections/accroche`, { methode: "PUT", cookie, corps: { contenu: "La Fraiseraie cherche repreneur" } })).status).toBe(422);
    const ok = await (await appel(`/api/dossiers/${id}/documents/teaser/sections/accroche`, { methode: "PUT", cookie, corps: { contenu: "Belle PME familiale à reprendre" } })).json();
    expect(ok.teaser.sections[0]).toMatchObject({ contenu: "Belle PME familiale à reprendre", modifie: true });
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/teaser`, { cookie: b.cookie })).status).toBe(404);
  });
});

describe("mémorandum", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  function webSimule() {
    vi.stubGlobal("fetch", vi.fn(async (u) => {
      const url = String(u);
      if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
      if (url.endsWith(".png")) return new Response(PNG, { headers: { "content-type": "image/png" } });
      if (url.endsWith(".svg")) return new Response("<svg onload=alert(1)>", { headers: { "content-type": "image/svg+xml" } });
      return new Response(`<html><title>Accueil</title><body><img src="/logo.png" alt="logo"><p>Confitures depuis 1980.</p><a href="/a-propos">À propos</a></body></html>`, { headers: { "content-type": "text/html" } });
    }));
  }
  it("site lu : faits à valider (jamais validés d'office), termes ajoutés aux interdits du teaser, candidats logo", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    webSimule();
    const { cookie, id } = await seConnecter("a@exemple.fr");
    extraireSite.mockResolvedValue({ faits: [{ categorie: "histoire", fait: "Fondée en 1980.", source: "https://atelier.fr/" }], termes_identifiants: ["Confiture Maison"] });
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/site`, { methode: "POST", cookie, corps: { url: "atelier.fr" } })).json();
    expect(m.site.faits[0]).toMatchObject({ fait: "Fondée en 1980.", valide: false });
    expect(m.site.logos[0].url).toBe("https://atelier.fr/logo.png");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    redigerTeaser.mockResolvedValue({ accroche: "Une Confiture Maison réputée", activite: "x", chiffres: "x", atouts: [], operation: "x" });
    const t = await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie });
    expect(t.status).toBe(422);
    expect((await t.json()).problemes[0].terme).toBe("confiture maison");
  });
  it("logo : PNG accepté et servi au seul propriétaire ; SVG refusé ; adresse privée refusée", async () => {
    webSimule();
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/logo`, { methode: "POST", cookie, corps: { url: "https://atelier.fr/logo.svg" } })).status).toBe(415);
    expect((await appel(`/api/dossiers/${id}/documents/memo/logo`, { methode: "POST", cookie, corps: { url: "http://127.0.0.1/logo.png" } })).status).toBe(400);
    const r = await appel(`/api/dossiers/${id}/documents/memo/logo`, { methode: "POST", cookie, corps: { url: "https://atelier.fr/logo.png" } });
    expect((await r.json()).logo).toBe(true);
    const img = await appel(`/api/dossiers/${id}/documents/memo/logo`, { cookie });
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-security-policy")).toBe("default-src 'none'");
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/logo`, { cookie: b.cookie })).status).toBe(404);
  });
  it("section : 409 tant que l'activité et l'opération manquent ; ensuite rédigée avec les seuls faits validés ; modifiable", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "POST", cookie })).status).toBe(409);
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    await appel(`/api/dossiers/${id}/answers/site`, { methode: "PUT", cookie, corps: { data: { faits: [
      { id: 1, categorie: "histoire", fait: "Fondée en 1980.", source: "s", valide: true },
      { id: 2, categorie: "histoire", fait: "Leader mondial.", source: "s", valide: false }] } } });
    redigerSectionMemo.mockResolvedValue({ contenu: "L'entreprise a été fondée en 1980.", a_completer: ["Dates des agrandissements"] });
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "POST", cookie })).json();
    const donnees = JSON.stringify(redigerSectionMemo.mock.calls[0][2]);
    expect(donnees).toContain("Fondée en 1980.");
    expect(donnees).not.toContain("Leader mondial");
    const h = m.sections.find((x) => x.cle === "histoire");
    expect(h).toMatchObject({ redigee: true, a_completer: ["Dates des agrandissements"] });
    const e = await (await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "PUT", cookie, corps: { contenu: "Texte revu." } })).json();
    expect(e.sections.find((x) => x.cle === "histoire")).toMatchObject({ contenu: "Texte revu.", modifie: true });
  });
  it("titre affirmatif et accroche enregistrés (point final retiré, titre trop long écarté) ; gardés quand le texte est modifié", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("titres@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    redigerSectionMemo.mockResolvedValue({ titre: "Une entreprise fondée en 1980, dirigée par la même famille.", accroche: "Quarante ans d'activité continue.", contenu: "- **1980** : création.", a_completer: [] });
    let m = await (await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "POST", cookie })).json();
    expect(m.sections.find((x) => x.cle === "histoire")).toMatchObject({ titre_affirme: "Une entreprise fondée en 1980, dirigée par la même famille", accroche: "Quarante ans d'activité continue", point_fort: null, partie: 2, court: "Histoire" });
    expect(m.chiffres).toHaveProperty("compte_resultat");
    expect(m.profil.nom_de_code).toMatch(/^Projet /);
    m = await (await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "PUT", cookie, corps: { contenu: "Texte revu." } })).json();
    expect(m.sections.find((x) => x.cle === "histoire").titre_affirme).toBe("Une entreprise fondée en 1980, dirigée par la même famille");
    expect((await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "PUT", cookie, corps: { contenu: "x", titre: "y".repeat(200) } })).status).toBe(400);
    redigerSectionMemo.mockResolvedValue({ titre: "z".repeat(150), accroche: "", contenu: "Texte.", a_completer: [] });
    m = await (await appel(`/api/dossiers/${id}/documents/memo/sections/activite`, { methode: "POST", cookie })).json();
    expect(m.sections.find((x) => x.cle === "activite")).toMatchObject({ titre_affirme: null, titre: "Activité et savoir-faire" });
  });
});

describe("photos du mémorandum", () => {
  const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const photo = (attestation) => { const f = new FormData(); f.append("fichier", new File([JPG], "atelier.jpg", { type: "image/jpeg" })); if (attestation) f.append("attestation", "oui"); f.append("legende", "L'atelier"); return f; };
  it("attestation obligatoire ; photo servie au seul propriétaire ; retrait efface le fichier", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: photo(false) })).status).toBe(400);
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: photo(true) })).json();
    expect(m.photos).toEqual([{ n: 0, legende: "L'atelier" }]);
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { cookie })).headers.get("content-type")).toBe("image/jpeg");
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { cookie: b.cookie })).status).toBe(404);
    const r = await (await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { methode: "DELETE", cookie })).json();
    expect(r.photos).toEqual([]);
    expect([...env.FILES.objets.keys()].some((k) => k.includes("/photos/"))).toBe(false);
  });
});

describe("validation d'un exercice en bloc", () => {
  it("valide toutes les lignes remplies sauf celles en alerte ; contrôles renvoyés", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/financials`, { cookie });
    await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", cookie, corps: { annee: 2030, valeurs: { chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 200_000, charges_personnel: 250_000, stocks: -10, creances_clients: 100_000, tresorerie: 80_000, capitaux_propres: 300_000, emprunts: 50_000, dettes_fournisseurs: 60_000, dettes_fiscales_sociales: 40_000 }, valider: false } });
    const avant = await (await appel(`/api/dossiers/${id}/financials`, { cookie })).json();
    expect(avant.controles["2030"].some((c) => c.code === "negatif")).toBe(true);
    const v = await (await appel(`/api/dossiers/${id}/financials/2030/valider`, { methode: "POST", cookie })).json();
    expect(v.exercices["2030"].chiffre_affaires.valide).toBe(true);
    expect(v.exercices["2030"].stocks.valide).toBe(false); // en alerte : à valider à part
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/financials/2030/valider`, { methode: "POST", cookie: b.cookie })).status).toBe(404);
  });
});

import { dossiersARelancer, relancer, DELAI_RAPPEL } from "../src/routes/suivi.js";
describe("suivi : dossier prêt et rappel unique", () => {
  async function completer(id, cookie) {
    const t = Math.floor(Date.now() / 1000), doc = "doc-memo-" + id;
    env.DB.sqlite.exec(`INSERT INTO valuations (id, dossier_id, kind, inputs_json, result_json, created_at) VALUES ('v-${id}', '${id}', 'approfondie', '{}', '{}', ${t});
      INSERT INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES ('d-${id}', '${id}', 'datapack', 1, '', ${t}), ('t-${id}', '${id}', 'teaser', 1, '', ${t}), ('${doc}', '${id}', 'memo', 1, '', ${t});`);
    for (const k of ["synthese", "histoire", "activite", "organisation", "marche", "clients", "finances", "perspectives", "operation"]) env.DB.sqlite.exec(`INSERT INTO document_sections (document_id, section_key, content_md, edited_by_user, updated_at) VALUES ('${doc}', '${k}', '{}', 0, ${t});`);
  }
  it("« dossier prêt » : 409 tant que tout n'est pas généré, puis un seul envoi", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/termine`, { methode: "POST", cookie })).status).toBe(409);
    await completer(id);
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await (await appel(`/api/dossiers/${id}/termine`, { methode: "POST", cookie })).json()).toMatchObject({ envoye: true });
    expect(await (await appel(`/api/dossiers/${id}/termine`, { methode: "POST", cookie })).json()).toMatchObject({ deja: true });
    expect(espion.mock.calls.flat().join(" ").match(/est prêt/g)).toHaveLength(1);
    espion.mockRestore();
  });
  it("rappel : seulement les dossiers inactifs depuis 3 jours et incomplets, une seule fois", async () => {
    const a = await seConnecter("a@exemple.fr");
    expect(await dossiersARelancer(env)).toHaveLength(0); // actif à l'instant
    env.DB.sqlite.exec(`UPDATE dossiers SET updated_at = ${Math.floor(Date.now() / 1000) - DELAI_RAPPEL - 60}`);
    expect((await dossiersARelancer(env)).map((d) => d.id)).toEqual([a.id]);
    const espion = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await relancer(env, "http://127.0.0.1:8787")).toBe(1);
    expect(await relancer(env, "http://127.0.0.1:8787")).toBe(0);
    espion.mockRestore();
  });
});

describe("mémorandum : rédactions en parallèle", () => {
  it("8 sections lancées en même temps → un seul document, 8 sections ; le dossier peut être déclaré complet", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    redigerSectionMemo.mockResolvedValue({ contenu: "Texte.", a_completer: [] });
    const cles = ["synthese", "histoire", "activite", "marche", "organisation", "finances", "perspectives", "operation"];
    await Promise.all(cles.map((k) => appel(`/api/dossiers/${id}/documents/memo/sections/${k}`, { methode: "POST", cookie })));
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM documents WHERE dossier_id = ? AND kind = 'memo'").get(id).n).toBe(1);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM document_sections").get().n).toBe(8);
  });
});

describe("clé de l'API Claude refusée", () => {
  it("message explicite (503 « clé refusée ») au lieu de « document illisible »", async () => {
    env.ANTHROPIC_API_KEY = "cle-invalide";
    const { cookie, id } = await seConnecter("a@exemple.fr");
    lireLiasse.mockRejectedValue(Object.assign(new Error("401 authentication_error"), { status: 401 }));
    const f = new FormData(); f.append("fichier", new File(["%PDF-1.4 x"], "l.pdf", { type: "application/pdf" }));
    const r = await appel(`/api/dossiers/${id}/uploads`, { methode: "POST", cookie, brut: f });
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe("cle_refusee");
  });
});

describe("pièces du dossier (dépôt)", () => {
  const fichier = (nom, contenu = "contenu", item = "statuts") => { const f = new FormData(); f.append("fichier", new File([contenu], nom)); f.append("item", item); return f; };
  it("dépôt, liste, téléchargement, suppression ; l'élément de la liste est coché puis décoché", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    const r = await appel(`/api/dossiers/${id}/pieces`, { methode: "POST", cookie, brut: fichier("Statuts 2021.pdf", "%PDF statuts") });
    expect(r.status).toBe(201);
    const { pieces } = await r.json();
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ item: "statuts", filename: "Statuts 2021.pdf", mime: "application/pdf", size: 12 });
    expect((await (await appel(`/api/dossiers/${id}`, { cookie })).json()).checklist).toContain("statuts");
    const dl = await appel(`/api/dossiers/${id}/pieces/${pieces[0].id}`, { cookie });
    expect(dl.headers.get("content-disposition")).toContain("Statuts%202021.pdf");
    expect([...env.FILES.objets.keys()].every((k) => k.startsWith(`dossiers/${id}/pieces/`))).toBe(true);
    const apres = await (await appel(`/api/dossiers/${id}/pieces/${pieces[0].id}`, { methode: "DELETE", cookie })).json();
    expect(apres.pieces).toEqual([]);
    expect(env.FILES.objets.size).toBe(0);
    expect((await (await appel(`/api/dossiers/${id}`, { cookie })).json()).checklist).not.toContain("statuts");
  });
  it("refuse un type inconnu, une pièce hors liste et l'accès au dossier d'un autre", async () => {
    const a = await seConnecter("a@exemple.fr");
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${a.id}/pieces`, { methode: "POST", cookie: a.cookie, brut: fichier("virus.exe") })).status).toBe(415);
    expect((await appel(`/api/dossiers/${a.id}/pieces`, { methode: "POST", cookie: a.cookie, brut: fichier("x.pdf", "a", "inconnu") })).status).toBe(400);
    const { pieces } = await (await appel(`/api/dossiers/${a.id}/pieces`, { methode: "POST", cookie: a.cookie, brut: fichier("kbis.pdf", "k", "kbis") })).json();
    expect((await appel(`/api/dossiers/${a.id}/pieces/${pieces[0].id}`, { cookie: b.cookie })).status).toBe(404);
    expect((await appel(`/api/dossiers/${a.id}/pieces`)).status).toBe(401);
  });
  it("la suppression du dossier efface aussi les pièces (base et fichiers)", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/pieces`, { methode: "POST", cookie, brut: fichier("kbis.pdf", "k", "kbis") });
    await appel(`/api/dossiers/${id}`, { methode: "DELETE", cookie });
    expect(env.FILES.objets.size).toBe(0);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM pieces").get().n).toBe(0);
  });
});

describe("quotas des traitements par Claude (SEC-01)", () => {
  const preparer = async (cookie, id) => {
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
  };
  it("quota quotidien par utilisateur : au-delà, 429 sans appel à Claude ; un autre utilisateur n'est pas touché", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    redigerSectionMemo.mockResolvedValue({ contenu: "Texte.", a_completer: [] });
    const { CLAUDE_QUOTAS } = await import("../src/config.js");
    const max = CLAUDE_QUOTAS.traitementsParJourParUtilisateur;
    const a = await seConnecter("a@exemple.fr");
    await preparer(a.cookie, a.id);
    for (let i = 0; i < max; i++) expect((await appel(`/api/dossiers/${a.id}/documents/memo/sections/histoire`, { methode: "POST", cookie: a.cookie })).status).toBe(200);
    const refus = await appel(`/api/dossiers/${a.id}/documents/memo/sections/histoire`, { methode: "POST", cookie: a.cookie });
    expect(refus.status).toBe(429);
    expect((await refus.json()).erreur).toBe("quota_atteint");
    expect(redigerSectionMemo).toHaveBeenCalledTimes(max);
    // le quota suit l'utilisateur, pas le dossier : le teaser du même compte est refusé aussi
    expect((await appel(`/api/dossiers/${a.id}/documents/teaser`, { methode: "POST", cookie: a.cookie })).status).toBe(429);
    const b = await seConnecter("b@exemple.fr");
    await preparer(b.cookie, b.id);
    expect((await appel(`/api/dossiers/${b.id}/documents/memo/sections/histoire`, { methode: "POST", cookie: b.cookie })).status).toBe(200);
  });
  it("une requête invalide (questionnaire incomplet) ne consomme pas le quota", async () => {
    env.ANTHROPIC_API_KEY = "cle-de-test";
    const a = await seConnecter("a@exemple.fr");
    for (let i = 0; i < 3; i++) expect((await appel(`/api/dossiers/${a.id}/documents/memo/sections/histoire`, { methode: "POST", cookie: a.cookie })).status).toBe(409);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'jour-claude:%'").get().n).toBe(0);
  });
  it("base indisponible pour le compteur : traitement refusé (le coût n'est jamais laissé sans limite)", async () => {
    const { quotaClaude } = await import("../src/lib/ratelimit.js");
    const panne = { DB: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1"); } }) }) } };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await quotaClaude(panne, "u1", 60)).toMatchObject({ message: expect.stringMatching(/limite/) });
    vi.restoreAllMocks();
  });
  it("nombre de dossiers par compte plafonné (chaque dossier ouvre ses propres lectures de liasse)", async () => {
    const { CLAUDE_QUOTAS } = await import("../src/config.js");
    const a = await seConnecter("a@exemple.fr"); // 1 dossier
    const u = env.DB.sqlite.prepare("SELECT user_id FROM dossiers WHERE id = ?").get(a.id).user_id;
    for (let i = 1; i < CLAUDE_QUOTAS.dossiersParUtilisateur; i++) {
      env.DB.sqlite.prepare("INSERT INTO dossiers (id, user_id, siren, company_json, status, created_at, updated_at) VALUES (?, ?, ?, '{}', 'en_cours', 0, 0)").run(crypto.randomUUID(), u, String(100000000 + i));
    }
    const r = await appel("/api/dossiers", { methode: "POST", cookie: a.cookie, corps: { siren: "552100554" } });
    expect(r.status).toBe(429);
    expect((await r.json()).erreur).toBe("limite_dossiers");
    // le dossier déjà ouvert pour ce SIREN reste accessible
    expect((await appel("/api/dossiers", { methode: "POST", cookie: a.cookie, corps: { siren: SIREN } })).status).toBe(201);
  });
});
