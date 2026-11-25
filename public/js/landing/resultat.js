// Result screen, connected to the existing quick estimate (GET /api/maquette/:siren, POST /api/estimation).
// Loading: the analysis in four steps (at least 2.4 s, never longer than the response). Then a "buyer"
// summary card (19/11/2026): on the left the anonymous profile as it will circulate (code name, stamp, industry, region,
// age, headcount); on the right the range, visible to the owner only, with the method (multiples blurred); at the
// bottom a line of dated sources and a single action, "Open my file" (sign-in by code, then the guided
// steps). Confidential accounts: two figures on the same card.
import { estimationManuelle, fourchette, montant, moisSource, multiple, remplir } from "/js/landing/estimation.js";
import { formaterSiren } from "/js/siren.js";
import { lien } from "/js/i18n.js";
import { t } from "/js/i18n.js";

const DUREE_MIN = 2400; // time to see the four steps of the analysis
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

export function creerResultat({ section, textes = {} }) {
  const R = textes.resultat || {};
  const $ = (s) => section.querySelector(s);
  const chargement = $(".resultat-chargement"), contenu = $(".resultat-contenu");
  const etapes = [...section.querySelectorAll(".analyse-etapes li")];
  const etat = { donnees: null, anim: 0 };

  const montrerSection = () => { section.hidden = false; };

  /** Loading: section visible with the key ring, then the response (at least DUREE_MIN). */
  async function charger(promesse) {
    cancelAnimationFrame(etat.anim);
    montrerSection();
    section.setAttribute("aria-busy", "true");
    chargement.hidden = false;
    contenu.hidden = true;
    section.classList.remove("resultat-pret");
    $(".resultat-grille").classList.add("carte-verte", "nuit");
    section.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
    // The steps of the analysis light up one after the other during loading
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
    $(".resultat-grille").classList.remove("carte-verte", "nuit"); // the card, on light paper
    const code = d.nom_de_code ? `Projet ${d.nom_de_code}` : "";
    $(".resultat-code").textContent = code;
    $(".fiche-profil-eti").hidden = !code;
    // Anonymous profile: a line hidden if the information is missing
    const t = d.teaser || {};
    for (const cle of ["secteur", "region", "anciennete", "effectif"]) {
      const ligne = $(`#profil-${cle}`);
      ligne.querySelector("dd").textContent = t[cle] || "";
      ligne.hidden = !t[cle];
    }
    // A single next step: sign-in by code for this SIREN. All the "My file" entries (bar, mobile
    // menu) also lead to this file: otherwise, after the code, the owner came back to the home page without a file
    // (found on 17/11/2026)
    document.querySelectorAll("a[data-connexion]").forEach((a) => { a.href = lien(`/connexion?siren=${d.siren}`); a.dataset.siren = d.siren; });
    // Without an account the server sends no amount (24/11/2026): public card, then "Create my access"
    const masquee = Boolean(d.estimation_masquee);
    const ouvrir = $("#resultat-ouvrir");
    ouvrir.dataset.mode = masquee ? "creer" : "connexion";
    ouvrir.href = lien(`/connexion?siren=${d.siren}${masquee ? "&mode=creer" : ""}`);
    ouvrir.querySelector("span").textContent = masquee ? R.creer_bouton : R.dossier_bouton;
    $("#resultat-masque").hidden = !masquee;
    if (masquee) {
      $("#resultat-estimation").hidden = true;
      $("#form-comptes").hidden = true;
      $("#resultat-sources").hidden = true;
      return;
    }
    afficherEstimation(d.estimation);
  }

  function afficherEstimation(est, { saisie = false } = {}) {
    const bloc = $("#resultat-estimation"), comptes = $("#form-comptes");
    const sansComptes = !est || est.statut === "comptes_absents";
    comptes.hidden = !sansComptes;
    bloc.hidden = sansComptes;
    const sources = $("#resultat-sources");
    sources.hidden = true;
    if (sansComptes) return;
    const valeur = $("#estimation-valeur"), note = $("#estimation-note"), methodes = $("#estimation-methodes");
    methodes.replaceChildren();
    const li = (texte) => { const e = document.createElement("li"); e.textContent = texte; methodes.append(e); };
    if (est.statut === "ok") {
      // The range only, in large type: no central value on the card (choice of 19/11/2026)
      valeur.textContent = fourchette(est.bas, est.haut);
      // Dated sources: the fiscal year of the public accounts (or the entry) and the month of the multiples reference
      const mois = moisSource(est.source);
      if (mois && (saisie || est.exercice)) { sources.textContent = remplir(saisie ? R.sources_saisie : R.sources, { exercice: est.exercice, mois }); sources.hidden = false; }
      // The multiples stay blurred (revealed in the file): the line keeps its shape, the figures are unreadable
      const e = document.createElement("li"), valeurs = { bas: multiple(est.multiples.bas), haut: multiple(est.multiples.haut) };
      const phrase = remplir(saisie || !est.exercice ? R.methode_saisie : R.methode, {
        annee: est.exercice, ebe: Number.isFinite(est.agregat) ? montant(est.agregat, est.agregat) : "", bas: "{bas}", haut: "{haut}" });
      for (const [k, morceau] of String(phrase || "").split(/\{(bas|haut)\}/).entries()) {
        if (k % 2) { const f = document.createElement("span"); f.className = "floute"; f.setAttribute("aria-hidden", "true"); f.textContent = valeurs[morceau]; e.append(f); }
        else e.append(document.createTextNode(morceau));
      }
      e.setAttribute("aria-label", t("regles.resultat.multiples_floutes"));
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

  // Confidential accounts: two figures, nothing is saved
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
