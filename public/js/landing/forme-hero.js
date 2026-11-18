// Hero (accueil v5, 18/11/2026) : la vidéo est découpée autour des bulles qui s'y logent, coins ou bords (comme une
// pièce de puzzle), avec tous les angles arrondis, y compris les angles rentrants. La forme se recalcule à chaque
// changement de taille. Sur téléphone (bulles masquées) : un rectangle aux angles asymétriques.
const scene = typeof document === "undefined" ? null : document.getElementById("hero-scene");
const fond = scene?.querySelector(".hero-fond");
const bulles = [...(scene?.querySelectorAll(".hero-bulle[data-cote]") || [])];

/**
 * Polygone à angles droits (sens des aiguilles d'une montre) d'un rectangle W × H dont on retire des encoches :
 * coins hg/hd/bd/bg { w, h } et bords g/d/h/b, chacun une liste de { debut, longueur, profondeur }.
 */
export function polygone(W, H, { hg, hd, bd, bg, h = [], d = [], b = [], g = [] } = {}) {
  const p = [];
  p.push(...(hg ? [[0, hg.h], [hg.w, hg.h], [hg.w, 0]] : [[0, 0]]));
  for (const n of [...h].sort((x, y) => x.debut - y.debut)) p.push([n.debut, 0], [n.debut, n.profondeur], [n.debut + n.longueur, n.profondeur], [n.debut + n.longueur, 0]);
  p.push(...(hd ? [[W - hd.w, 0], [W - hd.w, hd.h], [W, hd.h]] : [[W, 0]]));
  for (const n of [...d].sort((x, y) => x.debut - y.debut)) p.push([W, n.debut], [W - n.profondeur, n.debut], [W - n.profondeur, n.debut + n.longueur], [W, n.debut + n.longueur]);
  p.push(...(bd ? [[W, H - bd.h], [W - bd.w, H - bd.h], [W - bd.w, H]] : [[W, H]]));
  for (const n of [...b].sort((x, y) => y.debut - x.debut)) p.push([n.debut + n.longueur, H], [n.debut + n.longueur, H - n.profondeur], [n.debut, H - n.profondeur], [n.debut, H]);
  p.push(...(bg ? [[bg.w, H], [bg.w, H - bg.h], [0, H - bg.h]] : [[0, H]]));
  for (const n of [...g].sort((x, y) => y.debut - x.debut)) p.push([0, n.debut + n.longueur], [n.profondeur, n.debut + n.longueur], [n.profondeur, n.debut], [0, n.debut]);
  return p;
}

/** Polygone → chemin SVG aux angles arrondis (rayon r, réduit si un côté est trop court ; rayons propres par angle). */
export function cheminArrondi(points, r, rayonDe = () => r) {
  const n = points.length, seg = [];
  const lg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    const prec = points[(i - 1 + n) % n], c = points[i], suiv = points[(i + 1) % n];
    const ri = Math.min(rayonDe(i, c), lg(prec, c) / 2, lg(c, suiv) / 2);
    const u = (a, b) => { const l = lg(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const v1 = u(c, prec), v2 = u(c, suiv);
    const A = [c[0] + v1[0] * ri, c[1] + v1[1] * ri], B = [c[0] + v2[0] * ri, c[1] + v2[1] * ri];
    const croix = (c[0] - prec[0]) * (suiv[1] - c[1]) - (c[1] - prec[1]) * (suiv[0] - c[0]);
    seg.push({ A, B, ri, balayage: croix > 0 ? 1 : 0 });
  }
  const f = (x) => Math.round(x * 10) / 10;
  let d = `M ${f(seg[0].B[0])} ${f(seg[0].B[1])}`;
  for (let i = 1; i <= n; i++) { const s = seg[i % n]; d += ` L ${f(s.A[0])} ${f(s.A[1])} A ${f(s.ri)} ${f(s.ri)} 0 0 ${s.balayage} ${f(s.B[0])} ${f(s.B[1])}`; }
  return `${d} Z`;
}

function dessiner() {
  if (!scene || !fond) return;
  const W = fond.clientWidth, H = fond.clientHeight;
  if (!W || !H) return;
  // Sous 900 px, les bulles sont posées par-dessus (aucune découpe) : seule la forme aux angles asymétriques reste
  const visibles = W < 860 ? [] : bulles.filter((x) => getComputedStyle(x).display !== "none");
  if (!visibles.length) { fond.style.clipPath = `path('${cheminArrondi(polygone(W, H), 26, (i) => ([1, 3].includes(i) ? 70 : 24))}')`; return; }
  const ecart = 14, f = fond.getBoundingClientRect(), encoches = { h: [], d: [], b: [], g: [] };
  for (const x of visibles) {
    const r = x.getBoundingClientRect(), gx = r.left - f.left, gy = r.top - f.top;
    const cote = x.dataset.cote;
    if (cote === "hg") encoches.hg = { w: gx + r.width + ecart, h: gy + r.height + ecart };
    else if (cote === "hd") encoches.hd = { w: W - gx + ecart, h: gy + r.height + ecart };
    else if (cote === "bd") encoches.bd = { w: W - gx + ecart, h: H - gy + ecart };
    else if (cote === "bg") encoches.bg = { w: gx + r.width + ecart, h: H - gy + ecart };
    else if (cote === "g") encoches.g.push({ debut: gy - ecart, longueur: r.height + 2 * ecart, profondeur: gx + r.width + ecart });
    else if (cote === "d") encoches.d.push({ debut: gy - ecart, longueur: r.height + 2 * ecart, profondeur: W - gx + ecart });
    else if (cote === "b") encoches.b.push({ debut: gx - ecart, longueur: r.width + 2 * ecart, profondeur: H - gy + ecart });
    else if (cote === "h") encoches.h.push({ debut: gx - ecart, longueur: r.width + 2 * ecart, profondeur: gy + r.height + ecart });
  }
  fond.style.clipPath = `path('${cheminArrondi(polygone(W, H, encoches), 26)}')`;
}

if (scene && fond) {
  const ro = new ResizeObserver(dessiner);
  ro.observe(fond); bulles.forEach((x) => ro.observe(x));
  window.addEventListener("load", dessiner);
  dessiner();
}
