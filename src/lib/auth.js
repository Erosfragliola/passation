// Authentification : jetons de lien magique, sessions, cookies, contrôle d'origine.
// Les jetons et identifiants de session ne sont jamais stockés en clair : seule leur empreinte SHA-256 l'est.
import { DURATIONS } from "../config.js";
import { json } from "../http.js";

export const NOM_COOKIE = "passation_session";

/** Chaîne aléatoire sûre (base64url, 32 octets par défaut). */
export function aleatoire(octets = 32) {
  const b = crypto.getRandomValues(new Uint8Array(octets));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function empreinte(texte) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const maintenant = () => Math.floor(Date.now() / 1000);

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

/** Crée une session et renvoie la valeur du cookie (secret). */
export async function creerSession(db, userId) {
  const secret = aleatoire();
  const t = maintenant();
  await db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await empreinte(secret), userId, t, t + DURATIONS.session).run();
  return secret;
}

/** Utilisateur connecté, ou null. */
export async function utilisateurConnecte(request, env) {
  const secret = lireCookie(request);
  if (!secret || secret.length < 20) return null;
  return env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?",
  ).bind(await empreinte(secret), maintenant()).first();
}

/** Garde des routes privées : renvoie [utilisateur, null] ou [null, réponse 401]. */
export async function exigerUtilisateur(request, env) {
  const u = await utilisateurConnecte(request, env);
  return u ? [u, null] : [null, json({ erreur: "non_connecte", message: "Connectez-vous pour accéder à votre dossier." }, 401)];
}

/**
 * Protection contre les requêtes intersites (CSRF) : toute requête qui modifie des données doit venir du site
 * lui-même (en-tête Origin identique à l'hôte). Le cookie SameSite=Lax en est la première barrière.
 */
export function origineAutorisee(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origine = request.headers.get("origin");
  if (!origine) return false;
  try { return new URL(origine).host === new URL(request.url).host; } catch { return false; }
}
