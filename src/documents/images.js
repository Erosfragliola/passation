// Images (photos and logos of the file): type recognized by its signature, dimensions read in the file header
// (without decoding the image: a Worker has no image library), fingerprint to spot the same image under two addresses.
// Pure functions, tested (test/photos.test.js).

const SIGNATURES = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
export const MIME_IMAGE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** « png », « jpg », « webp » or null (WebP: « RIFF » then « WEBP » at byte 8). */
export function typeImage(o) {
  const t = Object.entries(SIGNATURES).find(([, sig]) => sig.every((b, i) => o?.[i] === b))?.[0] ?? null;
  if (t === "webp" && String.fromCharCode(o[8], o[9], o[10], o[11]) !== "WEBP") return null;
  return t;
}

const u16be = (o, i) => (o[i] << 8) | o[i + 1];
const u16le = (o, i) => o[i] | (o[i + 1] << 8);
const u24le = (o, i) => o[i] | (o[i + 1] << 8) | (o[i + 2] << 16);
const u32be = (o, i) => ((o[i] << 24) >>> 0) + (o[i + 1] << 16) + (o[i + 2] << 8) + o[i + 3];

/** Width and height in pixels read in the header (PNG, JPEG, WebP), or null if the file cannot be read. */
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
    // JPEG segments: the size is in the first SOF marker (C0 to CF, except C4, C8 and CC)
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

/** SHA-256 fingerprint (hexadecimal): two addresses that serve the same file have the same fingerprint. */
export async function empreinte(octets) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", octets));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Is an image of the website a usable content photo? Rejects: unknown format (SVG, GIF, AVIF…), small image
 * (pictogram, thumbnail), very elongated banner (in either direction).
 * @returns null if it is kept, otherwise the reason (« format », « petite », « bandeau »).
 */
export function raisonEcartPhoto(dim, { largeurMin, hauteurMin, allongementMax }) {
  if (!dim || !(dim.largeur > 0) || !(dim.hauteur > 0)) return "format";
  if (dim.largeur < largeurMin || dim.hauteur < hauteurMin) return "petite";
  const r = dim.largeur / dim.hauteur;
  if (r > allongementMax || r < 1 / allongementMax) return "bandeau";
  return null;
}
