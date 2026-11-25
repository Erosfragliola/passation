// GET /api/maquette/:siren : a company's data for "Your model" and the timeline.
import { json } from "../http.js";
import { chargerMaquette, CLE_MAQUETTE } from "../maquette/donnees.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { verifierDebit } from "../lib/ratelimit.js";
import { sirenValide, nettoyerSiren } from "../lib/siren.js";
import { MAQUETTE_RATE_LIMIT } from "../config.js";
import { estimationExpress } from "../valuation/express.js";
import { teaserExpress } from "../documents/teaser-express.js";
import { t as tr } from "../../public/js/i18n.js";
import { utilisateurConnecte } from "../lib/auth.js";

export async function routeMaquette(request, env, sirenBrut) {
  const siren = nettoyerSiren(sirenBrut);
  if (!sirenValide(siren)) return json({ erreur: "siren_invalide", message: tr("serveur.maquette.numero_siren_valide") }, 400);

  const cle = CLE_MAQUETTE(siren);
  let donnees = await lireCache(env.DB, cle);
  if (!donnees) {
    const debit = await verifierDebit(env.DB, request, env, "maquette", MAQUETTE_RATE_LIMIT.requetesParHeureParIP);
    if (!debit.autorise) {
      return json({ erreur: "trop_de_requetes", message: tr("serveur.maquette.trop_recherches_peu_temps") }, 429);
    }
    try {
      donnees = await chargerMaquette(siren);
    } catch (e) {
      console.warn("source indisponible :", e.message);
      return json({ erreur: "source_indisponible", message: tr("serveur.maquette.registres_publics_ne_repondent") }, 502);
    }
    if (!donnees) return json({ erreur: "introuvable", message: tr("serveur.maquette.nous_ne_trouvons_entreprise") }, 404);
    if (!donnees.sources_partielles) await ecrireCache(env.DB, cle, donnees);
  }
  if (!donnees.actif) {
    return json({ erreur: "inactive", message: tr("serveur.maquette.cette_entreprise_plus_active") }, 404);
  }
  // Without a valid session, no amount leaves the server: neither the range nor the published figures (24/11/2026).
  // The public card keeps the name, industry, region, headcount band and the years of the published accounts.
  if (!(await utilisateurConnecte(request, env).catch(() => null))) {
    return json({ ...sansMontants(donnees), estimation: null, estimation_masquee: true, ...teaserExpress(donnees) },
      200, { "cache-control": "private, no-store" });
  }
  return json({ ...donnees, estimation: estimationExpress(donnees), ...teaserExpress(donnees) }, 200, { "cache-control": "private, no-store" });
}

/** Public data without any amount: the series of revenue and EBITDA are replaced by their years. */
export function sansMontants(d) {
  const { ca = [], ebe = [], ...reste } = d;
  return { ...reste, exercices_publies: [...new Set(ca.map((x) => x.annee))].sort(), ebe_publie: ebe.length > 0 };
}
