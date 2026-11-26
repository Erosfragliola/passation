// Reveals on scroll: titles and cards of the sections after the story appear smoothly
// (opacity and slight vertical offset, never the layout: no layout shift).
// Nothing without IntersectionObserver, nor when the visitor asked for reduced motion; what is already on
// screen (or above) at load time stays visible immediately. The hero, the result and the story have their
// own animations and are not affected.
const CIBLES = [
  "#comment .surtitre", "#comment h2", "#comment .parcours-etape",
  "#livrables h2", "#livrables .chapo", "#livrables .bento-bloc",
  "#questions .surtitre", "#questions h2", "#questions .faq > *",
];
const PAS = 70;       // ms between two elements of the same group
const RETARD_MAX = 5; // beyond that, the rest of the group arrives together

export function lancerApparitions() {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const obs = new IntersectionObserver((entrees) => {
    for (const e of entrees) if (e.isIntersecting) { e.target.classList.add("apparu"); obs.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  const rangs = new Map();
  for (const el of CIBLES.flatMap((s) => [...document.querySelectorAll(s)])) {
    if (el.getBoundingClientRect().top < innerHeight) continue; // already seen or on screen: no effect
    const n = rangs.get(el.parentElement) ?? 0;
    rangs.set(el.parentElement, n + 1);
    el.style.setProperty("--retard", `${Math.min(n, RETARD_MAX) * PAS}ms`);
    el.classList.add("a-apparaitre");
    obs.observe(el);
  }
}
