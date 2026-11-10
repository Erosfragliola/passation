// Limite de débit par empreinte d'IP et par heure (table rate_limits). L'IP n'est jamais stockée en clair.

async function empreinte(texte) {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Limite par adresse IP (empreinte). Retourne { autorise, restant }. */
export async function verifierDebit(db, request, env, nom, maxParHeure) {
  return verifierDebitCle(db, env, nom, request.headers.get("cf-connecting-ip") || "local", maxParHeure);
}

/** Limite par clé quelconque (IP, e-mail…), jamais stockée en clair. Incrémente la fenêtre horaire courante. */
export async function verifierDebitCle(db, env, nom, cle, maxParHeure) {
  const heure = Math.floor(Date.now() / 3_600_000);
  const sel = env.SESSION_SECRET || "sel-de-developpement-local";
  const bucket = `${nom}:${await empreinte(sel + cle)}:${heure}`;
  let ligne;
  try {
    ligne = await db.prepare(
    "INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?) " +
    "ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(bucket, heure * 3600).first();
  } catch (e) {
    // Base indisponible : on laisse passer (le cache et la limite côté sources restent des garde-fous).
    console.warn("limite de débit indisponible", e.message);
    return { autorise: true, restant: null };
  }
  // Ménage occasionnel des fenêtres expirées
  if (Math.random() < 0.05) {
    await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind((heure - 2) * 3600).run().catch(() => {});
  }
  return { autorise: ligne.count <= maxParHeure, restant: Math.max(0, maxParHeure - ligne.count) };
}
