// Champ « SIREN ou nom de votre société », partagé : hero, en-tête (centré sur ordinateur, seconde ligne sur
// téléphone) et relance finale. Une seule valeur, une seule soumission ; chaque emplacement a sa propre liste de
// suggestions (motif combobox ARIA : flèches, Entrée, Échap) et sa propre zone de message (aria-live).
import { sirenValide, nettoyerSiren, ressembleASiren } from "/js/siren.js";
import { rechercher, detailSuggestion } from "/js/landing/estimation.js";

const MAX_SUGGESTIONS = 5;

/**
 * @param {{ estimer: (siren: string) => void, textes: object }} options
 * @returns {{ monter: (form: HTMLFormElement) => object, focaliser: (emplacement?: string) => void, vider: () => void,
 *             dire: (texte: string, emplacement?: string) => void, montures: object[] }}
 */
export function creerChampPartage({ estimer, textes = {} }) {
  const montures = [];
  const partage = { suggestion: null, derniere: null };
  const erreur = (code) => textes.erreurs?.[code] || textes.erreurs?.source_indisponible || "";

  function dire(texte, nom = partage.derniere) {
    for (const m of montures) {
      const ici = m.nom === nom;
      m.message.textContent = ici ? texte || "" : "";
      m.message.hidden = !ici || !texte;
    }
  }

  function monter(form) {
    const champ = form.querySelector('input[role="combobox"]');
    const liste = form.querySelector('[role="listbox"]');
    const message = form.querySelector("[data-message]");
    const m = { nom: form.dataset.champSiren, form, champ, liste, message, suggestions: [], actif: -1, minuterie: null, requete: 0 };
    montures.push(m);

    const fermer = () => {
      liste.hidden = true;
      champ.setAttribute("aria-expanded", "false");
      champ.removeAttribute("aria-activedescendant");
    };
    const marquer = () => {
      [...liste.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === m.actif)));
      if (m.actif >= 0) champ.setAttribute("aria-activedescendant", liste.children[m.actif].id);
      else champ.removeAttribute("aria-activedescendant");
    };
    const afficher = (s) => {
      m.suggestions = s.slice(0, MAX_SUGGESTIONS);
      m.actif = -1;
      liste.replaceChildren(...m.suggestions.map((x, i) => {
        const li = document.createElement("li");
        li.id = `${liste.id}-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        const nom = document.createElement("span"); nom.className = "sugg-nom"; nom.textContent = x.nom;
        const info = document.createElement("span"); info.className = "sugg-info"; info.textContent = detailSuggestion(x);
        li.append(nom, info);
        li.addEventListener("mousedown", (e) => { e.preventDefault(); choisir(x); });
        return li;
      }));
      liste.hidden = m.suggestions.length === 0;
      champ.setAttribute("aria-expanded", String(m.suggestions.length > 0));
      if (!liste.hidden && m.nom !== "nav") requestAnimationFrame(devoiler);
    };
    // Liste sous le bord de la fenêtre : la page défile juste assez pour la montrer entière, sans faire passer le
    // champ sous l'en-tête (il reste lisible, et celui de l'en-tête ne prend pas le relais).
    // Dans une carte collante (data-liste-bornee), défiler ne déplacerait pas le champ : la liste tient dans la carte.
    const devoiler = () => {
      const borne = form.closest("[data-liste-bornee]");
      liste.style.maxHeight = "";
      if (borne) {
        const dispo = Math.min(innerHeight, borne.getBoundingClientRect().bottom) - liste.getBoundingClientRect().top - 12;
        if (liste.scrollHeight > dispo) liste.style.maxHeight = `${Math.max(150, Math.floor(dispo))}px`;
        return;
      }
      const deborde = liste.getBoundingClientRect().bottom + 12 - innerHeight;
      const marge = champ.getBoundingClientRect().top - (document.querySelector(".nav")?.getBoundingClientRect().bottom || 0) - 12;
      const dy = Math.min(deborde, marge);
      if (dy > 0) scrollBy({ top: dy, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    const choisir = (x) => {
      partage.suggestion = x;
      synchroniser(x.nom);
      fermer();
      lancer(x.siren);
    };
    const lancer = (siren) => { partage.derniere = m.nom; estimer(siren, m.nom); };

    champ.addEventListener("input", () => {
      partage.suggestion = null;
      partage.derniere = m.nom;
      synchroniser(champ.value, m);
      dire("");
      const q = champ.value.trim();
      clearTimeout(m.minuterie);
      if (q.length < 3 || ressembleASiren(q)) { m.suggestions = []; return fermer(); }
      m.minuterie = setTimeout(async () => {
        const n = ++m.requete;
        const s = await rechercher(q);
        if (n !== m.requete || champ.value.trim() !== q) return;   // une frappe plus récente l'emporte
        if (s) afficher(s); else fermer();
      }, 250);
    });
    champ.addEventListener("keydown", (e) => {
      if (liste.hidden || !m.suggestions.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = m.suggestions.length;
        m.actif = (m.actif + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        marquer();
      } else if (e.key === "Enter" && m.actif >= 0) {
        e.preventDefault();
        choisir(m.suggestions[m.actif]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        fermer();
      }
    });
    champ.addEventListener("blur", () => setTimeout(fermer, 150));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      partage.derniere = m.nom;
      const brut = champ.value.trim();
      if (!brut) return dire(erreur("saisie_vide"));
      if (ressembleASiren(brut)) {
        const siren = nettoyerSiren(brut);
        return sirenValide(siren) ? lancer(siren) : dire(erreur("siren_invalide"));
      }
      if (partage.suggestion) return lancer(partage.suggestion.siren);
      if (m.suggestions.length) return choisir(m.suggestions[0]);
      if (brut.length < 3) return dire(erreur("saisie_vide"));
      // Nom tapé puis validé avant l'arrivée des suggestions : on cherche, puis on prend la première
      clearTimeout(m.minuterie);
      const s = await rechercher(brut);
      if (s === null) return dire(erreur("source_indisponible"));
      if (!s.length) return dire(erreur("introuvable"));
      choisir(s[0]);
    });
    m.fermer = fermer;
    return m;
  }

  /** Même valeur dans tous les champs (sans relancer leurs suggestions). */
  function synchroniser(valeur, sauf = null) {
    for (const x of montures) if (x !== sauf && x.champ.value !== valeur) x.champ.value = valeur;
  }

  /** Place le curseur dans le champ visible : celui de l'en-tête en priorité, sinon le hero. */
  function focaliser(prefere) {
    const racine = document.documentElement;
    const visible = (x) => {
      if (x.nom === "nav") return racine.classList.contains("champ-en-haut");
      const r = x.champ.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const ordre = ["nav", "relance", "histoire", "accueil"];
    const choisi = (prefere && montures.find((x) => x.nom === prefere && visible(x)))
      || ordre.map((n) => montures.find((x) => x.nom === n)).find((x) => x && visible(x));
    if (choisi) { choisi.champ.focus({ preventScroll: true }); return; }
    const accueil = montures.find((x) => x.nom === "accueil");
    if (!accueil) return;
    accueil.form.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    setTimeout(() => accueil.champ.focus({ preventScroll: true }), 450);
  }

  function vider() {
    partage.suggestion = null;
    for (const x of montures) { x.champ.value = ""; x.suggestions = []; x.fermer(); }
    dire("");
  }

  /** Ferme toutes les listes de suggestions (le champ change de place pendant le défilement). */
  const fermerListes = () => montures.forEach((x) => x.fermer?.());

  return { monter, focaliser, vider, dire, fermerListes, montures };
}
