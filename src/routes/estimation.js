// POST /api/estimation : fourchette express à partir de chiffres saisis par le dirigeant (comptes non publiés).
// Rien n'est enregistré : le calcul est fait puis la réponse est renvoyée.
import { json } from "../http.js";
import { estimationExpress } from "../valuation/express.js";
import { verifierDebit } from "../lib/ratelimit.js";
import { EXPRESS_RATE_LIMIT } from "../config.js";

export async function routeEstimation(request, env) {
  let corps;
  try { corps = await request.json(); } catch { return json({ erreur: "requete_invalide" }, 400); }
  const ca = Number(corps?.ca), ebe = corps?.ebe == null ? null : Number(corps.ebe);
  const section = String(corps?.section_naf || "").slice(0, 1).toUpperCase();
  if (!Number.isFinite(ca) || ca <= 0 || ca > 1e11 || (ebe != null && (!Number.isFinite(ebe) || Math.abs(ebe) > 1e11)) || !/^[A-U]$/.test(section)) {
    return json({ erreur: "requete_invalide", message: "Chiffres invalides." }, 400);
  }
  const debit = await verifierDebit(env.DB, request, env, "express", EXPRESS_RATE_LIMIT.requetesParHeureParIP);
  if (!debit.autorise) return json({ erreur: "trop_de_requetes", message: "Trop d'estimations en peu de temps. Réessayez dans une heure." }, 429);
  const annee = new Date().getFullYear() - 1;
  const estimation = estimationExpress({ section_naf: section, ca: [{ annee, valeur: ca }], ebe: ebe == null ? [] : [{ annee, valeur: ebe }] });
  return json({ estimation });
}
