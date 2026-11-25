// Account creation in the tests (25/11/2026): code read in the local development log, then the code opens the session
// (the account is created on first use).
import { vi } from "vitest";

/** Requests a code and retrieves it from the development log (local mode without Brevo). */
export async function demanderCode(appel, email) {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  const r = await appel("/api/auth/request", { methode: "POST", corps: { email } });
  const texte = espion.mock.calls.flat().join("\n");
  espion.mockRestore();
  return { r, code: texte.match(/Code de connexion pour \S+ : (\d{6})/)?.[1] };
}

/**
 * Creates the account (or signs in) with a code and opens a session.
 * Returns { r, cookie, id (file of the SIREN, if given) }.
 */
export async function creerCompte(appel, email, { siren } = {}) {
  const { code } = await demanderCode(appel, email);
  const r = await appel("/api/auth/code", { methode: "POST", corps: { email, code, siren } });
  const d = await r.clone().json();
  const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? null;
  const id = d.destination ? new URL(d.destination, "http://x").searchParams.get("dossier") : null;
  return { r, cookie, id };
}
