// Single place for the project's constants: change them here, nowhere else.

/** Claude models used by the application. */
export const MODELS = {
  deep: "claude-sonnet-5-5", // detailed valuation, information memo, teaser, chat
  fast: "claude-haiku-5-5", // quick-estimate comment, extraction of figures
};

/**
 * Claude processing (reading a tax return or website, teaser, memorandum sections, market research): daily quota
 * per user, across all files (a complete flow uses about 13), and number of files per user (each file has its own
 * reading caps). The chat has not been developed yet.
 */
export const CLAUDE_QUOTAS = { traitementsParJourParUtilisateur: 60, dossiersParUtilisateur: 10 };

/** Rate limits of the public routes (requests not served from the cache, per hour and per IP). */
export const EXPRESS_RATE_LIMIT = { requetesParHeureParIP: 10 };
export const MAQUETTE_RATE_LIMIT = { requetesParHeureParIP: 20 };
export const SEARCH_RATE_LIMIT = { requetesParHeureParIP: 120 };

/** Sign-in by code: wrong attempts tolerated before the code is blocked. */
export const CODE_ESSAIS_MAX = 5;

/** Durations (in seconds). */
export const DURATIONS = {
  codeConnexion: 10 * 60,
  session: 30 * 24 * 3600,
  apiCache: 24 * 3600,
};

/** Identifier sent to the public APIs (some reject anonymous requests). No personal data. */
export const USER_AGENT = "Passation/0.1 (outil de preparation de cession de PME)";

/** Tax-return reading by Claude: size and number of files, cap on readings per file (controlled cost). */
export const LIASSE = { tailleMax: 10 * 1024 * 1024, fichiersMax: 3, lecturesMaxParDossier: 6 };

/** Memorandum market research (web search by Claude, controlled cost): number of studies per file. */
export const MARCHE = { etudesMaxParDossier: 3 };
