// « Comment ça marche » en trois onglets (motif ARIA tabs) : clic, flèches gauche et droite, Début et Fin, focus
// visible ; l'onglet actif est vert. Sans JavaScript, la liste d'onglets reste cachée et les trois étapes se suivent.
// L'événement « ouvrir-etape » (liens #comment-1, -2, -3, déclenchés par landing.js) ouvre la bonne étape.
// Visuel de l'étape 3 : les neuf clés de l'histoire, alignées sous leurs étiquettes retournées.
import { creerGrilleCles, chargerImages } from "/js/landing/histoire.js";

const LARGEUR_RANGEE = 9 * 124 + 8 * 10;   // neuf étiquettes de 124 px, 10 px entre elles

export function lancerOnglets(section, { chapitres = [] } = {}) {
  const liste = section?.querySelector('[role="tablist"]');
  if (!liste) return;
  const onglets = [...liste.querySelectorAll('[role="tab"]')];
  const panneaux = onglets.map((o) => document.getElementById(o.getAttribute("aria-controls")));

  function choisir(i, { focus = false } = {}) {
    onglets.forEach((o, j) => {
      const actif = i === j;
      o.setAttribute("aria-selected", String(actif));
      o.tabIndex = actif ? 0 : -1;
      panneaux[j].hidden = !actif;
    });
    if (focus) onglets[i].focus();
  }
  liste.hidden = false;
  section.classList.add("avec-onglets");
  choisir(0);
  onglets.forEach((o, i) => o.addEventListener("click", () => choisir(i)));
  liste.addEventListener("keydown", (e) => {
    const i = onglets.indexOf(document.activeElement);
    if (i < 0) return;
    const n = onglets.length;
    const cible = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (cible == null) return;
    e.preventDefault();
    choisir(cible, { focus: true });
  });
  document.addEventListener("ouvrir-etape", (e) => { const i = Number(e.detail) - 1; if (onglets[i]) choisir(i); });

  // Rangée des clés : construite à l'approche de la section, mise à l'échelle de sa zone
  const zone = section.querySelector("[data-rangee-cles]");
  if (!zone || !chapitres.length) return;
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    const rangee = creerGrilleCles(chapitres, "rangee-grille");
    zone.append(rangee);
    chargerImages(zone);
    const echelle = () => {
      const cs = getComputedStyle(zone);
      const dispo = zone.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (dispo > 0) rangee.style.zoom = String(Math.min(1, dispo / LARGEUR_RANGEE));
    };
    new ResizeObserver(echelle).observe(zone);
    echelle();
  }, { rootMargin: "800px 0px" }).observe(section);
}
