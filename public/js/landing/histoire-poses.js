// L'histoire des clés : poses et rythme portés du prototype (_refonte/reference/prototype/index.html, renderMain),
// constantes reprises telles quelles. Fonctions pures du temps « établi » t, sans DOM (test/histoire-poses.test.js).
// Repères : trousseau lancé 6,6 → 8,32 (dernière étiquette étalée) ; rangement 11,55 → 13,7 ;
// retournements 14,25 → 17,25 ; sortie des clés 19,0 → 19,94 ; regroupement 19,35 → 20,63 ; dossier 20,45 → 21,45 ;
// onglets 21,15 → 22,54 ; « Et la vôtre ? » 24,3 → fin, gestes du nom de code aux seuils 24,6 · 25,1 · 25,6 · 26,1.
// Coordonnées en pixels de la scène 1920 × 1080.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
export const eIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const eOut = (x) => 1 - (1 - x) ** 3;
export const eIn = (x) => x * x * x;

export const NB = 9;
// Pile : x, y et rotation du trou de la clé ; décalage dx, dy de l'œillet de l'étiquette ; rotation de l'étiquette
export const PILE = [
  [1012, 618, -38, -54, -26, 64],
  [1150, 586, 72, 42, -50, -22],
  [930, 726, 118, -62, 12, 34],
  [1212, 714, -122, 52, 30, -50],
  [1078, 672, 12, -22, -62, 8],
  [1290, 626, 150, 60, -12, 78],
  [982, 578, -96, -50, -40, -66],
  [1132, 784, -12, 30, 54, 140],
  [1252, 542, 40, 54, -38, -112],
];
export const ZB = [3, 7, 1, 5, 9, 2, 4, 8, 6];
// Arrivée : le trousseau est lancé sur la table depuis le haut à droite, hors cadre (brief « début clair », § 7)
export const T0 = 6.6;
export const TOSS = [4, 1, 6, 0, 8, 3, 5, 2, 7].map((o) => T0 + o * 0.028);
export const FLY = 0.56, SPIN = -80, CX = 1110, CY = 662, SX0 = 1560, SY0 = -170;
export const KS = [0, 4, 2, 7, 1, 5, 8, 3, 6].map((o) => 11.55 + o * 0.11);
export const FS = Array.from({ length: NB }, (_, i) => 14.25 + i * 0.3);
export const KX = Array.from({ length: NB }, (_, i) => 19.0 + i * 0.03);
export const GA = Array.from({ length: NB }, (_, i) => 19.35 + i * 0.06);
export const TS = Array.from({ length: NB }, (_, i) => 21.15 + (8 - i) * 0.08);
export const SR = [-8, 5, -3, 7, -6, 2, -4, 6, 0];
export const STK = Array.from({ length: NB }, (_, i) => ({ x: 1340 + (i - 4) * 2.5, y: 600 - i * 1.5 }));
export const ROWX = Array.from({ length: NB }, (_, i) => 960 + (i - 4) * 160);
export const TAGY = 606, KEYY = 660;
export const TABT = Array.from({ length: NB }, (_, i) => ({ x: 1040 + 660, y: 160 + 96 + i * 66 + 28 }));

/** Début (rien sur la table), fin de l'arrivée jouée au temps (toutes les étiquettes étalées), fin. */
export const T_DEBUT = T0, T_POSE = 8.32, T_FIN = 26.8;
/** Temps établi suivant le défilement de la section (t = 7,7 + p × 19,1), jamais avant la fin de la chute. */
export const tempsDefilement = (p) => Math.max(T_POSE, 7.7 + clamp01(p) * (T_FIN - 7.7));

/** Léger mouvement de caméra (échelle de la scène), et petit choc à l'atterrissage (+ 0,006, amorti en 0,3 s). */
export function camera(t) {
  const atterrit = T0 + FLY;
  const choc = t >= atterrit ? 0.006 * (1 - seg(t, atterrit, atterrit + 0.3)) ** 2 : 0;
  return 1.03 - 0.03 * eOut(seg(t, 6.6, 8.4)) + 0.035 * seg(t, 8.4, 35.8) + choc;
}

