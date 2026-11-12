// Champ « SIREN ou nom de votre société » : autocomplétion (motif combobox ARIA), validation du SIREN (clé de
// Luhn) et lancement de l'estimation. Phase 2 : le champ du hero ; la phase 3 le partage avec la barre de
// navigation, la barre fixe du bas sur téléphone et la relance finale.
import { sirenValide, nettoyerSiren, ressembleASiren, formaterSiren } from "/js/siren.js";
import { rechercher } from "/js/landing/estimation.js";

const MAX_SUGGESTIONS = 5;

/**
 * @param {HTMLFormElement} form
 * @param {{ estimer: (siren: string, suggestion?: object) => void, erreur: (code: string) => void, effacer: () => void }} actions
 */
export function monterChamp(form, actions) {
  const champ = form.querySelector('input[role="combobox"]');
  const liste = form.querySelector('[role="listbox"]');
  const etat = { suggestion: null, suggestions: [], actif: -1, minuterie: null, requete: 0 };

  function fermer() {
    liste.hidden = true;
    champ.setAttribute("aria-expanded", "false");
    champ.removeAttribute("aria-activedescendant");
  }
  function marquer() {
    [...liste.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === etat.actif)));
    if (etat.actif >= 0) champ.setAttribute("aria-activedescendant", liste.children[etat.actif].id);
    else champ.removeAttribute("aria-activedescendant");
  }
  function afficher(s) {
    etat.suggestions = s.slice(0, MAX_SUGGESTIONS);
    etat.actif = -1;
    liste.replaceChildren(...etat.suggestions.map((x, i) => {
      const li = document.createElement("li");
      li.id = `${liste.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const nom = document.createElement("span"); nom.className = "sugg-nom"; nom.textContent = x.nom;
      const info = document.createElement("span"); info.className = "sugg-info";
      const dep = /^\d{5}$/.test(x.code_postal || "") ? ` (${x.code_postal.startsWith("97") ? x.code_postal.slice(0, 3) : x.code_postal.slice(0, 2)})` : "";
      info.textContent = [x.ville ? `${x.ville}${dep}` : null, formaterSiren(x.siren)].filter(Boolean).join(" · ");
      li.append(nom, info);
      li.addEventListener("mousedown", (e) => { e.preventDefault(); choisir(x); });
      return li;
    }));
    liste.hidden = etat.suggestions.length === 0;
    champ.setAttribute("aria-expanded", String(etat.suggestions.length > 0));
  }
  function choisir(x) {
    etat.suggestion = x;
    champ.value = x.nom;
    fermer();
    actions.estimer(x.siren, x);
  }

  champ.addEventListener("input", () => {
    etat.suggestion = null;
    actions.effacer();
    const q = champ.value.trim();
    clearTimeout(etat.minuterie);
    if (q.length < 3 || ressembleASiren(q)) { etat.suggestions = []; return fermer(); }
    etat.minuterie = setTimeout(async () => {
      const n = ++etat.requete;
      const s = await rechercher(q);
      if (n !== etat.requete || champ.value.trim() !== q) return;   // une frappe plus récente l'emporte
      if (s) afficher(s); else fermer();
    }, 250);
  });
  champ.addEventListener("keydown", (e) => {
    if (liste.hidden || !etat.suggestions.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = etat.suggestions.length;
      etat.actif = (etat.actif + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      marquer();
    } else if (e.key === "Enter" && etat.actif >= 0) {
      e.preventDefault();
      choisir(etat.suggestions[etat.actif]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fermer();
    }
  });
  champ.addEventListener("blur", () => setTimeout(fermer, 150));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const brut = champ.value.trim();
    if (!brut) return actions.erreur("saisie_vide");
    if (ressembleASiren(brut)) {
      const siren = nettoyerSiren(brut);
      return sirenValide(siren) ? actions.estimer(siren) : actions.erreur("siren_invalide");
    }
    if (etat.suggestion) return actions.estimer(etat.suggestion.siren, etat.suggestion);
    if (etat.suggestions.length) return choisir(etat.suggestions[0]);
    if (brut.length < 3) return actions.erreur("saisie_vide");
    // Nom tapé puis validé avant l'arrivée des suggestions : on cherche, puis on prend la première
    clearTimeout(etat.minuterie);
    const s = await rechercher(brut);
    if (s === null) return actions.erreur("source_indisponible");
    if (!s.length) return actions.erreur("introuvable");
    choisir(s[0]);
  });

  return {
    champ,
    focaliser() { champ.focus({ preventScroll: true }); },
    vider() { champ.value = ""; etat.suggestion = null; etat.suggestions = []; fermer(); },
  };
}
