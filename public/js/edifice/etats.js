// « De l'esquisse à l'édifice » : l'état de la maquette est une fonction pure de la position des fenêtres de la
// scène à l'écran, donc du défilement. Aucune horloge : remonter la page rejoue la scène à l'envers, à l'identique.
// Module sans DOM ni WebGL (testé dans test/edifice-etats.test.js).

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Lissage (départ et arrivée en douceur). */
export const doux = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Centre d'une fenêtre, en hauteurs d'écran depuis le haut : 0,5 = centrée, > 1 = encore sous l'écran. */
export const centreRelatif = (haut, hauteur, hauteurEcran) => (haut + hauteur / 2) / hauteurEcran;

/** Avancement de 0 à 1 pendant que le centre de la fenêtre remonte de `debut` à `fin` ; 0 si la fenêtre manque. */
export function avance(centre, debut, fin) {
  if (centre == null || !Number.isFinite(centre)) return 0;
  return clamp01((debut - centre) / (debut - fin));
}

/**
 * Plages de défilement de chaque grandeur : [fenêtre, centre au début, centre à la fin].
 * esquisse : la section « Le témoin » ; ouvrage : la bande de « Comment ça marche » (étapes 02 puis 03).
 */
export const PLAGES = {
  trace: ["esquisse", 1.2, 0.62],
  volume: ["ouvrage", 1.2, 0.7],
  matiere: ["ouvrage", 0.66, 0.3],
};
/** Ordre de construction : une étape plus avancée implique les précédentes terminées. */
export const CHAINE = ["trace", "volume", "matiere"];

/**
 * État de la scène à partir des centres relatifs des fenêtres ({ esquisse, ouvrage, … }).
 * reduit (« réduire les animations ») : chaque grandeur vaut 0 ou 1, une image fixe par état, sans transition.
 */
export function etatScene(centres = {}, { reduit = false } = {}) {
  const e = {};
  for (const [cle, [fenetre, debut, fin]] of Object.entries(PLAGES)) {
    const v = avance(centres[fenetre], debut, fin);
    e[cle] = reduit ? (v >= 0.5 ? 1 : 0) : v;
  }
  for (let i = CHAINE.length - 1; i > 0; i--) {
    if (e[CHAINE[i]] > 0) for (let j = 0; j < i; j++) e[CHAINE[j]] = 1;
  }
  e.etape = e.volume + e.matiere; // 0 : esquisse, 1 : volume monté, 2 : matière posée
  return e;
}

/** Poses de caméra (radians, distance relative au cadrage) aux étapes 0, 1, 2 : mouvements lents et courts. */
const POSES = [
  { azimut: -0.52, elevation: 0.66, distance: 1.0 },  // esquisse : la feuille vue d'au-dessus
  { azimut: -0.34, elevation: 0.44, distance: 0.97 }, // volume : on descend à hauteur de maquette
  { azimut: -0.16, elevation: 0.3, distance: 0.93 },  // matière : vue de trois quarts, plus proche
];
export function poseCamera(etape) {
  const k = Math.min(POSES.length - 1, Math.max(0, etape));
  const i = Math.min(POSES.length - 2, Math.floor(k));
  const t = doux(k - i);
  const a = POSES[i], b = POSES[i + 1];
  return {
    azimut: a.azimut + (b.azimut - a.azimut) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
    distance: a.distance + (b.distance - a.distance) * t,
  };
}

/** Sous-plage [a, b] d'un avancement p (0 avant a, 1 après b). */
export const segment = (p, a, b) => clamp01((p - a) / (b - a));

/**
 * Calendrier du volume (p de 0 à 1) : étages un à un, toit, détails, fenêtres une par une, arbres.
 * Renvoie des fonctions pures pour que la scène et les tests partagent les mêmes repères.
 */
export function calendrierVolume(nbNiveaux, nbFenetres, nbArbres) {
  // Chaque étage dure 1,3 pas (léger chevauchement) ; le dernier finit pile à 0,48, quand le toit commence.
  const finEtages = 0.48;
  const pas = finEtages / (Math.max(1, nbNiveaux) + 0.3);
  return {
    niveau: (p, i) => segment(p, i * pas, i * pas + pas * 1.3),
    toit: (p) => segment(p, 0.48, 0.6),
    details: (p) => segment(p, 0.56, 0.68),
    fenetreAllumee: (p, i) => p >= 0.62 + (0.26 * (i + 1)) / Math.max(1, nbFenetres),
    arbre: (p, i) => segment(p, 0.7 + (0.18 * i) / Math.max(1, nbArbres), 0.82 + (0.18 * i) / Math.max(1, nbArbres)),
  };
}
