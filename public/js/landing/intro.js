// Intro (2,4 s au plus) : le seuil du logo se dessine, « Passation » apparaît, la porte s'allume, puis on entre
// par la porte (zoom exponentiel d'environ ×100 centré sur elle) et le hero apparaît à travers.
// Décidée avant le premier affichage par le script en tête de index.html (classe « avec-intro » sur <html>) :
// première visite de la session seulement, jamais avec « réduire les animations », ni avec une ancre ou des
// paramètres dans l'adresse. Se passe au clic, au toucher, au défilement ou à n'importe quelle touche.
// Ne retarde rien : le hero est déjà dans la page, dessous.

const racine = document.documentElement;
const intro = document.getElementById("intro");

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eOut = (x) => 1 - (1 - x) ** 3;
const eIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

const PORTE = { x: 16, y: 21 };   // centre de la porte, en unités du logo (viewBox 32 × 32)
const DUREE = 2.4;

if (intro && racine.classList.contains("avec-intro")) demarrer();
else intro?.remove();

function demarrer() {
  try { sessionStorage.setItem("passation-intro", "1"); } catch { /* navigation privée : l'intro rejouera */ }
  const zooms = intro.querySelectorAll(".intro-zoom");
  const traits = [...intro.querySelectorAll(".intro-trait")];
  const porte = intro.querySelector(".intro-porte");
  const trou = intro.querySelector(".intro-trou");
  const point = intro.querySelector(".intro-point");
  const nom = intro.querySelector(".intro-nom");
  const longueurs = traits.map((p) => p.getTotalLength());
  traits.forEach((p, i) => { p.style.strokeDasharray = `${longueurs[i]}`; p.style.strokeDashoffset = `${longueurs[i]}`; });

  let geometrie = null;
  // Logo : x de 5 à 27 et y de 8 à 27 (unités du logo) ; le nom à sa droite ; l'ensemble centré
  const mesurer = () => {
    const W = innerWidth, H = innerHeight;
    const s0 = Math.min(4.2, Math.max(2.8, W / 340));          // logo de 53 à 80 px de haut
    const largeurNom = nom.getBoundingClientRect().width;
    const ecart = 3.5 * s0;
    const gauche = (W - (22 * s0 + ecart + largeurNom)) / 2;
    geometrie = { s0, cx: gauche + (PORTE.x - 5) * s0, cy: H / 2 + (PORTE.y - 17.5) * s0 };
    nom.style.left = `${gauche + 22 * s0 + ecart}px`;
    nom.style.top = `${H / 2 - nom.offsetHeight / 2 + 2 * s0}px`;
  };
  mesurer();
  addEventListener("resize", mesurer);

  let debut = null, fin = false, raf = 0;
  function image(now) {
    if (fin) return;
    debut ??= now;
    const t = (now - debut) / 1000;
    const { s0, cx, cy } = geometrie;
    // 0 à 0,7 s : le contour se dessine
    const d = eOut(seg(t, 0, 0.7));
    traits.forEach((p, i) => { p.style.strokeDashoffset = `${longueurs[i] * (1 - d)}`; });
    // 0,45 à 0,75 s : « Passation » apparaît ; s'efface quand on entre
    nom.style.opacity = String(eOut(seg(t, 0.45, 0.75)) * (1 - seg(t, 1.2, 1.45)));
    // 0,7 à 1,0 s : la porte s'allume ; 1,2 à 1,6 s : la lumière laisse voir le hero à travers la porte
    const allume = eOut(seg(t, 0.7, 1.0));
    porte.setAttribute("opacity", String(0.95 * allume * (1 - seg(t, 1.25, 1.6))));
    point.setAttribute("opacity", String(allume * (1 - seg(t, 1.2, 1.4))));
    trou.setAttribute("opacity", String(seg(t, 1.2, 1.35)));
    // 1,2 à 2,2 s : zoom exponentiel (×100) centré sur la porte
    const z = eIO(seg(t, 1.2, 2.2));
    const s = s0 * 100 ** z;
    const tr = `translate(${cx} ${cy}) scale(${s}) translate(${-PORTE.x} ${-PORTE.y})`;
    zooms.forEach((g) => g.setAttribute("transform", tr));
    traits.forEach((p) => { p.style.opacity = String(1 - seg(t, 1.2, 1.45)); });
    if (t >= 2.2) intro.style.opacity = String(1 - seg(t, 2.2, DUREE));
    if (t >= DUREE) return terminer();
    raf = requestAnimationFrame(image);
  }

  function terminer(rapide = false) {
    if (fin) return;
    fin = true;
    cancelAnimationFrame(raf);
    removeEventListener("resize", mesurer);
    for (const [type, f] of passer) removeEventListener(type, f, true);
    const retirer = () => { intro.remove(); racine.classList.remove("avec-intro"); };
    if (rapide) {
      intro.style.transition = "opacity .2s ease";
      intro.style.opacity = "0";
      setTimeout(retirer, 220);
    } else retirer();
  }

  // Passer : clic, toucher, défilement, n'importe quelle touche
  const passerMaintenant = () => terminer(true);
  const passer = [["pointerdown", passerMaintenant], ["wheel", passerMaintenant], ["touchmove", passerMaintenant], ["keydown", passerMaintenant], ["scroll", passerMaintenant]];
  for (const [type, f] of passer) addEventListener(type, f, { capture: true, passive: true });
  intro.querySelector(".intro-passer")?.addEventListener("click", passerMaintenant);

  raf = requestAnimationFrame(image);
}
