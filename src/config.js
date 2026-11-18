// Constantes uniques du projet : modifier ici, nulle part ailleurs.

/** Modèles Claude utilisés par l'application. */
export const MODELS = {
  deep: "claude-sonnet-5-5", // valorisation approfondie, info memo, teaser, chat
  fast: "claude-haiku-5-5", // commentaire express, extraction de chiffres
};

/**
 * Traitements par Claude (lecture de liasse ou de site, teaser, sections du mémorandum, étude de marché) : quota
 * quotidien par utilisateur, tous dossiers confondus (un parcours complet en compte environ 13), et nombre de
 * dossiers par utilisateur (chaque dossier a ses propres plafonds de lecture). Le chat n'est pas encore développé.
 */
export const CLAUDE_QUOTAS = { traitementsParJourParUtilisateur: 60, dossiersParUtilisateur: 10 };

/** Limites de débit des routes publiques (requêtes non servies par le cache, par heure et par IP). */
export const EXPRESS_RATE_LIMIT = { requetesParHeureParIP: 10 };
export const MAQUETTE_RATE_LIMIT = { requetesParHeureParIP: 20 };
export const SEARCH_RATE_LIMIT = { requetesParHeureParIP: 120 };

/** Connexion par code : essais faux tolérés avant blocage du code. */
export const CODE_ESSAIS_MAX = 5;

/** Durées (en secondes). */
export const DURATIONS = {
  codeConnexion: 10 * 60,
  session: 30 * 24 * 3600,
  apiCache: 24 * 3600,
};

/** Identifiant envoyé aux API publiques (certaines refusent les requêtes anonymes). Aucune donnée personnelle. */
export const USER_AGENT = "Passation/0.1 (outil de preparation de cession de PME)";

/** Lecture de liasse par Claude : taille et nombre de fichiers, plafond de lectures par dossier (coût maîtrisé). */
export const LIASSE = { tailleMax: 10 * 1024 * 1024, fichiersMax: 3, lecturesMaxParDossier: 6 };

/** Étude de marché du mémorandum (recherche web par Claude, coût maîtrisé) : nombre d'études par dossier. */
export const MARCHE = { etudesMaxParDossier: 3 };
