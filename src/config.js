// Single place for the project's constants: change them here, nowhere else.

/** Claude models used by the application. */
export const MODELS = {
  deep: "claude-sonnet-5-5", // detailed valuation, info memo, teaser, chat
  fast: "claude-haiku-5-5", // quick-estimate comment, extraction of figures
  photos: "claude-haiku-5-5", // assessment of the memorandum's photos (vision), light model chosen on 24/11/2026
  relecture: "claude-sonnet-5-5", // critical review of the memorandum (reads the whole document)
};

/**
 * Processing by Claude (reading a tax return or a website, teaser, memorandum chapters, market research): daily
 * quota per user, all files together (a full flow uses about 13), and number of files per user (each file has its own
 * reading caps). The chat is not developed yet.
 */
export const CLAUDE_QUOTAS = { traitementsParJourParUtilisateur: 60, dossiersParUtilisateur: 10 };

/** Rate limits of the public routes (requests not served by the cache, per hour and per IP). */
export const EXPRESS_RATE_LIMIT = { requetesParHeureParIP: 10 };
export const MAQUETTE_RATE_LIMIT = { requetesParHeureParIP: 20 };
export const SEARCH_RATE_LIMIT = { requetesParHeureParIP: 120 };

/** Sign-in by code: wrong attempts allowed before the code is blocked. */
export const CODE_ESSAIS_MAX = 5;

/** Durations (in seconds). */
export const DURATIONS = {
  codeConnexion: 10 * 60,
  session: 30 * 24 * 3600,
  apiCache: 24 * 3600,
};

/** Identifier sent to the public APIs (some refuse anonymous requests). No personal data. */
export const USER_AGENT = "Passation/0.1 (outil de preparation de cession de PME)";

/** Tax-return reading by Claude: size and number of files, cap on readings per file (controlled cost). */
export const LIASSE = { tailleMax: 10 * 1024 * 1024, fichiersMax: 3, lecturesMaxParDossier: 6 };

/** Market research of the memorandum (web search by Claude, controlled cost): number of studies per file. */
export const MARCHE = { etudesMaxParDossier: 3 };

/**
 * Photos of the memorandum: number (a single definition, sent to the browser by the memorandum API), weight per
 * photo, longest side of the image sent to Claude (reduced in the browser before sending), minimum width for a cover or
 * an opening page, and filter of the images read on the website.
 */
export const PHOTOS_MAX = 12;
/** Logo of the memorandum: weight of the file (reduced in the browser before being sent when heavier). */
export const LOGO_POIDS_MAX = 1_000_000;
export const PHOTOS = {
  max: PHOTOS_MAX, poidsMax: 3_000_000, coteAnalyseMax: 1568, poidsAnalyseMax: 1_500_000, largeurPleinePage: 1200,
  site: { largeurMin: 500, hauteurMin: 300, allongementMax: 2.6, mesureesMax: 20, retenuesMax: 16 },
};
/** Management team (memorandum only): number of people, experiences per person, weight of a photo. */
export const EQUIPE = { personnesMax: 4, experiencesMax: 3, photoPoidsMax: 3_000_000 };
/** Critical review: remarks kept at most. */
export const RELECTURE = { remarquesMax: 10 };
