// « Votre maquette » et « Vous avez bâti » : orchestration de la landing.
// Le dirigeant saisit son SIREN (ou choisit sa société) ; la maquette se construit, la frise s'écrit,
// le témoin se pose, la fourchette apparaît. Rien n'est enregistré côté serveur sans compte.

import { parametresMaquette, redigerFrise } from "/js/regles.js";

const $ = (s, r = document) => r.querySelector(s);
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const euros = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`;
  return `${Math.round(v / 1000).toLocaleString("fr-FR")} k€`;
};

const section = $("#maquette");
const conteneur3d = $("[data-maquette]");
const form = $("form.recherche");
const champ = $("#q");
const liste = $("#suggestions");
const etat = { scene: null, sceneChargee: null, donnees: null, suggestion: null, suggestions: [], actif: -1 };

// ------------------------------------------------------------------ Chargement de la scène 3D
function chargerScene() {
  if (!etat.sceneChargee) {
    etat.sceneChargee = import("/js/scene.js")
      .then(({ creerScene }) => { etat.scene = creerScene(conteneur3d); if (!etat.scene) sansWebGL(); return etat.scene; })
      .catch(() => { sansWebGL(); return null; });
  }
  return etat.sceneChargee;
}
if (conteneur3d && "IntersectionObserver" in window) {
  const obs = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { obs.disconnect(); chargerScene(); } }, { rootMargin: "400px 0px" });
  obs.observe(conteneur3d);
}
function sansWebGL() {
  conteneur3d.classList.add("sans-3d");
  $("#btn-telecharger")?.setAttribute("hidden", "");
}

// ------------------------------------------------------------------ Autocomplétion (motif combobox ARIA)
let minuterie = null;
champ?.addEventListener("input", () => {
  etat.suggestion = null;
  const q = champ.value.trim();
  clearTimeout(minuterie);
  if (q.length < 3 || /^[\d\s]+$/.test(q)) return fermerListe();
  minuterie = setTimeout(async () => {
    try {
      const r = await fetch(`/api/company/search?q=${encodeURIComponent(q)}`);
      const { suggestions = [] } = await r.json();
      if (champ.value.trim() !== q) return;
      afficherSuggestions(suggestions);
    } catch { fermerListe(); }
  }, 250);
});
champ?.addEventListener("keydown", (e) => {
  if (liste.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = etat.suggestions.length;
    etat.actif = (etat.actif + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    marquerActif();
  } else if (e.key === "Enter" && etat.actif >= 0) {
    e.preventDefault();
    choisir(etat.suggestions[etat.actif]);
  } else if (e.key === "Escape") fermerListe();
});
champ?.addEventListener("blur", () => setTimeout(fermerListe, 150));

function afficherSuggestions(s) {
  etat.suggestions = s;
  etat.actif = -1;
  liste.replaceChildren(...s.map((x, i) => {
    const li = document.createElement("li");
    li.id = `sugg-${i}`;
    li.setAttribute("role", "option");
    const nom = document.createElement("span"); nom.className = "sugg-nom"; nom.textContent = x.nom;
    const info = document.createElement("span"); info.className = "sugg-info";
    info.textContent = [x.ville, x.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")].filter(Boolean).join(" · ");
    li.append(nom, info);
    li.addEventListener("mousedown", (e) => { e.preventDefault(); choisir(x); });
    return li;
  }));
  liste.hidden = s.length === 0;
  champ.setAttribute("aria-expanded", String(s.length > 0));
}
function marquerActif() {
  [...liste.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === etat.actif)));
  champ.setAttribute("aria-activedescendant", etat.actif >= 0 ? `sugg-${etat.actif}` : "");
}
function fermerListe() {
  if (!liste) return;
  liste.hidden = true;
  champ.setAttribute("aria-expanded", "false");
  champ.removeAttribute("aria-activedescendant");
}
function choisir(x) {
  etat.suggestion = x;
  champ.value = x.nom;
  fermerListe();
  lancer(x.siren);
}

// ------------------------------------------------------------------ Lancement
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const brut = champ.value.replace(/\s+/g, "");
  if (/^\d{9}$/.test(brut)) return lancer(brut);
  if (etat.suggestion) return lancer(etat.suggestion.siren);
  if (etat.suggestions.length) return choisir(etat.suggestions[0]);
  message("Saisissez un SIREN à 9 chiffres, ou choisissez votre société dans la liste.", true);
});

async function lancer(siren) {
  etat.scene?.terminer?.();
  section.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
  message("");
  const scene = await chargerScene();
  scene?.respirer(true);
  $("#maquette-resultat").setAttribute("aria-busy", "true");
  let d;
  try {
    const r = await fetch(`/api/maquette/${siren}`);
    d = await r.json();
    if (!r.ok) throw new Error(d.message || "Erreur");
  } catch (err) {
    scene?.respirer(false);
    $("#maquette-resultat").removeAttribute("aria-busy");
    return message(err.message === "Failed to fetch" ? "Connexion impossible. Vérifiez votre réseau et réessayez." : err.message, true);
  }
  etat.donnees = d;
  afficher(d, scene);
}

// ------------------------------------------------------------------ Affichage du résultat
function afficher(d, scene, { depuisEtages = false } = {}) {
  const p = parametresMaquette(d);
  const lignes = redigerFrise(d);
  $("#maquette-intro").hidden = true;
  const res = $("#maquette-resultat");
  res.hidden = false;
  res.removeAttribute("aria-busy");
  $("#maquette-etiquette").textContent = "Votre maquette";
  const titre = $("#titre-maquette");
  titre.replaceChildren("Vous avez bâti ", Object.assign(document.createElement("em"), { textContent: d.nom }), ".");

  // Frise : vrai texte HTML, lignes révélées au rythme de la construction
  const ol = $("#frise");
  if (!depuisEtages) {
    ol.replaceChildren(...lignes.map((l) => {
      const li = document.createElement("li");
      const date = document.createElement("span"); date.className = "frise-date"; date.textContent = l.date;
      const texte = document.createElement("span"); texte.className = "frise-texte"; texte.textContent = l.texte;
      li.append(date, texte);
      return li;
    }));
  }
  const items = [...ol.children];
  const animer = scene && !reduit();
  items.forEach((li) => li.classList.toggle("visible", !animer || depuisEtages));

  const absents = $("#comptes-absents");
  absents.hidden = !p.comptesManquants;
  const blocEstimation = $("#estimation");
  blocEstimation.hidden = true;

  const evenements = animer && !depuisEtages
    ? items.map((li, i) => ({ t: 1.2 + (i / Math.max(1, items.length - 1)) * 3.3, f: () => li.classList.add("visible") }))
    : [];
  const montrerEstimation = () => afficherEstimation(d.estimation, !!animer);
  if (scene) {
    scene.construire({ ...p }, { evenements: [...evenements, { t: 5.5, f: montrerEstimation }], depuisEtages });
  } else {
    dessinerSansWebGL(p);
    montrerEstimation();
  }
}

function afficherEstimation(est, animer) {
  const bloc = $("#estimation");
  const valeur = $("#estimation-valeur");
  const legende = $("#estimation-legende");
  const note = $("#estimation-note");
  bloc.hidden = false;
  note.textContent = "";
  if (!est || est.statut === "comptes_absents") { bloc.hidden = true; return; }
  const x = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "x";
  if (est.statut === "non_calculable") {
    valeur.textContent = "Sur mesure";
    legende.textContent = `Comptes ${est.exercice} lus.`;
    note.textContent = "La méthode express s'appuie sur l'EBE du dernier exercice ; elle ne s'applique pas ici. La valorisation approfondie tient compte de vos retraitements et de vos perspectives.";
    return;
  }
  if (est.statut !== "ok") {
    valeur.textContent = "À compléter";
    legende.textContent = `Comptes ${est.exercice} lus.`;
    note.textContent = "Nous n'affichons pas de fourchette sans référence sectorielle fiable pour votre activité. La valorisation approfondie s'appuie sur vos propres chiffres.";
    return;
  }
  legende.textContent = `Valeur d'entreprise estimée · comptes ${est.exercice}`;
  note.textContent = `Multiples retenus : ${x(est.multiples.bas)} à ${x(est.multiples.haut)} l'EBE (central ${x(est.multiples.central)}). Valeur avant dette nette : la valeur de vos titres dépend aussi de votre trésorerie et de vos dettes.`;
  if (est.avertissement) note.textContent += " " + est.avertissement;
  const fin = [est.bas, est.haut];
  if (!animer) { valeur.textContent = `${euros(fin[0])} – ${euros(fin[1])}`; return; }
  const t0 = performance.now();
  const pas = (t) => {
    const p = Math.min(1, (t - t0) / 600);
    const e = 1 - Math.pow(1 - p, 3);
    valeur.textContent = `${euros(fin[0] * e)} – ${euros(fin[1] * e)}`;
    if (p < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

// ------------------------------------------------------------------ Comptes non publiés : saisie du dirigeant
$("#form-comptes")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ca = Number($("#saisie-ca").value) * 1000;
  const ebe = $("#saisie-ebe").value === "" ? null : Number($("#saisie-ebe").value) * 1000;
  if (!Number.isFinite(ca) || ca <= 0) return message("Indiquez un chiffre d'affaires en milliers d'euros.", true);
  const annee = new Date().getFullYear() - 1;
  const d = { ...etat.donnees, ca: [{ annee, valeur: ca }], ebe: ebe == null ? [] : [{ annee, valeur: ebe }] };
  // Calcul de la fourchette sans enregistrement (aucune donnée conservée côté serveur)
  try {
    const r = await fetch("/api/estimation", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_naf: d.section_naf, ca, ebe }) });
    d.estimation = (await r.json()).estimation;
  } catch { d.estimation = null; }
  etat.donnees = d;
  afficher(d, etat.scene, { depuisEtages: true });
});

