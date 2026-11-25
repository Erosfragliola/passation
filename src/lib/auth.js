// Authentication: sign-in codes, sessions, cookies, origin check.
// Codes and session identifiers are never stored in clear: only their SHA-256 hash is.
import { DURATIONS } from "../config.js";
import { json } from "../http.js";
import { t as tr } from "../../public/js/i18n.js";

const NOM_COOKIE = "passation_session";

/** Secure random string (base64url, 32 bytes by default). */
function aleatoire(octets = 32) {
  const b = crypto.getRandomValues(new Uint8Array(octets));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function empreinte(texte) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const maintenant = () => Math.floor(Date.now() / 1000);

/** 6-digit code, drawn uniformly (values that would bias the modulo are rejected). */
export function codeAleatoire() {
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= 4_294_000_000);
  return String(b[0] % 1_000_000).padStart(6, "0");
}

/** Hash of a code: salt specific to the row + server secret, so that a copy of the database is not enough. */
export const empreinteCode = (env, sel, code) => empreinte(`${env.SESSION_SECRET || ""}|${sel}|${code}`);

export function emailValide(e) {
  return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
export const normaliserEmail = (e) => String(e || "").trim().toLowerCase();

export function lireCookie(request, nom = NOM_COOKIE) {
  const brut = request.headers.get("cookie") || "";
  for (const morceau of brut.split(";")) {
    const [k, ...v] = morceau.trim().split("=");
    if (k === nom) return v.join("=");
  }
  return null;
}

export function cookieSession(valeur, maxAge = DURATIONS.session) {
  return `${NOM_COOKIE}=${valeur}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export const cookieEffacement = () => `${NOM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Creates a session and returns the cookie value (secret). */
export async function creerSession(db, userId) {
  const secret = aleatoire();
  const t = maintenant();
  await db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await empreinte(secret), userId, t, t + DURATIONS.session).run();
  return secret;
}

/** Signed-in user, or null. */
export async function utilisateurConnecte(request, env) {
  const secret = lireCookie(request);
  if (!secret || secret.length < 20) return null;
  return env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?",
  ).bind(await empreinte(secret), maintenant()).first();
}

/** Guard for private routes: returns [user, null] or [null, 401 response]. */
export async function exigerUtilisateur(request, env) {
  const u = await utilisateurConnecte(request, env);
  return u ? [u, null] : [null, json({ erreur: "non_connecte", message: tr("serveur.auth.connectez_vous_pour_acceder") }, 401)];
}

/**
 * Protection against cross-site requests (CSRF): any request that changes data must come from the site itself
 * (Origin header identical to the host). The SameSite=Lax cookie is the first barrier.
 */
export function origineAutorisee(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origine = request.headers.get("origin");
  if (!origine) return false;
  try { return new URL(origine).host === new URL(request.url).host; } catch { return false; }
}
