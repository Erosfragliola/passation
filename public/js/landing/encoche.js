// Hero : la vidéo (.hero-fond) est découpée d'une encoche en bas à droite, à la taille de la carte qui s'y loge
// (#hero-encoche), avec des angles rentrants arrondis. Recalculée à chaque changement de taille. Sur téléphone, la
// carte n'est plus positionnée en absolu : pas de découpe, elle se pose sur le bas de la vidéo.
const hero = document.getElementById("accueil");
const fond = hero?.querySelector(".hero-fond");
const carte = document.getElementById("hero-encoche");

function decouper() {
  if (!hero || !fond || !carte) return;
  if (getComputedStyle(carte).position !== "absolute") { fond.style.clipPath = ""; fond.classList.remove("decoupee"); return; }
  const W = fond.clientWidth, H = fond.clientHeight;
  if (!W || !H) return;
  const r = Math.min(30, parseFloat(getComputedStyle(fond).borderTopLeftRadius) || 30), ecart = 14;
  const c = carte.offsetWidth + ecart, d = carte.offsetHeight + ecart;
  fond.classList.add("decoupee");
  fond.style.clipPath = `path('M ${r} 0 L ${W - r} 0 A ${r} ${r} 0 0 1 ${W} ${r} L ${W} ${H - d - r} A ${r} ${r} 0 0 1 ${W - r} ${H - d} `
    + `L ${W - c + r} ${H - d} A ${r} ${r} 0 0 0 ${W - c} ${H - d + r} L ${W - c} ${H - r} A ${r} ${r} 0 0 1 ${W - c - r} ${H} `
    + `L ${r} ${H} A ${r} ${r} 0 0 1 0 ${H - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z')`;
}

if (hero && fond && carte) {
  new ResizeObserver(decouper).observe(hero);
  new ResizeObserver(decouper).observe(carte);
  window.addEventListener("load", decouper);
  decouper();
}
