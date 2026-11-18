// Hero (accueil v5, 18/11/2026) : la vidéo est découpée en une forme non rectangulaire. Angles asymétriques (petits
// en haut à gauche et en bas à droite, grands sur l'autre diagonale) et, en bas au centre, une encoche où se loge le
// champ SIREN. La forme suit la taille de l'écran et du champ. Sur téléphone : angles asymétriques seulement.
const scene = document.getElementById("hero-scene");
const fond = scene?.querySelector(".hero-fond");
const champ = scene?.querySelector(".recherche-champ");

/**
 * Chemin de la forme : W × H, rayons des quatre angles (hg, hd, bd, bg), encoche centrée en bas (largeur l,
 * profondeur p, rayon intérieur ri) ; sans encoche si l = 0. Sens des aiguilles d'une montre.
 */
export function cheminForme(W, H, { hg, hd, bd, bg }, { l = 0, p = 0, ri = 22 } = {}) {
  const c = [`M ${hg} 0`, `L ${W - hd} 0`, `A ${hd} ${hd} 0 0 1 ${W} ${hd}`, `L ${W} ${H - bd}`, `A ${bd} ${bd} 0 0 1 ${W - bd} ${H}`];
  if (l > 0 && p > 0) {
    const x1 = W / 2 + l / 2, x0 = W / 2 - l / 2;
    c.push(`L ${x1 + ri} ${H}`, `A ${ri} ${ri} 0 0 1 ${x1} ${H - ri}`, `L ${x1} ${H - p + ri}`, `A ${ri} ${ri} 0 0 0 ${x1 - ri} ${H - p}`,
      `L ${x0 + ri} ${H - p}`, `A ${ri} ${ri} 0 0 0 ${x0} ${H - p + ri}`, `L ${x0} ${H - ri}`, `A ${ri} ${ri} 0 0 1 ${x0 - ri} ${H}`);
  }
  c.push(`L ${bg} ${H}`, `A ${bg} ${bg} 0 0 1 0 ${H - bg}`, `L 0 ${hg}`, `A ${hg} ${hg} 0 0 1 ${hg} 0`, "Z");
  return c.join(" ");
}

function dessiner() {
  if (!scene || !fond) return;
  const W = fond.clientWidth, H = fond.clientHeight;
  if (!W || !H) return;
  const telephone = W < 700;
  const rayons = telephone ? { hg: 22, hd: 64, bd: 22, bg: 64 } : { hg: 40, hd: 120, bd: 40, bg: 120 };
  let encoche = {};
  if (!telephone && champ) {
    const ecart = 14, l = Math.min(W - 2 * (rayons.bg + 40), champ.offsetWidth + 2 * ecart), p = champ.offsetHeight + 2 * ecart;
    encoche = { l, p, ri: 22 };
    scene.style.setProperty("--encoche-p", `${p}px`);
  } else scene.style.removeProperty("--encoche-p");
  fond.style.clipPath = `path('${cheminForme(W, H, rayons, encoche)}')`;
}

if (scene && fond) {
  const ro = new ResizeObserver(dessiner);
  ro.observe(fond); if (champ) ro.observe(champ);
  window.addEventListener("load", dessiner);
  dessiner();
}
