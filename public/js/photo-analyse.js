// Analyse d'une photo par Claude, depuis le navigateur : la photo enregistrée est relue, réduite (plus grand côté de
// 1 568 px au plus, JPEG) puis envoyée seule à la route d'analyse. Partagé par le parcours guidé et la page du
// mémorandum. Sans clé Claude ou en cas d'échec, la photo reste utilisable : l'erreur est simplement renvoyée.
export const COTE_MAX = 1568;

/** Dimensions réduites (le plus grand côté ramené à `max`, jamais agrandi). */
export function dimensionsReduites(largeur, hauteur, max = COTE_MAX) {
  const k = Math.min(1, max / Math.max(largeur, hauteur, 1));
  return { largeur: Math.max(1, Math.round(largeur * k)), hauteur: Math.max(1, Math.round(hauteur * k)) };
}

/** Image réduite (Blob JPEG) à partir de l'adresse d'une photo du dossier. */
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

/** Analyse la photo n du dossier ; renvoie la réponse de l'API (mémorandum relu) ou lève l'erreur du serveur. */
export async function analyserPhoto(baseMemo, n, version = Date.now()) {
  const image = await photoReduite(`${baseMemo}/photos/${n}?v=${version}`);
  const fd = new FormData();
  fd.append("image", image, "photo.jpg");
  const r = await fetch(`${baseMemo}/photos/${n}/analyse`, { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || "analyse"), { statut: r.status, erreur: d.erreur });
  return d;
}
