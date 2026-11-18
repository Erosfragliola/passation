// Écran de résultat, branché sur l'estimation express existante (GET /api/maquette/:siren, POST /api/estimation).
// Chargement : l'analyse en quatre étapes (au moins 2,4 s, jamais plus que la réponse). Puis une fiche de synthèse
// (lot 1, 18/11/2026) : nom de code, fourchette en grand avec la barre bas / central / haut, la méthode (multiples
// floutés), une ligne de sources datées et une seule action, « Voir mon dossier » (connexion par code, puis le
// parcours guidé). Comptes confidentiels : deux chiffres sur la même fiche.
import { estimationManuelle, fourchette, montant, positionRepere, moisSource, multiple, remplir } from "/js/landing/estimation.js";
import { formaterSiren } from "/js/siren.js";

const DUREE_MIN = 2400; // le temps de voir les quatre étapes de l'analyse
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

export function creerResultat({ section, textes = {}, histoire = {} }) {
  const R = textes.resultat || {};
  const $ = (s) => section.querySelector(s);
  const chargement = $(".resultat-chargement"), contenu = $(".resultat-contenu");
  const etapes = [...section.querySelectorAll(".analyse-etapes li")];
  const etat = { donnees: null, anim: 0 };

  const montrerSection = () => { section.hidden = false; };

  /** Chargement : section visible avec le trousseau, puis la réponse (au moins DUREE_MIN). */
  async function charger(promesse) {
    cancelAnimationFrame(etat.anim);
    montrerSection();
    section.setAttribute("aria-busy", "true");
    chargement.hidden = false;
    contenu.hidden = true;
    section.classList.remove("resultat-pret");
    $(".resultat-grille").classList.add("carte-verte", "nuit");
    section.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
    // Les étapes de l'analyse s'allument l'une après l'autre pendant le chargement
    etapes.forEach((li) => { li.className = ""; });
    const pas = DUREE_MIN / (etapes.length + 0.5);
    const minuteurs = etapes.map((li, i) => setTimeout(() => { li.className = "en-cours"; if (i) etapes[i - 1].className = "fait"; }, reduit() ? 0 : i * pas));
    const [r] = await Promise.all([promesse, new Promise((ok) => setTimeout(ok, reduit() ? 300 : DUREE_MIN))]);
    minuteurs.forEach(clearTimeout); etapes.forEach((li) => { li.className = "fait"; });
    section.removeAttribute("aria-busy");
    chargement.hidden = true;
    return r;
  }

  function masquer() {
    cancelAnimationFrame(etat.anim);
    section.hidden = true;
    chargement.hidden = true;
  }

  function afficher(d) {
    etat.donnees = d;
    contenu.hidden = false;
    section.classList.add("resultat-pret");
    $(".resultat-grille").classList.remove("carte-verte", "nuit"); // la fiche, sur papier clair
    const code = d.nom_de_code ? `Projet ${d.nom_de_code}` : "";
    $(".resultat-code").textContent = code;
    $(".resultat-code-intro").hidden = !code;
    const t = d.teaser || {};
    const ou = (v) => v || R.non_renseigne;
    $("#resultat-teaser").textContent = remplir(R.teaser, { nom: d.nom, secteur: ou(t.secteur), region: ou(t.region), anciennete: ou(t.anciennete), effectif: ou(t.effectif) });
    // Une seule suite : la connexion par code pour ce SIREN. Toutes les entrées « Espace dirigeant » (barre, menu
    // mobile) mènent aussi à ce dossier : sinon, après le code, le dirigeant revenait sur l'accueil sans dossier
    // (constaté le 17/11/2026)
    document.querySelectorAll("a[data-connexion]").forEach((a) => { a.href = `/connexion?siren=${d.siren}`; a.dataset.siren = d.siren; });
    afficherEstimation(d.estimation);
  }

  function afficherEstimation(est, { saisie = false } = {}) {
    const bloc = $("#resultat-estimation"), comptes = $("#form-comptes");
    const sansComptes = !est || est.statut === "comptes_absents";
    comptes.hidden = !sansComptes;
    bloc.hidden = sansComptes;
    const barre = $("#estimation-barre"), sources = $("#resultat-sources");
    barre.hidden = true; sources.hidden = true;
    if (sansComptes) return;
    const valeur = $("#estimation-valeur"), note = $("#estimation-note"), methodes = $("#estimation-methodes");
    methodes.replaceChildren();
    const li = (texte) => { const e = document.createElement("li"); e.textContent = texte; methodes.append(e); };
    if (est.statut === "ok") {
      valeur.textContent = fourchette(est.bas, est.haut);
      // Barre bas / central / haut, dans l'unité de la fourchette
      $("#borne-bas").textContent = montant(est.bas, est.haut);
      $("#borne-central").textContent = montant(est.central, est.haut);
      $("#borne-haut").textContent = montant(est.haut, est.haut);
      barre.style.setProperty("--repere", `${positionRepere(est.bas, est.central, est.haut).toFixed(1)}%`);
      barre.hidden = false;
      // Sources datées : l'exercice des comptes publics (ou la saisie) et le mois de la référence des multiples
      const mois = moisSource(est.source);
      if (mois && (saisie || est.exercice)) { sources.textContent = remplir(saisie ? R.sources_saisie : R.sources, { exercice: est.exercice, mois }); sources.hidden = false; }
      // Les multiples restent floutés (dévoilés dans le dossier) : la ligne garde sa forme, les chiffres sont illisibles
      const e = document.createElement("li"), valeurs = { bas: multiple(est.multiples.bas), haut: multiple(est.multiples.haut), central: multiple(est.multiples.central) };
      for (const [k, morceau] of String(R.methode || "").split(/\{(bas|haut|central)\}/).entries()) {
        if (k % 2) { const f = document.createElement("span"); f.className = "floute"; f.setAttribute("aria-hidden", "true"); f.textContent = valeurs[morceau]; e.append(f); }
        else e.append(document.createTextNode(morceau));
      }
      e.setAttribute("aria-label", "Multiples de l'EBE du secteur : détaillés dans votre dossier.");
      methodes.append(e);
      note.textContent = (saisie ? R.note_saisie : remplir(R.note, { exercice: est.exercice })) + (est.avertissement ? ` ${est.avertissement}` : "");
    } else if (est.statut === "non_calculable") {
      valeur.textContent = R.sur_mesure;
      note.textContent = R.sur_mesure_note;
    } else {
      valeur.textContent = R.a_completer;
      note.textContent = R.a_completer_note;
    }
  }

  // Comptes confidentiels : deux chiffres, rien n'est enregistré
  $("#form-comptes")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ca = Number($("#saisie-ca").value) * 1000, ebe = Number($("#saisie-ebe").value) * 1000;
    const msg = $("#resultat-message");
    const signaler = (t) => { msg.textContent = t || ""; msg.hidden = !t; };
    if (!(ca > 0) || !Number.isFinite(ebe) || $("#saisie-ebe").value === "") return signaler(R.saisie_erreur);
    const est = await estimationManuelle({ section_naf: etat.donnees?.section_naf, ca, ebe });
    if (!est) return signaler(textes.erreurs?.source_indisponible);
    signaler("");
    afficherEstimation(est, { saisie: true });
  });

  return { charger, afficher, masquer };
}
