// Comportements de démonstration des maquettes (non servies) : montants formatés en direct, curseur synchronisé,
// limite « une à trois réponses », faits repliés. Rien n'est enregistré.
const fmt = new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 });
const lire = (s) => { const n = Number(String(s).replace(/[^\d-]/g, "")); return String(s).trim() === "" || Number.isNaN(n) ? null : n; };

for (const bloc of document.querySelectorAll("[data-montant]")) {
  const champ = bloc.querySelector("input[type=text]"), curseur = bloc.querySelector("input[type=range]");
  const unite = bloc.dataset.montant; // « € » ou « % »
  const texte = (n) => (unite === "%" ? `${fmt.format(n)} %` : `${fmt.format(n)} €`);
  const peindre = () => { const p = ((curseur.value - curseur.min) / (curseur.max - curseur.min)) * 100; curseur.style.setProperty("--p", `${p}%`); curseur.setAttribute("aria-valuetext", texte(Number(curseur.value))); };
  champ.addEventListener("input", () => {
    // Séparateurs de milliers en direct, curseur aligné ; le curseur garde la position du chiffre tapé
    const fin = champ.value.length - champ.selectionStart;
    const n = lire(champ.value);
    champ.value = n == null ? "" : fmt.format(n);
    champ.setSelectionRange(champ.value.length - fin, champ.value.length - fin);
    if (n != null) { curseur.value = Math.min(Math.max(n, curseur.min), curseur.max); peindre(); }
    bloc.querySelector(".repere")?.classList.remove("propose");
  });
  curseur.addEventListener("input", () => { champ.value = fmt.format(Number(curseur.value)); peindre(); bloc.querySelector(".repere")?.classList.remove("propose"); });
  peindre();
}

for (const groupe of document.querySelectorAll("[data-max]")) {
  const max = Number(groupe.dataset.max), cases = [...groupe.querySelectorAll("input[type=checkbox]")];
  const compte = groupe.parentElement.querySelector(".compte-choix");
  const maj = () => {
    const n = cases.filter((c) => c.checked).length;
    for (const c of cases) c.disabled = !c.checked && n >= max;
    if (compte) compte.textContent = n >= max ? `${n} sur ${max} : décochez un choix pour en changer.` : `${n} sur ${max} au plus.`;
  };
  cases.forEach((c) => c.addEventListener("change", maj)); maj();
}

for (const b of document.querySelectorAll("[data-deplier]")) {
  const cible = document.getElementById(b.getAttribute("aria-controls"));
  b.addEventListener("click", () => { const ouvert = b.getAttribute("aria-expanded") === "true"; b.setAttribute("aria-expanded", String(!ouvert)); cible.hidden = ouvert; b.textContent = ouvert ? b.dataset.deplier : b.dataset.replier; });
}

for (const b of document.querySelectorAll("[data-retirer]")) b.addEventListener("click", () => b.closest("li").remove());

for (const grille of document.querySelectorAll("[data-photos]")) {
  const max = Number(grille.dataset.photos), cases = [...grille.querySelectorAll("input[type=checkbox]")];
  const compte = document.getElementById(grille.dataset.compte);
  const maj = () => { const n = cases.filter((c) => c.checked).length; for (const c of cases) c.disabled = !c.checked && n >= max; if (compte) compte.textContent = `${n} photo${n > 1 ? "s" : ""} choisie${n > 1 ? "s" : ""} sur ${max} au plus`; };
  cases.forEach((c) => c.addEventListener("change", maj)); maj();
}
