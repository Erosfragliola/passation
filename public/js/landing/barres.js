// Le champ ne disparaît jamais : quand celui du hero passe sous l'en-tête (il sort de la zone lisible par le haut),
// il apparaît dans l'en-tête, centré (ordinateur) ou sur une seconde ligne pleine largeur (téléphone, < 768 px),
// jusqu'en bas de la page. Classe posée sur <html> : champ-en-haut.

export function surveillerChamps({ hero, auChangement = () => {} }) {
  const racine = document.documentElement;
  const ligne = hero?.querySelector(".recherche-champ") || hero;
  let heroPasse = false;

  const hautEntete = () => Math.round(document.querySelector(".nav")?.getBoundingClientRect().bottom || 0);
  const appliquer = () => {
    const avant = racine.classList.contains("champ-en-haut");
    racine.classList.toggle("champ-en-haut", heroPasse);
    if (avant !== heroPasse) auChangement();
  };
  /** Recalcul immédiat (sans attendre l'observateur), par exemple avant de donner le focus au champ. */
  const actualiser = () => {
    if (!ligne) return;
    heroPasse = ligne.getBoundingClientRect().bottom <= hautEntete();
    appliquer();
  };
  if (!ligne || !("IntersectionObserver" in window)) return { actualiser };

  let obs = null;
  const observer = () => {
    obs?.disconnect();
    obs = new IntersectionObserver(([e]) => {
      heroPasse = !e.isIntersecting && e.boundingClientRect.top < innerHeight / 2;
      appliquer();
    }, { rootMargin: `-${hautEntete()}px 0px 0px 0px` });
    obs.observe(ligne);
  };
  observer();
  addEventListener("resize", () => { observer(); actualiser(); }, { passive: true });
  return { actualiser };
}
