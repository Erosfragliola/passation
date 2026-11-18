// Écran de résultat, branché sur l'estimation express existante (GET /api/maquette/:siren, POST /api/estimation).
// Chargement (au moins 1,2 s pour éviter un éclair, jamais plus que la réponse) ; puis à gauche le nom de code, la
// première fourchette et la méthode réellement employée ; à droite le dossier : le vrai nom s'écrit (seul le
// dirigeant le voit), des bandeaux noirs le recouvrent, le tampon tombe, le teaser anonyme s'affiche.
// Comptes confidentiels : deux chiffres sur le même écran. Deux suites : ouvrir le dossier (connexion par code, puis
// le parcours guidé), inviter l'expert-comptable (e-mail prérempli, aucune donnée jointe).
import { estimationManuelle, fourchette, multiple, remplir } from "/js/landing/estimation.js";
import { formaterSiren } from "/js/siren.js";

const DUREE_MIN = 2400; // le temps de voir les quatre étapes de l'analyse
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

export function creerResultat({ section, textes = {}, histoire = {} }) {
  const R = textes.resultat || {};
  const $ = (s) => section.querySelector(s);
  const chargement = $(".resultat-chargement"), contenu = $(".resultat-contenu");
  const zoneDossier = $(".resultat-dossier");
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
    zoneDossier.hidden = true;
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
    zoneDossier.hidden = false;
    const code = d.nom_de_code ? `Projet ${d.nom_de_code}` : "";
    $(".resultat-code").textContent = code;
    $(".resultat-code-intro").hidden = !code;
    const t = d.teaser || {};
    const ou = (v) => v || R.non_renseigne;
    $("#resultat-teaser").textContent = remplir(R.teaser, { nom: d.nom, secteur: ou(t.secteur), region: ou(t.region), anciennete: ou(t.anciennete), effectif: ou(t.effectif) });
    // Suites : connexion par code pour ce SIREN ; e-mail prérempli sans aucune donnée du dossier
    // Toutes les entrées « Espace dirigeant » (barre, menu mobile) mènent aussi à ce dossier : sinon, après le code,
    // le dirigeant revenait sur l'accueil sans dossier (constaté le 17/11/2026)
    document.querySelectorAll("a[data-connexion]").forEach((a) => { a.href = `/connexion?siren=${d.siren}`; a.dataset.siren = d.siren; });
    const corps = remplir(R.inviter_corps, { adresse: location.origin });
    $('a[data-suite="inviter"]').href = `mailto:?subject=${encodeURIComponent(R.inviter_sujet || "")}&body=${encodeURIComponent(corps)}`;
    afficherEstimation(d.estimation);

    const dep = departement(d.code_postal);
    // À droite : ce que Passation a lu (données réelles de l'entreprise), puis ce que le dossier apportera
    const est = d.estimation || {}, t2 = d.teaser || {};
    const lignes = [
      [textes.analyse?.[0], [t2.secteur, d.ville ? `${d.ville}${dep ? ` (${dep})` : ""}` : null].filter(Boolean).join(" · ")],
      [textes.analyse?.[1], est.exercice ? `exercice ${est.exercice}` : "non publiés"],
      [textes.analyse?.[2], est.statut === "ok" && est.multiples ? `${multiple(est.multiples.bas)} à ${multiple(est.multiples.haut)} l'EBE` : "avec vos chiffres"],
      [textes.analyse?.[3], code || "attribué"],
    ];
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const tuile = el("div", "resultat-tuile"), liste = el("ul", "resultat-lu");
    tuile.append(el("p", "resultat-tuile-titre", R.analyse_titre || ""), liste);
    for (const [lib, val] of lignes) { const li = el("li"); li.append(el("i"), el("span", null, lib || ""), el("b", null, val || "")); liste.append(li); }
    const obtenir = el("div", "resultat-tuile claire");
    const pil = el("div", "resultat-pilules");
    for (const x of R.obtenir || []) pil.append(el("span", null, x));
    obtenir.append(el("p", "resultat-tuile-titre", R.obtenir_titre || ""), pil);
    zoneDossier.replaceChildren(tuile, obtenir);
  }

  function afficherEstimation(est, { saisie = false } = {}) {
    const bloc = $("#resultat-estimation"), comptes = $("#form-comptes");
    const sansComptes = !est || est.statut === "comptes_absents";
    comptes.hidden = !sansComptes;
    bloc.hidden = sansComptes;
    if (sansComptes) return;
    const valeur = $("#estimation-valeur"), note = $("#estimation-note"), methodes = $("#estimation-methodes");
    methodes.replaceChildren();
    const li = (texte) => { const e = document.createElement("li"); e.textContent = texte; methodes.append(e); };
    if (est.statut === "ok") {
      valeur.textContent = fourchette(est.bas, est.haut);
      li(remplir(R.methode, { bas: multiple(est.multiples.bas), haut: multiple(est.multiples.haut), central: multiple(est.multiples.central) }));
      li(R.methodes_approfondies);
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
