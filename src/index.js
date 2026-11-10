import { json } from "./http.js";

/**
 * Point d'entrée du Worker.
 * Seules les URL /api/* arrivent ici (run_worker_first) ; le reste est servi depuis public/.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, app: env.APP_NAME ?? "Passation" });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Route inconnue" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