// ------------------------------------------------------------------ Télécharger ma maquette
$("#btn-telecharger")?.addEventListener("click", async () => {
  if (!etat.scene || !etat.donnees) return;
  const blob = await etat.scene.exporter({ nom: etat.donnees.nom, depuis: parametresMaquette(etat.donnees).depuis });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `maquette-${etat.donnees.nom.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$("#btn-autre")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: reduit() ? "auto" : "smooth" });
  setTimeout(() => { champ.value = ""; champ.focus({ preventScroll: true }); }, reduit() ? 0 : 500);
});

function message(texte, erreur = false) {
  const m = $("#maquette-message");
  m.textContent = texte;
  m.hidden = !texte;
  m.classList.toggle("erreur", erreur);
}

// ------------------------------------------------------------------ Sans WebGL : façade SVG statique
function dessinerSansWebGL(p) {
  const etages = p.etages ?? 1;
  const h = 34, l = 220, x0 = 90, sol = 300;
  let s = `<svg viewBox="0 0 400 340" role="img" aria-label="Maquette simplifiée : ${etages} niveau${etages > 1 ? "x" : ""}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="20" y="${sol}" width="360" height="14" fill="#5A3E2B"/>`;
  let allumees = p.fenetresAllumees;
  for (let i = 0; i < etages; i++) {
    const y = sol - (i + 1) * h;
    s += `<rect x="${x0}" y="${y}" width="${l}" height="${h}" fill="#F3EADB" stroke="#8A7F70"/>`;
    for (let k = 0; k < 5; k++) {
      const on = allumees-- > 0;
      s += `<rect x="${x0 + 14 + k * 42}" y="${y + 9}" width="20" height="16" fill="${on ? "#F0D6A8" : "#3A3128"}"/>`;
    }
  }
  if (p.comptesManquants) for (let i = 0; i < 2; i++) s += `<rect x="${x0}" y="${sol - (etages + i + 1) * h}" width="${l}" height="${h}" fill="none" stroke="#EADFCB" stroke-dasharray="6 5"/>`;
  s += `<circle cx="${x0 + l / 2}" cy="${sol - 8}" r="6" fill="#A8653A"/></svg>`;
  conteneur3d.querySelector(".facade-svg")?.remove();
  const div = document.createElement("div");
  div.className = "facade-svg";
  div.innerHTML = s; // contenu entièrement généré ici (nombres), sans donnée externe
  conteneur3d.prepend(div);
}
