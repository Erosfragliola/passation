import { json } from "./http.js";
import { routeMaquette } from "./routes/maquette.js";
import { routeRecherche } from "./routes/company.js";
import { routeEstimation } from "./routes/estimation.js";

/**
 * Point d'entrée du Worker.
 * Seules les URL /api/* arrivent ici (run_worker_first) ; le reste est servi depuis public/.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/health") return json({ ok: true, app: env.APP_NAME ?? "Passation" });

    if (request.method === "GET") {
      const m = p.match(/^\/api\/maquette\/([^/]+)$/);
      if (m) return routeMaquette(request, env, decodeURIComponent(m[1]));
      if (p === "/api/company/search") return routeRecherche(request, env);
    }

    if (request.method === "POST" && p === "/api/estimation") return routeEstimation(request, env);

    if (p.startsWith("/api/")) return json({ error: "Route inconnue" }, 404);
    return env.ASSETS.fetch(request);
  },
};
