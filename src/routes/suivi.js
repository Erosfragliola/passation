// Suivi du parcours : « dossier prêt » (une seule fois, quand tout est généré) et rappel unique après 3 jours
// d'inactivité (tâche planifiée quotidienne). Aucun autre e-mail n'est envoyé.
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { envoyerMessage } from "../lib/email.js";
import { lien as lienLocal, t as tr } from "../../public/js/i18n.js";
import { SECTIONS_MEMO } from "../documents/memo.js";

export const DELAI_RAPPEL = 3 * 24 * 3600;

async function lireSuivi(env, dossierId) {
  const r = await env.DB.prepare("SELECT data_json FROM answers WHERE dossier_id = ? AND step = 'suivi'").bind(dossierId).first();
  return r ? JSON.parse(r.data_json) : {};
}
async function ecrireSuivi(env, dossierId, suivi) {
  await env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, 'suivi', ?, ?)
    ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(dossierId, JSON.stringify(suivi), maintenant()).run();
}

/** Le dossier est complet : valorisation, datapack, teaser et toutes les sections du mémorandum (SECTIONS_MEMO). */
async function dossierComplet(env, dossierId) {
  const docs = await env.DB.prepare("SELECT kind, id FROM documents WHERE dossier_id = ?").bind(dossierId).all();
  const kinds = new Set(docs.results.map((d) => d.kind));
  const val = await env.DB.prepare("SELECT 1 AS ok FROM valuations WHERE dossier_id = ? AND kind = 'approfondie' LIMIT 1").bind(dossierId).first();
  const memo = docs.results.find((d) => d.kind === "memo");
  const n = memo ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM document_sections WHERE document_id = ?").bind(memo.id).first()).n : 0;
  return Boolean(val) && kinds.has("datapack") && kinds.has("teaser") && n >= SECTIONS_MEMO.length;
}

/** POST /api/dossiers/:id/termine : envoie « Votre dossier est prêt » une seule fois. */
export async function routeTermine(request, env, row, user) {
  if (!(await dossierComplet(env, row.id))) return json({ erreur: "incomplet", message: tr("serveur.suivi.dossier_encore_complet") }, 409);
  const suivi = await lireSuivi(env, row.id);
  if (suivi.pret_envoye) return json({ ok: true, deja: true });
  const lien = new URL(lienLocal(`/espace/demarrer/?dossier=${row.id}`), request.url).href;
  const nom = JSON.parse(row.company_json || "{}").nom || tr("serveur.email.votre_entreprise");
  const r = await envoyerMessage(env, user.email, { sujet: tr("serveur.email.pret.sujet"), titre: tr("serveur.email.pret.titre", { nom }), texte: tr("serveur.email.pret.texte"), lien, bouton: tr("serveur.email.pret.bouton") }, request.url);
  if (r.envoye) await ecrireSuivi(env, row.id, { ...suivi, pret_envoye: maintenant() });
  return json({ ok: true, envoye: r.envoye });
}

/** Dossiers à relancer : inactifs depuis 3 jours, incomplets, jamais relancés. */
export async function dossiersARelancer(env, t = maintenant()) {
  const { results } = await env.DB.prepare(`SELECT d.id, d.company_json, u.email FROM dossiers d JOIN users u ON u.id = d.user_id
    WHERE d.updated_at < ? AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.dossier_id = d.id AND a.step = 'suivi' AND (a.data_json LIKE '%"rappel_envoye"%' OR a.data_json LIKE '%"pret_envoye"%'))
    LIMIT 50`).bind(t - DELAI_RAPPEL).all();
  const liste = [];
  for (const d of results) if (!(await dossierComplet(env, d.id))) liste.push(d);
  return liste;
}

/** Tâche planifiée : un seul rappel par dossier. */
export async function relancer(env, base = env.APP_URL || "https://passation.eros-fragliola-freedom.workers.dev") {
  let n = 0;
  for (const d of await dossiersARelancer(env)) {
    const nom = JSON.parse(d.company_json || "{}").nom || tr("serveur.email.votre_entreprise");
    const r = await envoyerMessage(env, d.email, { sujet: tr("serveur.email.rappel.sujet"), titre: tr("serveur.email.rappel.titre", { nom }), texte: tr("serveur.email.rappel.texte"), lien: `${base}${lienLocal(`/espace/demarrer/?dossier=${d.id}`)}`, bouton: tr("serveur.email.rappel.bouton") }, base);
    if (r.envoye) { await ecrireSuivi(env, d.id, { ...(await lireSuivi(env, d.id)), rappel_envoye: maintenant() }); n++; }
  }
  return n;
}
