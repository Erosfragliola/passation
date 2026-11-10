import { json } from "./http.js";
import { routeMaquette } from "./routes/maquette.js";
import { routeRecherche } from "./routes/company.js";
import { routeEstimation } from "./routes/estimation.js";
import { routeDemandeLien, routeVerification, routeDeconnexion, routeMoi } from "./routes/auth.js";
import { routeDossiers } from "./routes/dossiers.js";
import { origineAutorisee } from "./lib/auth.js";

/**
 * Point d'entrée du Worker.
 * Seules les URL /api/* arrivent ici (run_worker_first) ; le reste est servi depuis public/.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;

    if (p === "/api/health") return json({ ok: true, app: env.APP_NAME ?? "Passation" });

    // Toute requête qui modifie des données doit venir du site lui-même (protection CSRF).
    if (p.startsWith("/api/") && !origineAutorisee(request)) {
      return json({ erreur: "origine_refusee", message: "Requête refusée." }, 403);
    }

    if (m === "GET") {
      const r = p.match(/^\/api\/maquette\/([^/]+)$/);
      if (r) return routeMaquette(request, env, decodeURIComponent(r[1]));
      if (p === "/api/company/search") return routeRecherche(request, env);
      if (p === "/api/auth/verify") return routeVerification(request, env);
      if (p === "/api/me") return routeMoi(request, env);
    }
    if (m === "POST") {
      if (p === "/api/estimation") return routeEstimation(request, env);
      if (p === "/api/auth/request") return routeDemandeLien(request, env);
      if (p === "/api/auth/logout") return routeDeconnexion(request, env);
    }
    if (p === "/api/dossiers" || p.startsWith("/api/dossiers/")) {
      const segments = p.slice("/api/dossiers".length).split("/").filter(Boolean).map(decodeURIComponent);
      return routeDossiers(request, env, segments);
    }

    if (p.startsWith("/api/")) return json({ erreur: "route_inconnue" }, 404);
    return env.ASSETS.fetch(request);
  },
};
