// Small animated scenes of the home page (steps of "How it works", confidentiality stamp): each one
// plays when it enters the screen. The CSS describes the final state by default (what is seen without JavaScript or with
// "reduce motion"); "scene-attente" sets the starting state, "scene-joue" starts the animations, which
// end on the final state. Sibling scenes (the three steps) follow each other: the next one waits for the end of the
// previous one, which gives a 1 → 2 → 3 sequence on desktop; on phones, they enter one after the other.
const DUREE_SCENE = 2100; // ms: duration of a step's animation, connecting line included

const reduit = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Moment (ms, `maintenant` clock) when each scene must start: not before the end of the previous one in the same group. */
export function planifier(departs, maintenant, duree = DUREE_SCENE, libreA = 0) {
  return departs.map(() => {
    const debut = Math.max(maintenant, libreA);
    libreA = debut + duree;
    return debut;
  });
}

/** Replays a scene from its starting state (on click). */
export function rejouer(scene) {
  if (reduit()) return;
  scene.classList.remove("scene-joue");
  scene.classList.add("scene-attente");
  void scene.offsetWidth; // forces the browser to restart from the starting state
  scene.classList.replace("scene-attente", "scene-joue");
}

export function lancerScenes(racine = document) {
  const scenes = [...racine.querySelectorAll("[data-scene]")];
  if (!scenes.length || !("IntersectionObserver" in window) || reduit()) return;
  const libre = new WeakMap(); // parent → moment when the next scene of the group can start
  const obs = new IntersectionObserver((entrees) => {
    const visibles = entrees.filter((e) => e.isIntersecting).map((e) => e.target)
      .sort((a, b) => scenes.indexOf(a) - scenes.indexOf(b));
    const maintenant = performance.now();
    for (const s of visibles) {
      obs.unobserve(s);
      const [debut] = planifier([s], maintenant, DUREE_SCENE, libre.get(s.parentElement) || 0);
      libre.set(s.parentElement, debut + DUREE_SCENE);
      setTimeout(() => s.classList.replace("scene-attente", "scene-joue"), debut - maintenant);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.35 });
  for (const s of scenes) { s.classList.add("scene-attente"); obs.observe(s); }
}

/** Steps: the pitch is collapsed; a click on the title (or on the illustration) expands it and replays the scene. */
export function lancerEtapes(racine = document) {
  for (const etape of racine.querySelectorAll(".parcours-etape")) {
    const bouton = etape.querySelector(".parcours-ouvrir");
    const detail = etape.querySelector(".parcours-detail");
    if (!bouton || !detail) continue;
    const ouvrir = (ouvert) => {
      bouton.setAttribute("aria-expanded", String(ouvert));
      etape.classList.toggle("repliee", !ouvert);
      detail.inert = !ouvert;
    };
    ouvrir(false);
    bouton.addEventListener("click", () => {
      const ouvert = bouton.getAttribute("aria-expanded") !== "true";
      ouvrir(ouvert);
      if (ouvert && etape.classList.contains("scene-joue")) rejouer(etape);
    });
    etape.querySelector(".parcours-scene")?.addEventListener("click", () => bouton.click());
  }
}
