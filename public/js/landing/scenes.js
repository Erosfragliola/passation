// Petites scènes animées de l'accueil (étapes de « Comment ça marche », tampon de la confidentialité) : chacune se
// joue une seule fois, quand elle entre dans l'écran. Le CSS décrit l'état final par défaut (ce que l'on voit sans
// JavaScript ou avec « réduire les animations ») ; « scene-attente » pose l'état de départ, « scene-joue » lance les
// animations, qui finissent sur l'état final. Une scène déjà à l'écran au chargement se joue tout de suite.
export function lancerScenes(racine = document) {
  const scenes = [...racine.querySelectorAll("[data-scene]")];
  if (!scenes.length || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const obs = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      e.target.classList.replace("scene-attente", "scene-joue");
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.35 });
  for (const s of scenes) { s.classList.add("scene-attente"); obs.observe(s); }
}
