// Le champ ne disparaît jamais : quand celui du hero passe sous la barre de navigation (il sort de la zone lisible
// par le haut), il passe dans la navigation (ordinateur, jusqu'en bas de la page) ou dans une barre fixe en bas
// (téléphone, ≤ 768 px), cachée quand le champ de la relance finale est visible.
// Classes posées sur <html> : champ-en-haut, champ-en-bas.

export function surveillerChamps({ hero, relance, auChangement = () => {} }) {
  const racine = document.documentElement;
  const telephone = window.matchMedia("(max-width: 768px)");
  const ligne = hero?.querySelector(".recherche-champ") || hero;
  const relanceLigne = relance?.querySelector(".recherche-champ") || relance;
  let heroPasse = false, relanceVue = false;

  const hautNav = () => Math.round(document.querySelector(".nav-zone")?.getBoundingClientRect().bottom || 0);
  const appliquer = () => {
    const avant = racine.className;
    racine.classList.toggle("champ-en-haut", heroPasse && !telephone.matches);
    racine.classList.toggle("champ-en-bas", heroPasse && telephone.matches && !relanceVue);
    if (racine.className !== avant) auChangement();
  };
  /** Recalcul immédiat (sans attendre les observateurs), par exemple avant de donner le focus au champ. */
  const actualiser = () => {
    if (!ligne) return;
    heroPasse = ligne.getBoundingClientRect().bottom <= hautNav();
    if (relanceLigne) { const r = relanceLigne.getBoundingClientRect(); relanceVue = r.bottom > 0 && r.top < innerHeight; }
    appliquer();
  };
  if (!ligne || !("IntersectionObserver" in window)) return { actualiser };

  let obs = null;
  const observer = () => {
    obs?.disconnect();
    obs = new IntersectionObserver(([e]) => {
      heroPasse = !e.isIntersecting && e.boundingClientRect.top < innerHeight / 2;
      appliquer();
    }, { rootMargin: `-${hautNav()}px 0px 0px 0px` });
    obs.observe(ligne);
  };
  observer();
  addEventListener("resize", () => { observer(); actualiser(); }, { passive: true });
  if (relanceLigne) new IntersectionObserver(([e]) => { relanceVue = e.isIntersecting; appliquer(); }).observe(relanceLigne);
  telephone.addEventListener("change", appliquer);

  // Clavier iOS : la barre du bas reste au-dessus du clavier (zone visible plus petite que la fenêtre)
  const vv = window.visualViewport;
  if (vv) {
    const caler = () => {
      const bas = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      racine.style.setProperty("--clavier", `${bas}px`);
    };
    vv.addEventListener("resize", caler);
    vv.addEventListener("scroll", caler);
  }
  return { actualiser };
}
