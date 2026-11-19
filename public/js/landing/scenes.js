// Petites scènes animées de l'accueil (étapes de « Comment ça marche », tampon de la confidentialité) : chacune se
// joue quand elle entre dans l'écran. Le CSS décrit l'état final par défaut (ce que l'on voit sans JavaScript ou avec
// « réduire les animations ») ; « scene-attente » pose l'état de départ, « scene-joue » lance les animations, qui
// finissent sur l'état final. Les scènes sœurs (les trois étapes) s'enchaînent : la suivante attend la fin de la
// précédente, ce qui donne un parcours 1 → 2 → 3 sur ordinateur ; sur téléphone, elles entrent l'une après l'autre.
const DUREE_SCENE = 2100; // ms : durée de l'animation d'une étape, trait de liaison compris

const reduit = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Moment (ms, horloge `maintenant`) où chaque scène doit démarrer : pas avant la fin de la précédente du même groupe. */
export function planifier(departs, maintenant, duree = DUREE_SCENE, libreA = 0) {
  return departs.map(() => {
    const debut = Math.max(maintenant, libreA);
    libreA = debut + duree;
    return debut;
  });
}

/** Rejoue une scène depuis son état de départ (au clic). */
export function rejouer(scene) {
  if (reduit()) return;
  scene.classList.remove("scene-joue");
  scene.classList.add("scene-attente");
  void scene.offsetWidth; // force le navigateur à repartir de l'état de départ
  scene.classList.replace("scene-attente", "scene-joue");
}

export function lancerScenes(racine = document) {
  const scenes = [...racine.querySelectorAll("[data-scene]")];
  if (!scenes.length || !("IntersectionObserver" in window) || reduit()) return;
  const libre = new WeakMap(); // parent → moment où la scène suivante du groupe peut démarrer
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

/** Étapes : l'argumentaire est replié ; un clic sur le titre (ou sur l'illustration) le déplie et rejoue la scène. */
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
