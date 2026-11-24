// Mémorandum, phase 2 (24/11/2026) : routes. Photos (12 au plus, doublon refusé, analyse par Claude simulée,
// « Utiliser comme proposé », ordre, chemin de fichier jamais pris du navigateur), équipe dirigeante (consentement
// obligatoire, suppression avec le dossier, jamais dans le teaser), relecture critique (« Oui, corriger » sans chiffre
// touché, « Non » sans effet), message « crédit épuisé » pour toutes les rédactions. Claude est simulé : aucun appel.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/claude.js", async (original) => ({
  ...(await original()),
  claudeDisponible: (env) => Boolean(env.ANTHROPIC_API_KEY),
  redigerTeaser: vi.fn(), redigerSectionMemo: vi.fn(), analyserPhoto: vi.fn(), relireMemo: vi.fn(), extraireSite: vi.fn(), rechercherMarche: vi.fn(), lireLiasse: vi.fn(),
}));
// Annuaire public simulé (aucun appel réseau pendant les tests)
vi.mock("../src/sources/secteur.js", async (original) => ({ ...(await original()), compterSecteur: async () => { throw new Error("annuaire hors ligne (test)"); } }));
import { redigerTeaser, redigerSectionMemo, analyserPhoto, relireMemo, extraireSite, rechercherMarche, lireLiasse } from "../src/lib/claude.js";
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { normaliserEntreprise } from "../src/sources/entreprise.js";
import { normaliserExercices } from "../src/sources/inpi.js";
import { normaliserAnnonces } from "../src/sources/bodacc.js";
import { assembler, CLE_MAQUETTE } from "../src/maquette/donnees.js";

const BASE = "http://127.0.0.1:8787";
const SIREN = "319252813";
let env;
const appel = (chemin, { methode = "GET", corps, cookie, brut, referer } = {}) => {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.9" };
  if (cookie) headers.cookie = cookie;
  if (referer) headers.referer = referer;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: brut ?? (corps ? JSON.stringify(corps) : undefined) }), env);
};
async function seConnecter(email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const code = espion.mock.calls.flat().join("\n").match(/Code de connexion pour \S+ : (\d{6})/)[1];
  espion.mockRestore();
  const r = await appel("/api/auth/code", { methode: "POST", corps: { email, code, siren: SIREN } });
  return { cookie: r.headers.get("set-cookie").split(";")[0], id: new URL((await r.json()).destination, BASE).searchParams.get("dossier") };
}
// Images fictives : en-tête JPEG avec dimensions ; un octet varie pour que chaque photo soit différente
const jpg = (l, h, k = 0) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, k, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, l >> 8, l & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const formPhoto = (octets) => { const f = new FormData(); f.append("fichier", new File([octets], "photo.jpg", { type: "image/jpeg" })); f.append("attestation", "oui"); return f; };
const formImage = (octets) => { const f = new FormData(); f.append("image", new File([octets], "reduite.jpg", { type: "image/jpeg" })); return f; };
const JUGEMENT = { description: "Atelier avec stock de planches.", categorie: "atelier", note: 4, raison: "Nette.", usage: "activite", legende: "L'atelier de fabrication", signalements: [], teaser: true };
const CREDIT = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
const MESSAGE_CREDIT = "La rédaction est momentanément indisponible. Vos réponses sont enregistrées.";
const memo = (cookie, id) => appel(`/api/dossiers/${id}/documents/memo`, { cookie }).then((r) => r.json());

beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire(), ANTHROPIC_API_KEY: "cle-factice-de-test" };
  for (const f of [redigerTeaser, redigerSectionMemo, analyserPhoto, relireMemo, extraireSite, rechercherMarche, lireLiasse]) f.mockReset();
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${SIREN}.json`, import.meta.url)));
  const e = normaliserEntreprise(f.entreprise, SIREN);
  const d = assembler(e, normaliserExercices(f.inpi), normaliserAnnonces(f.bodacc, SIREN, e.date_creation));
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN), JSON.stringify(d), Math.floor(Date.now() / 1000)).run();
});

describe("photos : 12 au plus, doublon refusé, numéros à deux chiffres", () => {
  it("la 13e photo est refusée ; la 12e est servie ; la même image deux fois : 409", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    for (let k = 0; k < 12; k++) expect((await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(1600, 1000, k)) })).status).toBe(200);
    const r = await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(1600, 1000, 99)) });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe("trop_de_photos");
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/11`, { cookie })).headers.get("content-type")).toBe("image/jpeg");
    const m = await memo(cookie, id);
    expect(m.photos_max).toBe(12);
    expect(m.photos[11]).toMatchObject({ n: 11, largeur: 1600, hauteur: 1000 });
    await appel(`/api/dossiers/${id}/documents/memo/photos/11`, { methode: "DELETE", cookie });
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(1600, 1000, 0)) })).status).toBe(409);
  });
});

describe("analyse d'une photo par Claude (simulé)", () => {
  it("image réduite exigée ; jugement enregistré à côté de la photo ; rien n'est appliqué sans « Utiliser comme proposé »", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(4000, 3000)) });
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/0/analyse`, { methode: "POST", cookie, brut: formImage(jpg(4000, 3000)) })).status).toBe(413);
    expect(analyserPhoto).not.toHaveBeenCalled();
    analyserPhoto.mockResolvedValue(JUGEMENT);
    let m = await (await appel(`/api/dossiers/${id}/documents/memo/photos/0/analyse`, { methode: "POST", cookie, brut: formImage(jpg(1568, 1176)) })).json();
    expect(analyserPhoto).toHaveBeenCalledTimes(1);
    expect(analyserPhoto.mock.calls[0][2]).toBe("image/jpeg");
    expect(m.photos[0]).toMatchObject({ analyse: { categorie: "atelier", note: 4 }, decision: null, categorie: null, usage: null });
    m = await (await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { methode: "PUT", cookie, corps: { decision: "utilise" } })).json();
    expect(m.photos[0]).toMatchObject({ decision: "utilise", categorie: "atelier", usage: "activite", legende: "L'atelier de fabrication" });
    m = await (await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { methode: "PUT", cookie, corps: { decision: "ignore" } })).json();
    expect(m.photos[0]).toMatchObject({ decision: "ignore", categorie: null, usage: null });
  });
  it("sans clé Claude : 503, la photo reste utilisable ; crédit épuisé : message clair, jamais « réessayez dans un instant »", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(1600, 1000)) });
    analyserPhoto.mockRejectedValue(CREDIT);
    const r = await appel(`/api/dossiers/${id}/documents/memo/photos/0/analyse`, { methode: "POST", cookie, brut: formImage(jpg(1200, 750)) });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erreur: "credit_epuise", message: MESSAGE_CREDIT });
    delete env.ANTHROPIC_API_KEY;
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/0/analyse`, { methode: "POST", cookie, brut: formImage(jpg(1200, 750)) })).status).toBe(503);
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/0`, { cookie })).status).toBe(200);
    expect((await memo(cookie, id)).analyse_photos).toBe(false);
  });
});

describe("ordre des photos et chemins de fichiers", () => {
  it("permutation complète acceptée ; ordre incomplet refusé", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    for (let k = 0; k < 3; k++) await appel(`/api/dossiers/${id}/documents/memo/photos`, { methode: "POST", cookie, brut: formPhoto(jpg(1600, 1000 + k, k)) });
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/photos/ordre`, { methode: "PUT", cookie, corps: { ordre: [2, 0, 1] } })).json();
    expect(m.photos.map((p) => p.hauteur)).toEqual([1002, 1000, 1001]);
    expect((await appel(`/api/dossiers/${id}/documents/memo/photos/ordre`, { methode: "PUT", cookie, corps: { ordre: [0, 0, 1] } })).status).toBe(400);
  });
  it("l'enregistrement des réponses ne peut pas remplacer le chemin d'une photo (fichier d'un autre dossier jamais servi)", async () => {
    const a = await seConnecter("a@exemple.fr"), b = await seConnecter("b@exemple.fr");
    await appel(`/api/dossiers/${b.id}/documents/memo/photos`, { methode: "POST", cookie: b.cookie, brut: formPhoto(jpg(1600, 1000)) });
    const cleB = [...env.FILES.objets.keys()].find((k) => k.includes(b.id));
    await appel(`/api/dossiers/${a.id}/documents/memo/photos`, { methode: "POST", cookie: a.cookie, brut: formPhoto(jpg(1600, 1000, 5)) });
    await appel(`/api/dossiers/${a.id}/answers/site`, { methode: "PUT", cookie: a.cookie, corps: { data: { url: "https://exemple-menuiserie.test", photos: [{ cle: cleB, type: "image/jpeg" }] } } });
    const site = (await (await appel(`/api/dossiers/${a.id}/answers`, { cookie: a.cookie })).json()).reponses.site;
    expect(site.photos[0].cle.startsWith(`dossiers/${a.id}/`)).toBe(true);
    expect(site.url).toBe("https://exemple-menuiserie.test");
  });
});

