// « Et la vôtre ? » : sur le dossier tel qu'il est à la fin de l'histoire, le nom fictif s'écrit, les bandeaux noirs
// le recouvrent, le tampon du nom de code tombe, le teaser anonyme s'affiche. Jouée une fois, quand le dossier est
// visible à 50 % ; état final direct en mouvement réduit. Données fictives, signalées comme telles.
import { creerDossier, couperNom } from "/js/landing/dossier.js";
import { etatDemo, DEMO } from "/js/landing/demo-etat.js";

const lire = (id) => { try { return JSON.parse(document.getElementById(id)?.textContent || "{}"); } catch { return {}; } };
const section = document.getElementById("essai");
const H = lire("textes-histoire"), D = lire("textes-demo");

if (section && H.chapitres) {
  const zone = section.querySelector(".essai-dossier");
  const avant = section.querySelector(".essai-avant"), apres = section.querySelector(".essai-apres");
  const dossier = creerDossier({ textes: H.dossier || {}, chapitres: H.chapitres, valeurLibelle: D.valeur_libelle });
  zone.append(dossier.element);
  dossier.definir({
    onglets: H.chapitres.map(() => ({ op: 1, dx: 0 })),
    nom: couperNom(D.nom), meta: D.meta,
    tampon: { nom: `Projet ${D.code}` },
    lignes: [D.secteur, D.region, D.anciennete, D.effectif].map((texte) => ({ texte })),
    pastille: { valeur: D.valeur }, mention: D.mention,
  });
  const appliquer = (t) => {
    const e = etatDemo(t);
    dossier.definir(e);
    if (e.apres > 0) {
      apres.hidden = false;
      apres.style.opacity = e.apres;
      avant.style.opacity = 1 - e.apres;
      avant.hidden = e.apres >= 1;
    }
  };
  appliquer(-1);

  // Fond et images chargés à l'approche
  const fond = section.querySelector("[data-fond]");
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    if (fond) fond.style.backgroundImage = `url("${fond.dataset.fond}")`;
  }, { rootMargin: "1500px 0px" }).observe(section);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) appliquer(DEMO.fin);
  else {
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      const t0 = performance.now();
      const pas = (now) => {
        const t = (now - t0) / 1000;
        appliquer(Math.min(t, DEMO.fin));
        if (t < DEMO.fin) requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    }, { threshold: 0.5 }).observe(zone);
  }
}
