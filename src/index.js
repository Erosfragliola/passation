// First: dictionaries installed before the other modules read a text.
import { avecLangue, langueDeRequete } from "./i18n.js";
import { json } from "./http.js";
import { routeMaquette } from "./routes/maquette.js";
import { routeRecherche } from "./routes/company.js";
import { routeEstimation } from "./routes/estimation.js";
import { routeDemandeCode, routeVerificationCode, routeDeconnexion, routeMoi } from "./routes/auth.js";
import { routeDossiers } from "./routes/dossiers.js";
import { origineAutorisee } from "./lib/auth.js";
import { avecEntetes } from "./lib/entetes.js";
import { relancer } from "./routes/suivi.js";
import { routePage, routeRobots, routeSitemap } from "./routes/pages.js";
import { t as tr } from "../public/js/i18n.js";

/**
 * Entry point of the Worker.
 * Everything arrives here except static resources (css, js, img, fonts, video: run_worker_first): the API, and the
 * pages,
 * filled in their language (src/routes/pages.js).
 */
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

export default {
  async fetch(request, env) {
    let reponse;
    try {
      reponse = await avecLangue(langueDeRequete(request), () => router(request, env));
    } catch (e) {
      // No internal information in the response; the detail stays in the Worker's logs.
      console.error("erreur non gérée :", e?.stack || e);
      reponse = json({ erreur: "erreur_interne", message: tr("serveur.index.erreur_survenue_reessayez_dans") }, 500);
    }
    // Security headers on every response of the Worker (audit SEC-04)
    return avecEntetes(reponse, new URL(request.url));
  },
  /** Daily scheduled task: a single reminder for files interrupted for 3 days. */
  async scheduled(event, env, ctx) {
    // Without an origin page, the user's language is unknown: reminders in French (the language of the data).
    ctx.waitUntil(avecLangue("fr", () => relancer(env)).then((n) => console.log(`Rappels envoyés : ${n}`)));
  },
};

async function router(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;

  if (p === "/robots.txt") return routeRobots(request);
  if (p === "/sitemap.xml") return routeSitemap(request);
  if (p === "/api/health") return json({ ok: true, app: env.APP_NAME ?? "Passation" });

  // Without a server secret, sign-in codes and IP fingerprints would be hashed without a secret salt: outside local
  // development, the API refuses to run rather than silently weaken security.
  if (p.startsWith("/api/") && !env.SESSION_SECRET && !LOCAL.has(url.hostname)) {
    console.error("SESSION_SECRET absent : API désactivée (npx wrangler secret put SESSION_SECRET)");
    return json({ erreur: "configuration_incomplete", message: tr("serveur.index.service_momentanement_indisponible") }, 503);
  }

  // Any request that changes data must come from the site itself (CSRF protection).
  if (p.startsWith("/api/") && !origineAutorisee(request)) {
    return json({ erreur: "origine_refusee", message: tr("serveur.index.requete_refusee") }, 403);
  }

  if (m === "GET") {
    const r = p.match(/^\/api\/maquette\/([^/]+)$/);
    if (r) return routeMaquette(request, env, decodeURIComponent(r[1]));
    if (p === "/api/company/search") return routeRecherche(request, env);
    if (p === "/api/me") return routeMoi(request, env);
  }
  if (m === "POST") {
    if (p === "/api/estimation") return routeEstimation(request, env);
    if (p === "/api/auth/request") return routeDemandeCode(request, env);
    if (p === "/api/auth/code") return routeVerificationCode(request, env);
    if (p === "/api/auth/logout") return routeDeconnexion(request, env);
  }
  if (p === "/api/dossiers" || p.startsWith("/api/dossiers/")) {
    const segments = p.slice("/api/dossiers".length).split("/").filter(Boolean).map(decodeURIComponent);
    return routeDossiers(request, env, segments);
  }

  if (p.startsWith("/api/")) return json({ erreur: "route_inconnue" }, 404);
  if (m === "GET" || m === "HEAD") return routePage(request, env);
  return env.ASSETS.fetch(request);
}
