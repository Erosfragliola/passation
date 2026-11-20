// Shared behaviors of the site: mobile menu, reveals on scroll, year.
(() => {
  document.documentElement.classList.remove("sans-js");
  // Texts: dictionary placed by the Worker (<script id="i18n">, "commun" namespace); classic script, without import.
  let T = {};
  try { T = JSON.parse(document.getElementById("i18n")?.textContent || "{}").commun?.site || {}; } catch { /* page without a dictionary */ }

  // Development: home page content still to provide (empty keys of src/contenu/cles.json and of the "cles" in src/contenu/<language>/accueil.json)
  const manquants = document.documentElement.dataset.contenuManquant;
  if (manquants) console.warn(`Contenu à fournir (src/contenu/cles.json, ou « cles » de src/contenu/<langue>/accueil.json) : ${manquants.split(" ").join(", ")}`); // i18n:ignorer-ligne (development only)

  // Language switcher: the choice is remembered ("langue" cookie, read by the Worker on the home page); the page's
  // anchor follows (the Worker does not know it).
  document.querySelectorAll("a[data-langue]").forEach((a) => a.addEventListener("click", () => {
    document.cookie = `langue=${a.dataset.langue}; path=/; max-age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (location.hash) a.href = a.href.split("#")[0] + location.hash;
  }));

  // Mobile menu
  const bouton = document.querySelector(".nav-bouton");
  const menu = document.getElementById("nav-mobile");
  if (bouton && menu) {
    const fermer = () => { menu.hidden = true; bouton.setAttribute("aria-expanded", "false"); bouton.setAttribute("aria-label", T.menu_ouvrir); };
    bouton.addEventListener("click", () => {
      const ouvert = bouton.getAttribute("aria-expanded") === "true";
      if (ouvert) return fermer();
      menu.hidden = false;
      bouton.setAttribute("aria-expanded", "true");
      bouton.setAttribute("aria-label", T.menu_fermer);
    });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) fermer(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(); });
  }

  // Light reveals on scroll (disabled if the user reduces motion)
  const elements = document.querySelectorAll(".apparait");
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // the hero video: js/landing/video.js
  if (reduit || !("IntersectionObserver" in window)) {
    elements.forEach((el) => el.classList.add("visible"));
  } else {
    const obs = new IntersectionObserver((entrees) => {
      entrees.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    elements.forEach((el) => obs.observe(el));
  }

  // Links that lead back to the search field
  document.querySelectorAll("[data-focus]").forEach((lien) => {
    lien.addEventListener("click", () => {
      const cible = document.querySelector(lien.dataset.focus);
      if (cible) setTimeout(() => cible.focus({ preventScroll: true }), 400);
    });
  });

  // Confirmation after a file is deleted
  if (new URLSearchParams(location.search).has("dossier-supprime")) {
    const m = document.createElement("p");
    m.className = "message-flottant";
    m.setAttribute("role", "status");
    m.textContent = T.dossier_supprime;
    document.body.append(m);
    setTimeout(() => m.remove(), 6000);
    history.replaceState(null, "", location.pathname);
  }

  document.querySelectorAll("[data-annee]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
