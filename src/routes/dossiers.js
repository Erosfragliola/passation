// The owner's files. Every route checks that the file belongs to the signed-in user;
// otherwise it answers 404 (without revealing that the file exists).
//   GET    /api/dossiers                          list
//   POST   /api/dossiers            { siren }     creation (one file per SIREN and per user)
//   GET    /api/dossiers/:id                      details + progress
//   DELETE /api/dossiers/:id                      complete deletion (database + R2 files)
//   PUT    /api/dossiers/:id/checklist/:item { done }
//   financials, uploads, answers, valuation: see routes/valorisation.js; documents: routes/documents.js
import { json } from "../http.js";
import { exigerUtilisateur, maintenant } from "../lib/auth.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { CLAUDE_QUOTAS } from "../config.js";
import { sirenValide, nettoyerSiren } from "../lib/siren.js";
import { chargerMaquette, CLE_MAQUETTE } from "../maquette/donnees.js";
import { estimationExpress } from "../valuation/express.js";
import { CLES_CHECKLIST, avancement } from "../../public/js/dossier-regles.js";
import { manquants, exercicesAttendus } from "../../public/js/champs-financiers.js";
import { avancementQuestions, etatValorisation, vuesDe } from "../../public/js/parcours.js";
import { resumeValorisation } from "../../public/js/dossier-parcours.js";
import { routeValorisation, lireChiffres, lireReponses } from "./valorisation.js";
import { routePieces } from "./pieces.js";
import { projet } from "../documents/nom-de-code.js";
import { routeDocuments } from "./documents.js";
import { routeTermine } from "./suivi.js";
import { t as tr } from "../../public/js/i18n.js";

const resume = (row) => {
  const c = JSON.parse(row.company_json || "{}");
  return { id: row.id, siren: row.siren, nom: c.nom ?? null, ville: c.ville ?? null, cree_le: row.created_at };
};

export async function listerDossiers(env, userId) {
  const { results } = await env.DB.prepare("SELECT id, siren, company_json, created_at FROM dossiers WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  return results.map(resume);
}

/** Creates (or finds) a user's file for a SIREN, prefilled with the public data. */
export async function creerDossierPourSiren(env, userId, siren) {
  const existant = await env.DB.prepare("SELECT id, siren, company_json, created_at FROM dossiers WHERE user_id = ? AND siren = ?").bind(userId, siren).first();
  if (existant) return resume(existant);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM dossiers WHERE user_id = ?").bind(userId).first();
  if ((n?.n ?? 0) >= CLAUDE_QUOTAS.dossiersParUtilisateur) throw new Error("limite_dossiers");
  const cle = CLE_MAQUETTE(siren);
  let donnees = await lireCache(env.DB, cle);
  if (!donnees) {
    donnees = await chargerMaquette(siren); // outage of a source: error passed on (see routeDossiers)
    if (!donnees) throw new Error("introuvable");
    if (!donnees.sources_partielles) await ecrireCache(env.DB, cle, donnees);
  }
  const entreprise = { ...donnees, estimation: estimationExpress(donnees) };
  const id = crypto.randomUUID();
  const t = maintenant();
  await env.DB.prepare("INSERT INTO dossiers (id, user_id, siren, company_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'en_cours', ?, ?)")
    .bind(id, userId, siren, JSON.stringify(entreprise), t, t).run();
  return { id, siren, nom: entreprise.nom, ville: entreprise.ville, cree_le: t };
}

async function dossierDe(env, id, userId) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return env.DB.prepare("SELECT * FROM dossiers WHERE id = ? AND user_id = ?").bind(id, userId).first();
}
const introuvable = () => json({ erreur: "introuvable", message: tr("serveur.dossiers.dossier_introuvable") }, 404);

async function detail(env, row) {
  const { results } = await env.DB.prepare("SELECT item_key FROM checklist WHERE dossier_id = ? AND done = 1").bind(row.id).all();
  const coches = new Set(results.map((r) => r.item_key));
  const entreprise = JSON.parse(row.company_json || "{}");
  const lignes = await lireChiffres(env, row.id);
  const complets = Object.values(lignes).filter((l) => manquants(l).length === 0).length;
  const exercices = exercicesAttendus(lignes);
  const approfondie = await env.DB.prepare("SELECT result_json, created_at FROM valuations WHERE dossier_id = ? AND kind = 'approfondie' ORDER BY created_at DESC LIMIT 1").bind(row.id).first();
  // Range only (never a central value for the owner), and what explains it
  const valorisation = approfondie ? resumeValorisation(JSON.parse(approfondie.result_json)) : null;
  const reponses = await lireReponses(env, row.id);
  const vues = vuesDe(reponses);
  const questions = avancementQuestions(reponses, vues);
  // Steps of the two stages done or not, from the saved answers (same rule as the guided steps)
  const etapes = { ...etatValorisation(reponses, vues), photos: vues.includes("photos"), equipe: vues.includes("equipe_dirigeante") };
  const docs = await env.DB.prepare("SELECT kind, MAX(version) AS version, MAX(created_at) AS le FROM documents WHERE dossier_id = ? GROUP BY kind").bind(row.id).all();
  return {
    id: row.id, siren: row.siren, cree_le: row.created_at, statut: row.status,
    nom_de_code: row.code_name || (entreprise.naf ? projet(entreprise.naf) : null),
    entreprise: {
      nom: entreprise.nom, ville: entreprise.ville, naf: entreprise.naf, section_naf: entreprise.section_naf,
      date_creation: entreprise.date_creation, tranche_effectif: entreprise.tranche_effectif,
      ca: entreprise.ca, ebe: entreprise.ebe, comptes_confidentiels: entreprise.comptes_confidentiels,
    },
    estimation: entreprise.estimation ?? null,
    checklist: [...coches],
    parcours: { exercices, exercices_complets: complets, questions, etapes, valorisation, valorisation_le: approfondie?.created_at ?? null },
    documents: Object.fromEntries(docs.results.map((d) => [d.kind, { version: d.version, le: d.le }])),
    avancement: avancement({
      estimation_express: entreprise.estimation?.statut === "ok", checklist: coches,
      dernier_exercice: exercices.dernier_complet, questions_pct: questions.pct, valorisation_approfondie: valorisation != null, documents: docs.results.length,
    }),
  };
}

