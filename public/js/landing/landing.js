// Page d'accueil : champ SIREN partagé (hero, navigation, barre du bas, relance) branché sur l'estimation express,
// vidéo du hero, affichage du résultat. Textes : src/contenu/landing.json (sous-arbre « js », <script id="textes">).
// L'affichage du résultat est provisoire : l'écran du nom de code le remplacera en phase 7.
import { creerChampPartage } from "/js/landing/champ-siren.js";
import { surveillerChamps } from "/js/landing/barres.js";
import { lancerVideo } from "/js/landing/video.js";
import { chargerEntreprise, estimationManuelle, fourchette, multiple, remplir } from "/js/landing/estimation.js";

const $ = (s) => document.querySelector(s);
let T = {};
try { T = JSON.parse($("#textes")?.textContent || "{}"); } catch { T = {}; }
const R = T.resultat || {};
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const section = $("#resultat");
const etat = { donnees: null };

const champ = creerChampPartage({ estimer, textes: T });
document.querySelectorAll("[data-champ-siren]").forEach((f) => champ.monter(f));
const barres = surveillerChamps({ hero: $('[data-champ-siren="accueil"]'), relance: $('[data-champ-siren="relance"]'), auChangement: () => champ.fermerListes() });
lancerVideo({ hero: $("#accueil"), textes: T.video });

async function estimer(siren, emplacement) {
  champ.dire(T.chargement, emplacement);
  const r = await chargerEntreprise(siren);
  if (!r.ok) return champ.dire(T.erreurs?.[r.code] || T.erreurs?.source_indisponible, emplacement);
  champ.dire("");
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
  champ.vider();
  barres.actualiser();
  champ.focaliser();
});

// « Essayer avec mon entreprise » : le curseur dans le champ partagé (barre du haut ou du bas)
document.querySelectorAll("[data-focus-champ]").forEach((b) => b.addEventListener("click", () => { barres.actualiser(); champ.focaliser(); }));
