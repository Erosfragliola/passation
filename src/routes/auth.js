// Connexion par lien magique (sans mot de passe).
//   POST /api/auth/request  { email, siren? }  → envoie le lien (réponse identique que le compte existe ou non)
//   GET  /api/auth/verify?token=…&siren=…    → consomme le jeton, ouvre la session, crée le dossier, redirige
//   POST /api/auth/logout                    → ferme la session
//   GET  /api/me                             → utilisateur et ses dossiers (401 sinon)
import { json } from "../http.js";
import { DURATIONS } from "../config.js";
import { aleatoire, empreinte, maintenant, emailValide, normaliserEmail, creerSession, cookieSession,
  cookieEffacement, lireCookie, exigerUtilisateur } from "../lib/auth.js";
import { envoyerLienConnexion } from "../lib/email.js";
import { verifierDebit, verifierDebitCle } from "../lib/ratelimit.js";
import { sirenValide, nettoyerSiren } from "../lib/siren.js";
import { creerDossierPourSiren, listerDossiers } from "./dossiers.js";

const MESSAGE_ENVOI = "Si l'adresse est valide, un lien de connexion vient d'être envoyé. Il est valable 15 minutes.";

export async function routeDemandeLien(request, env) {
  let corps;
  try { corps = await request.json(); } catch { return json({ erreur: "requete_invalide" }, 400); }
  const email = normaliserEmail(corps?.email);
  if (!emailValide(email)) return json({ erreur: "email_invalide", message: "Cette adresse e-mail n'est pas valide." }, 400);
  const siren = nettoyerSiren(corps?.siren);

  const parIp = await verifierDebit(env.DB, request, env, "lien-ip", 10);
  const parEmail = await verifierDebitCle(env.DB, env, "lien-email", email, 5);
  if (!parIp.autorise || !parEmail.autorise) {
    return json({ erreur: "trop_de_requetes", message: "Trop de demandes de lien. Réessayez dans une heure." }, 429);
  }

  const jeton = aleatoire();
  await env.DB.prepare("INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)")
    .bind(await empreinte(jeton), email, maintenant() + DURATIONS.magicLink).run();
  const lien = new URL("/api/auth/verify", request.url);
  lien.searchParams.set("token", jeton);
  if (sirenValide(siren)) lien.searchParams.set("siren", siren);

  const envoi = await envoyerLienConnexion(env, email, lien.toString());
  if (!envoi.envoye) {
    return json({ erreur: "envoi_impossible", message: "L'envoi d'e-mails n'est pas encore activé. Réessayez plus tard." }, 503);
  }
  return json({ ok: true, message: MESSAGE_ENVOI });
}

export async function routeVerification(request, env) {
  const url = new URL(request.url);
  const jeton = url.searchParams.get("token") || "";
  const echec = (raison) => Response.redirect(new URL(`/connexion?erreur=${raison}`, url).toString(), 302);
  if (jeton.length < 20) return echec("lien_invalide");

  // Consommation atomique : le jeton n'est utilisable qu'une fois, et seulement avant expiration.
  const ligne = await env.DB.prepare(
    "UPDATE magic_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email",
  ).bind(maintenant(), await empreinte(jeton), maintenant()).first();
  if (!ligne) return echec("lien_expire");

  let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(ligne.email).first();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare("INSERT INTO users (id, email, created_at, last_login_at) VALUES (?, ?, ?, ?)")
      .bind(user.id, ligne.email, maintenant(), maintenant()).run();
  } else {
    await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(maintenant(), user.id).run();
  }
  const secret = await creerSession(env.DB, user.id);

  let destination = "/espace/";
  const siren = nettoyerSiren(url.searchParams.get("siren"));
  if (sirenValide(siren)) {
    const dossier = await creerDossierPourSiren(env, user.id, siren).catch(() => null);
    if (dossier) destination = `/espace/?dossier=${dossier.id}`;
  }
  return new Response(null, { status: 302, headers: { location: destination, "set-cookie": cookieSession(secret), "cache-control": "no-store" } });
}

export async function routeDeconnexion(request, env) {
  const secret = lireCookie(request);
  if (secret) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await empreinte(secret)).run();
  return json({ ok: true }, 200, { "set-cookie": cookieEffacement() });
}

export async function routeMoi(request, env) {
  const [u, refus] = await exigerUtilisateur(request, env);
  if (refus) return refus;
  return json({ email: u.email, dossiers: await listerDossiers(env, u.id) });
}
