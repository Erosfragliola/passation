// L'histoire des clés : poses et rythme portés du prototype (_refonte/reference/prototype/index.html, renderMain),
// constantes reprises telles quelles. Fonctions pures du temps « établi » t, sans DOM (test/histoire-poses.test.js).
// Repères : lampe 6,6 → 7,15 ; chute 7,05 → 8,19 (dernière étiquette posée) ; rangement 11,55 → 13,7 ;
// retournements 14,25 → 17,25 ; sortie des clés 19,0 → 19,94 ; regroupement 19,35 → 20,63 ; dossier 20,45 → 21,45 ;
// onglets 21,15 → 22,54. Coordonnées en pixels de la scène 1920 × 1080.

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
export const DROP = [4, 1, 6, 0, 8, 3, 5, 2, 7].map((o) => 7.05 + o * 0.075);
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

/** Début (lampe éteinte, rien sur l'établi), fin de la chute jouée au temps (toutes les étiquettes posées), fin. */
export const T_DEBUT = 6.6, T_POSE = 8.2, T_FIN = 24.5;
/** Temps établi suivant le défilement de la section (brief : t = 7,7 + p × 16,8), jamais avant la fin de la chute. */
export const tempsDefilement = (p) => Math.max(T_POSE, 7.7 + clamp01(p) * 16.8);

/** Luminosité de l'établi : la lampe s'allume avec un léger vacillement. */
export function lampe(t) {
  return 0.24 + 0.76 * eOut(seg(t, 6.6, 7.15)) * (t > 6.74 && t < 6.79 ? 0.45 : 1) * (t > 6.86 && t < 6.89 ? 0.75 : 1);
}
/** Léger mouvement de caméra (échelle de la scène). */
export const camera = (t) => 1.03 - 0.03 * eOut(seg(t, 6.6, 8.4)) + 0.035 * seg(t, 8.4, 35.8);

/** Clé i : position du trou de l'anneau (pivot), rotation, échelle, opacité, hauteur (soulèvement 0 à 1), ordre. */
export function cle(i, t) {
  const P = PILE[i];
  const dE = eOut(seg(t, DROP[i], DROP[i] + 0.5));
  let op = seg(t, DROP[i], DROP[i] + 0.1);
  let h = 1 - dE;
  const jit = 14 * (1 - dE) * (i % 2 ? 1 : -1);
  const kk = eIO(seg(t, KS[i], KS[i] + 1.25));
  const x = lerp(P[0], ROWX[i], kk);
  let y = lerp(P[1], KEYY, kk) - 28 * Math.sin(Math.PI * kk);
  const rot = lerp(P[2], 0, kk) + jit;
  h = Math.max(h, 0.55 * Math.sin(Math.PI * kk));
  const ex = seg(t, KX[i], KX[i] + 0.7);
  y += 700 * eIn(ex);
  op *= 1 - seg(t, KX[i] + 0.25, KX[i] + 0.7);
  return { x, y, rot, s: 1 + 0.12 * h, op, h, z: kk > 0 && kk < 1 ? 200 + i * 2 : ZB[i] * 2, jit };
}

/** Étiquette i : position de l'œillet (pivot), rotation, échelle, opacité, hauteur, retournement (0 recto, 1 verso). */
export function etiquette(i, t, jit = cle(i, t).jit) {
  const P = PILE[i];
  const dtE = eOut(seg(t, DROP[i] + 0.04, DROP[i] + 0.54));
  let op = seg(t, DROP[i] + 0.04, DROP[i] + 0.14);
  const kt = eIO(seg(t, KS[i] + 0.07, KS[i] + 1.32));
  let x = lerp(P[0] + P[3], ROWX[i], kt);
  let y = lerp(P[1] + P[4], TAGY, kt) - 28 * Math.sin(Math.PI * kt);
  let rot = lerp(P[5], 0, kt) + jit * 0.7;
  const flip = eIO(seg(t, FS[i], FS[i] + 0.6));
  let h = Math.max(1 - dtE, 0.5 * Math.sin(Math.PI * kt), 0.42 * Math.sin(Math.PI * flip));
  const g1 = eIO(seg(t, GA[i], GA[i] + 0.8));
  x = lerp(x, STK[i].x, g1); y = lerp(y, STK[i].y, g1); rot = lerp(rot, SR[i], g1);
  const g0 = seg(t, TS[i], TS[i] + 0.6), g = eIO(g0);
  x = lerp(x, TABT[i].x, g); y = lerp(y, TABT[i].y, g); rot = lerp(rot, -90, g);
  h = Math.max(h, 0.5 * Math.sin(Math.PI * g1), 0.45 * Math.sin(Math.PI * g));
  const s = lerp(lerp(1, 0.92, g1), 0.45, g) * (1 + 0.1 * h);
  op *= 1 - seg(g0, 0.65, 1);
  return { x, y, rot, s, op, h, flip, z: g1 > 0 ? 400 + i : kt > 0 && kt < 1 ? 201 + i * 2 : ZB[i] * 2 + 1 };
}

/** Ficelle de la clé i à son étiquette : courbe quadratique de l'anneau à l'œillet (null si invisible). */
export function ficelle(i, t, k = cle(i, t), e = etiquette(i, t, k.jit)) {
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
/** Les trois temps de l'histoire (le troisième reste jusqu'à la fin). */
export const TEMPS = [[7.9, 12.55], [13.15, 19.0], [21.0, Infinity]];

/** Poussières dans la lumière de la lampe (graine fixe : même tirage à chaque visite). */
export function poussieres(n = 26) {
  let a = 31;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return Array.from({ length: n }, () => { const s = 3 + r() * 6; return { x: 560 + r() * 980, y: 180 + r() * 640, p: r() * 6.28, s }; });
}
export function poussiere(m, t) {
  const mv = seg(t, 7.2, 8.2);
  return {
    x: m.x + 28 * Math.sin(0.33 * t + m.p),
    y: m.y + 20 * Math.cos(0.26 * t + m.p * 1.3) - 8 * Math.sin(0.11 * t + m.p),
    op: mv * (0.1 + 0.28 * (0.5 + 0.5 * Math.sin(1.1 * t + m.p * 2))),
  };
}
