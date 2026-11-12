// Page d'accueil : branchement du champ SIREN sur l'estimation express et affichage du résultat.
// Les textes viennent de src/contenu/landing.json (sous-arbre « js », posé dans <script id="textes">).
// Phase 2 : affichage provisoire du résultat ; l'écran du nom de code le remplacera en phase 7.
import { monterChamp } from "/js/landing/champ-siren.js";
import { chargerEntreprise, estimationManuelle, fourchette, multiple, remplir } from "/js/landing/estimation.js";

const $ = (s) => document.querySelector(s);
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let T = {};
try { T = JSON.parse($("#textes")?.textContent || "{}"); } catch { T = {}; }
const R = T.resultat || {};

const message = $("#recherche-message");
const section = $("#resultat");
const etat = { donnees: null };

function dire(texte) {
  message.textContent = texte || "";
  message.hidden = !texte;
}

const form = document.querySelector('[data-champ-siren="accueil"]');
const champ = form && monterChamp(form, {
  estimer: (siren) => estimer(siren),
  erreur: (code) => dire(T.erreurs?.[code] || T.erreurs?.source_indisponible),
  effacer: () => dire(""),
});

async function estimer(siren) {
  dire(T.chargement);
  form.setAttribute("aria-busy", "true");
  const r = await chargerEntreprise(siren);
  form.removeAttribute("aria-busy");
  if (!r.ok) return dire(T.erreurs?.[r.code] || T.erreurs?.source_indisponible);
  dire("");
  etat.donnees = r.donnees;
  afficher(r.donnees, r.donnees.estimation);
  section.hidden = false;
  section.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
}

function afficher(d, est, { saisie = false } = {}) {
  $("#titre-resultat").textContent = d.nom;
  const affiner = $("#btn-affiner");
  affiner.href = `/connexion?siren=${d.siren}`;
  affiner.dataset.siren = d.siren;

  const bloc = $("#resultat-estimation"), comptes = $("#form-comptes");
  const sansComptes = !est || est.statut === "comptes_absents";
  comptes.hidden = !sansComptes;
  bloc.hidden = sansComptes;
  if (sansComptes) return;

  const valeur = $("#estimation-valeur"), legende = $("#estimation-legende"), note = $("#estimation-note"), methodes = $("#estimation-methodes");
  methodes.textContent = "";
  if (est.statut === "ok") {
    valeur.textContent = fourchette(est.bas, est.haut);
    legende.textContent = saisie ? R.legende_saisie : remplir(R.legende, { exercice: est.exercice });
    note.textContent = (saisie ? R.note_saisie : remplir(R.note, { exercice: est.exercice })) + (est.avertissement ? ` ${est.avertissement}` : "");
    methodes.textContent = `${remplir(R.methode, { bas: multiple(est.multiples.bas), haut: multiple(est.multiples.haut), central: multiple(est.multiples.central) })} ${R.methodes_approfondies || ""}`;
  } else if (est.statut === "non_calculable") {
    valeur.textContent = R.sur_mesure;
    legende.textContent = "";
    note.textContent = R.sur_mesure_note;
  } else {
    valeur.textContent = R.a_completer;
    legende.textContent = "";
    note.textContent = R.a_completer_note;
  }
}

// Comptes non publiés : deux chiffres, rien n'est enregistré
$("#form-comptes")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ca = Number($("#saisie-ca").value) * 1000, ebe = Number($("#saisie-ebe").value) * 1000;
  const msg = $("#resultat-message");
  const signaler = (t) => { msg.textContent = t || ""; msg.hidden = !t; };
  if (!(ca > 0) || !Number.isFinite(ebe) || $("#saisie-ebe").value === "") return signaler(R.saisie_erreur);
  const est = await estimationManuelle({ section_naf: etat.donnees?.section_naf, ca, ebe });
  if (!est) return signaler(T.erreurs?.source_indisponible);
  signaler("");
  afficher(etat.donnees, est, { saisie: true });
});

$("#btn-autre")?.addEventListener("click", () => {
  section.hidden = true;
  champ?.vider();
  window.scrollTo({ top: 0, behavior: reduit() ? "auto" : "smooth" });
  setTimeout(() => champ?.focaliser(), reduit() ? 0 : 400);
});

// Boutons qui ramènent au champ (« Essayer avec mon entreprise », relance)
document.querySelectorAll("[data-focus-champ]").forEach((b) => b.addEventListener("click", () => {
  form.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "center" });
  setTimeout(() => champ?.focaliser(), reduit() ? 0 : 400);
}));
