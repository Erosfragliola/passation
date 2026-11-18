// Hero (accueil v4, 18/11/2026) : la vidéo (.hero-fond) est découpée d'une encoche à chaque coin où se loge une
// bulle (.hero-bulle[data-coin=hg|hd|bg|bd]), avec des angles rentrants arrondis. Recalculée à chaque changement de
// taille. Sur téléphone, les bulles ne sont plus positionnées en absolu : pas de découpe, elles se rangent dessous.
const visuel = document.getElementById("hero-visuel");
const fond = visuel?.querySelector(".hero-fond");
const bulles = [...(visuel?.querySelectorAll(".hero-bulle[data-coin]") || [])];

/**
 * Chemin d'un rectangle W × H aux coins arrondis (r), dont chaque coin peut être découpé d'une encoche
 * { w, h } (largeur et hauteur de la bulle, écart compris). Parcours dans le sens des aiguilles d'une montre.
 */
export function cheminEncoches(W, H, r, { hg, hd, bg, bd } = {}) {
  const p = [`M ${hg ? hg.w + r : r} 0`];
  if (hd) p.push(`L ${W - hd.w - r} 0`, `A ${r} ${r} 0 0 1 ${W - hd.w} ${r}`, `L ${W - hd.w} ${hd.h - r}`, `A ${r} ${r} 0 0 0 ${W - hd.w + r} ${hd.h}`, `L ${W - r} ${hd.h}`, `A ${r} ${r} 0 0 1 ${W} ${hd.h + r}`);
  else p.push(`L ${W - r} 0`, `A ${r} ${r} 0 0 1 ${W} ${r}`);
  if (bd) p.push(`L ${W} ${H - bd.h - r}`, `A ${r} ${r} 0 0 1 ${W - r} ${H - bd.h}`, `L ${W - bd.w + r} ${H - bd.h}`, `A ${r} ${r} 0 0 0 ${W - bd.w} ${H - bd.h + r}`, `L ${W - bd.w} ${H - r}`, `A ${r} ${r} 0 0 1 ${W - bd.w - r} ${H}`);
  else p.push(`L ${W} ${H - r}`, `A ${r} ${r} 0 0 1 ${W - r} ${H}`);
  if (bg) p.push(`L ${bg.w + r} ${H}`, `A ${r} ${r} 0 0 1 ${bg.w} ${H - r}`, `L ${bg.w} ${H - bg.h + r}`, `A ${r} ${r} 0 0 0 ${bg.w - r} ${H - bg.h}`, `L ${r} ${H - bg.h}`, `A ${r} ${r} 0 0 1 0 ${H - bg.h - r}`);
  else p.push(`L ${r} ${H}`, `A ${r} ${r} 0 0 1 0 ${H - r}`);
  if (hg) p.push(`L 0 ${hg.h + r}`, `A ${r} ${r} 0 0 1 ${r} ${hg.h}`, `L ${hg.w - r} ${hg.h}`, `A ${r} ${r} 0 0 0 ${hg.w} ${hg.h - r}`, `L ${hg.w} ${r}`, `A ${r} ${r} 0 0 1 ${hg.w + r} 0`);
  else p.push(`L 0 ${r}`, `A ${r} ${r} 0 0 1 ${r} 0`);
  return `${p.join(" ")} Z`;
}

function decouper() {
  if (!visuel || !fond || !bulles.length) return;
  if (getComputedStyle(bulles[0]).position !== "absolute") { fond.style.clipPath = ""; fond.classList.remove("decoupee"); return; }
  const W = fond.clientWidth, H = fond.clientHeight;
  if (!W || !H) return;
  const ecart = 12, r = 26, coins = {};
  for (const b of bulles) coins[b.dataset.coin] = { w: b.offsetWidth + ecart, h: b.offsetHeight + ecart };
  fond.classList.add("decoupee");
  fond.style.clipPath = `path('${cheminEncoches(W, H, r, coins)}')`;
}

if (visuel && fond) {
  const ro = new ResizeObserver(decouper);
  ro.observe(visuel); bulles.forEach((b) => ro.observe(b));
  window.addEventListener("load", decouper);
  decouper();
}