/**
 * Vol commun aux clés et aux étiquettes : départ groupé hors cadre, chute (f de 0 à 1), puis étalement (u de 0 à 1)
 * avec un petit rebond. groupeA / groupeD : part du décalage final gardée à l'arrivée et au départ.
 */
function vol(t, debut, duree, etalement, cible, decalage, groupeA, groupeD) {
  const f = seg(t, debut, debut + duree);
  const u = seg(t, debut + duree, debut + duree + etalement);
  const uE = eOut(u);
  const arrivee = { x: CX + (cible.x - CX) * 0.32 + decalage.x * groupeA, y: CY + (cible.y - CY) * 0.32 + decalage.y * groupeA };
  const depart = { x: SX0 + (cible.x - CX) * 0.22 + decalage.x * groupeD, y: SY0 + (cible.y - CY) * 0.22 + decalage.y * groupeD };
  const fin = { x: cible.x + decalage.x, y: cible.y + decalage.y };
  const hVol = f < 1 ? 1 - f * f : 0.11 * Math.sin(Math.PI * Math.min(1, u * 2.4)) * (1 - u);
  return {
    f, u, uE, hVol,
    x: f < 1 ? lerp(depart.x, arrivee.x, f) : lerp(arrivee.x, fin.x, uE),
    y: f < 1 ? lerp(depart.y, arrivee.y, f) : lerp(arrivee.y, fin.y, uE),
    op: seg(t, debut, debut + 0.07),
  };
}

/** Clé i : position du trou de l'anneau (pivot), rotation, échelle, opacité, hauteur (soulèvement 0 à 1), ordre. */
export function cle(i, t) {
  const P = PILE[i];
  const v = vol(t, TOSS[i], FLY, 0.62, { x: P[0], y: P[1] }, { x: 0, y: 0 }, 0, 0);
  const rotVol = v.f < 1 ? P[2] * 0.35 + SPIN * (1 - v.f) : lerp(P[2] * 0.35, P[2], v.uE);
  const kk = eIO(seg(t, KS[i], KS[i] + 1.25));
  const x = lerp(v.x, ROWX[i], kk);
  let y = lerp(v.y, KEYY, kk) - 28 * Math.sin(Math.PI * kk);
  const rot = lerp(rotVol, 0, kk);
  const hRangement = 0.55 * Math.sin(Math.PI * kk);
  const ex = seg(t, KX[i], KX[i] + 0.7);
  y += 700 * eIn(ex);
  const op = v.op * (1 - seg(t, KX[i] + 0.25, KX[i] + 0.7));
  // Taille : 160 % en l'air (« près de l'objectif »), plus le léger soulèvement du rangement ; h pour l'ombre
  return { x, y, rot, s: 1 + 0.6 * v.hVol + 0.12 * hRangement, op, h: Math.max(hRangement, 2.6 * v.hVol), z: kk > 0 && kk < 1 ? 200 + i * 2 : ZB[i] * 2 };
}

