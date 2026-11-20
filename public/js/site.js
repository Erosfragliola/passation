// Comportements communs du site : menu mobile, apparitions au scroll, année.
(() => {
  document.documentElement.classList.remove("sans-js");

  // Développement : contenus de la page d'accueil encore à fournir (clés vides de src/contenu/cles.json et des « cles » de src/contenu/<langue>/accueil.json)
  const manquants = document.documentElement.dataset.contenuManquant;
  if (manquants) console.warn(`Contenu à fournir (src/contenu/cles.json, ou « cles » de src/contenu/<langue>/accueil.json) : ${manquants.split(" ").join(", ")}`);

  // Sélecteur de langue : le choix est mémorisé (cookie « langue », lu par le Worker sur la page d'accueil) ; l'ancre
  // de la page suit (le Worker ne la connaît pas).
  document.querySelectorAll("a[data-langue]").forEach((a) => a.addEventListener("click", () => {
    document.cookie = `langue=${a.dataset.langue}; path=/; max-age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (location.hash) a.href = a.href.split("#")[0] + location.hash;
  }));

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
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // la vidéo du hero : js/landing/video.js
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
