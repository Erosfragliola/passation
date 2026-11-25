// Assembles the "maquette" object from the three normalized sources.
import { rechercherBrut, normaliserEntreprise } from "../sources/entreprise.js";
import { exercicesBruts, normaliserExercices } from "../sources/inpi.js";
import { annoncesBrutes, normaliserAnnonces } from "../sources/bodacc.js";
import { casseVille, memeVille } from "../../public/js/regles.js";

export function assembler(entreprise, exercices, annonces) {
  const villeActuelle = casseVille(entreprise.ville);
  // Prefer the BODACC's accented spelling when it is the same city ("Saint-Péreuse" rather than "Saint-Pereuse").
  const villesBodacc = annonces.villes || [];
  const ville = villesBodacc.find((v) => memeVille(v, villeActuelle)) || villeActuelle;

  const ca = exercices.filter((e) => e.ca != null).map((e) => ({ annee: e.annee, valeur: e.ca }));
  const ebe = exercices.filter((e) => e.ebe != null).map((e) => ({ annee: e.annee, valeur: e.ebe }));
  const t = entreprise.tranche_effectif;
  return {
    siren: entreprise.siren,
    nom: entreprise.nom,
    ville,
    code_postal: entreprise.code_postal ?? null,
    ville_creation: annonces.ville_creation ? casseVille(annonces.ville_creation) : null,
    naf: entreprise.naf,
    section_naf: entreprise.section_naf,
    date_creation: entreprise.date_creation,
    tranche_effectif: t ? { code: t.code, annee: t.annee } : null,
    actif: entreprise.actif,
    ca,
    ebe,
    evenements: annonces.evenements,
    comptes_confidentiels: ca.length === 0,
    exercices_non_publies: exercices.filter((e) => !e.publie).map((e) => e.annee),
  };
}

/** Single cache key of a company's public data (v2: postal code, for the teaser's region). */
export const CLE_MAQUETTE = (siren) => `maquette:v2:${siren}`;

/**
 * Queries the three sources in parallel. Returns null if the SIREN cannot be found.
 * An outage of the directory or of the accounts (INPI) is an error, never an absence of accounts: it is passed on
 * (otherwise the company would appear to have confidential accounts, and this false finding would be cached).
 * An outage of the BODACC (timeline events only) gives a response marked sources_partielles, not to be
 * cached.
 */
export async function chargerMaquette(siren, options = {}) {
  const [brutE, brutI, brutB] = await Promise.all([
    rechercherBrut(siren, options),
    exercicesBruts(siren, options),
    annoncesBrutes(siren, options).catch((e) => { console.warn("BODACC indisponible :", e.message); return null; }),
  ]);
  const entreprise = normaliserEntreprise(brutE, siren);
  if (!entreprise) return null;
  const donnees = assembler(entreprise, normaliserExercices(brutI), normaliserAnnonces(brutB ?? { results: [] }, siren, entreprise.date_creation));
  if (!brutB) donnees.sources_partielles = ["bodacc"];
  return donnees;
}
