// The field never disappears: when the hero's field goes under the header (it leaves the readable area at the top),
// it appears in the header, centered (desktop) or on a second full-width line (phone, < 768 px),
// down to the bottom of the page. Class set on <html>: champ-en-haut.

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
  /** Immediate recalculation (without waiting for the observer), for example before giving focus to the field. */
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
