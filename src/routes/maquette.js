// GET /api/maquette/:siren : données d'une entreprise pour « Votre maquette » et la frise.
import { json } from "../http.js";
import { chargerMaquette } from "../maquette/donnees.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { verifierDebit } from "../lib/ratelimit.js";
import { sirenValide, nettoyerSiren } from "../lib/siren.js";
import { MAQUETTE_RATE_LIMIT } from "../config.js";
import { estimationExpress } from "../valuation/express.js";

const VERSION = "v1";

export async function routeMaquette(request, env, sirenBrut) {
  const siren = nettoyerSiren(sirenBrut);
  if (!sirenValide(siren)) return json({ erreur: "siren_invalide", message: "Ce numéro SIREN n'est pas valide." }, 400);

  const cle = `maquette:${VERSION}:${siren}`;
  let donnees = await lireCache(env.DB, cle);
  if (!donnees) {
    const debit = await verifierDebit(env.DB, request, env, "maquette", MAQUETTE_RATE_LIMIT.requetesParHeureParIP);
    if (!debit.autorise) {
      return json({ erreur: "trop_de_requetes", message: "Trop de recherches en peu de temps. Réessayez dans une heure." }, 429);
    }
    try {
      donnees = await chargerMaquette(siren);
    } catch (e) {
      console.warn("source indisponible :", e.message);
      return json({ erreur: "source_indisponible", message: "Les registres publics ne répondent pas pour le moment. Réessayez dans quelques minutes." }, 502);
    }
    if (!donnees) return json({ erreur: "introuvable", message: "Nous ne trouvons pas d'entreprise avec ce SIREN." }, 404);
    await ecrireCache(env.DB, cle, donnees);
  }
  if (!donnees.actif) {
    return json({ erreur: "inactive", message: "Cette entreprise n'est plus active dans les registres publics." }, 404);
  }
  return json({ ...donnees, estimation: estimationExpress(donnees) });
}
