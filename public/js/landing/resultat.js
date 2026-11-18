// Écran de résultat, branché sur l'estimation express existante (GET /api/maquette/:siren, POST /api/estimation).
// Chargement (au moins 1,2 s pour éviter un éclair, jamais plus que la réponse) ; puis à gauche le nom de code, la
// première fourchette et la méthode réellement employée ; à droite le dossier : le vrai nom s'écrit (seul le
// dirigeant le voit), des bandeaux noirs le recouvrent, le tampon tombe, le teaser anonyme s'affiche.
// Comptes confidentiels : deux chiffres sur le même écran. Deux suites : ouvrir le dossier (connexion par code, puis
// le parcours guidé), inviter l'expert-comptable (e-mail prérempli, aucune donnée jointe).
import { creerDossier, couperNom } from "/js/landing/dossier.js";
import { etatDemo, DEMO } from "/js/landing/demo-etat.js";
import { estimationManuelle, fourchette, multiple, remplir } from "/js/landing/estimation.js";
import { formaterSiren } from "/js/siren.js";

const DUREE_MIN = 1200;
const FIN_TEASER = DEMO.lignes(3)[1];
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const departement = (cp) => (/^\d{5}$/.test(cp || "") ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null);

export function creerResultat({ section, textes = {}, histoire = {} }) {
  const R = textes.resultat || {};
  const $ = (s) => section.querySelector(s);
  const chargement = $(".resultat-chargement"), contenu = $(".resultat-contenu");
  const zoneDossier = $(".resultat-dossier");
  const dossier = creerDossier({ textes: histoire.dossier || {}, chapitres: histoire.chapitres || [] });
  zoneDossier.append(dossier.element);
  dossier.definir({ onglets: (histoire.chapitres || []).map(() => ({ op: 1, dx: 0 })) });
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
    const [r] = await Promise.all([promesse, new Promise((ok) => setTimeout(ok, DUREE_MIN))]);
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

    // Le dossier : le vrai nom s'écrit, puis disparaît sous les bandeaux ; le teaser anonyme apparaît
    const dep = departement(d.code_postal);
    dossier.definir({
      nom: couperNom(d.nom),
      meta: [`SIREN ${formaterSiren(d.siren)}`, d.ville ? `${d.ville}${dep ? ` (${dep})` : ""}` : null].filter(Boolean).join(" · "),
      tampon: { nom: code },
      lignes: [t.secteur, t.region, t.anciennete, t.effectif].map((v) => ({ texte: ou(v) })),
    });
    const poser = (s) => dossier.definir({ ...etatDemo(s), pastille: { op: 0 }, mentionOp: 0 });
    cancelAnimationFrame(etat.anim);
    if (reduit()) { poser(FIN_TEASER); return; }
    poser(-1);
    const t0 = performance.now();
    const pas = (now) => {
      const s = (now - t0) / 1000;
      poser(Math.min(s, FIN_TEASER));
      if (s < FIN_TEASER) etat.anim = requestAnimationFrame(pas);
    };
    etat.anim = requestAnimationFrame(pas);
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
