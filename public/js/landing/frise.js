// « Comment ça marche » en frise : les trois étapes sont toujours visibles (plus d'onglets). Ce module ne fait que le
// visuel de l'étape 3 : les neuf clés de l'histoire sous leurs étiquettes retournées (les neuf chapitres), sur deux
// rangées (5 + 4), mises à l'échelle de leur zone.
import { creerGrilleCles, chargerImages } from "/js/landing/histoire.js";

const LARGEUR = 5 * 124 + 4 * 10;   // cinq étiquettes de 124 px, 10 px entre elles
const HAUTEUR = 2 * 330;            // deux rangées de clés

export function lancerFriseCles(section, { chapitres = [] } = {}) {
  const zone = section?.querySelector("[data-rangee-cles]");
  if (!zone || !chapitres.length) return;
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    const grille = creerGrilleCles(chapitres, "comment-cles");
    zone.append(grille);
    chargerImages(zone);
    const echelle = () => {
      const cs = getComputedStyle(zone);
      const l = zone.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = zone.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (l > 0 && h > 0) grille.style.zoom = String(Math.min(1, l / LARGEUR, h / HAUTEUR));
    };
    new ResizeObserver(echelle).observe(zone);
    echelle();
  }, { rootMargin: "800px 0px" }).observe(section);
}