/** Deletes a file and everything attached to it: database rows and R2 files (prefix dossiers/<id>/). */
async function supprimerDossier(env, id) {
  if (env.FILES) {
    let curseur;
    do {
      const page = await env.FILES.list({ prefix: `dossiers/${id}/`, cursor: curseur });
      if (page.objects.length) await env.FILES.delete(page.objects.map((o) => o.key));
      curseur = page.truncated ? page.cursor : undefined;
    } while (curseur);
  }
  const t = (sql) => env.DB.prepare(sql).bind(id);
  await env.DB.batch([
    t("DELETE FROM document_sections WHERE document_id IN (SELECT id FROM documents WHERE dossier_id = ?)"),
    t("DELETE FROM documents WHERE dossier_id = ?"),
    t("DELETE FROM uploads WHERE dossier_id = ?"),
    t("DELETE FROM pieces WHERE dossier_id = ?"),
    t("DELETE FROM valuations WHERE dossier_id = ?"),
    t("DELETE FROM adjustments WHERE dossier_id = ?"),
    t("DELETE FROM financials WHERE dossier_id = ?"),
    t("DELETE FROM answers WHERE dossier_id = ?"),
    t("DELETE FROM checklist WHERE dossier_id = ?"),
    t("DELETE FROM chat_messages WHERE dossier_id = ?"),
    t("DELETE FROM dossiers WHERE id = ?"),
  ]);
}

export async function routeDossiers(request, env, segments) {
  const [u, refus] = await exigerUtilisateur(request, env);
  if (refus) return refus;
  const [id, sous, item, ...reste] = segments;
  const m = request.method;

  if (!id) {
    if (m === "GET") return json({ dossiers: await listerDossiers(env, u.id) });
    if (m === "POST") {
      let corps; try { corps = await request.json(); } catch { corps = {}; }
      const siren = nettoyerSiren(corps.siren);
      if (!sirenValide(siren)) return json({ erreur: "siren_invalide", message: tr("serveur.dossiers.numero_siren_valide") }, 400);
      try { return json({ dossier: await creerDossierPourSiren(env, u.id, siren) }, 201); }
      catch (e) {
        if (e.message === "introuvable") return json({ erreur: "introuvable", message: tr("serveur.dossiers.nous_ne_trouvons_cette") }, 404);
        if (e.message === "limite_dossiers") return json({ erreur: "limite_dossiers", message: tr("serveur.dossiers.max_dossiers", { n: CLAUDE_QUOTAS.dossiersParUtilisateur }) }, 429);
        console.warn("source indisponible :", e.message);
        return json({ erreur: "source_indisponible", message: tr("serveur.dossiers.registres_publics_ne_repondent") }, 502);
      }
    }
    return json({ erreur: "methode" }, 405);
  }

  const row = await dossierDe(env, id, u.id);
  if (!row) return introuvable();

  if (!sous) {
    if (m === "GET") return json(await detail(env, row));
    if (m === "DELETE") { await supprimerDossier(env, id); return json({ ok: true }); }
    return json({ erreur: "methode" }, 405);
  }
  if (["financials", "uploads", "answers", "valuation"].includes(sous)) return routeValorisation(request, env, row, sous, reste.length ? [item, ...reste].join("/") : item);
  if (sous === "documents") return reste.length > 3 ? json({ erreur: "route_inconnue" }, 404) : routeDocuments(request, env, row, item, reste[0], reste[1], reste[2]);
  if (sous === "termine" && m === "POST") return routeTermine(request, env, row, u);
  if (sous === "pieces" && reste.length === 0) return routePieces(request, env, row, item);
  if (sous === "checklist" && item && m === "PUT") {
    if (!CLES_CHECKLIST.has(item)) return json({ erreur: "element_inconnu" }, 400);
    let corps; try { corps = await request.json(); } catch { corps = {}; }
    const t = maintenant();
    await env.DB.prepare("INSERT INTO checklist (dossier_id, item_key, done, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(dossier_id, item_key) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at")
      .bind(id, item, corps.done ? 1 : 0, t).run();
    await env.DB.prepare("UPDATE dossiers SET updated_at = ? WHERE id = ?").bind(t, id).run();
    return json(await detail(env, { ...row, updated_at: t }));
  }
  return json({ erreur: "route_inconnue" }, 404);
}
