// Assemble l'objet « maquette » à partir des trois sources normalisées.
import { rechercherBrut, normaliserEntreprise } from "../sources/entreprise.js";
import { exercicesBruts, normaliserExercices } from "../sources/inpi.js";
import { annoncesBrutes, normaliserAnnonces } from "../sources/bodacc.js";
import { casseVille, memeVille } from "../../public/js/regles.js";

export function assembler(entreprise, exercices, annonces) {
  const villeActuelle = casseVille(entreprise.ville);
  // Préférer l'orthographe accentuée du BODACC quand c'est la même ville (« Saint-Péreuse » plutôt que « Saint-Pereuse »).
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

/** Clé de cache unique des données publiques d'une entreprise (v2 : code postal, pour la région du teaser). */
export const CLE_MAQUETTE = (siren) => `maquette:v2:${siren}`;

/**
 * Interroge les trois sources en parallèle. Retourne null si le SIREN est introuvable.
 * Une panne de l'annuaire ou des comptes (INPI) est une erreur, jamais une absence de comptes : elle est propagée
 * (sinon l'entreprise passerait pour avoir des comptes confidentiels, et ce faux constat serait mis en cache).
 * Une panne du BODACC (événements de la frise seulement) donne une réponse marquée sources_partielles, à ne pas
 * mettre en cache.
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