/** Étiquette i : position de l'œillet (pivot), rotation, échelle, opacité, hauteur, retournement (0 recto, 1 verso). */
export function etiquette(i, t) {
  const P = PILE[i];
  // Papier : part 50 ms après la clé, tombe un peu plus lentement (0,64 s), s'étale en flottant (0,8 s)
  const v = vol(t, TOSS[i] + 0.05, FLY + 0.08, 0.8, { x: P[0], y: P[1] }, { x: P[3], y: P[4] }, 0.5, 0.4);
  const rotVol = v.f < 1 ? P[5] * 0.3 + SPIN * 0.85 * (1 - v.f) : lerp(P[5] * 0.3, P[5], v.uE) + 16 * Math.sin(2.5 * Math.PI * v.u) * (1 - v.u);
  let op = v.op;
  const kt = eIO(seg(t, KS[i] + 0.07, KS[i] + 1.32));
  let x = lerp(v.x, ROWX[i], kt);
  let y = lerp(v.y, TAGY, kt) - 28 * Math.sin(Math.PI * kt);
  let rot = lerp(rotVol, 0, kt);
  const flip = eIO(seg(t, FS[i], FS[i] + 0.6));
  let h = Math.max(0.5 * Math.sin(Math.PI * kt), 0.42 * Math.sin(Math.PI * flip));
  const g1 = eIO(seg(t, GA[i], GA[i] + 0.8));
  x = lerp(x, STK[i].x, g1); y = lerp(y, STK[i].y, g1); rot = lerp(rot, SR[i], g1);
  const g0 = seg(t, TS[i], TS[i] + 0.6), g = eIO(g0);
  x = lerp(x, TABT[i].x, g); y = lerp(y, TABT[i].y, g); rot = lerp(rot, -90, g);
  h = Math.max(h, 0.5 * Math.sin(Math.PI * g1), 0.45 * Math.sin(Math.PI * g));
  const s = lerp(lerp(1, 0.92, g1), 0.45, g) * (1 + 0.1 * h) * (1 + 0.55 * v.hVol);
  op *= 1 - seg(g0, 0.65, 1);
  return { x, y, rot, s, op, h: Math.max(h, 2.4 * v.hVol), flip, z: g1 > 0 ? 400 + i : kt > 0 && kt < 1 ? 201 + i * 2 : ZB[i] * 2 + 1 };
}

/** Ficelle de la clé i à son étiquette : courbe quadratique de l'anneau à l'œillet (null si invisible). */
export function ficelle(i, t, k = cle(i, t), e = etiquette(i, t)) {
  const op = Math.min(k.op, e.op) * (1 - seg(t, 19.0, 19.25));
  if (op <= 0.001) return null;
  const dx = e.x - k.x, dy = e.y - k.y, L = Math.hypot(dx, dy) || 1;
  const sag = (i % 2 ? 1 : -1) * Math.min(16, 5 + 0.14 * L);
  const cx = (k.x + e.x) / 2 - (dy / L) * sag, cy = (k.y + e.y) / 2 + (dx / L) * sag;
  return { op, x1: k.x, y1: k.y, cx, cy, x2: e.x, y2: e.y };
}

/** Onglet i du dossier : apparaît quand l'étiquette s'y range. */
export function onglet(i, t) {
  const v = eOut(seg(t, TS[i] + 0.4, TS[i] + 0.75));
  return { op: v, dx: -64 * (1 - v) };
}

/** Dossier : arrive par le bas en se redressant. */
export function dossier(t) {
  const v = eOut(seg(t, 20.45, 21.45));
  return { visible: t > 20.4, y: 860 * (1 - v), rot: lerp(-5, -0.8, v) };
}

/** Bloc de texte (surtitre, titre, texte) : enfants qui montent l'un après l'autre, puis sortie. */
export function bloc(t, debut, fin, enfants = 3) {
  const o = Number.isFinite(fin) ? 1 - seg(t, fin, fin + 0.4) : 1;
  return {
    visible: t >= debut - 0.01 && o > 0,
    enfants: Array.from({ length: enfants }, (_, c) => {
      const e = eOut(seg(t, debut + c * 0.09, debut + c * 0.09 + 0.65));
      return { op: e * o, dy: (1 - e) * 26 - (1 - o) * 14 };
    }),
  };
}
/** Les quatre temps de l'histoire (le quatrième, « Et la vôtre ? », reste jusqu'à la fin). */
export const TEMPS = [[7.9, 12.55], [13.15, 19.0], [21.0, 23.9], [24.3, Infinity]];
/** Seuils des quatre gestes du nom de code (nom, bandes noires, tampon, valeur), une fois le dossier en place. */
export const SEUILS_GESTES = [24.6, 25.1, 25.6, 26.1];
/** Nombre de gestes dont le seuil est atteint au temps t. */
export const gestesAtteints = (t) => SEUILS_GESTES.filter((s) => t >= s).length;
