// Account required after the SIREN, sign-in by a 6-digit code sent by email only (decision of 25/11/2026), without
// leaving the page.
//   POST /api/auth/request { email }               → sends a code (same response whether or not the account exists)
//   POST /api/auth/code    { email, code, siren? }  → checks the code (single use, 10 min, 5 attempts), creates the
//                                                    account on first use, opens the session, creates the SIREN's file
//   POST /api/auth/logout                          → closes the session
//   GET  /api/me                                   → user and their files (401 otherwise)
import { json } from "../http.js";
import { DURATIONS, CODE_ESSAIS_MAX } from "../config.js";
import { empreinte, maintenant, emailValide, normaliserEmail, creerSession, cookieSession,
  cookieEffacement, lireCookie, exigerUtilisateur, codeAleatoire, empreinteCode } from "../lib/auth.js";
import { envoyerCodeConnexion } from "../lib/email.js";
import { verifierDebit, verifierDebitCle } from "../lib/ratelimit.js";
import { sirenValide, nettoyerSiren } from "../lib/siren.js";
import { creerDossierPourSiren, listerDossiers } from "./dossiers.js";
import { lien, t as tr } from "../../public/js/i18n.js";

const messageEnvoi = () => tr("serveur.auth.envoi");

async function lireCorps(request) {
  try { return await request.json(); } catch { return null; }
}

/** Session cookie + destination: the guided steps of the SIREN's file when a SIREN is given, otherwise the space. */
async function ouvrirSession(env, userId, sirenBrut) {
  const secret = await creerSession(env.DB, userId);
  let destination = "/espace/";
  const siren = nettoyerSiren(sirenBrut);
  if (sirenValide(siren)) {
    const dossier = await creerDossierPourSiren(env, userId, siren).catch(() => null);
    if (dossier) destination = `/espace/demarrer/?dossier=${dossier.id}`; // guided steps, resumed where they stopped
  }
  return json({ ok: true, destination: lien(destination) }, 200, { "set-cookie": cookieSession(secret), "cache-control": "no-store" });
}

export async function routeDemandeCode(request, env) {
  const corps = await lireCorps(request);
  if (!corps) return json({ erreur: "requete_invalide" }, 400);
  const email = normaliserEmail(corps.email);
  if (!emailValide(email)) return json({ erreur: "email_invalide", message: tr("serveur.auth.cette_adresse_e_mail") }, 400);

  const parIp = await verifierDebit(env.DB, request, env, "code-ip", 10);
  const parEmail = await verifierDebitCle(env.DB, env, "code-email", email, 5);
  if (!parIp.autorise || !parEmail.autorise) {
    return json({ erreur: "trop_de_requetes", message: tr("serveur.auth.trop_demandes_code_reessayez") }, 429);
  }

  const t = maintenant();
  const id = crypto.randomUUID();
  const code = codeAleatoire();
  // A single active code per address: the previous ones no longer work.
  await env.DB.batch([
    env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(t, email),
    env.DB.prepare("INSERT INTO login_codes (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, email, await empreinteCode(env, id, code), t, t + DURATIONS.codeConnexion),
  ]);

  const envoi = await envoyerCodeConnexion(env, email, code, request.url);
  if (!envoi.envoye) {
    if (envoi.raison !== "envoi_non_configure") console.log(`Could not send the code: ${envoi.raison}`);
    return json({ erreur: "envoi_impossible", message: tr("serveur.auth.envoi_e_mails_ne") }, 503);
  }
  return json({ ok: true, message: messageEnvoi() });
}

export async function routeVerificationCode(request, env) {
  const corps = await lireCorps(request);
  if (!corps) return json({ erreur: "requete_invalide" }, 400);
  const email = normaliserEmail(corps.email);
  const code = String(corps.code ?? "").replace(/\s/g, "");
  if (!emailValide(email) || !/^\d{6}$/.test(code)) {
    return json({ erreur: "code_invalide", message: tr("serveur.auth.code_compte_6_chiffres") }, 400);
  }
  // Limit per IP: prevents trying codes on many addresses at once.
  const parIp = await verifierDebit(env.DB, request, env, "code-essai-ip", 30);
  if (!parIp.autorise) return json({ erreur: "trop_de_requetes", message: tr("serveur.auth.trop_essais_reessayez_dans") }, 429);

  const t = maintenant();
  const ligne = await env.DB.prepare(
    "SELECT id, code_hash FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, t).first();
  const expire = () => json({ erreur: "code_expire", message: tr("serveur.auth.code_expire_ou_deja") }, 400);
  if (!ligne) return expire();

  // The attempt is counted before the comparison, atomically: the limit cannot be exceeded in parallel.
  const essai = await env.DB.prepare(
    "UPDATE login_codes SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ? RETURNING attempts",
  ).bind(ligne.id, CODE_ESSAIS_MAX).first();
  if (!essai) return expire();

  if (await empreinteCode(env, ligne.id, code) !== ligne.code_hash) {
    const restants = CODE_ESSAIS_MAX - essai.attempts;
    if (restants <= 0) {
      await env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE id = ?").bind(t, ligne.id).run();
      return json({ erreur: "code_bloque", message: tr("serveur.auth.trop_essais_faux_code") }, 400);
    }
    return json({ erreur: "code_incorrect", restants,
      message: tr("serveur.auth.code_incorrect", { n: restants }) }, 400);
  }

  // Atomic consumption: the code works only once.
  const consomme = await env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL RETURNING id")
    .bind(t, ligne.id).first();
  if (!consomme) return expire();

  // The address is verified: account created on first use, session opened, file of the SIREN created
  let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare("INSERT INTO users (id, email, created_at, last_login_at) VALUES (?, ?, ?, ?)").bind(user.id, email, t, t).run();
  } else {
    await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(t, user.id).run();
  }
  return ouvrirSession(env, user.id, corps.siren);
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
