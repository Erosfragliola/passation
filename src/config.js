// Constantes uniques du projet : modifier ici, nulle part ailleurs.

/** Modèles Claude utilisés par l'application. */
export const MODELS = {
  deep: "claude-sonnet-5-5", // valorisation approfondie, info memo, teaser, chat
  fast: "claude-haiku-5-5", // commentaire express, extraction de chiffres
};

/** Limites d'usage du chat, par utilisateur et par jour. */
export const CHAT_LIMITS = { messagesParJour: 30, tokensParJour: 150_000 };

/** Limites de débit des routes publiques (requêtes non servies par le cache, par heure et par IP). */
export const EXPRESS_RATE_LIMIT = { requetesParHeureParIP: 10 };
export const MAQUETTE_RATE_LIMIT = { requetesParHeureParIP: 20 };
export const SEARCH_RATE_LIMIT = { requetesParHeureParIP: 120 };

/** Durées (en secondes). */
export const DURATIONS = {
  magicLink: 15 * 60,
  session: 30 * 24 * 3600,
  signedUrl: 10 * 60,
  apiCache: 24 * 3600,
};
