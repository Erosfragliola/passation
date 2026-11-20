// Limites de débit et quotas (table rate_limits). La clé (IP, e-mail, utilisateur) n'est jamais stockée en clair :
// seule une empreinte salée (secret serveur) l'est. Le compteur est incrémenté avant l'action, de façon atomique.
import { empreinte } from "./auth.js";
import { t as tr } from "../../public/js/i18n.js";

/** Limite par adresse IP (empreinte), par heure. Retourne { autorise, restant }. */
export async function verifierDebit(db, request, env, nom, maxParHeure) {
  return verifierDebitCle(db, env, nom, request.headers.get("cf-connecting-ip") || "local", maxParHeure);
}

const JOUR = 86_400;

/**
 * Limite par clé quelconque. Fenêtre horaire par défaut ; { parJour: true } pour un quota quotidien.
 * { siIndisponible: "refuser" } : si la base ne répond pas, l'action est refusée (quotas de coût) au lieu d'être
 * autorisée (limites anti-abus des routes publiques, qui ont d'autres garde-fous).
 */
export async function verifierDebitCle(db, env, nom, cle, max, { parJour = false, siIndisponible = "autoriser" } = {}) {
  const duree = parJour ? JOUR : 3600;
  const fenetre = Math.floor(Date.now() / 1000 / duree);
  const sel = env.SESSION_SECRET || "sel-de-developpement-local";
  const prefixe = parJour ? "jour-" : "";
  const bucket = `${prefixe}${nom}:${(await empreinte(sel + cle)).slice(0, 32)}:${fenetre}`;
  let ligne;
  try {
    ligne = await db.prepare(
      "INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?) " +
      "ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count",
    ).bind(bucket, fenetre * duree).first();
  } catch (e) {
    console.warn("limite de débit indisponible", e.message);
    return { autorise: siIndisponible !== "refuser", restant: null };
  }
  // Ménage occasionnel des fenêtres expirées (horaires : après 2 h ; quotidiennes : après 2 jours)
  if (Math.random() < 0.05) {
    const t = Math.floor(Date.now() / 1000);
    await db.prepare("DELETE FROM rate_limits WHERE (bucket NOT LIKE 'jour-%' AND window_start < ?) OR (bucket LIKE 'jour-%' AND window_start < ?)")
      .bind(t - 2 * 3600, t - 2 * JOUR).run().catch(() => {});
  }
  return { autorise: ligne.count <= max, restant: Math.max(0, max - ligne.count) };
}

/**
 * Quota quotidien des traitements par Claude (lecture de liasse ou de site, rédactions, étude de marché), par
 * utilisateur, tous dossiers confondus. Refusé si la base ne répond pas. Retourne null si autorisé, sinon { message }.
 */
export async function quotaClaude(env, userId, max) {
  const q = await verifierDebitCle(env.DB, env, "claude", userId, max, { parJour: true, siIndisponible: "refuser" });
  return q.autorise ? null : { message: tr("serveur.ratelimit.limite_jour", { max }) };
}
