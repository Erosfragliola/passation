// Lighter owner's path (audit of 25/11/2026), part 3: fixes.
//   3.1 The approval stays « up to date » while the approved range (low and high, to the thousand euros) is unchanged:
//       answering the growth question, which the range does not use without a size premium, no longer asks for a new
//       approval; a change that moves the range (owner's pay) does.
//   3.2 The balance-sheet check (assets ≈ liabilities) applies only when the net fixed assets are entered.
//   3.3 The question counter counts every question screen of « Your company », whatever has been answered.
// Entirely fictitious figures (sample file of docs/DEMO.md); expected values worked out by hand in the comments.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/claude.js", async (original) => ({ ...(await original()), claudeDisponible: () => false }));
import worker from "../src/index.js";
import { d1Memoire, r2Memoire } from "./aide/environnement.js";
import { creerCompte } from "./aide/connexion.js";
import { CLE_MAQUETTE } from "../src/maquette/donnees.js";
import { SIREN_EXEMPLE, ENTREPRISE_EXEMPLE, EXERCICES_EXEMPLE, remplirDossierExemple } from "../scripts/dossier-exemple.mjs";
import { controlerExercice } from "../src/valuation/controles.js";
import { positionQuestion, QUESTIONS } from "../public/js/parcours.js";
import { ELEMENTS_DETTE, etatInitial, valeursAEnregistrer, peutValider } from "../public/js/dette-elements.js";

const BASE = "http://127.0.0.1:8787";
let env;
const appel = (chemin, { methode = "GET", corps, cookie } = {}) => {
  const headers = { origin: BASE, "cf-connecting-ip": "203.0.113.41" };
  if (cookie) headers.cookie = cookie;
  if (corps) headers["content-type"] = "application/json";
  return worker.fetch(new Request(BASE + chemin, { method: methode, headers, body: corps ? JSON.stringify(corps) : undefined }), env);
};
beforeEach(async () => {
  env = { DB: d1Memoire(), FILES: r2Memoire() };
  await env.DB.prepare("INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?)").bind(CLE_MAQUETTE(SIREN_EXEMPLE), JSON.stringify(ENTREPRISE_EXEMPLE), 4102444800).run();
});
async function dossierValide() {
  const { cookie, id } = await creerCompte(appel, "allege@exemple.fr", { siren: SIREN_EXEMPLE });
  const a = (chemin, o = {}) => appel(chemin, { ...o, cookie });
  await remplirDossierExemple(a, id);
  const etat = async () => (await (await a(`/api/dossiers/${id}`)).json()).parcours.etapes.validation;
  return { a, id, etat };
}

describe("3.1 approval up to date while the approved range is unchanged", () => {
  it("growth answered without a size premium: still up to date", async () => {
    const { a, id, etat } = await dossierValide();
    expect((await etat()).a_jour).toBe(true);
    // « How do you see the next 5 years? »: 5 % → 12 % a year. Without a size premium the DCF is not calculated, so the
    // range stays 1,381,818 – 2,431,818 (multiples 4 and 7 × normalized EBITDA 350,000, docs/DEMO.md)
    expect((await a(`/api/dossiers/${id}/answers/perspectives`, { methode: "PUT", corps: { data: { croissance: 0.12, axes: ["Nouveaux clients"] } } })).ok).toBe(true);
    expect((await etat()).a_jour).toBe(true);
    const v = await (await a(`/api/dossiers/${id}/valuation`)).json();
    expect([Math.round(v.resultat.synthese.bas), Math.round(v.resultat.synthese.haut)]).toEqual([1_381_818, 2_431_818]);
  });
  it("owner's pay changed: to approve again", async () => {
    const { a, id, etat } = await dossierValide();
    // Actual pay 85,000 → 165,000 with a normalized pay of 85,000: +80,000 on the adjusted EBITDA, the range moves
    await a(`/api/dossiers/${id}/answers/dirigeant`, { methode: "PUT", corps: { data: { remuneration_dirigeant_reelle: 165000, remuneration_normative: 85000, encadrement: "Oui, un ou plusieurs responsables", role_dirigeant: ["Commercial"] } } });
    expect((await etat()).a_jour).toBe(false);
  });
  it("an approved file where nothing changes stays up to date (also after the value is displayed again)", async () => {
    const { a, id, etat } = await dossierValide();
    await a(`/api/dossiers/${id}/valuation`);
    await a(`/api/dossiers/${id}/valuation`);
    expect((await etat()).a_jour).toBe(true);
  });
});

