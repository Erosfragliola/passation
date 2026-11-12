// Comportements communs du site : menu mobile, apparitions au scroll, année.
(() => {
  document.documentElement.classList.remove("sans-js");

  // Développement : contenus de la page d'accueil encore à fournir (clés vides de src/contenu/landing.json)
  const manquants = document.documentElement.dataset.contenuManquant;
  if (manquants) console.warn(`Contenu à fournir (src/contenu/landing.json, « cles ») : ${manquants.split(" ").join(", ")}`);

  // Menu mobile
  const bouton = document.querySelector(".nav-bouton");
  const menu = document.getElementById("nav-mobile");
  if (bouton && menu) {
    const fermer = () => { menu.hidden = true; bouton.setAttribute("aria-expanded", "false"); bouton.setAttribute("aria-label", "Ouvrir le menu"); };
    bouton.addEventListener("click", () => {
      const ouvert = bouton.getAttribute("aria-expanded") === "true";
      if (ouvert) return fermer();
      menu.hidden = false;
      bouton.setAttribute("aria-expanded", "true");
      bouton.setAttribute("aria-label", "Fermer le menu");
    });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) fermer(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(); });
  }

  // Apparitions légères au scroll (désactivées si l'utilisateur réduit les animations)
  const elements = document.querySelectorAll(".apparait");
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduit || !("IntersectionObserver" in window)) {
    elements.forEach((el) => el.classList.add("visible"));
  } else {
    const obs = new IntersectionObserver((entrees) => {
      entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    elements.forEach((el) => obs.observe(el));
  }

  // Liens qui renvoient vers le champ de recherche
  document.querySelectorAll("[data-focus]").forEach((lien) => {
    lien.addEventListener("click", () => {
      const cible = document.querySelector(lien.dataset.focus);
      if (cible) setTimeout(() => cible.focus({ preventScroll: true }), 400);
    });
  });

  // Vidéo du hero : grand écran seulement, et jamais si l'utilisateur réduit les animations
  const video = document.querySelector(".hero-video");
  const connexion = navigator.connection || {};
  if (video && window.matchMedia("(min-width: 768px)").matches && !reduit && !connexion.saveData) {
    // 4K pour les écrans qui en profitent (Retina, 4K) avec une connexion rapide ; Full HD sinon
    const pixels = window.innerWidth * (window.devicePixelRatio || 1);
    const rapide = !connexion.effectiveType || connexion.effectiveType === "4g";
    const sources = pixels >= 2200 && rapide ? video.dataset.sourcesUhd : video.dataset.sourcesHd;
    JSON.parse(sources).forEach(([src, type]) => {
      const s = document.createElement("source");
      s.src = src; s.type = type;
      video.append(s);
    });
    video.hidden = false;
    video.addEventListener("playing", () => video.classList.add("lue"), { once: true });
    video.play().catch(() => { video.hidden = true; });
  }

  // Confirmation après suppression d'un dossier
  if (new URLSearchParams(location.search).has("dossier-supprime")) {
    const m = document.createElement("p");
    m.className = "message-flottant";
    m.setAttribute("role", "status");
    m.textContent = "Votre dossier et ses fichiers ont été supprimés.";
    document.body.append(m);
    setTimeout(() => m.remove(), 6000);
    history.replaceState(null, "", location.pathname);
  }

  document.querySelectorAll("[data-annee]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
