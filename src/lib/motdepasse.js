// Passwords: policy, PBKDF2-SHA256 hashing (WebCrypto, available in Workers and Node) and constant-time comparison.
// A password is never logged, returned or stored in clear: only "pbkdf2-sha256$<iterations>$<salt>$<hash>" is.
import { MOT_DE_PASSE } from "../config.js";

const ALGO = "pbkdf2-sha256";
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Short list of very common passwords of 12 characters or more (shorter ones are already refused by the length rule).
 * Compared in lower case, without spaces. Not exhaustive: it blocks the most obvious choices only.
 */
const COURANTS = new Set([
  "123456789012", "1234567890123", "12345678901234", "123456789123", "111111111111", "000000000000",
  "azertyuiopqs", "azertyuiop123", "azerty123456", "qwertyuiop12", "qwertyuiop123", "qwerty123456",
  "motdepasse12", "motdepasse123", "motdepasse1234", "password1234", "password12345", "password123456",
  "passwordpassword", "motdepassemotdepasse", "iloveyou1234", "jetaime123456", "soleil123456", "bonjour12345",
  "bonjour123456", "admin1234567", "administrator", "administrateur", "welcome12345", "bienvenue123",
  "passation123", "passation2026", "cession123456", "entreprise123", "abcdefghijkl", "abcdef123456",
]);

/** Normalized form: same password whatever the Unicode composition of accents. */
const normaliser = (mdp) => String(mdp ?? "").normalize("NFC");

/** null if the password is acceptable, otherwise the reason: "trop_court", "trop_long", "trop_courant". */
export function refusMotDePasse(mdp, { email = "" } = {}) {
  const m = normaliser(mdp);
  if ([...m].length < MOT_DE_PASSE.longueurMin) return "trop_court";
  if (m.length > MOT_DE_PASSE.longueurMax) return "trop_long";
  const simple = m.toLowerCase().replace(/\s+/g, "");
  const local = String(email).toLowerCase().split("@")[0];
  if (COURANTS.has(simple) || /^(.)\1+$/.test(simple) || (local.length >= 4 && simple === local)) return "trop_courant";
  return null;
}

async function deriver(mdp, sel, iterations) {
  const cle = await crypto.subtle.importKey("raw", enc.encode(normaliser(mdp)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations }, cle, 256));
}

/** Hash to store: a new random salt for every call (so for every account and every change). */
export async function hacherMotDePasse(mdp) {
  const sel = crypto.getRandomValues(new Uint8Array(MOT_DE_PASSE.selOctets));
  const h = await deriver(mdp, sel, MOT_DE_PASSE.iterations);
  return `${ALGO}$${MOT_DE_PASSE.iterations}$${b64(sel)}$${b64(h)}`;
}

/** Comparison in constant time (independent of the position of the first differing byte). */
export function egalTempsConstant(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hash used when the account does not exist: the work is the same, so the response time reveals nothing (read at
 *  each call: the current target count). */
const leurre = () => `${ALGO}${MOT_DE_PASSE.iterations}${b64(new Uint8Array(MOT_DE_PASSE.selOctets))}${b64(new Uint8Array(32))}`;

/** Iterations recorded in a stored hash (null if the hash is not of this format). */
export function iterationsDe(stocke) {
  const p = String(stocke || "").split("$");
  const n = Number(p[1]);
  return p.length === 4 && p[0] === ALGO && Number.isInteger(n) ? n : null;
}
/** The hash was made with another count than the current target: to be recalculated after a successful sign-in. */
export const aRecalculer = (stocke) => iterationsDe(stocke) !== null && iterationsDe(stocke) !== MOT_DE_PASSE.iterations;

/** true if `mdp` matches the stored hash. Without a hash (unknown account), the same calculation is done, then false. */
export async function verifierMotDePasse(mdp, stocke) {
  const parties = String(stocke || leurre()).split("$");
  if (parties.length !== 4 || parties[0] !== ALGO) return false;
  const iterations = Number(parties[1]);
  // The count of the hash itself, not the current target: a hash made before a change of target stays verifiable
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MOT_DE_PASSE.iterationsMax) return false;
  const attendu = deb64(parties[3]);
  const obtenu = await deriver(mdp, deb64(parties[2]), iterations);
  return Boolean(stocke) && egalTempsConstant(obtenu, attendu);
}
