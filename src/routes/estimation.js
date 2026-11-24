// POST /api/estimation : quick range from figures entered by the owner (unpublished accounts).
// Nothing is saved: the calculation is done and the response is sent back.
import { json } from "../http.js";
import { estimationExpress } from "../valuation/express.js";
import { verifierDebit } from "../lib/ratelimit.js";
import { EXPRESS_RATE_LIMIT } from "../config.js";
import { t as tr } from "../../public/js/i18n.js";
import { exigerUtilisateur } from "../lib/auth.js";

export async function routeEstimation(request, env) {
  // A range is an amount: only for a signed-in owner (24/11/2026).
  const [, refus] = await exigerUtilisateur(request, env);
  if (refus) return refus;
  let corps;
  try { corps = await request.json(); } catch { return json({ erreur: "requete_invalide" }, 400); }
  const ca = Number(corps?.ca), ebe = corps?.ebe == null ? null : Number(corps.ebe);
  const section = String(corps?.section_naf || "").slice(0, 1).toUpperCase();
  if (!Number.isFinite(ca) || ca <= 0 || ca > 1e11 || (ebe != null && (!Number.isFinite(ebe) || Math.abs(ebe) > 1e11)) || !/^[A-U]$/.test(section)) {
    return json({ erreur: "requete_invalide", message: tr("serveur.estimation.chiffres_invalides") }, 400);
  }
  const debit = await verifierDebit(env.DB, request, env, "express", EXPRESS_RATE_LIMIT.requetesParHeureParIP);
  if (!debit.autorise) return json({ erreur: "trop_de_requetes", message: tr("serveur.estimation.trop_estimations_peu_temps") }, 429);
  const annee = new Date().getFullYear() - 1;
  const estimation = estimationExpress({ section_naf: section, ca: [{ annee, valeur: ca }], ebe: ebe == null ? [] : [{ annee, valeur: ebe }] });
  return json({ estimation });
}
