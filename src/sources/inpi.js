// Ratios financiers issus des comptes déposés (jeu ratios_inpi_bce, data.economie.gouv.fr).
// Constats sur données réelles : un exercice confidentiel renvoie CA = 0 et EBE = 0 (et non null) ;
// une même année peut exister en comptes complets (C) et simplifiés (S) ; des années manquent.

import { USER_AGENT } from "../config.js";

export const URL_INPI = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/records";
const CHAMPS = "siren,date_cloture_exercice,chiffre_d_affaires,ebe,ebit,resultat_net,confidentiality,type_bilan";

export async function exercicesBruts(siren, { fetch: f = fetch } = {}) {
  const where = encodeURIComponent(`siren="${siren}"`);
  const url = `${URL_INPI}?select=${CHAMPS}&where=${where}&order_by=date_cloture_exercice%20desc&limit=30`;
  const res = await f(url, { headers: { accept: "application/json", "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`ratios INPI : HTTP ${res.status}`);
  return res.json();
}

const PUBLIC = new Set(["Public", "Publication simplifiee"]);
const PRIORITE_TYPE = { C: 0, S: 1, K: 2 };

/** Un exercice par année ; chiffres à null si l'exercice n'est pas publié. */
export function normaliserExercices(brut) {
  const parAnnee = new Map();
  for (const r of brut?.results || []) {
    if (!r.date_cloture_exercice) continue;
    const annee = Number(r.date_cloture_exercice.slice(0, 4));
    const publie = PUBLIC.has(r.confidentiality);
    const ex = {
      annee,
      ca: publie && Number.isFinite(r.chiffre_d_affaires) ? r.chiffre_d_affaires : null,
      ebe: publie && Number.isFinite(r.ebe) ? r.ebe : null,
      ebit: publie && Number.isFinite(r.ebit) ? r.ebit : null,
      resultat_net: publie && Number.isFinite(r.resultat_net) ? r.resultat_net : null,
      publie,
      type: r.type_bilan ?? null,
    };
    const deja = parAnnee.get(annee);
    const meilleur = !deja
      || (ex.publie && !deja.publie)
      || (ex.publie === deja.publie && (PRIORITE_TYPE[ex.type] ?? 9) < (PRIORITE_TYPE[deja.type] ?? 9));
    if (meilleur) parAnnee.set(annee, ex);
  }
  return [...parAnnee.values()].sort((a, b) => a.annee - b.annee);
}
