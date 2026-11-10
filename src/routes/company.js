// GET /api/company/search?q= : autocomplétion par nom ou SIREN.
import { json } from "../http.js";
import { rechercherBrut, normaliserSuggestions } from "../sources/entreprise.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { verifierDebit } from "../lib/ratelimit.js";
import { SEARCH_RATE_LIMIT } from "../config.js";

export async function routeRecherche(request, env) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 3) return json({ suggestions: [] });
  const cle = `recherche:v1:${q.toLowerCase()}`;
  let suggestions = await lireCache(env.DB, cle);
  if (!suggestions) {
    const debit = await verifierDebit(env.DB, request, env, "recherche", SEARCH_RATE_LIMIT.requetesParHeureParIP);
    if (!debit.autorise) return json({ erreur: "trop_de_requetes", suggestions: [] }, 429);
    try {
      suggestions = normaliserSuggestions(await rechercherBrut(q, { parPage: 6 })).filter((s) => s.actif);
    } catch (e) {
      console.warn("source indisponible :", e.message);
      return json({ erreur: "source_indisponible", suggestions: [] }, 502);
    }
    await ecrireCache(env.DB, cle, suggestions);
  }
  return json({ suggestions });
}
