// Textures procédurales de la maquette : fonctions pures (aucun DOM), exécutées dans un Web Worker pour ne pas
// bloquer la page. Chaque générateur renvoie des tableaux RGBA prêts pour THREE.DataTexture, et une carte de hauteur
// d'où l'on dérive la normal map. Déterministes : même graine, même texture.

// ------------------------------------------------------------------ Bruit (valeur, fBm), graine fixe
export function hachage(x, y, graine) {
  let h = (x * 374761393 + y * 668265263 + graine * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const lisse = (t) => t * t * (3 - 2 * t);
/** Bruit de valeur périodique (période px, py) pour des textures sans raccord visible. */
function bruit(x, y, px, py, graine) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = lisse(x - xi), fy = lisse(y - yi);
  const m = (a, p) => ((a % p) + p) % p;
  const a = hachage(m(xi, px), m(yi, py), graine), b = hachage(m(xi + 1, px), m(yi, py), graine);
  const c = hachage(m(xi, px), m(yi + 1, py), graine), d = hachage(m(xi + 1, px), m(yi + 1, py), graine);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, px, py, graine, octaves = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) { s += amp * bruit(x * f, y * f, px * f, py * f, graine + o * 17); amp *= 0.5; f *= 2; }
  return s / (1 - Math.pow(0.5, octaves));
}

// ------------------------------------------------------------------ Peinture et normal maps (tableaux)
/** f(u, v) → { r, g, b, h, rough } pour chaque pixel ; renvoie couleur et rugosité (RGBA) + hauteur. */
function peindre(l, h, f) {
  const couleur = new Uint8ClampedArray(l * h * 4), rugo = new Uint8ClampedArray(l * h * 4);
  const hauteur = new Float32Array(l * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const p = f(x / l, y / h);
      const i = (y * l + x) * 4;
      couleur[i] = p.r; couleur[i + 1] = p.g; couleur[i + 2] = p.b; couleur[i + 3] = 255;
      const r = Math.round((p.rough ?? 0.5) * 255);
      rugo[i] = r; rugo[i + 1] = r; rugo[i + 2] = r; rugo[i + 3] = 255;
      hauteur[y * l + x] = p.h ?? 0;
    }
  }
  return { l, h, couleur, rugo, hauteur };
}
/** Normal map (RGBA) dérivée d'une carte de hauteur, filtre de Sobel, bords repliés (texture sans raccord). */
export function normale(hauteur, l, h, force = 2) {
  const out = new Uint8ClampedArray(l * h * 4);
  const H = (x, y) => hauteur[((y + h) % h) * l + ((x + l) % l)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * force, ny = dy * force, nz = 1;
      const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
      const i = (y * l + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}
const melange = (a, b, t) => a + (b - a) * t;
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// ------------------------------------------------------------------ Pierre de taille (assises régulières, joints fins)
// La texture couvre 2 × 2 unités de maquette : 4 blocs par assise, 8 assises, joints décalés d'un demi-bloc.
export function pierre(l = 512, h = 512) {
  const clair = rgb(0xe2d5bd), fonce = rgb(0xc4b293), joint = rgb(0xb7a78c);
  const assises = 8, blocs = 4, e = 0.0055;
  return peindre(l, h, (u, v) => {
    const r = Math.floor(v * assises);
    const uu = (u + (r % 2) * (0.5 / blocs)) % 1;
    const c = Math.floor(uu * blocs);
    const fu = uu * blocs - c, fv = v * assises - r;
    const dJoint = Math.min(Math.min(fu, 1 - fu) / blocs, Math.min(fv, 1 - fv) / assises);
    const grain = fbm(u * 48, v * 48, 48, 48, 23, 3);
    if (dJoint < e) {
      const k = 0.9 + grain * 0.08;
      return { r: joint[0] * k, g: joint[1] * k, b: joint[2] * k, h: 0, rough: 0.95 };
    }
    const nuance = hachage(c, r, 13);
    const t = Math.min(1, Math.max(0, 0.3 + nuance * 0.45 + (grain - 0.5) * 0.35));
    const bord = Math.min(1, dJoint / (e * 3)); // arête légèrement adoucie
    return { r: melange(fonce[0], clair[0], t), g: melange(fonce[1], clair[1], t), b: melange(fonce[2], clair[2], t), h: 0.5 + grain * 0.3 * bord, rough: 0.78 + grain * 0.14 };
  });
}

// ------------------------------------------------------------------ Plâtre / carton plume (grain très fin)
export function platre(l = 512, h = 512) {
  return peindre(l, h, (u, v) => {
    const g = fbm(u * 64, v * 64, 64, 64, 41, 3);
    const k = 236 + (g - 0.5) * 14;
    return { r: k, g: k - 7, b: k - 20, h: g, rough: 0.88 + g * 0.1 };
  });
}

// ------------------------------------------------------------------ Balsa (fil serré, clair)
export function balsa(l = 512, h = 512) {
  const a = rgb(0xcfa977), b = rgb(0xe6cda3);
  return peindre(l, h, (u, v) => {
    const d = fbm(u * 2, v * 8, 2, 8, 51) * 1.4;
    const s = 0.5 + 0.5 * Math.sin((v * 90 + d * 4) * Math.PI);
    const f = fbm(u * 8, v * 200, 8, 200, 3, 2);
    const t = s * 0.55 + f * 0.45;
    return { r: melange(a[0], b[0], t), g: melange(a[1], b[1], t), b: melange(a[2], b[2], t), h: t, rough: 0.78 };
  });
}

// ------------------------------------------------------------------ Lichen (bosses très fines)
export function lichen(l = 256, h = 256) {
  return peindre(l, h, (u, v) => {
    const g = fbm(u * 40, v * 40, 40, 40, 61, 3);
    const k = 200 + g * 55;
    return { r: k, g: k, b: k, h: g, rough: 1 };
  });
}

// ------------------------------------------------------------------ Cuivre brossé (stries horizontales)
export function brosse(l = 512, h = 256) {
  return peindre(l, h, (u, v) => {
    const s = fbm(u * 2, v * 260, 2, 260, 71, 2);
    return { r: 255, g: 255, b: 255, h: s, rough: 0.26 + s * 0.16 };
  });
}

/** Toutes les textures de la maquette (appelé dans le Worker). */
export function genererTout(mobile = false) {
  const pi = pierre(mobile ? 256 : 512, mobile ? 256 : 512);
  const p = platre(), b = balsa(), li = lichen(), br = brosse();
  return {
    pierre: { l: pi.l, h: pi.h, couleur: pi.couleur },
    platre: { l: p.l, h: p.h, couleur: p.couleur, rugo: p.rugo, normale: normale(p.hauteur, p.l, p.h, 1.2) },
    balsa: { l: b.l, h: b.h, couleur: b.couleur, normale: normale(b.hauteur, b.l, b.h, 1.5) },
    lichen: { l: li.l, h: li.h, normale: normale(li.hauteur, li.l, li.h, 2.5) },
    brosse: { l: br.l, h: br.h, rugo: br.rugo, normale: normale(br.hauteur, br.l, br.h, 1.2) },
  };
}

/** Tampons à transférer (sans copie) du Worker vers la page. */
export function tampons(t) {
  const liste = [];
  for (const v of Object.values(t)) for (const x of Object.values(v)) if (x?.buffer) liste.push(x.buffer);
  return liste;
}
