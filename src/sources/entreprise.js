// Business directory (recherche-entreprises.api.gouv.fr): identity, NAF, headcount, head office.
// Normalization built on real responses (see test/fixtures/). Officers are never kept.

import { requeteJson } from "../lib/requete.js";

export const URL_RECHERCHE = "https://recherche-entreprises.api.gouv.fr/search";

export async function rechercherBrut(q, { fetch: f = fetch, parPage = 1, ...options } = {}) {
  const url = `${URL_RECHERCHE}?q=${encodeURIComponent(q)}&per_page=${parPage}`;
  return requeteJson(url, "recherche-entreprises", { ...options, fetch: f });
}

/** Extracts the record of the requested SIREN (exact match); null if missing. */
export function normaliserEntreprise(brut, siren) {
  const r = (brut?.results || []).find((x) => x.siren === siren);
  if (!r) return null;
  return {
    siren: r.siren,
    nom: r.nom_raison_sociale || r.nom_complet,
    ville: r.siege?.libelle_commune ?? null,
    code_postal: r.siege?.code_postal ?? null,
    naf: r.activite_principale ?? null,
    section_naf: r.section_activite_principale ?? null,
    date_creation: r.date_creation ?? null,
    tranche_effectif: r.tranche_effectif_salarie
      ? { code: r.tranche_effectif_salarie, annee: Number(r.annee_tranche_effectif_salarie) || null }
      : null,
    actif: r.etat_administratif === "A",
    categorie: r.categorie_entreprise ?? null,
  };
}

/** Autocomplete suggestions: name, SIREN, city, NAF. No personal data. */
export function normaliserSuggestions(brut) {
  return (brut?.results || []).map((r) => ({
    siren: r.siren,
    nom: r.nom_complet,
    ville: r.siege?.libelle_commune ?? null,
    code_postal: r.siege?.code_postal ?? null,
    naf: r.activite_principale ?? null,
    date_creation: r.date_creation ?? null,
    tranche_effectif: r.tranche_effectif_salarie ?? null,
    actif: r.etat_administratif === "A",
  }));
}
