// Pages du mémorandum : remplissage mesuré à la surface, fusion des pages presque vides, numérotation et sommaire.
// Fonctions pures (rectangles et listes en entrée), testées dans test/memo-pages.test.js ; la page du mémorandum
// (memo.js) leur passe les mesures du navigateur.

/** Seuil de fusion : une page qui couvre moins de 16 % de sa zone de contenu (un tiers d'une page pleine, qui couvre
 *  45 à 55 %) est fusionnée avec sa voisine de la même partie. Choix du propriétaire, 24/11/2026. */
export const SEUIL_PAGE_VIDE = 0.16;

/**
 * Part de la zone de contenu couverte par du texte, des tableaux, des graphiques ou des photos : une grille de nx × ny
 * points posée sur la zone ; un point compte s'il tombe dans au moins un rectangle (lignes de texte, images).
 * @param zone { left, top, width, height } ; @param rects [{ left, top, right, bottom }] ; @returns 0 à 1
 */
export function surfaceCouverte(zone, rects, nx = 64, ny = 36) {
  if (!zone || !(zone.width > 0) || !(zone.height > 0)) return 0;
  const r = (rects || []).filter((x) => x && x.right > x.left && x.bottom > x.top);
  let c = 0;
  for (let y = 0; y < ny; y++) {
    const py = zone.top + ((y + 0.5) * zone.height) / ny;
    for (let x = 0; x < nx; x++) {
      const px = zone.left + ((x + 0.5) * zone.width) / nx;
      if (r.some((q) => px >= q.left && px <= q.right && py >= q.top - 2 && py <= q.bottom + 2)) c++;
    }
  }
  return c / (nx * ny);
}

/**
 * Fusions à tenter, dans l'ordre : chaque page sous le seuil est rapprochée de la page suivante de la même partie
 * (à défaut, de la précédente). Une page n'entre que dans une fusion ; les pages non fusionnables (couverture,
 * ouvertures, sommaire, glossaire, avertissement, « Éléments à compléter ») ne sont jamais touchées.
 * @param pages [{ partie, couverture, fusionnable }] dans l'ordre du document ; @returns [[receveuse, donneuse]] (index)
 */
export function planFusion(pages, seuil = SEUIL_PAGE_VIDE) {
  const pris = new Set(), plan = [];
  const voisine = (i, pas) => { const j = i + pas, p = pages[j]; return p && p.fusionnable && !pris.has(j) && p.partie === pages[i].partie ? j : null; };
  pages.forEach((p, i) => {
    if (!p.fusionnable || pris.has(i) || !(p.couverture < seuil)) return;
    const j = voisine(i, 1) ?? voisine(i, -1);
    if (j == null) return;
    const [a, b] = j > i ? [i, j] : [j, i];
    pris.add(a); pris.add(b); plan.push([a, b]);
  });
  return plan;
}

/**
 * Numéros « partie.page » et pages du sommaire, recalculés après fusion : une page d'ouverture fixe la partie ; une
 * suite garde le numéro de sa page ; chaque chapitre renvoie à la première page qui le porte (une page fusionnée en
 * porte plusieurs).
 * @param pages [{ type: "ouverture"|"page"|"hors", partie, sections: [cle], suite, fusion: [cle des chapitres rapprochés] }]
 * @returns { numeros: [string|null], pageDe: { cle: n° de page (1…) }, numeroDe: { cle: "2.3" }, ouvertures: { partie: n° } }
 */
export function numeroter(pages) {
  const numeros = [], pageDe = {}, numeroDe = {}, ouvertures = {};
  let partie = 0, n = 0;
  pages.forEach((p, k) => {
    if (p.type === "ouverture") { partie = p.partie; n = 0; ouvertures[p.partie] = k + 1; numeros.push(null); return; }
    if (p.type !== "page") { numeros.push(null); return; }
    if (!p.suite) n++;
    const num = `${partie}.${Math.max(1, n)}`;
    numeros.push(num);
    for (const cle of p.sections || []) { if (!(cle in pageDe) && !(p.fusion || []).includes(cle)) { pageDe[cle] = k + 1; numeroDe[cle] = num; } }
    // Chapitre rapproché sur la page d'un autre (fusion) : son propre numéro, à la suite, pour que le sommaire ne
    // répète jamais un numéro ; la page suivante continue après lui
    for (const cle of p.fusion || []) { if (!(cle in pageDe)) { n++; pageDe[cle] = k + 1; numeroDe[cle] = `${partie}.${n}`; } }
  });
  return { numeros, pageDe, numeroDe, ouvertures };
}