describe("3.2 balance-sheet check only with the net fixed assets", () => {
  const lignes = (x) => Object.fromEntries(Object.entries(x).map(([k, valeur]) => [k, { valeur, source: "dirigeant", valide: true }]));
  const bilan = (l) => controlerExercice(lignes(l)).filter((c) => c.code === "bilan");
  it("no alert without the fixed assets (2024 sample: assets without them 810,000, liabilities 1,320,000)", () => {
    expect(bilan(EXERCICES_EXEMPLE[2024])).toEqual([]);
  });
  it("alert when the fixed assets are entered and the gap is above 3 %", () => {
    // 100,000 + 810,000 = 910,000 against 1,320,000: gap 31 %
    expect(bilan({ ...EXERCICES_EXEMPLE[2024], immobilisations_nettes: 100000 })).toHaveLength(1);
    // 1,300,000 against 1,320,000: gap 1.5 %, within the 3 % tolerance
    expect(bilan({ ...EXERCICES_EXEMPLE[2024], immobilisations_nettes: 490000 })).toEqual([]);
  });
  it("the sample file balances: 510,000 in 2024 and 520,000 in 2025", () => {
    expect(EXERCICES_EXEMPLE[2024].immobilisations_nettes).toBe(510000);
    expect(EXERCICES_EXEMPLE[2025].immobilisations_nettes).toBe(520000);
    expect(bilan(EXERCICES_EXEMPLE[2024])).toEqual([]);
    expect(bilan(EXERCICES_EXEMPLE[2025])).toEqual([]);
  });
});

describe("3.3 question counter over every screen of « Your company »", () => {
  it("fixed position: the website first, then the questions in order, whatever is already answered", () => {
    const total = QUESTIONS.length + 1;
    expect(positionQuestion("site")).toEqual({ n: 1, total });
    expect(positionQuestion(QUESTIONS[1].id)).toEqual({ n: 3, total });
    expect(positionQuestion(QUESTIONS.at(-1).id)).toEqual({ n: total, total });
    expect(positionQuestion("inconnue")).toBeNull();
  });
});

describe("5.1 net debt: tick before entering an amount", () => {
  it("an amount already saved ticks its box; « None » ticked when the screen was validated without any item", () => {
    expect([...etatInitial({ credit_bail_restant: 45000, dividendes_a_verser: null }).coches]).toEqual(["credit_bail_restant"]);
    expect(etatInitial({}, true)).toEqual({ coches: new Set(), aucun: true });
    expect(etatInitial({}, false).aucun).toBe(false);
  });
  it("unticking erases the amount: null is saved, never 0 without an entry", () => {
    const e = etatInitial({ credit_bail_restant: 45000, comptes_courants_remboursables: 20000 });
    e.coches.delete("credit_bail_restant");
    expect(valeursAEnregistrer(e, { credit_bail_restant: 45000, comptes_courants_remboursables: 20000 }))
      .toEqual({ comptes_courants_remboursables: 20000, credit_bail_restant: null, dividendes_a_verser: null, actifs_hors_exploitation: null });
  });
  it("« None » accepted and erases every amount; otherwise every ticked item needs its amount", () => {
    const aucun = { coches: new Set(), aucun: true };
    expect(peutValider(aucun)).toBe(true);
    expect(Object.values(valeursAEnregistrer(aucun, { credit_bail_restant: 45000 }))).toEqual([null, null, null, null]);
    const deux = { coches: new Set(["credit_bail_restant", "dividendes_a_verser"]), aucun: false };
    expect(peutValider(deux, { credit_bail_restant: 45000 })).toBe(false);
    expect(peutValider(deux, { credit_bail_restant: 45000, dividendes_a_verser: 0 })).toBe(true);
    expect(peutValider({ coches: new Set(), aucun: false })).toBe(false);
    expect(ELEMENTS_DETTE).toHaveLength(4);
  });
});
