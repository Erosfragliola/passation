// Images (photos et logos du dossier) : type reconnu à la signature, dimensions lues dans l'en-tête du fichier (sans
// décoder l'image : un Worker n'a pas de bibliothèque d'images), empreinte pour repérer une même image sous deux
// adresses. Fonctions pures, testées (test/photos.test.js).

const SIGNATURES = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
export const MIME_IMAGE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** « png », « jpg », « webp » ou null (WebP : « RIFF » puis « WEBP » à l'octet 8). */
export function typeImage(o) {
  const t = Object.entries(SIGNATURES).find(([, sig]) => sig.every((b, i) => o?.[i] === b))?.[0] ?? null;
  if (t === "webp" && String.fromCharCode(o[8], o[9], o[10], o[11]) !== "WEBP") return null;
  return t;
}

const u16be = (o, i) => (o[i] << 8) | o[i + 1];
const u16le = (o, i) => o[i] | (o[i + 1] << 8);
const u24le = (o, i) => o[i] | (o[i + 1] << 8) | (o[i + 2] << 16);
const u32be = (o, i) => ((o[i] << 24) >>> 0) + (o[i + 1] << 16) + (o[i + 2] << 8) + o[i + 3];

/** Largeur et hauteur en pixels lues dans l'en-tête (PNG, JPEG, WebP), ou null si le fichier n'est pas lisible. */
export function dimensionsImage(o) {
  if (!o || o.length < 24) return null;
  const t = typeImage(o);
  if (t === "png") return o.length >= 24 ? { largeur: u32be(o, 16), hauteur: u32be(o, 20) } : null;
  if (t === "webp") {
    const bloc = String.fromCharCode(o[12], o[13], o[14], o[15]);
    if (bloc === "VP8 " && o.length >= 30) return { largeur: u16le(o, 26) & 0x3fff, hauteur: u16le(o, 28) & 0x3fff };
    if (bloc === "VP8L" && o.length >= 25) { const b = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24); return { largeur: (b & 0x3fff) + 1, hauteur: ((b >> 14) & 0x3fff) + 1 }; }
    if (bloc === "VP8X" && o.length >= 30) return { largeur: u24le(o, 24) + 1, hauteur: u24le(o, 27) + 1 };
    return null;
  }
  if (t === "jpg") {
    // Segments JPEG : la taille est dans le premier marqueur SOF (C0 à CF, sauf C4, C8 et CC)
    let i = 2;
    while (i + 9 < o.length) {
      if (o[i] !== 0xff) { i++; continue; }
      const m = o[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const long = u16be(o, i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { hauteur: u16be(o, i + 5), largeur: u16be(o, i + 7) };
      if (long < 2) return null;
      i += 2 + long;
    }
    return null;
  }
  return null;
}

/** Empreinte SHA-256 (hexadécimal) : deux adresses qui servent le même fichier ont la même empreinte. */
export async function empreinte(octets) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", octets));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Une image du site est-elle une photo de contenu utilisable ? Écarte : format non reconnu (SVG, GIF, AVIF…), petite
 * image (pictogramme, vignette), bandeau très allongé (dans un sens ou dans l'autre).
 * @returns null si elle est gardée, sinon la raison (« format », « petite », « bandeau »).
 */
export function raisonEcartPhoto(dim, { largeurMin, hauteurMin, allongementMax }) {
  if (!dim || !(dim.largeur > 0) || !(dim.hauteur > 0)) return "format";
  if (dim.largeur < largeurMin || dim.hauteur < hauteurMin) return "petite";
  const r = dim.largeur / dim.hauteur;
  if (r > allongementMax || r < 1 / allongementMax) return "bandeau";
  return null;
}
