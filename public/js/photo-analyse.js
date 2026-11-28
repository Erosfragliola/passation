// Analysis of a photo by Claude, from the browser: the saved photo is read again, reduced (longest side of
// 1,568 px at most, JPEG), then sent alone to the analysis route. Shared by the guided flow and the memorandum page.
// Without a Claude key or on failure, the photo stays usable: the error is simply passed on.
export const COTE_MAX = 1568;

/** Reduced dimensions (the longest side brought down to `max`, never enlarged). */
export function dimensionsReduites(largeur, hauteur, max = COTE_MAX) {
  const k = Math.min(1, max / Math.max(largeur, hauteur, 1));
  return { largeur: Math.max(1, Math.round(largeur * k)), hauteur: Math.max(1, Math.round(hauteur * k)) };
}

/** Reduced image (JPEG Blob) from the address of a photo of the file. */
export async function photoReduite(url) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  const { largeur, hauteur } = dimensionsReduites(bitmap.width, bitmap.height);
  const toile = document.createElement("canvas");
  toile.width = largeur; toile.height = hauteur;
  toile.getContext("2d").drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close?.();
  return new Promise((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error("reduction"))), "image/jpeg", 0.86));
}

/** Analyses photo n of the file; returns the API's response (memorandum read again) or throws the server's error. */
export async function analyserPhoto(baseMemo, n, version = Date.now()) {
  const image = await photoReduite(`${baseMemo}/photos/${n}?v=${version}`);
  const fd = new FormData();
  fd.append("image", image, "photo.jpg");
  const r = await fetch(`${baseMemo}/photos/${n}/analyse`, { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || "analyse"), { statut: r.status, erreur: d.erreur });
  return d;
}
