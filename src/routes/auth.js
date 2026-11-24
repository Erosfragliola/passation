// Account with a password (24/11/2026), without leaving the page.
//   POST /api/auth/request  { email }                        → sends a 6-digit code (same response whether or not the
//                                                              account exists): sign-up, forgotten password, or first
//                                                              sign-in of an account created with a code only
//   POST /api/auth/code     { email, code }                  → checks the code; returns a one-time ticket (15 min), no session
//   POST /api/auth/password { ticket, mot_de_passe, siren? } → sets the password, closes every other session of the
//                                                              account, opens a session, creates the SIREN's file
//   POST /api/auth/login    { email, mot_de_passe, siren? }  → email + password; 5 failures → 15-min block (account and IP);
//                                                              the same message whether or not the address exists
//   POST /api/auth/logout                                    → closes the session
//   GET  /api/me                                             → user and their files (401 otherwise)
import { json } from "../http.js";
import { DURATIONS, CODE_ESSAIS_MAX, MOT_DE_PASSE } from "../config.js";
import { empreinte, maintenant, emailValide, normaliserEmail, creerSession, cookieSession,
  cookieEffacement, lireCookie, exigerUtilisateur, codeAleatoire, empreinteCode, aleatoire } from "../lib/auth.js";
import { refusMotDePasse, hacherMotDePasse, verifierMotDePasse, aRecalculer } from "../lib/motdepasse.js";
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

/** Keys of the failure counters: never the address or the IP in clear (hash with the server secret). */
const cleEchec = async (env, genre, valeur) => `${genre}:${(await empreinte(`${env.SESSION_SECRET || "sel-de-developpement-local"}|${genre}|${valeur}`)).slice(0, 40)}`;

async function bloque(env, cles, t) {
  for (const cle of cles) {
    const l = await env.DB.prepare("SELECT bloque_jusqua FROM login_failures WHERE cle = ?").bind(cle).first();
    if (l && l.bloque_jusqua > t) return true;
  }
  return false;
}

/** Counts a failure on each key; the 5th failure within 15 minutes blocks the key for 15 minutes. true if now blocked. */
async function compterEchec(env, cles, t) {
  let bloquee = false;
  // Occasional clean-up: rows with no failure for a day are of no use (same practice as the rate limits)
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM login_failures WHERE updated_at < ? AND bloque_jusqua < ?").bind(t - 86_400, t).run().catch(() => {});
  for (const cle of cles) {
    const l = await env.DB.prepare(
      "INSERT INTO login_failures (cle, echecs, bloque_jusqua, updated_at) VALUES (?, 1, 0, ?) " +
      "ON CONFLICT(cle) DO UPDATE SET echecs = CASE WHEN updated_at < ? THEN 1 ELSE echecs + 1 END, updated_at = ? RETURNING echecs",
    ).bind(cle, t, t - MOT_DE_PASSE.blocage, t).first();
    if (l.echecs >= MOT_DE_PASSE.echecsMax) {
      await env.DB.prepare("UPDATE login_failures SET echecs = 0, bloque_jusqua = ? WHERE cle = ?").bind(t + MOT_DE_PASSE.blocage, cle).run();
      bloquee = true;
    }
  }
  return bloquee;
}

const refusMdp = (raison) => json({ erreur: `mot_de_passe_${raison}`,
  message: tr(`serveur.auth.mot_de_passe_${raison}`, { n: MOT_DE_PASSE.longueurMin }) }, 400);

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

  // The address is verified: a one-time ticket lets the owner choose a password (no session yet).
  const ticket = aleatoire();
  await env.DB.batch([
    env.DB.prepare("UPDATE password_tickets SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(t, email),
    env.DB.prepare("INSERT INTO password_tickets (id_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await empreinte(ticket), email, t, t + DURATIONS.ticketMotDePasse),
  ]);
  return json({ ok: true, etape: "mot_de_passe", ticket }, 200, { "cache-control": "no-store" });
}

/** Sets the password after a verified code: sign-up, forgotten password, or an account that had no password yet. */
export async function routeMotDePasse(request, env) {
  const corps = await lireCorps(request);
  if (!corps) return json({ erreur: "requete_invalide" }, 400);
  const ticket = String(corps.ticket ?? "");
  const mdp = corps.mot_de_passe;
  if (typeof mdp !== "string") return refusMdp("trop_court");
  const t = maintenant();
  const expire = () => json({ erreur: "ticket_expire", message: tr("serveur.auth.ticket_expire") }, 400);
  if (ticket.length < 20) return expire();
  const ligne = await env.DB.prepare("SELECT email FROM password_tickets WHERE id_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(await empreinte(ticket), t).first();
  if (!ligne) return expire();
  // Checked before the ticket is used: a refused password can be corrected without a new code.
  const raison = refusMotDePasse(mdp, { email: ligne.email });
  if (raison) return refusMdp(raison);
  const consomme = await env.DB.prepare("UPDATE password_tickets SET used_at = ? WHERE id_hash = ? AND used_at IS NULL RETURNING email")
    .bind(t, await empreinte(ticket)).first();
  if (!consomme) return expire();

  const hash = await hacherMotDePasse(mdp);
  let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(consomme.email).first();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare("INSERT INTO users (id, email, created_at, last_login_at, password_hash, password_set_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(user.id, consomme.email, t, t, hash, t).run();
  } else {
    // New password: every other session of the account is closed (lost or stolen device).
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash = ?, password_set_at = ?, last_login_at = ? WHERE id = ?").bind(hash, t, t, user.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    ]);
  }
  await env.DB.prepare("DELETE FROM login_failures WHERE cle = ?").bind(await cleEchec(env, "compte", consomme.email)).run();
  return ouvrirSession(env, user.id, corps.siren);
}

/** Sign-in with email and password. The response never reveals whether the address has an account. */
export async function routeConnexion(request, env) {
  const corps = await lireCorps(request);
  if (!corps) return json({ erreur: "requete_invalide" }, 400);
  const email = normaliserEmail(corps.email);
  const mdp = typeof corps.mot_de_passe === "string" ? corps.mot_de_passe : "";
  const invalides = () => json({ erreur: "identifiants_invalides", message: tr("serveur.auth.identifiants_invalides") }, 401);
  const tropEchecs = () => json({ erreur: "trop_echecs", message: tr("serveur.auth.trop_echecs", { n: MOT_DE_PASSE.blocage / 60 }) }, 429);
  if (!emailValide(email) || !mdp || mdp.length > MOT_DE_PASSE.longueurMax) return invalides();

  const t = maintenant();
  const cles = [await cleEchec(env, "compte", email), await cleEchec(env, "ip", request.headers.get("cf-connecting-ip") || "local")];
  if (await bloque(env, cles, t)) return tropEchecs();

  const user = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(email).first();
  // Same calculation whether or not the account (or its password) exists: same time, same message.
  const ok = await verifierMotDePasse(mdp, user?.password_hash ?? null);
  if (!ok || !user) return (await compterEchec(env, cles, t)) ? tropEchecs() : invalides();

  const stmts = [
    env.DB.prepare("DELETE FROM login_failures WHERE cle = ?").bind(cles[0]),
    env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(t, user.id),
  ];
  // Hash made with another number of iterations than the target (setting changed): recalculated now that the
  // password is known, so that a change of setting never breaks an account
  if (aRecalculer(user.password_hash)) stmts.push(env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hacherMotDePasse(mdp), user.id));
  await env.DB.batch(stmts);
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
