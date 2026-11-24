// Account creation in the tests: code (read in the local development log), ticket, then password.
// The password is drawn at random on every run: no password is written in the tests.
import { vi } from "vitest";

export const motDePasseAleatoire = () => `essai-${crypto.randomUUID()}`;

/** Requests a code and retrieves it from the development log (local mode without Brevo). */
export async function demanderCode(appel, email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const texte = espion.mock.calls.flat().join("\n");
  espion.mockRestore();
  return { r, code: texte.match(/Code de connexion pour \S+ : (\d{6})/)?.[1] };
}

/** Code → ticket. */
export async function ticketPour(appel, email) {
  const { code } = await demanderCode(appel, email);
  const r = await appel("/api/auth/code", { methode: "POST", corps: { email, code } });
  return (await r.json()).ticket;
}

/**
 * Creates the account (or sets a new password) and opens a session.
 * Returns { r, cookie, id (file of the SIREN, if given), motDePasse }.
 */
export async function creerCompte(appel, email, { siren, motDePasse = motDePasseAleatoire() } = {}) {
  const ticket = await ticketPour(appel, email);
  const r = await appel("/api/auth/password", { methode: "POST", corps: { ticket, mot_de_passe: motDePasse, siren } });
  const d = await r.clone().json();
  const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? null;
  const id = d.destination ? new URL(d.destination, "http://x").searchParams.get("dossier") : null;
  return { r, cookie, id, motDePasse };
}
