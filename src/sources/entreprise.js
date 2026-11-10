// Annuaire des entreprises (recherche-entreprises.api.gouv.fr) : identité, NAF, effectif, siège.
// Normalisation construite sur des réponses réelles (voir test/fixtures/). Les dirigeants ne sont jamais conservés.

import { requeteJson } from "../lib/requete.js";

export const URL_RECHERCHE = "https://recherche-entreprises.api.gouv.fr/search";

export async function rechercherBrut(q, { fetch: f = fetch, parPage = 1 } = {}) {
  const url = `${URL_RECHERCHE}?q=${encodeURIComponent(q)}&per_page=${parPage}`;
  return requeteJson(url, "recherche-entreprises", { fetch: f });
}

/** Extrait la fiche du SIREN demandé (correspondance exacte) ; null si absente. */
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

/** Suggestions pour l'autocomplétion : nom, SIREN, ville, NAF. Aucune donnée personnelle. */
export function normaliserSuggestions(brut) {
  return (brut?.results || []).map((r) => ({
    siren: r.siren,
    nom: r.nom_complet,
    ville: r.siege?.libelle_commune ?? null,
    code_postal: r.siege?.code_postal ?? null,
    naf: r.activite_principale ?? null,
    actif: r.etat_administratif === "A",
  }));
}
