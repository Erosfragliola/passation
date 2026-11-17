// Apparitions au défilement : titres et cartes des sections situées après l'histoire apparaissent en douceur
// (opacité et léger décalage vertical, jamais la mise en page : aucun décalage de mise en page).
// Rien sans IntersectionObserver, ni quand le visiteur a demandé à réduire les animations ; ce qui est déjà à
// l'écran (ou au-dessus) au chargement reste visible tout de suite. Le hero, le résultat et l'histoire ont leurs
// propres animations et ne sont pas concernés.
const CIBLES = [
  "#comment .surtitre", "#comment h2", "#comment .onglets", "#comment .etape-panneau:not([hidden])",
  "#pourquoi .surtitre", "#pourquoi h2", "#pourquoi .pourquoi-cartes > *", "#pourquoi .pourquoi-sources",
  "#confidentialite .confid-texte > *", "#confidentialite .confid-dossier",
  "#questions .surtitre", "#questions h2", "#questions .faq > *",
  "#relance .carte-relance",
];
const PAS = 70;       // ms entre deux éléments d'un même groupe
const RETARD_MAX = 5; // au-delà, tout le reste du groupe arrive ensemble

export function lancerApparitions() {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const obs = new IntersectionObserver((entrees) => {
    for (const e of entrees) if (e.isIntersecting) { e.target.classList.add("apparu"); obs.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  const rangs = new Map();
  for (const el of CIBLES.flatMap((s) => [...document.querySelectorAll(s)])) {
    if (el.getBoundingClientRect().top < innerHeight) continue; // déjà vu ou à l'écran : pas d'effet
    const n = rangs.get(el.parentElement) ?? 0;
    rangs.set(el.parentElement, n + 1);
    el.style.setProperty("--retard", `${Math.min(n, RETARD_MAX) * PAS}ms`);
    el.classList.add("a-apparaitre");
    obs.observe(el);
  }
}
