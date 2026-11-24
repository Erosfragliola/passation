// En premier : dictionnaires installés avant que les autres modules ne lisent un texte.
import { avecLangue, langueDeRequete } from "./i18n.js";
import { json } from "./http.js";
import { routeMaquette } from "./routes/maquette.js";
import { routeRecherche } from "./routes/company.js";
import { routeEstimation } from "./routes/estimation.js";
import { routeDemandeCode, routeVerificationCode, routeMotDePasse, routeConnexion, routeDeconnexion, routeMoi } from "./routes/auth.js";
import { routeDossiers } from "./routes/dossiers.js";
import { origineAutorisee } from "./lib/auth.js";
import { avecEntetes } from "./lib/entetes.js";
import { relancer } from "./routes/suivi.js";
import { routePage, routeRobots, routeSitemap } from "./routes/pages.js";
import { t as tr } from "../public/js/i18n.js";

/**
 * Point d'entrée du Worker.
 * Tout arrive ici sauf les ressources statiques (css, js, img, fonts, video : run_worker_first) : l'API, et les pages,
 * remplies dans leur langue (src/routes/pages.js).
 */
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

export default {
  async fetch(request, env) {
    let reponse;
    try {
      reponse = await avecLangue(langueDeRequete(request), () => router(request, env));
    } catch (e) {
      // Aucune information interne dans la réponse ; le détail reste dans les journaux du Worker.
      console.error("erreur non gérée :", e?.stack || e);
      reponse = json({ erreur: "erreur_interne", message: tr("serveur.index.erreur_survenue_reessayez_dans") }, 500);
    }
    // En-têtes de sécurité sur toutes les réponses du Worker (audit SEC-04)
    return avecEntetes(reponse, new URL(request.url));
  },
  /** Tâche planifiée quotidienne : rappel unique des dossiers interrompus depuis 3 jours. */
  async scheduled(event, env, ctx) {
    // Sans page d'origine, la langue de l'utilisateur n'est pas connue : rappels en français (la langue des données).
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

  // Sans secret serveur, codes de connexion et empreintes d'IP seraient hachés sans sel secret : hors développement
  // local, l'API refuse de fonctionner plutôt que de dégrader la sécurité en silence.
  if (p.startsWith("/api/") && !env.SESSION_SECRET && !LOCAL.has(url.hostname)) {
    console.error("SESSION_SECRET absent : API désactivée (npx wrangler secret put SESSION_SECRET)");
    return json({ erreur: "configuration_incomplete", message: tr("serveur.index.service_momentanement_indisponible") }, 503);
  }

  // Toute requête qui modifie des données doit venir du site lui-même (protection CSRF).
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
    if (p === "/api/auth/password") return routeMotDePasse(request, env);
    if (p === "/api/auth/login") return routeConnexion(request, env);
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
