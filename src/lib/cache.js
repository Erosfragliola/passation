// Cache des réponses d'API publiques dans D1 (table api_cache).
import { DURATIONS } from "../config.js";

// Une panne du cache ne doit jamais faire échouer la réponse : on journalise et on continue sans cache.
export async function lireCache(db, cle, dureeSecondes = DURATIONS.apiCache) {
  let ligne;
  try {
    ligne = await db.prepare("SELECT payload_json, fetched_at FROM api_cache WHERE key = ?").bind(cle).first();
  } catch (e) { console.warn("cache indisponible (lecture)", e.message); return null; }
  if (!ligne || Date.now() / 1000 - ligne.fetched_at > dureeSecondes) return null;
  return JSON.parse(ligne.payload_json);
}

export async function ecrireCache(db, cle, valeur) {
  try {
    await db.prepare(
    "INSERT INTO api_cache (key, payload_json, fetched_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at",
  ).bind(cle, JSON.stringify(valeur), Math.floor(Date.now() / 1000)).run();
  } catch (e) { console.warn("cache indisponible (écriture)", e.message); }
}
