// Constantes uniques du projet : modifier ici, nulle part ailleurs.

/** Modèles Claude utilisés par l'application. */
export const MODELS = {
  deep: "claude-sonnet-5-5", // valorisation approfondie, info memo, teaser, chat
  fast: "claude-haiku-5-5", // commentaire express, extraction de chiffres
  photos: "claude-haiku-5-5", // jugement des photos du mémorandum (vision), modèle léger choisi le 24/11/2026
  relecture: "claude-sonnet-5-5", // relecture critique du mémorandum (lecture de tout le document)
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

/**
 * Password (account required after the SIREN, 24/11/2026). PBKDF2-SHA256 through WebCrypto: 100,000 iterations is the
 * maximum Cloudflare Workers accepts; 16-byte random salt per account. Sign-in: 5 failures → 15-minute block,
 * counted per account (email hash) and per IP hash.
 */
export const MOT_DE_PASSE = {
  iterations: 100_000, selOctets: 16, longueurMin: 12, longueurMax: 256,
  echecsMax: 5, blocage: 15 * 60,
};

/** Durées (en secondes). */
export const DURATIONS = {
  codeConnexion: 10 * 60,
  ticketMotDePasse: 15 * 60, // after a verified code: time left to choose the password
  session: 30 * 24 * 3600,
  apiCache: 24 * 3600,
};

/** Identifiant envoyé aux API publiques (certaines refusent les requêtes anonymes). Aucune donnée personnelle. */
export const USER_AGENT = "Passation/0.1 (outil de preparation de cession de PME)";

/** Lecture de liasse par Claude : taille et nombre de fichiers, plafond de lectures par dossier (coût maîtrisé). */
export const LIASSE = { tailleMax: 10 * 1024 * 1024, fichiersMax: 3, lecturesMaxParDossier: 6 };

/** Étude de marché du mémorandum (recherche web par Claude, coût maîtrisé) : nombre d'études par dossier. */
export const MARCHE = { etudesMaxParDossier: 3 };

/**
 * Photos du mémorandum : nombre (une seule définition, transmise au navigateur par l'API du mémorandum), poids par
 * photo, plus grand côté de l'image envoyée à Claude (réduite dans le navigateur avant l'envoi), largeur minimale pour
 * une couverture ou une page d'ouverture, et filtre des images lues sur le site.
 */
export const PHOTOS_MAX = 12;
/** Logo of the memorandum: weight of the file (reduced in the browser before being sent when heavier). */
export const LOGO_POIDS_MAX = 1_000_000;
export const PHOTOS = {
  max: PHOTOS_MAX, poidsMax: 3_000_000, coteAnalyseMax: 1568, poidsAnalyseMax: 1_500_000, largeurPleinePage: 1200,
  site: { largeurMin: 500, hauteurMin: 300, allongementMax: 2.6, mesureesMax: 20, retenuesMax: 16 },
};
/** Équipe dirigeante (mémorandum uniquement) : nombre de personnes, expériences par personne, poids d'une photo. */
export const EQUIPE = { personnesMax: 4, experiencesMax: 3, photoPoidsMax: 3_000_000 };
/** Relecture critique : remarques gardées au plus. */
export const RELECTURE = { remarquesMax: 10 };