describe("équipe dirigeante", () => {
  const personne = { id: "abc12345", nom: "Bernard Exemple", role: "fondateur", anciennete: 28, experience: 34, formation: "cap_bep", experiences: [{ type: "formation", precision: "Compagnons du devoir" }], apres: "reste" };
  const formPortrait = (consentement) => { const f = new FormData(); f.append("fichier", new File([jpg(600, 800)], "portrait.jpg", { type: "image/jpeg" })); if (consentement) f.append("consentement", "oui"); return f; };
  it("photo refusée sans consentement ; acceptée avec ; supprimée avec la personne puis avec le dossier", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/equipe`, { methode: "PUT", cookie, corps: { data: { personnes: [personne, { ...personne, id: "def67890", nom: "Nadia Exemple", photo: { cle: "dossiers/autre/x.jpg" } }] } } });
    const r = await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { methode: "POST", cookie, brut: formPortrait(false) });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe("consentement");
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { methode: "POST", cookie, brut: formPortrait(true) })).json();
    expect(m.equipe.personnes.map((p) => [p.nom, p.a_photo])).toEqual([["Bernard Exemple", true], ["Nadia Exemple", false]]);
    expect(JSON.stringify(m.equipe)).not.toMatch(/dossiers\//); // aucun chemin de fichier envoyé au navigateur
    expect((await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { cookie })).status).toBe(200);
    const b = await seConnecter("b@exemple.fr");
    expect((await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { cookie: b.cookie })).status).toBe(404);
    // Personne retirée : sa photo est effacée du stockage
    await appel(`/api/dossiers/${id}/answers/equipe`, { methode: "PUT", cookie, corps: { data: { personnes: [{ ...personne, id: "def67890", nom: "Nadia Exemple" }] } } });
    expect([...env.FILES.objets.keys()].some((k) => k.includes("/equipe/"))).toBe(false);
    await appel(`/api/dossiers/${id}/answers/equipe`, { methode: "PUT", cookie, corps: { data: { personnes: [personne] } } });
    await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { methode: "POST", cookie, brut: formPortrait(true) });
    expect([...env.FILES.objets.keys()].some((k) => k.includes("/equipe/"))).toBe(true);
    // Suppression du dossier en un clic : photos et parcours effacés
    await appel(`/api/dossiers/${id}`, { methode: "DELETE", cookie });
    expect([...env.FILES.objets.keys()].some((k) => k.includes(id))).toBe(false);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM answers WHERE dossier_id = ?").get(id).n).toBe(0);
  });
  it("chapitre « Organisation » : Claude reçoit les réponses, jamais la photo ; parcours sans chiffre inventé gardé", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    await appel(`/api/dossiers/${id}/answers/equipe`, { methode: "PUT", cookie, corps: { data: { personnes: [personne] } } });
    await appel(`/api/dossiers/${id}/documents/memo/equipe/abc12345/photo`, { methode: "POST", cookie, brut: formPortrait(true) });
    redigerSectionMemo.mockResolvedValue({ titre: "Une équipe en place", accroche: "x", contenu: "Intro.", a_completer: [], parcours: { abc12345: "CAP, puis compagnonnage." } });
    const m = await (await appel(`/api/dossiers/${id}/documents/memo/sections/organisation`, { methode: "POST", cookie })).json();
    const donnees = redigerSectionMemo.mock.calls[0][2];
    expect(donnees.equipe_dirigeante).toHaveLength(1);
    expect(JSON.stringify(donnees)).not.toMatch(/photo|consentement|dossiers\//);
    expect(m.sections.find((s) => s.cle === "organisation").parcours).toEqual({ abc12345: "CAP, puis compagnonnage." });
  });
  it("teaser : un nom de l'équipe rédigé par Claude est refusé ; jamais de photo dans le teaser", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication de pièces." } } });
    await appel(`/api/dossiers/${id}/answers/equipe`, { methode: "PUT", cookie, corps: { data: { personnes: [personne] } } });
    const texte = (equipe) => ({ accroche: "Une PME industrielle rentable", activite: `Fabrication de pièces. ${equipe}`, chiffres: "À compléter", atouts: ["Savoir-faire"], operation: "Cession totale." });
    redigerTeaser.mockResolvedValue(texte("Bernard Exemple dirige l'atelier."));
    const r = await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie });
    expect(r.status).toBe(422);
    expect((await r.json()).problemes.map((p) => p.terme)).toContain("bernard exemple");
    redigerTeaser.mockResolvedValue(texte("Une équipe de direction en place."));
    const t = await (await appel(`/api/dossiers/${id}/documents/teaser`, { methode: "POST", cookie })).json();
    expect(JSON.stringify(t)).not.toMatch(/Bernard|photo|equipe\/abc/i);
    expect(JSON.stringify(redigerTeaser.mock.calls[0][1])).not.toMatch(/Bernard|Compagnons|abc12345/);
  });
});

describe("relecture critique", () => {
  async function memoRedige() {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    redigerSectionMemo.mockResolvedValue({ titre: "Une équipe de 23 salariés", accroche: "x", contenu: "L'entreprise compte 23 salariés.\n\n- **Équipe** : Les compagnons ont une ancienneté moyenne élevée.", a_completer: [] });
    await appel(`/api/dossiers/${id}/documents/memo/sections/organisation`, { methode: "POST", cookie });
    return { cookie, id };
  }
  const remarques = [
    { id: "r1", section: "organisation", type: "non_sourcee", titre: "Préciser l'ancienneté de l'équipe", constat: "Non appuyé.", correction: { texte_actuel: "Les compagnons ont une ancienneté moyenne élevée.", texte_propose: "L'équipe d'atelier est en place." }, importance: "indispensable", statut: null },
    { id: "r2", section: "organisation", type: "chiffre", titre: "Vérifier l'effectif", constat: "À vérifier.", correction: null, importance: "conseille", statut: null },
  ];
  it("remarques enregistrées ; « Oui, corriger » ne touche aucun chiffre ; « Non » ne change rien", async () => {
    const { cookie, id } = await memoRedige();
    relireMemo.mockResolvedValue(remarques);
    let m = await (await appel(`/api/dossiers/${id}/documents/memo/relecture`, { methode: "POST", cookie })).json();
    expect(relireMemo.mock.calls[0][1]).toEqual([expect.objectContaining({ cle: "organisation" })]);
    expect(m.relecture.remarques).toHaveLength(2);
    const avant = m.sections.find((s) => s.cle === "organisation").contenu;
    m = await (await appel(`/api/dossiers/${id}/documents/memo/relecture/r2`, { methode: "POST", cookie, corps: { decision: "non" } })).json();
    expect(m.sections.find((s) => s.cle === "organisation").contenu).toBe(avant);
    expect(m.relecture.remarques[1].statut).toBe("ecartee");
    m = await (await appel(`/api/dossiers/${id}/documents/memo/relecture/r1`, { methode: "POST", cookie, corps: { decision: "oui" } })).json();
    const apres = m.sections.find((s) => s.cle === "organisation").contenu;
    expect(apres).toContain("L'équipe d'atelier est en place.");
    expect(apres.match(/\d+/g)).toEqual(avant.match(/\d+/g));
    expect(m.relecture.remarques[0].statut).toBe("corrigee");
  });
  it("une correction qui changerait un chiffre ou dont le passage a changé est refusée", async () => {
    const { cookie, id } = await memoRedige();
    relireMemo.mockResolvedValue([{ ...remarques[0], correction: { texte_actuel: "23 salariés", texte_propose: "25 salariés" } }, { ...remarques[0], id: "r2", correction: { texte_actuel: "passage disparu", texte_propose: "x" } }]);
    await appel(`/api/dossiers/${id}/documents/memo/relecture`, { methode: "POST", cookie });
    expect((await appel(`/api/dossiers/${id}/documents/memo/relecture/r1`, { methode: "POST", cookie, corps: { decision: "oui" } })).status).toBe(409);
    expect((await appel(`/api/dossiers/${id}/documents/memo/relecture/r2`, { methode: "POST", cookie, corps: { decision: "oui" } })).status).toBe(409);
    expect((await memo(cookie, id)).sections.find((s) => s.cle === "organisation").contenu).toContain("23 salariés");
  });
});

describe("crédit Anthropic épuisé : même message clair pour toutes les rédactions et analyses", () => {
  it("chapitre du mémorandum, teaser, relecture, lecture du site, étude de marché", async () => {
    const { cookie, id } = await seConnecter("a@exemple.fr");
    await appel(`/api/dossiers/${id}/answers/activite`, { methode: "PUT", cookie, corps: { data: { description: "Fabrication." } } });
    await appel(`/api/dossiers/${id}/answers/operation`, { methode: "PUT", cookie, corps: { data: { part_cedee: "100 %" } } });
    for (const f of [redigerSectionMemo, redigerTeaser, extraireSite, rechercherMarche]) f.mockRejectedValue(CREDIT);
    const essais = [
      [`/api/dossiers/${id}/documents/memo/sections/histoire`, null],
      [`/api/dossiers/${id}/documents/teaser`, null],
      [`/api/dossiers/${id}/documents/memo/site`, { url: "https://exemple-menuiserie.test" }],
    ];
    vi.stubGlobal("fetch", async () => new Response("<html><body>Menuiserie</body></html>", { headers: { "content-type": "text/html" } }));
    for (const [url, corps] of essais) {
      const r = await appel(url, { methode: "POST", cookie, corps });
      expect(r.status, url).toBe(503);
      const d = await r.json();
      expect(d, url).toEqual({ erreur: "credit_epuise", message: MESSAGE_CREDIT });
      expect(d.message).not.toMatch(/réessayez dans un instant/i);
    }
    const r = await appel(`/api/dossiers/${id}/documents/memo/marche`, { methode: "POST", cookie });
    vi.unstubAllGlobals();
    expect((await r.json()).message).toBe(MESSAGE_CREDIT);
    // Anglais : la même chose dans la langue de la page
    const en = await appel(`/api/dossiers/${id}/documents/memo/sections/histoire`, { methode: "POST", cookie, referer: `${BASE}/espace/documents/memo/` });
    expect((await en.json()).message).toBe("Drafting is temporarily unavailable. Your answers have been saved.");
  });
});
