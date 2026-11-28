// Pages of the memorandum: filling measured by area, merging of almost empty pages, numbering and contents.
// Pure functions (rectangles and lists as input), tested in test/memo-pages.test.js; the memorandum page (memo.js)
// passes them the browser's measurements.

/**
 * Merge threshold: a page that covers less than 16% of its content area (a third of a full page, which covers 45 to
 * 55%) is merged with its neighbour of the same part. Owner's choice, 24/11/2026.
 */
export const SEUIL_PAGE_VIDE = 0.16;

/**
 * Share of the content area covered by text, tables, charts or photos: a grid of nx × ny points laid on the area;
 * a point counts if it falls in at least one rectangle (text lines, images).
 * @param zone { left, top, width, height }; @param rects [{ left, top, right, bottom }]; @returns 0 to 1
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
 * Merges to try, in order: each page under the threshold is brought next to the following page of the same part
 * (otherwise, the previous one). A page takes part in one merge only; pages that cannot be merged (cover, openings,
 * contents, glossary, disclaimer, « Éléments à compléter ») are never touched.
 * @param pages [{ partie, couverture, fusionnable }] in document order; @returns [[receiving, giving]] (indexes)
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
 * Numbers « part.page » and pages of the contents, computed again after merging: an opening page sets the part; a
 * continuation keeps the number of its page; each chapter points to the first page that carries it (a merged page
 * carries several).
 * @param pages [{ type: "ouverture"|"page"|"hors", partie, sections: [cle], suite, fusion: [keys of the chapters
 * brought together] }]
 * @returns { numeros: [string|null], pageDe: { cle: page number (1…) }, numeroDe: { cle: "2.3" }, ouvertures: { partie:
 * n° } }
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
    // Chapter brought onto another one's page (merge): its own number, next in line, so that the contents never repeat
    // a number; the following page continues after it
    for (const cle of p.fusion || []) { if (!(cle in pageDe)) { n++; pageDe[cle] = k + 1; numeroDe[cle] = `${partie}.${n}`; } }
  });
  return { numeros, pageDe, numeroDe, ouvertures };
}
