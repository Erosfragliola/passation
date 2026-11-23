// Guided steps: one step at a time, a single main action per screen, resumed where the owner stopped.
// The steps are those of the file page (single list ETAPES_PARCOURS, state calculated by etatParcours):
//   Estimate (done: the file comes from the home page card)
//   Your figures: what Passation already knows, then the PDF tax return; failing that, entry of the essentials of the
//      latest fiscal year (the only required one); then one confirmation click, only flagged lines need attention
//   Your answers: one question per screen, the first about the website (suggested from the email address), read
//      during the following questions; then the facts found on the website (untick what is wrong) and the logo
//   Drafting: valuation, datapack, teaser and memorandum generated in one go
//   Review and sending: "ready" only if everything required is done, otherwise what is left (same count as
//      the file page)
import { CHAMPS, exercicesAttendus, libelleEcran, aideEcran, aideEbe as texteAideEbe } from "/js/champs-financiers.js";
import { REGIONS, libelleOption, detailOption } from "/js/questionnaire.js";
import { QUESTIONS, questionRepondue, requisManquants, questionsIncompletes, siteDepuisEmail, questionsAPoser, vuesDe } from "/js/parcours.js";
import { ETAPES_PARCOURS, ETAPE_DE_L_ECRAN, etiquetteExpress, etatParcours, ecranFinal } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js";
import { rangPhoto } from "/js/memo-format.js";
import { lien, t, langue, locale, lireNombreSaisi } from "/js/i18n.js";
import { champMontant, formaterSaisie, lireMontant, texteMontant } from "/js/montants.js";
import { contradictions, nomLisible, faitsEssentiels, faitsParTheme, limiterChoix, lireDate, lignesDates, phraseActivite, TYPES_EVENEMENT } from "/js/faits-site.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("dossier") || "";
const base = `/api/dossiers/${id}`;
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
/** Replaces the content of a node, ignoring null, undefined and false (otherwise the browser writes "null"). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
const fmt = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 });
const court = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? euros((v / 1e6).toLocaleString(locale(), { maximumFractionDigits: 2 }), "M") : euros(Math.round(v / 1e3).toLocaleString(locale()), "k"));
/** "1,2 M€" in French, "€1.2M" in English. */
const euros = (n, unite) => (langue() === "fr" ? `${n} ${unite}€` : `€${n}${unite === "k" ? "K" : unite}`);
const lireNombre = (s) => lireNombreSaisi(s);
/** Fills the screen, ignoring empty slots ("null" is never displayed). */
const remplir = (...enfants) => remplacer($("#ecran"), ...enfants);
function message(texte, erreur = false) { const m = $("#message"); m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur); }
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: enJson ? { "content-type": "application/json" } : {} });
  if (r.status === 401) { location.replace(lien("/connexion")); throw new Error("non_connecte"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || t("teaser.js.erreur")), { statut: r.status });
  return d;
}

const S = { propositions: {}, email: "", dossier: null, etat: null, chiffres: null, reponses: {}, memo: null, etape: "comptes", q: 0, vues: [], aPoser: null, lectureSite: null, saisie: null };
const PICTOS = {
  qualite: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z", outil: "M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2zM5 21l2-2",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2", usine: "M3 21V10l6 4V10l6 4V6l6 3v12zM3 21h18", bouclier: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  poignee: "M3 12l4-4 5 3 4-3 5 4-5 5-4-3-4 3z", graphe: "M4 20V10M10 20V4M16 20v-7M22 20H2", euro: "M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9",
  equipe: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m2-5c3 0 6 2 6 5", metier: "M4 7h16v12H4zM9 7V4h6v3",
  balance: "M12 4v16M6 20h12M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z", lieu: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18", croissance: "M3 17l6-6 4 4 8-8M15 7h6v6", valide: "M5 12l4 4 10-10",
};
const picto = (nom) => { const NS = "http://www.w3.org/2000/svg", g = document.createElementNS(NS, "svg"); g.setAttribute("viewBox", "0 0 24 24"); g.setAttribute("aria-hidden", "true"); g.setAttribute("class", "picto"); const pa = document.createElementNS(NS, "path"); pa.setAttribute("d", PICTOS[nom] || PICTOS.valide); g.append(pa); return g; };
const fleche = () => el("span", { class: "fleche", "aria-hidden": "true", text: "→" });

// ================================================================== Where are we?
const exercicesComplets = () => Object.entries(S.chiffres?.manquants || {}).filter(([, l]) => !l.length).length;
/** Is the latest fiscal year (the only required one, shared rule exercicesAttendus) confirmed? */
const dernierConfirme = () => exercicesAttendus(S.chiffres?.exercices).dernier_complet;
const aDesChiffresAValider = () => Object.values(S.chiffres?.exercices || {}).some((l) => Object.values(l).some((x) => x.valeur != null && x.source !== "inpi"));
function etapeCourante() {
  // Accueil de l'analyse approfondie : une fois, avant toute saisie
  if (!S.vues.includes("accueil") && !dernierConfirme() && !aDesChiffresAValider() && !S.complet) return "accueil";
  if (!dernierConfirme()) return aDesChiffresAValider() ? "chiffres" : "comptes";
  if (siteARepondre() && !S.complet && !S.reponses.suivi?.pret_envoye) { S.q = -1; return "questions"; }
  // Site lu : ses faits, puis son logo et ses photos, avant les questions restantes
  if (siteAValider()) return "site";
  if (photosAChoisir()) return "photos";
  const iq = QUESTIONS.findIndex((q) => !questionRepondue(q, S.reponses, S.vues));
  if (iq >= 0) { S.q = iq; return "questions"; }
  if (!S.reponses.suivi?.pret_envoye && !S.complet) return "redaction";
  return "pret";
}
/** Step requested by the file page (?etape=…): to review a completed step or go straight to the point. Without
 *  figures, "chiffres" leads to uploading the accounts; "questions" resumes at the first unanswered question. */
function etapeDemandee() {
  const e = new URLSearchParams(location.search).get("etape");
  if (e === "chiffres") return exercicesComplets() || aDesChiffresAValider() ? "chiffres" : "comptes";
  // Previous fiscal years (optional): direct entry of the first one missing
  if (e === "exercice") { const x = exercicesAttendus(S.chiffres?.exercices); S.saisie = { annee: x.recommandes_manquants?.[0] ?? anneesSaisie().defaut, valeurs: {} }; return "saisie"; }
  if (e === "questions") {
    if (siteARepondre()) { S.q = -1; return "questions"; }
    const iq = QUESTIONS.findIndex((q) => !questionRepondue(q, S.reponses, S.vues)); S.q = Math.max(0, iq); return "questions";
  }
  if (e === "photos") return S.reponses.site?.url ? "photos" : null;
  if (e === "redaction" || e === "pret") return e;
  return null;
}
const siteARepondre = () => !S.reponses.site?.url && !S.reponses.site?.aucun;
/** Step line: the list and the done / upcoming state are those of the file page (etatParcours); the step of
 *  the displayed screen is highlighted. The percentage is the same as on the file page. */
function dessinerEtapes() {
  const ici = ETAPE_DE_L_ECRAN[S.etape];
  const etats = Object.fromEntries((S.etat?.etapes || []).map((x) => [x.cle, x.etat]));
  remplacer($("#guide-etapes"), ...ETAPES_PARCOURS.map(([k, libelle], j) => el("li", { class: k === ici ? "actif" : etats[k] === "fait" ? "fait" : null, "aria-current": k === ici ? "step" : null },
    el("span", { text: etats[k] === "fait" && k !== ici ? "✓" : String(j + 1) }), libelle, el("span", { class: "visuellement-cache", text: etats[k] === "fait" ? t("demarrer.js.faite") : "" }))));
  const pct = S.etat?.avancement ?? 0;
  $("#guide-barre span").style.width = `${pct}%`;
  $("#guide-barre").setAttribute("aria-valuenow", String(pct));
}
/** State of the file reread from the server (same calculation as the file page), then step line redrawn. */
/** Memorandum and teaser read as on the file page: same state, same tasks (an empty teaser is not "ready"). */
const documentsPourEtat = (d) => Promise.all([
  d.documents?.memo ? api(`${base}/documents/memo`).catch(() => null) : null,
  d.documents?.teaser ? api(`${base}/documents/teaser`).catch(() => null) : null,
]);

async function rafraichirEtat() {
  try {
    const d = await api(base);
    S.dossier = d; S.etat = etatParcours(d, ...(await documentsPourEtat(d))); dessinerEtapes();
    return S.etat;
  } catch { return S.etat; }
}
function aller(etape) {
  if (etape === "questions" && S.etape !== "questions") { S.aPoser = null; rafraichirPropositions().then(() => { if (S.etape === "questions" && S.q >= 0) questions(); }); }
  S.etape = etape; dessinerEtapes(); rafraichirEtat();
  ({ accueil, comptes, saisie, chiffres, questions, site, photos, redaction, pret })[etape](); $("#ecran").querySelector("h1, h2")?.focus?.(); window.scrollTo({ top: 0 });
}
const titre = (texte, aide) => [el("h1", { class: "guide-titre", tabindex: "-1", text: texte }), aide ? el("p", { class: "chapo-petit", text: aide }) : null].filter(Boolean);

/** Proposals recalculated when new data arrives (confirmed accounts, website read). */
function rafraichirPropositions() {
  return api(`${base}/documents/memo/propositions`).then((p) => { S.propositions = p.propositions || {}; }).catch(() => null);
}
// ================================================================== 1. Your accounts
function lancerLectureSite(url) {
  S.lectureSite = api(`${base}/documents/memo/site`, { method: "POST", body: JSON.stringify({ url }) })
    .then((m) => { S.memo = m; S.reponses.site = m.site; rafraichirPropositions(); return m; })
    .catch((e) => { S.erreurSite = e.message; return null; });
}
/** What Passation already knows: the owner does not start from zero. */
function dejaFait() {
  const e = S.dossier?.entreprise || {}, est = S.dossier?.estimation;
  const publics = Object.entries(S.chiffres?.exercices || {})
    .filter(([, l]) => Object.values(l).some((x) => x.source === "inpi" && x.valeur != null)).map(([a]) => a).sort();
  const faits = [
    t("demarrer.js.deja.entreprise", { nom: e.nom || t("demarrer.js.deja.votre_societe") }),
    publics.length ? t("demarrer.js.deja.comptes", { annees: publics.join(", ") }) : null,
    est?.statut === "ok" ? t("demarrer.js.deja.estimation", { etiquette: `${etiquetteExpress()}${est.exercice ? ` (${t("dossier.valeur.comptes", { annee: est.exercice })})` : ""}`, fourchette: fourchette(est.bas, est.haut) }) : null,
  ].filter(Boolean);
  return el("div", { class: "carte guide-deja" }, el("p", { class: "etiquette", text: t("demarrer.js.deja.titre") }),
    el("ul", {}, ...faits.map((x) => el("li", { text: x }))));
}
function comptes() {
  const lecture = S.chiffres?.lecture_automatique !== false;
  const fichier = el("input", { type: "file", accept: "application/pdf", id: "liasse", class: "visuellement-cache" });
  fichier.addEventListener("change", async () => {
    const f = fichier.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("fichier", f);
    message(t("demarrer.js.comptes.lecture"));
    $("#zone-depot").setAttribute("aria-busy", "true");
    try { S.chiffres = await api(`${base}/uploads`, { method: "POST", body: fd }); message(""); aller("chiffres"); }
    catch (e) { message(e.message, true); }
    finally { $("#zone-depot")?.removeAttribute("aria-busy"); }
  });
  const versSaisie = (texte, classe = "lien-simple") => el("button", { type: "button", class: classe, onclick: () => { S.saisie = null; aller("saisie"); } }, texte);
  const suite = dernierConfirme() || aDesChiffresAValider() ? el("button", { type: "button", class: "btn btn-vert", onclick: () => aller("chiffres") }, t("espace.continuer")) : null;
  if (!lecture) {
    remplir(dejaFait(), ...titre(t("demarrer.js.comptes.saisir_titre"), t("demarrer.js.comptes.saisir_aide")),
      el("p", { class: "petit", text: t("demarrer.js.comptes.lecture_indisponible") }),
      versSaisie(t("demarrer.js.comptes.saisir_mes_chiffres"), "btn btn-noir"), suite);
    return;
  }
  remplir(dejaFait(), ...titre(t("demarrer.js.comptes.deposer_titre"), t("demarrer.js.comptes.deposer_aide")),
    el("div", { class: "depot depot-grand", id: "zone-depot" },
      el("div", { class: "depot-texte" }, el("strong", { text: t("demarrer.js.comptes.liasse_pdf") }), el("span", { class: "petit", text: t("demarrer.js.comptes.formulaires") })),
      el("label", { class: "btn btn-noir", for: "liasse" }, t("demarrer.js.comptes.choisir_pdf")), fichier),
    el("p", { class: "petit" }, t("demarrer.js.comptes.pas_de_liasse"), versSaisie(t("demarrer.js.comptes.saisir_main")), t("demarrer.js.comptes.dizaine")),
    suite);
}

// ================================================================== 1a. Entry of the essentials (without a tax return)
const DETAIL_CHARGES = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"];
const BILAN_ESSENTIEL = ["stocks", "creances_clients", "tresorerie", "capitaux_propres", "emprunts", "dettes_fournisseurs", "dettes_fiscales_sociales"];
const FACULTATIFS = new Set(["impots_taxes", "resultat_net"]);
/** Proposed fiscal year: the latest known fiscal year if it is not confirmed (the only required one), otherwise the
 *  first missing of the two previous ones, otherwise the latest closed fiscal year. Never an isolated older year. */
function anneesSaisie() {
  const y = new Date().getFullYear();
  const x = exercicesAttendus(S.chiffres?.exercices);
  const toutes = [...new Set([...(x.dernier != null ? [x.dernier, ...x.recommandes] : []), y - 1, y - 2, y - 3])].sort((a, b) => b - a);
  const defaut = x.dernier == null ? y - 1 : !x.dernier_complet ? x.dernier : x.recommandes_manquants[0] ?? x.dernier;
  return { toutes, defaut };
}
/** "The essentials of your accounts" in two screens (19/11/2026): what the company earns, then what it owns and
 *  owes. The amounts typed are kept from one screen to the next; the fiscal year is saved in one go, on the second screen. */
function saisie() {
  const { toutes, defaut } = anneesSaisie();
  if (!S.saisie) S.saisie = { annee: defaut, valeurs: {}, ecran: 1 };
  S.saisie.ecran ??= 1;
  const { annee, ecran } = S.saisie;
  const l = S.chiffres?.exercices?.[annee] || {};
  const ebePublie = l.ebe?.valeur != null;
  const detail = S.saisie.detail ?? !ebePublie;
  const cles1 = ["chiffre_affaires", ...(detail ? DETAIL_CHARGES : ["ebe"]), "resultat_net"];
  const brut = (cle) => S.saisie.valeurs[cle] ?? (l[cle]?.valeur != null ? fmt.format(l[cle].valeur) : "");
  const aideEbe = () => el("span", { class: "aide-bulle" }, el("button", { type: "button", class: "aide-rond", "aria-describedby": "aide-ebe-saisie", "aria-label": t("demarrer.js.saisie.quest_ce_ebe") }, "?"),
    el("span", { role: "tooltip", id: "aide-ebe-saisie", text: texteAideEbe() }));
  const champ = (cle) => {
    const c = CHAMPS.find((x) => x.cle === cle), cell = l[cle];
    // Champ formaté + curseur (option B1) : borne haute déduite du chiffre d'affaires (tapé ou publié), jamais une
    // valeur inventée ; la donnée publique (INPI) pré-remplit le champ, comme avant
    const ca = lireNombre(brut("chiffre_affaires"));
    const max = cle === "chiffre_affaires" ? Math.max(5e6, 2 * (Number.isFinite(ca) ? ca : 0)) : Number.isFinite(ca) && ca > 0 ? ca : 5e6;
    const actuel = lireNombre(brut(cle));
    const comp = champMontant({ id: `s-${cle}`, libelle: cle === "ebe" ? t("demarrer.js.saisie.ebe") : libelleEcran(c), unite: "€", min: ["resultat_net", "ebe", "capitaux_propres"].includes(cle) ? Math.min(-Math.round(max / 2), Number.isFinite(actuel) ? actuel : 0) : 0, max, // peut être négatif
      valeur: Number.isFinite(actuel) ? actuel : null });
    comp.classList.add("montant-empile");
    comp.champ.dataset.cle = cle;
    comp.addEventListener("input", () => { S.saisie.valeurs[cle] = comp.champ.value; });
    const aide = cell?.source === "inpi" ? t("demarrer.js.saisie.repris_inpi") : aideEcran(c);
    return el("div", { class: "guide-champ saisie-champ" },
      el("label", { class: "guide-lib", for: `s-${cle}` }, cle === "ebe" ? [t("demarrer.js.saisie.ebe"), aideEbe()] : libelleEcran(c), FACULTATIFS.has(cle) ? el("span", { class: "facultatif", text: t("demarrer.js.saisie.facultatif") }) : null),
      el("p", { class: "petit", text: aide }),
      comp);
  };
  /** Reads the amounts of the given keys: { valeurs } or an error message (unreadable field or empty required field). */
  const lire = (cles) => {
    const valeurs = {}, manque = [];
    for (const cle of cles) {
      const v = lireNombre(brut(cle));
      const lib = cle === "ebe" ? "EBE" : libelleEcran(CHAMPS.find((x) => x.cle === cle));
      if (Number.isNaN(v)) return { erreur: t("demarrer.js.saisie.illisible", { libelle: lib }), cle };
      if (v === null) { if (!FACULTATIFS.has(cle)) manque.push(lib); continue; }
      valeurs[cle] = v;
    }
    return manque.length ? { erreur: t("demarrer.js.saisie.il_manque", { liste: manque.join(", ") }), cle: null } : { valeurs };
  };
  const choixAnnee = el("select", { id: "s-annee" }, ...toutes.map((a) => el("option", { value: String(a), selected: a === annee }, String(a))));
  choixAnnee.addEventListener("change", () => { S.saisie = { annee: Number(choixAnnee.value), valeurs: {}, ecran: 1 }; saisie(); });
  const basculer = ebePublie ? el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie.detail = !detail; saisie(); } },
    detail ? t("demarrer.js.saisie.reprendre_ebe") : t("demarrer.js.saisie.detailler")) : null;
  const erreur = (r) => { message(r.erreur, true); if (r.cle && ecran === 1) $(`#s-${r.cle}`)?.focus(); return false; };

  if (ecran === 1) {
    remplir(...titre(t("demarrer.js.saisie.titre"), t("demarrer.js.saisie.ecran1")),
      el("div", { class: "guide-champ saisie-annee" }, el("label", { class: "guide-lib", for: "s-annee", text: t("demarrer.js.saisie.clos_en") }), choixAnnee),
      el("fieldset", { class: "saisie-groupe saisie-deux" }, el("legend", { text: t("demarrer.js.saisie.gagne") }), ...cles1.map(champ), basculer),
      el("div", { class: "q-nav" },
        el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie = null; message(""); aller(exercicesComplets() || aDesChiffresAValider() ? "chiffres" : "comptes"); } }, t("demarrer.js.retour")),
        el("button", { type: "button", class: "btn btn-noir", onclick: () => {
          const r = lire(cles1);
          if (r.erreur) return erreur(r);
          message(""); S.saisie.ecran = 2; saisie();
        } }, t("demarrer.js.saisie.suivant_bilan"), fleche())));
    return;
  }
  remplir(...titre(t("demarrer.js.saisie.titre"), t("demarrer.js.saisie.ecran2", { annee })),
    el("fieldset", { class: "saisie-groupe saisie-deux" }, el("legend", { text: t("demarrer.js.saisie.possede") }), ...BILAN_ESSENTIEL.map(champ)),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { message(""); S.saisie.ecran = 1; saisie(); } }, t("demarrer.js.saisie.retour_gagne")),
      el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
        const bouton = ev.currentTarget;
        const r1 = lire(cles1);
        if (r1.erreur) { S.saisie.ecran = 1; saisie(); return erreur(r1); }
        const r2 = lire(BILAN_ESSENTIEL);
        if (r2.erreur) { message(r2.erreur, true); if (r2.cle) $(`#s-${r2.cle}`)?.focus(); return; }
        const valeurs = { ...r1.valeurs, ...r2.valeurs };
        bouton.disabled = true;
        try {
          S.chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee, valeurs, valider: false }) });
          // What the owner has just typed does not need to be confirmed again on the next screen: it is confirmed by default,
          // unless an automatic check flags an inconsistency (the "Your figures" screen then shows it)
          const alerte = (S.chiffres.controles?.[annee] || []).some((c) => c.niveau === "alerte");
          if (!alerte && !(S.chiffres.manquants?.[annee] || []).length) S.chiffres = await api(`${base}/financials/${annee}/valider`, { method: "POST" });
          S.saisie = null;
          if (alerte || !dernierConfirme()) { message(""); aller("chiffres"); }
          else { message(t("demarrer.js.saisie.enregistre", { annee })); aller(etapeCourante()); }
        } catch (e) { message(e.message, true); bouton.disabled = false; }
      } }, t("demarrer.js.saisie.enregistrer"), fleche())));
}

// ================================================================== 2. Your figures
/** Fiscal years to confirm: the latest (required) and, if they were entered or read from the tax return, the two
 *  before it (optional). An older year published on its own is not shown. */
function anneesUtiles() {
  const x = exercicesAttendus(S.chiffres.exercices);
  if (x.dernier == null) return [];
  const propre = (a) => Object.values(S.chiffres.exercices[a] || {}).some((c) => c.valeur != null && c.source !== "inpi");
  return [x.dernier, ...x.recommandes.filter((a) => S.chiffres.exercices[a] && propre(a))];
}
function chiffres() {
  const annees = anneesUtiles();
  const cartes = annees.map((a) => {
    const l = S.chiffres.exercices[a], ctl = S.chiffres.controles?.[a] || [], manque = S.chiffres.manquants?.[a] || [];
    const val = (k) => l[k]?.valeur ?? null;
    const det = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"].map(val);
    const ebe = det.some((x) => x != null) ? (val("chiffre_affaires") ?? 0) + (val("autres_produits") ?? 0) - det.reduce((s, x) => s + (x ?? 0), 0) : val("ebe");
    const valide = !manque.length;
    const alertes = ctl.filter((c) => c.niveau === "alerte"), attentions = ctl.filter((c) => c.niveau === "attention");
    const bloquees = [...new Set(alertes.flatMap((c) => c.lignes))].filter((k) => k !== "manquant");
    return el("article", { class: `carte guide-exercice${valide ? " valide" : ""}` },
      el("header", {}, el("h2", { text: t("demarrer.js.chiffres.exercice", { annee: a }) }), valide ? el("span", { class: "pastille-ok", text: t("demarrer.js.chiffres.confirme") }) : a !== annees[0] ? el("span", { class: "petit", text: t("demarrer.js.chiffres.facultatif") }) : null),
      el("dl", { class: "guide-resume" },
        ...[[t("demarrer.js.chiffres.ca"), val("chiffre_affaires")], [t("demarrer.js.chiffres.ebe"), ebe], [t("demarrer.js.chiffres.rn"), val("resultat_net")], [t("demarrer.js.chiffres.cp"), val("capitaux_propres")]]
          .map(([lib, x]) => el("div", {}, el("dt", { text: lib }), el("dd", { text: court(x) })))),
      ...alertes.map((c) => el("p", { class: "controle alerte", text: c.message })),
      ...attentions.map((c) => el("p", { class: "controle attention", text: c.message })),
      bloquees.length ? el("div", { class: "guide-lignes" }, ...bloquees.map((k) => ligneAVerifier(a, k, l[k]))) : null,
      valide ? null : el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        try { S.chiffres = await api(`${base}/financials/${a}/valider`, { method: "POST" }); chiffres(); }
        catch (e) { message(e.message, true); }
      } }, alertes.length ? t("demarrer.js.chiffres.confirmer_autres") : t("demarrer.js.chiffres.justes")));
  });
  remplir(...titre(t("demarrer.js.chiffres.titre"), t("demarrer.js.chiffres.aide")),
    ...cartes,
    el("p", { class: "petit" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie = null; aller("saisie"); } }, t("demarrer.js.chiffres.autre_exercice")), " · ",
      el("button", { type: "button", class: "lien-simple", onclick: () => aller("comptes") }, t("demarrer.js.chiffres.autre_liasse")), " · ",
      el("a", { href: lien(`/espace/valorisation/?dossier=${id}#chiffres`), text: t("demarrer.js.chiffres.mode_detaille") })),
    dernierConfirme() ? el("button", { type: "button", class: "btn btn-vert", onclick: () => aller(etapeCourante()) }, t("demarrer.js.continuer"), fleche()) : null);
}
function ligneAVerifier(annee, cle, cellule) {
  const c = CHAMPS.find((x) => x.cle === cle);
  const input = el("input", { type: "text", inputmode: "decimal", value: cellule?.valeur != null ? fmt.format(cellule.valeur) : "", "aria-label": `${libelleEcran(c)}, ${annee}` });
  input.addEventListener("input", () => { input.value = formaterSaisie(input.value); }); // séparateurs de milliers en direct
  return el("div", { class: "guide-ligne" }, el("label", { text: libelleEcran(c) || cle }), input,
    el("button", { type: "button", class: "btn btn-mini", onclick: async () => {
      const v = lireNombre(input.value);
      if (v === null || Number.isNaN(v)) { message(t("demarrer.js.chiffres.montant_lisible"), true); input.focus(); return; }
      try { S.chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee, valeurs: { [cle]: v }, valider: true }) }); message(""); chiffres(); }
      catch (e) { message(e.message, true); }
    } }, t("demarrer.js.chiffres.valider_ligne")));
}

// ================================================================== 3. Questions (one per screen)
async function enregistrer(etape, cle, valeur) {
  S.reponses[etape] = { ...(S.reponses[etape] || {}), [cle]: valeur };
  await api(`${base}/answers/${etape}`, { method: "PUT", body: JSON.stringify({ data: S.reponses[etape] }) });
}
function brouillonActivite() {
  const f = (S.reponses.site?.faits || []).filter((x) => ["activite", "produits", "clients", "qualite"].includes(x.categorie)).slice(0, 5).map((x) => x.fait);
  return f.length ? f.join(" ") : "";
}
/** Passation's proposal for this field, as long as the owner has saved nothing. */
const proposition = (q, c) => (S.reponses[c.etape]?.[c.cle] == null ? S.propositions[q.id]?.valeurs?.[`${c.etape}.${c.cle}`] : undefined);
const valeurDe = (chemin) => { const [e, k] = chemin.split("."); return S.reponses[e]?.[k]; };
const idChamp = (c) => `q-${c.etape}-${c.cle}`;
/** Libellé (et aide) d'un champ ; `pour` relie le libellé au champ, sinon c'est un texte (légende d'un groupe). */
const entete = (c, pour = null) => [
  c.libelle ? el(pour ? "label" : "p", { class: "guide-lib", for: pour, id: `${idChamp(c)}-lib` }, c.libelle) : null,
  c.aide ? el("p", { class: "guide-aide", text: c.aide }) : null,
];

/** Puces à cocher (métiers, certifications) : propositions sourcées + réponses déjà données + ajouts du dirigeant. */
function champEtiquettes(c, q) {
  const enregistre = Array.isArray(S.reponses[c.etape]?.[c.cle]) ? S.reponses[c.etape][c.cle] : typeof S.reponses[c.etape]?.[c.cle] === "string" ? S.reponses[c.etape][c.cle].split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) : null;
  const propose = Array.isArray(proposition(q, c)) ? proposition(q, c) : [];
  const coches = new Set(enregistre ?? propose);
  const autres = S.reponses[c.etape]?.[c.cle] == null ? S.propositions[q.id]?.autres?.[`${c.etape}.${c.cle}`] || [] : [];
  const libelles = [...new Set([...propose, ...(enregistre || []), ...autres])];
  const source = S.propositions[q.id]?.source;
  const zone = el("div", { class: "puces etiquettes", role: "group", "aria-labelledby": `${idChamp(c)}-lib`, "data-etape": c.etape, "data-cle": c.cle, "data-type": "etiquettes" });
  const puce = (lib, coche, proposee) => {
    const cb = el("input", { type: "checkbox", value: lib, checked: coche });
    cb.addEventListener("change", () => zone.dispatchEvent(new Event("change", { bubbles: true })));
    return el("label", { class: "puce-case" }, cb, proposee ? el("span", { class: "src", title: source || "", "aria-hidden": "true" }) : null, el("span", { text: lib }));
  };
  const ajout = el("input", { type: "text", class: "puce-ajout", maxlength: "60", "aria-label": c.ajouter, placeholder: c.ajouter });
  const ajouter = () => {
    const v = ajout.value.trim();
    if (!v) return;
    if (![...zone.querySelectorAll("input[type=checkbox]")].some((x) => x.value.toLowerCase() === v.toLowerCase())) zone.insertBefore(puce(v, true, false), formAjout);
    ajout.value = ""; ajout.focus();
    zone.dispatchEvent(new Event("change", { bubbles: true }));
  };
  ajout.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } });
  const formAjout = el("span", { class: "puce-ajout-zone" }, ajout, el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: ajouter }, t("demarrer.js.question.ajouter")));
  zone.append(...libelles.map((x) => puce(x, coches.has(x), propose.includes(x))), formAjout);
  return el("div", { class: "guide-champ" }, ...entete(c), zone,
    propose.length && source ? el("p", { class: "guide-source" }, el("span", { class: "src", "aria-hidden": "true" }), source) : null);
}

/** Choix à icône, plusieurs réponses ; `max` réellement appliqué (au-delà, les autres choix se grisent). */
function champMulti(c, q) {
  const v = S.reponses[c.etape]?.[c.cle] ?? proposition(q, c);
  const lib = c.libelle ? el("p", { class: "guide-lib", text: c.libelle }) : null;
  if (c.type === "texte") {
    const ta = el("textarea", { rows: "6", "aria-label": q.titre, "data-etape": c.etape, "data-cle": c.cle });
    ta.value = v || (c.cle === "description" ? brouillonActivite() : "");
    return el("div", { class: "guide-champ" }, lib, ta);
  }
  if (c.type === "ligne") {
    const i = el("input", { type: "text", value: v || "", placeholder: c.exemple || "", "aria-label": c.libelle, "data-etape": c.etape, "data-cle": c.cle, "data-type": "ligne", maxlength: "300" });
    return el("div", { class: "guide-champ" }, lib, i);
  }
  if (c.type === "multi") {
    // Several answers: tiles with pictograms, saved when the screen is approved
    const choisies = new Set(Array.isArray(v) ? v : []);
    const zone = el("div", { class: "tuiles-choix", role: "group", "aria-label": c.libelle || q.titre, "data-etape": c.etape, "data-cle": c.cle, "data-type": "multi" },
      ...c.options.map(([val, ic]) => el("button", { type: "button", class: "tuile-choix", "aria-pressed": String(choisies.has(val)), "data-valeur": val, onclick: (ev) => {
        const b = ev.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
      } }, picto(ic), el("strong", { text: libelleOption(c.cle, val) }), detailOption(c.cle, val) ? el("span", { text: detailOption(c.cle, val) }) : null)));
    return el("div", { class: "guide-champ" }, lib, zone);
  }
  if (c.type === "euros" || c.type === "curseur") {
    if (c.type === "curseur") {
      const r = el("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round((v ?? 0.1) * 100)), "aria-label": c.libelle, "data-etape": c.etape, "data-cle": c.cle, "data-type": "curseur" });
      const out = el("output", { text: t("espace.js.pct", { n: r.value }) });
      r.addEventListener("input", () => { out.textContent = t("espace.js.pct", { n: r.value }); });
      return el("div", { class: "guide-champ" }, lib, el("div", { class: "guide-curseur" }, r, out));
    }
    const i = el("input", { type: "text", inputmode: "decimal", value: v != null ? fmt.format(v) : "", "aria-label": c.libelle, "data-etape": c.etape, "data-cle": c.cle, "data-type": "euros" });
    return el("div", { class: "guide-champ" }, lib, el("div", { class: "champ-unite" }, i, el("span", { class: "unite", text: "€" })));
  }
  if (c.type === "choix" || c.type === "valeurs") {
    const opts = c.type === "choix" ? c.options.map((o) => [libelleOption(c.cle, o), o]) : c.options.map(([lib, val]) => [langue() === "fr" ? lib : lib.replace(/\s%/, "%"), val]);
    return el("div", { class: "guide-champ" }, lib, el("div", { class: "puces-choix", role: "group", "aria-label": c.libelle || q.titre },
      ...opts.map(([lib, val]) => el("button", { type: "button", class: `puce${v === val ? " choisie" : ""}`, "aria-pressed": String(v === val), "data-propose": proposition(q, c) === val ? "1" : null, onclick: async (ev) => {
        const bouton = ev.currentTarget; // ev.currentTarget is emptied after the first "await"
        try {
          await enregistrer(c.etape, c.cle, val);
          bouton.parentElement.querySelectorAll(".puce").forEach((b) => { b.classList.toggle("choisie", b === bouton); b.setAttribute("aria-pressed", String(b === bouton)); });
          // Single-choice screen: move on immediately; otherwise show the follow-up, if any
          if (q.champs.length === 1 && !q.suite?.si(S.reponses) && !S.propositions[q.id]) suivante(q);
          else if (q.suite) questions();
        } catch (e) { message(e.message, true); }
      } }, lib))));
  }
  if (c.type === "regions") {
    const choisies = new Set(Array.isArray(v) ? v : []);
    return el("fieldset", { class: "guide-champ regions-choix" }, el("legend", { text: c.libelle }),
      ...REGIONS.map((r, k) => { const cb = el("input", { type: "checkbox", id: `reg-${k}`, checked: choisies.has(r) }); cb.addEventListener("change", () => { if (cb.checked) choisies.add(r); else choisies.delete(r); enregistrer(c.etape, c.cle, [...choisies]).catch((e) => message(e.message, true)); }); return el("label", { class: "choix", for: `reg-${k}` }, cb, ` ${r}`); }));
  }
  if (c.type === "top_clients") {
    // Five anonymous lines: share of revenue (%), length of the relationship (years), customer's business
    const lignes = Array.isArray(v) ? v : [];
    const zone = el("div", { class: "guide-champ top-clients", "data-etape": c.etape, "data-cle": c.cle, "data-type": "top_clients" },
      el("div", { class: "top-clients-tete", "aria-hidden": "true" }, el("span"), el("span", { text: t("demarrer.js.clients.part") }), el("span", { text: t("demarrer.js.clients.depuis") }), el("span", { text: t("demarrer.js.clients.activite") })),
      ...[0, 1, 2, 3, 4].map((k) => {
        const x = lignes[k] || {};
        return el("div", { class: "top-clients-ligne" },
          el("span", { class: "top-clients-rang", text: t("demarrer.js.clients.client", { n: k + 1 }) }),
          el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "decimal", "data-col": "part", placeholder: t("demarrer.js.clients.part_court"), "aria-label": t("demarrer.js.clients.part_aria", { n: k + 1 }), value: Number.isFinite(x.part) ? fmt.format(Math.round(x.part * 1000) / 10) : "" }), el("span", { class: "unite", text: "%" })),
          el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "numeric", "data-col": "anciennete", placeholder: t("demarrer.js.clients.depuis_court"), "aria-label": t("demarrer.js.clients.depuis_aria", { n: k + 1 }), value: Number.isFinite(x.anciennete) ? String(x.anciennete) : "" }), el("span", { class: "unite", text: t("demarrer.js.clients.ans") })),
          el("input", { type: "text", "data-col": "secteur", maxlength: "40", "aria-label": t("demarrer.js.clients.activite_aria", { n: k + 1 }), placeholder: t("demarrer.js.clients.activite_exemple"), value: x.secteur || "" }));
      }));
    return zone;
  }
  if (c.type === "exceptionnels") {
    const liste = Array.isArray(v) && v.length ? v : [{ annee: Number(Object.keys(S.chiffres?.exercices || {}).sort().at(-1)) || null, libelle: "", montant: null, justification: "" }];
    const zone = el("div", { class: "guide-champ exceptionnels" });
    const dessiner = () => remplacer(zone, ...liste.map((x, k) => el("div", { class: "exc" },
      el("input", { type: "text", value: x.annee ?? "", "aria-label": t("demarrer.js.exc.exercice"), inputmode: "numeric", onchange: (e) => { x.annee = Number(e.target.value); } }),
      el("input", { type: "text", value: x.libelle, placeholder: t("demarrer.js.exc.libelle"), "aria-label": t("demarrer.js.exc.libelle"), onchange: (e) => { x.libelle = e.target.value; } }),
      montant,
      el("input", { type: "text", value: x.justification, placeholder: t("demarrer.js.exc.pourquoi"), "aria-label": t("demarrer.js.exc.justification"), onchange: (e) => { x.justification = e.target.value; } }),
      el("button", { type: "button", class: "lien-simple", onclick: () => { liste.splice(k, 1); dessiner(); } }, t("espace.js.retirer")));
  }),
  el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => { liste.push({ annee: liste.at(-1)?.annee ?? null, libelle: "", montant: null, justification: "" }); dessiner(); } }, t("demarrer.js.exc.ajouter")));
  zone.dataset.etape = c.etape; zone.dataset.cle = c.cle; zone.dataset.type = "exceptionnels"; zone._liste = liste;
  dessiner();
  return zone;
}

function champ(c, q) {
  const rendu = { etiquettes: champEtiquettes, multi: champMulti, phrase: champPhrase, montant: champNombre, pourcentage: champNombre, dates: champDates, choix: champChoix, regions: champRegions, top_clients: champTopClients, exceptionnels: champExceptionnels }[c.type];
  const n = rendu ? rendu(c, q) : null;
  // Bloc facultatif replié sous un lien (régions, cinq premiers clients)
  return n && c.replie ? el("details", { class: "guide-replie" }, el("summary", { text: c.replie }), n) : n;
}
/** Approves the screen: the proposed choices that the owner kept as they are get saved. */
async function validerPropositions(q) {
  for (const c of [...q.champs, ...(q.suite?.si(S.reponses) ? q.suite.champs : [])]) {
    if (!["choix", "regions"].includes(c.type)) continue;
    const pv = proposition(q, c);
    if (pv !== undefined) await enregistrer(c.etape, c.cle, pv);
  }
}
async function enregistrerEcran() {
  for (const n of $("#ecran").querySelectorAll("[data-cle]")) {
    if (n.closest("[hidden]")) continue; // suite masquée (par exemple : murs qui ne sont pas à vous)
    const { etape, cle, type } = n.dataset;
    if (type === "phrase") { if (n.value.trim()) await enregistrer(etape, cle, n.value.trim().slice(0, 2000)); }
    else if (type === "etiquettes") await enregistrer(etape, cle, [...n.querySelectorAll("input[type=checkbox]:checked")].map((x) => x.value));
    else if (type === "multi") {
      const c = QUESTIONS.flatMap((q) => [...q.champs, ...(q.suite?.champs || [])]).find((x) => x.etape === etape && x.cle === cle);
      await enregistrer(etape, cle, limiterChoix([...n.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.valeur), c?.max));
    } else if (type === "nombre") {
      const { valeur, illisible } = n.lire();
      if (illisible) { n.champ.focus(); throw new Error(t("demarrer.js.erreurs.montant_illisible")); }
      if (valeur != null) await enregistrer(etape, cle, valeur / Number(n.dataset.facteur || 1));
    } else if (type === "dates") {
      const lignes = [];
      for (const x of n._lignes) {
        if (!x.date && !x.precision.trim()) continue;
        const d = lireDate(x.date);
        if (!d) { n.querySelectorAll(".dates-date")[n._lignes.indexOf(x)]?.focus(); throw new Error(t("demarrer.js.dates.illisible", { date: x.date || "…" })); }
        lignes.push({ date: d.texte, type: x.type, precision: x.precision.trim().slice(0, 120), source: x.source || null });
      }
      await enregistrer(etape, cle, lignes.sort((a, b) => lireDate(a.date).annee - lireDate(b.date).annee));
    } else if (type === "exceptionnels") await enregistrer(etape, cle, n._liste.filter((x) => Number.isFinite(x.montant) && x.montant !== 0));
    else if (type === "top_clients") {
      const lignes = [];
      for (const l of n.querySelectorAll(".top-clients-ligne")) {
        const part = lireNombre(l.querySelector('[data-col="part"]').value), anc = lireNombre(l.querySelector('[data-col="anciennete"]').value);
        if (Number.isNaN(part) || Number.isNaN(anc)) throw new Error(t("demarrer.js.erreurs.part_illisible"));
        if (part == null) continue;
        if (part <= 0 || part > 100) throw new Error(t("demarrer.js.erreurs.part_bornes"));
        lignes.push({ part: part / 100, anciennete: anc == null ? null : Math.round(anc), secteur: l.querySelector('[data-col="secteur"]').value.trim().slice(0, 40) || null });
      }
      if (lignes.reduce((a, x) => a + x.part, 0) > 1.0001) throw new Error(t("demarrer.js.erreurs.parts_total"));
      if (lignes.length || Array.isArray(S.reponses[etape]?.[cle])) await enregistrer(etape, cle, lignes);
    }
  }
}
/** Screen seen: saved ("Skip" counts as an answer), so that the file page counts the same way. */
function marquerVue(qid) {
  if (S.vues.includes(qid)) return Promise.resolve();
  S.vues.push(qid);
  S.reponses.parcours = { ...(S.reponses.parcours || {}), vues: [...S.vues] };
  return api(`${base}/answers/parcours`, { method: "PUT", body: JSON.stringify({ data: S.reponses.parcours }) }).then(() => rafraichirEtat()).catch(() => null);
}
/** "Question N of M" counter: M = questions still to show when arriving at the questions (those already
 *  answered, approved in the summary or skipped are not included); it does not change from one screen to the next. */
const cleEcran = () => (S.q < 0 ? "site" : QUESTIONS[S.q]?.id);
function compteur() {
  if (!S.aPoser) S.aPoser = questionsAPoser(S.reponses, S.vues);
  const cle = cleEcran();
  if (cle && !S.aPoser.includes(cle)) S.aPoser = [...S.aPoser, cle].sort((a, b) => ordre(a) - ordre(b)); // came back by itself ("Back")
  const n = S.aPoser.indexOf(cle) + 1, total = S.aPoser.length;
  return el("div", { class: "q-tete" }, el("p", { class: "q-compteur", text: t("demarrer.js.question_n", { n, total }) }),
    el("span", { class: "q-jauge", "aria-hidden": "true" }, el("span", { style: `width:${Math.round((n / total) * 100)}%` })));
}
const ordre = (cle) => (cle === "site" ? -1 : QUESTIONS.findIndex((q) => q.id === cle));
/** "Back": the previous screen in the list of questions shown; before the first one, the figures. */
function precedente() {
  const i = (S.aPoser || []).indexOf(cleEcran());
  const prec = i > 0 ? S.aPoser[i - 1] : null;
  if (prec == null) { aller("chiffres"); return; }
  S.q = ordre(prec); questions();
}
/** Le site vient d'être lu : ses faits, son logo et ses photos sont à valider (juste après la lecture). */
const siteAValider = () => { const s = S.reponses.site || {}; return Boolean(s.url && !s.confirme && ((s.faits || []).length || (s.logos || []).length)); };
const photosAChoisir = () => { const s = S.reponses.site || {}; return Boolean(s.url && s.confirme && !S.vues.includes("photos") && ((s.photos_candidates || []).length || (s.logos || []).length)); };
function suivante(q) {
  marquerVue(q.id);
  // Came from drafting to complete a required answer: go back there as soon as everything is filled in
  if (S.retour === "redaction") {
    const reste = questionsIncompletes(S.reponses);
    if (reste.length) { S.q = QUESTIONS.indexOf(reste[0]); questions(); } else { S.retour = null; aller("redaction"); }
    return;
  }
  // Next question still unanswered (those approved in the summary are skipped)
  const i = QUESTIONS.indexOf(q);
  const j = QUESTIONS.findIndex((x, k) => k > i && !questionRepondue(x, S.reponses, S.vues));
  if (j >= 0) { S.q = j; questions(); } else aller(etapeCourante());
}
/** First question: the website. Its reading continues during the following questions. */
function questionSite() {
  const proposition = S.reponses.site?.url || siteDepuisEmail(S.email) || "";
  const input = el("input", { type: "text", id: "site-url", inputmode: "url", value: proposition, placeholder: t("memo.www_mon_entreprise_fr"), autocomplete: "url" });
  // Next question still unanswered (the website no longer needs asking)
  const suivanteQ = () => { message(""); const j = QUESTIONS.findIndex((x) => !questionRepondue(x, S.reponses, S.vues)); if (j >= 0) { S.q = j; questions(); } else aller(etapeCourante()); };
  remplir(
    compteur(),
    ...titre(proposition ? t("demarrer.js.site.est_ce") : t("demarrer.js.site.a_t_elle"),
      t("demarrer.js.site.aide")),
    el("div", { class: "guide-champ" }, el("label", { class: "guide-lib", for: "site-url", text: t("demarrer.js.site.adresse") }), input),
    el("p", { class: "petit" }, el("button", { type: "button", class: "lien-simple", onclick: async () => {
      try { S.reponses.site = { aucun: true }; await api(`${base}/answers/site`, { method: "PUT", body: JSON.stringify({ data: S.reponses.site }) }); rafraichirEtat(); suivanteQ(); }
      catch (e) { message(e.message, true); }
    } }, t("demarrer.js.site.aucun"))),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => precedente() }, t("demarrer.js.retour")),
      el("button", { type: "button", class: "btn btn-vert", onclick: () => {
        const url = input.value.trim();
        if (!url) { message(t("demarrer.js.site.indiquez"), true); input.focus(); return; }
        lancerLectureSite(url);
        S.reponses.site = { ...(S.reponses.site || {}), url, aucun: undefined };
        suivanteQ();
      } }, proposition ? t("demarrer.js.site.oui_lire") : t("demarrer.js.site.lire"), fleche())),
    el("p", { class: "q-usage", text: t("demarrer.js.site.usage") }));
}
// ---- Summary: all the prepared answers on one screen, approved in one click (the rest is asked afterwards)
const cleRecap = `passation-recap-${id}`;
const recapVu = () => { try { return Boolean(sessionStorage.getItem(cleRecap)); } catch { return S.recapVu; } };
const marquerRecap = () => { S.recapVu = true; try { sessionStorage.setItem(cleRecap, "1"); } catch { /* without storage */ } };
const clesEnAttente = (q) => Object.keys(S.propositions[q.id]?.valeurs || {}).filter((k) => { const [e, c] = k.split("."); return S.reponses[e]?.[c] == null; });
const questionsPreparees = () => QUESTIONS.filter((q) => clesEnAttente(q).length && !S.propositions[q.id]?.a_completer && !questionRepondue(q, S.reponses, S.vues));
/** Proposed value in plain words (choice label, percentage, list, shortened text). */
function libelleValeur(q, cle, v) {
  const c = champDeCle(q, cle);
  if (c?.type === "choix") return libelleOption(c.cle, v);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
function recapitulatif() {
  const liste = questionsPreparees();
  const coches = new Map(liste.map((q) => [q.id, true]));
  const bouton = el("button", { type: "button", class: "btn btn-vert" });
  const majBouton = () => { const n = [...coches.values()].filter(Boolean).length; bouton.textContent = n ? t("demarrer.js.recap.valider", { n }) : t("demarrer.js.continuer"); bouton.append(fleche()); };
  majBouton();
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    try {
      for (const q of liste) if (coches.get(q.id)) for (const k of clesEnAttente(q)) { const [e, c] = k.split("."); await enregistrer(e, c, S.propositions[q.id].valeurs[k]); }
      marquerRecap(); message(""); S.aPoser = null; // the counter no longer counts the answers that have just been approved
      rafraichirEtat();
      aller(etapeCourante());
    } catch (e) { message(e.message, true); bouton.disabled = false; }
  });
  remplir(
    el("p", { class: "q-compteur", text: t("demarrer.js.recap.preparees", { n: liste.length }) }),
    ...titre(t("demarrer.js.recap.titre"), t("demarrer.js.recap.aide")),
    el("ul", { class: "recap-liste" }, ...liste.map((q) => {
      const cb = el("input", { type: "checkbox", id: `recap-${q.id}`, checked: true });
      cb.addEventListener("change", () => { coches.set(q.id, cb.checked); cb.closest("li").classList.toggle("decoche", !cb.checked); majBouton(); });
      const p = S.propositions[q.id];
      return el("li", {}, el("label", { for: `recap-${q.id}`, class: "recap-carte" }, cb,
        el("span", { class: "recap-texte" }, el("strong", { text: q.titre }),
          el("span", { class: "recap-valeurs" }, ...clesEnAttente(q).map((k) => el("span", { text: libelleValeur(q, k, p.valeurs[k]) }))),
          el("small", { text: p.source }))));
    })),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => { marquerRecap(); S.aPoser = null; questions(); } }, t("demarrer.js.recap.une_par_une")), bouton));
}

function questions() {
  // The summary of prepared answers comes before the first question: the "Question N of M" counter is
  // set afterwards, once and for all (it does not restart from 1 after the prepared answers are approved)
  if (!recapVu() && questionsPreparees().length >= 3) return recapitulatif();
  if (S.q < 0) return questionSite();
  const q = QUESTIONS[S.q];
  const prop = S.propositions[q.id];
  const aValider = prop && Object.keys(prop.valeurs).some((k) => { const [e, c] = k.split("."); return S.reponses[e]?.[c] == null; });
  const seulChoix = !aValider && q.champs.length === 1 && q.champs[0].type === "choix" && !q.suite?.si(S.reponses);
  remplir(
    compteur(),
    ...titre(q.titre, q.aide),
    aValider ? el("p", { class: "proposition-bandeau" }, t("demarrer.js.question.preparee_court", { source: prop.source })) : null,
    ...q.champs.map((c) => champ(c, q)),
    q.suite ? el("div", { class: "guide-suite", "data-suite": "1", hidden: !q.suite.si(S.reponses) }, ...q.suite.champs.map((c) => champ(c, q))) : null,
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => precedente() }, t("demarrer.js.retour")),
      seulChoix ? el("button", { type: "button", class: "lien-simple", onclick: () => suivante(q) }, t("demarrer.js.question.passer"))
        : el("button", { type: "button", class: "btn btn-vert", onclick: async (ev) => {
          const bouton = ev.currentTarget;
          bouton.disabled = true;
          try {
            if (aValider) await validerPropositions(q);
            await enregistrerEcran();
            const manque = requisManquants(q, S.reponses);
            if (manque.length) { message(t("demarrer.js.question.il_manque", { liste: manque.length > 1 ? t("dossier.annees.liste", { debut: manque.slice(0, -1).join(", "), fin: manque.at(-1) }) : manque[0] }), true); bouton.disabled = false; $("#ecran").querySelector("textarea, .puces-choix .puce")?.focus(); return; }
            message(""); suivante(q);
          } catch (e) { message(e.message, true); bouton.disabled = false; }
        } }, t("demarrer.js.continuer"), fleche())),
    ouVa(q));
  // Montant proposé d'après un autre montant de l'écran : il suit la saisie tant qu'il n'est pas confirmé
  for (const c of [...q.champs, ...(q.suite?.champs || [])].filter((x) => x.propose)) {
    const [e, k] = c.propose.split(".");
    const source = $(`#ecran [data-etape="${e}"][data-cle="${k}"][data-type=nombre]`), cible = $(`#ecran [data-etape="${c.etape}"][data-cle="${c.cle}"][data-type=nombre]`);
    if (source && cible?.suivre) source.champ.addEventListener("input", () => cible.suivre(source.lire().valeur));
  }
  // Phrase d'activité : mise à jour à chaque coche (métiers, clients), tant que le dirigeant ne l'a pas modifiée
  const phrase = $("#ecran [data-type=phrase]");
  if (phrase) { $("#ecran").addEventListener("change", () => phrase.proposer()); queueMicrotask(() => phrase.proposer()); }
}

// ================================================================== 4. Your website
async function site() {
  if (S.lectureSite) { message(t("demarrer.js.site.lecture")); await S.lectureSite; message(""); }
  const s = S.reponses.site || {};
  if (!s.url || !((s.faits || []).length || (s.logos || []).length)) { aller(photosAChoisir() ? "photos" : etapeCourante()); return; }
  const faits = (s.faits || []).map((f) => ({ ...f, valide: s.confirme ? f.valide !== false : true }));
  const conflits = contradictions(faits, S.dossier?.entreprise || {});
  const enConflit = new Set(conflits.map((c) => c.id));
  const choix = new Map(); // id du fait → « site » | « registre » | « deux »
  const ligne = (f) => {
    const li = el("li", { class: f.valide ? null : "retire" }, el("span", { class: "fait-txt", text: f.fait }));
    const b = el("button", { type: "button", class: "lien-simple fait-action", "aria-label": null });
    const maj = () => { li.classList.toggle("retire", !f.valide); b.textContent = f.valide ? t("demarrer.js.site.retirer") : t("demarrer.js.site.remettre"); b.setAttribute("aria-label", `${b.textContent} : ${f.fait}`); };
    b.addEventListener("click", () => { f.valide = !f.valide; maj(); });
    maj(); li.append(b);
    return li;
  };
  const libres = faits.filter((f) => !enConflit.has(f.id));
  const essentiels = faitsEssentiels(libres, 4);
  const autres = libres.filter((f) => !essentiels.includes(f));
  const blocConflit = (c) => {
    const f = faits.find((x) => x.id === c.id);
    const nom = `conflit-${c.id}`;
    const registre = c.type === "creation" ? String(c.registre) : t("demarrer.js.site.tranche", { min: c.registre[0], max: Number.isFinite(c.registre[1]) ? c.registre[1] : "…" });
    const option = (val, fort, texte) => {
      const r = el("input", { type: "radio", name: nom, value: val });
      r.addEventListener("change", () => choix.set(c.id, val));
      return el("label", { class: "conflit-choix" }, r, el("span", {}, el("strong", { text: fort }), el("span", { text: texte })));
    };
    return el("fieldset", { class: "conflit" }, el("legend", {}, el("span", { class: "pastille-alerte", text: t("demarrer.js.site.a_verifier") }), t(`demarrer.js.site.conflit_${c.type}`)),
      el("p", { class: "petit", text: t("demarrer.js.site.conflit_aide") }),
      el("div", { class: "conflit-deux" },
        option("site", String(c.site), t("demarrer.js.site.selon_site", { fait: f.fait })),
        option("registre", registre, t("demarrer.js.site.selon_registres"))),
      c.type === "creation" ? option("deux", t("demarrer.js.site.les_deux"), t("demarrer.js.site.les_deux_aide")) : null);
  };
  const plus = autres.length ? el("details", { class: "guide-replie faits-autres" }, el("summary", { text: t("demarrer.js.site.voir_autres", { n: autres.length }) }),
    ...faitsParTheme(autres).map(([theme, l]) => el("section", { class: "faits-theme" }, el("h2", { text: t(`demarrer.js.site.themes.${theme}`) }), el("ul", { class: "faits-liste" }, ...l.map(ligne))))) : null;
  remplir(
    el("p", { class: "q-compteur", text: t("demarrer.js.site.lu", { site: new URL(s.url).hostname, n: (s.pages || []).length || 1 }) }),
    ...titre(t("demarrer.js.site.retenu_titre"), t("demarrer.js.site.retenu_aide", { n: faits.length })),
    ...conflits.map(blocConflit),
    essentiels.length ? el("ul", { class: "faits-liste faits-essentiels" }, ...essentiels.map(ligne)) : null,
    plus,
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { S.q = Math.max(0, QUESTIONS.findIndex((x) => !questionRepondue(x, S.reponses, S.vues))); aller("questions"); } }, t("demarrer.js.site.plus_tard")),
      el("button", { type: "button", class: "btn btn-vert", onclick: async (ev) => {
        const bouton = ev.currentTarget;
        bouton.disabled = true;
        try {
          // Contradiction tranchée : registres → fait écarté ; site ou les deux → fait gardé (« resolu »)
          const final = faits.map((f) => (enConflit.has(f.id) && choix.has(f.id) ? { ...f, valide: choix.get(f.id) !== "registre", resolu: true } : f));
          const memo = await api(`${base}/documents/memo`).catch(() => null); // photos et logo à jour (jamais écrasés)
          const site = { ...(memo?.site || S.reponses.site || {}), faits: final, confirme: true };
          await api(`${base}/answers/site`, { method: "PUT", body: JSON.stringify({ data: site }) });
          S.reponses.site = site; S.memo = memo;
          rafraichirPropositions();
          aller(photosAChoisir() ? "photos" : etapeCourante());
        } catch (e) { message(e.message, true); bouton.disabled = false; }
      } }, t("demarrer.js.site.valider_faits"), fleche())),
    el("p", { class: "q-usage", text: t("demarrer.js.site.usage_faits") }));
}

/** Logo et photos du site : le logo trouvé est présélectionné ; le dirigeant clique les photos à utiliser (6 au plus)
 *  et coche une seule fois la case de droits. Ce qui est choisi va sur la couverture, l'activité et l'équipe. */
const PHOTOS_MAX = 6;
async function photos() {
  const memo = S.memo?.site ? S.memo : await api(`${base}/documents/memo`).catch(() => null);
  S.memo = memo;
  const s = memo?.site || S.reponses.site || {};
  const deja = memo?.photos || [];
  const candidates = (s.photos_candidates || []).slice(0, 12);
  const choisies = new Set(deja.map((p) => p.origine).filter((u) => candidates.includes(u)));
  const propres = deja.filter((p) => !p.origine || !candidates.includes(p.origine)); // déposées par le dirigeant
  const logos = s.logos || [];
  let logo = memo?.logo ? "garde" : logos[0]?.url ?? null;
  const compte = el("p", { class: "guide-compte", "aria-live": "polite" });
  const bouton = el("button", { type: "button", class: "btn btn-vert" });
  const grille = el("div", { class: "photos-grille", role: "group", "aria-labelledby": "photos-titre" });
  const maj = () => {
    const n = choisies.size + propres.length;
    for (const b of grille.querySelectorAll(".photo-tuile")) b.disabled = b.getAttribute("aria-pressed") !== "true" && n >= PHOTOS_MAX;
    compte.textContent = t("demarrer.js.photos.compte", { n, max: PHOTOS_MAX });
    bouton.replaceChildren(n ? t("demarrer.js.photos.utiliser", { n }) : t("demarrer.js.photos.sans_photo"), fleche());
  };
  grille.append(...candidates.map((u, k) => el("button", { type: "button", class: "photo-tuile", "aria-pressed": String(choisies.has(u)), "aria-label": t("demarrer.js.photos.photo_n", { n: k + 1 }), onclick: (ev) => {
    const b = ev.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (on) choisies.add(u); else choisies.delete(u);
    maj();
  } }, el("img", { src: u, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.currentTarget.closest(".photo-tuile")?.remove() }), el("span", { class: "photo-coche", "aria-hidden": "true" }))),
  ...propres.map((p) => el("figure", { class: "photo-tuile photo-propre", "aria-pressed": "true" }, el("img", { src: `${base}/documents/memo/photos/${p.n}?v=${Date.now()}`, alt: p.legende || t("demarrer.js.photos.deposee") }),
    el("button", { type: "button", class: "lien-simple", onclick: async () => { try { S.memo = await api(`${base}/documents/memo/photos/${p.n}`, { method: "DELETE" }); photos(); } catch (e) { message(e.message, true); } } }, t("espace.js.retirer")))));
  const droits = el("input", { type: "checkbox", id: "photos-droits" });
  const fichier = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "photos-fichier", class: "visuellement-cache", multiple: true });
  fichier.addEventListener("change", async () => {
    if (!droits.checked) { message(t("demarrer.js.photos.cochez_droits"), true); droits.focus(); fichier.value = ""; return; }
    for (const f of [...fichier.files].slice(0, PHOTOS_MAX)) {
      const fd = new FormData(); fd.append("fichier", f); fd.append("attestation", "oui");
      try { S.memo = await api(`${base}/documents/memo/photos`, { method: "POST", body: fd }); } catch (e) { message(e.message, true); break; }
    }
    photos();
  });
  // Logo : présélectionné ; « Changer » ouvre les autres candidats, le dépôt et « aucun »
  const apercuLogo = () => (logo === "garde" ? `${base}/documents/memo/logo?v=${Date.now()}` : logo);
  const zoneLogo = el("div", { class: "logo-ligne" });
  const dessinerLogo = (ouvert = false) => remplacer(zoneLogo,
    el("span", { class: "logo-apercu" }, apercuLogo() ? el("img", { src: apercuLogo(), alt: t("demarrer.js.site.votre_logo"), referrerpolicy: "no-referrer" }) : el("span", { class: "petit", text: t("demarrer.js.photos.aucun_logo") })),
    el("div", { class: "logo-texte" }, el("strong", { text: t("demarrer.js.site.votre_logo") }), el("span", { class: "petit", text: logo ? t("demarrer.js.photos.logo_aide") : t("demarrer.js.photos.logo_aucun_aide") })),
    logos.length > 1 || !logo ? el("button", { type: "button", class: "btn btn-contour btn-mini", "aria-expanded": String(ouvert), onclick: () => dessinerLogo(!ouvert) }, t("demarrer.js.photos.changer")) : null,
    ouvert ? el("div", { class: "logos-liste", role: "radiogroup", "aria-label": t("demarrer.js.site.choix_logo") },
      ...logos.map((l, k) => { const r = el("input", { type: "radio", name: "logo", id: `logo-${k}`, checked: logo === l.url, class: "visuellement-cache" }); r.addEventListener("change", () => { logo = l.url; dessinerLogo(true); }); return el("label", { class: "logo-choix", for: `logo-${k}` }, r, el("img", { src: l.url, alt: l.origine, referrerpolicy: "no-referrer" })); }),
      (() => { const r = el("input", { type: "radio", name: "logo", id: "logo-aucun", class: "visuellement-cache", checked: !logo }); r.addEventListener("change", () => { logo = null; dessinerLogo(true); }); return el("label", { class: "logo-choix logo-aucun", for: "logo-aucun" }, r, t("demarrer.js.site.aucun_logo")); })()) : null);
  dessinerLogo();
  bouton.addEventListener("click", async () => {
    const aAjouter = [...choisies].filter((u) => !deja.some((p) => p.origine === u));
    if (aAjouter.length && !droits.checked) { message(t("demarrer.js.photos.cochez_droits"), true); droits.focus(); return; }
    bouton.disabled = true; message(t("demarrer.js.photos.enregistrement"));
    const echecs = [];
    try {
      if (logo && logo !== "garde") await api(`${base}/documents/memo/logo`, { method: "POST", body: JSON.stringify({ url: logo }) }).catch(() => echecs.push("logo"));
      // Photos du site décochées : retirées (de la dernière à la première, les numéros se décalent)
      for (const p of [...deja].reverse()) if (p.origine && candidates.includes(p.origine) && !choisies.has(p.origine)) S.memo = await api(`${base}/documents/memo/photos/${p.n}`, { method: "DELETE" });
      for (const u of aAjouter) {
        try { S.memo = await api(`${base}/documents/memo/photos`, { method: "POST", body: JSON.stringify({ url: u, attestation: true }) }); }
        catch { echecs.push(u); }
      }
      await marquerVue("photos");
      message(echecs.length ? t("demarrer.js.photos.echecs", { n: echecs.length }) : "", Boolean(echecs.length));
      aller(etapeCourante());
    } catch (e) { message(e.message, true); bouton.disabled = false; }
  });
  maj();
  remplir(
    el("p", { class: "q-compteur", text: new URL(s.url).hostname }),
    ...titre(t("demarrer.js.photos.titre"), t("demarrer.js.photos.aide")),
    zoneLogo,
    candidates.length || propres.length ? el("div", { class: "guide-champ" },
      el("p", { class: "guide-lib", id: "photos-titre", text: t("demarrer.js.photos.cliquez") }),
      el("p", { class: "guide-aide", text: t("demarrer.js.photos.usage", { max: PHOTOS_MAX }) }),
      grille, compte) : el("p", { class: "petit", text: t("demarrer.js.photos.aucune") }),
    el("label", { class: "photos-droits", for: "photos-droits" }, droits, el("span", { text: t("demarrer.js.photos.droits") })),
    el("p", { class: "petit" }, el("label", { class: "lien-simple", for: "photos-fichier", tabindex: "0", onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fichier.click(); } } }, t("demarrer.js.photos.deposer")), fichier, " ", t("demarrer.js.photos.formats")),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => aller("site") }, t("demarrer.js.retour")),
      bouton),
    el("p", { class: "q-usage", text: t("demarrer.js.photos.ou_va") }));
}

// ================================================================== 0. Accueil de l'analyse approfondie
/** Écran d'accueil, une seule fois, avant tout : ce qui va se passer, en combien de temps, un seul bouton. */
function accueil() {
  const e = S.dossier?.entreprise || {}, est = S.dossier?.estimation;
  const publics = Object.entries(S.chiffres?.exercices || {}).filter(([, l]) => Object.values(l).some((x) => x.source === "inpi" && x.valeur != null)).map(([a]) => a).sort();
  remplir(
    el("p", { class: "q-compteur accueil-sur", text: t("demarrer.js.accueil.surtitre") }),
    el("h1", { class: "guide-titre accueil-titre", tabindex: "-1", text: t("demarrer.js.accueil.titre") }),
    el("p", { class: "chapo-petit", text: t("demarrer.js.accueil.chapo") }),
    el("ol", { class: "accueil-etapes" },
      el("li", {}, el("strong", { text: t("demarrer.js.accueil.chiffres_titre") }), el("span", { text: publics.length ? t("demarrer.js.accueil.chiffres_publics", { annees: publics.join(", ") }) : t("demarrer.js.accueil.chiffres") })),
      el("li", {}, el("strong", { text: t("demarrer.js.accueil.reponses_titre") }), el("span", { text: t("demarrer.js.accueil.reponses", { n: QUESTIONS.length + 1 }) })),
      el("li", {}, el("strong", { text: t("demarrer.js.accueil.redaction_titre") }), el("span", { text: t("demarrer.js.accueil.redaction") }))),
    el("div", { class: "accueil-depart" },
      el("button", { type: "button", class: "btn btn-vert", onclick: async (ev) => { ev.currentTarget.disabled = true; await marquerVue("accueil"); aller(etapeCourante()); } }, t("demarrer.js.accueil.commencer"), fleche()),
      el("span", { class: "petit", text: t("demarrer.js.accueil.reprise") })),
    est?.statut === "ok" ? el("p", { class: "petit accueil-deja" }, el("strong", { text: t("demarrer.js.accueil.deja") }), " ", t("demarrer.js.accueil.deja_estimation", { fourchette: fourchette(est.bas, est.haut), nom: e.nom || "" })) : null);
}

// ================================================================== 5. Drafting (all in one go)
/** Market research launched as soon as the flow opens (registries + web search, one to two minutes): it depends
 *  only on the company, and runs while the owner answers the questions. Only once per file. */
function lancerEtudeMarche() {
  if (S.marche) return S.marche;
  const cle = `passation-marche-${id}`;
  try { const t = Number(localStorage.getItem(cle)); if (t && Date.now() - t < 10 * 60 * 1000) return null; localStorage.setItem(cle, String(Date.now())); } catch { /* storage unavailable */ }
  // On failure, the error is kept: drafting does not launch a second search (two more minutes and
  // an attempt used up), unless the study was already in progress (409), in which case it waits for its result
  S.marche = api(`${base}/documents/memo`).then((m) => (m.marche?.date ? m : api(`${base}/documents/memo/marche`, { method: "POST" }))).catch((e) => ({ echec: e }));
  return S.marche;
}

/** Runs tasks with at most n in parallel (continuous queue: a task starts as soon as another one finishes). */
async function enParallele(taches, n, f) {
  const file = [...taches];
  await Promise.all(Array.from({ length: Math.min(n, file.length) }, async () => { while (file.length) await f(file.shift()); }));
}

async function redaction() {
  const SECTIONS = ["synthese", "histoire", "activite", "organisation", "marche", "clients", "finances", "perspectives", "operation"].map((k) => [k, t(`demarrer.js.redaction.sections.${k}`)]);
  const taches = [
    ["valorisation", t("demarrer.js.redaction.valorisation"), () => api(`${base}/valuation`, { method: "POST" })],
    ["etude-marche", t("demarrer.js.redaction.marche"), async () => {
      const m = await (S.marche || null);
      if (m?.marche?.date) return;
      if (m?.echec && m.echec.statut !== 409) throw m.echec; // already attempted during the questions: no second search
      try { await api(`${base}/documents/memo/marche`, { method: "POST" }); }
      catch (e) {
        if (e.statut !== 409) throw e;
        // Already in progress (launched at the start of the flow): wait for its result, two minutes at most
        for (let k = 0; k < 24; k++) { await new Promise((r) => setTimeout(r, 5000)); const x = await api(`${base}/documents/memo`).catch(() => null); if (x?.marche?.date || !x?.marche?.en_cours) return; }
      }
    }],
    ["datapack", t("dossier.documents.datapack"), () => api(`${base}/documents/datapack`, { method: "POST" })],
    ["teaser", t("dossier.documents.teaser"), () => api(`${base}/documents/teaser`, { method: "POST" })],
    ...SECTIONS.map(([k, nom]) => [`memo-${k}`, t("demarrer.js.redaction.memo_section", { section: nom }), () => api(`${base}/documents/memo/sections/${k}`, { method: "POST" })]),
  ];
  const libelle = Object.fromEntries(taches.map(([k, lib]) => [k, lib]));
  // Answers required for the memorandum: checked before launching anything (otherwise 9 failures with no way out)
  const incompletes = questionsIncompletes(S.reponses);
  // What is already drafted is not redone (resumption after an interruption)
  const deja = new Set();
  try {
    const [d, m] = await Promise.all([api(base), api(`${base}/documents/memo`)]);
    if (d.parcours?.valorisation) deja.add("valorisation");
    if (d.documents?.datapack) deja.add("datapack");
    if (d.documents?.teaser) deja.add("teaser");
    for (const x of m.sections || []) if (x.redigee) deja.add(`memo-${x.cle}`);
    if (m.marche?.date) deja.add("etude-marche");
  } catch { /* redo everything */ }
  const lignes = Object.fromEntries(taches.map(([k, lib]) => [k, el("li", { class: deja.has(k) ? "fait" : incompletes.length && k.startsWith("memo-") ? "attente" : null }, el("span", { class: "etat", "aria-hidden": "true" }), lib)]));
  const chrono = el("span", { class: "petit guide-chrono", "aria-hidden": "true" });
  remplir(...titre(t("demarrer.js.redaction.titre"), t("demarrer.js.redaction.aide")),
    chrono, el("ul", { class: "guide-taches" }, ...Object.values(lignes)), el("div", { id: "redaction-suite" }));
  const debut = Date.now(), minuterie = setInterval(() => { const s = Math.round((Date.now() - debut) / 1000); chrono.textContent = t("demarrer.js.redaction.chrono", { s, n: $("#ecran .guide-taches")?.querySelectorAll("li.fait").length ?? 0, total: taches.length }); }, 1000);
  const erreurs = [];
  const executer = async ([k, , f]) => {
    if (deja.has(k) || (incompletes.length && k.startsWith("memo-"))) return;
    lignes[k].classList.add("en-cours");
    try { await f(); lignes[k].classList.replace("en-cours", "fait"); }
    catch (e) { lignes[k].classList.replace("en-cours", "erreur"); erreurs.push({ k, message: e.message, statut: e.statut }); }
  };
  try {
    await executer(taches[0]); // the valuation first: the datapack, the teaser and the memorandum use it
    // The market research runs during everything else; only the chapters that cite it (market, summary,
    // outlook) wait for it, and they go last
    const marche = executer(taches[1]);
    const citent = new Set(["memo-marche", "memo-synthese", "memo-perspectives"]);
    const memo = taches.filter(([k]) => k.startsWith("memo-"));
    await enParallele([...taches.slice(2).filter(([k]) => !k.startsWith("memo-")), ...memo.filter(([k]) => !citent.has(k))], 4, executer);
    await marche;
    await enParallele(memo.filter(([k]) => citent.has(k)), 3, executer);
  } finally { clearInterval(minuterie); }

  const suite = $("#redaction-suite");
  // 1. Missing required answers: ask for them here, with direct access to the question
  let manquantes = incompletes;
  if (!manquantes.length && erreurs.some((e) => e.statut === 409 && e.k.startsWith("memo-"))) {
    S.reponses = (await api(`${base}/answers`).catch(() => ({}))).reponses || S.reponses; // answers possibly changed elsewhere
    manquantes = questionsIncompletes(S.reponses);
  }
  if (manquantes.length) {
    remplacer(suite, el("div", { class: "carte guide-todo" },
      el("h2", { text: t("demarrer.js.redaction.manque_titre") }),
      el("p", { class: "petit", text: t("demarrer.js.redaction.manque_aide") }),
      ...manquantes.map((q) => el("button", { type: "button", class: "btn btn-noir", onclick: () => { S.retour = "redaction"; S.q = QUESTIONS.indexOf(q); aller("questions"); } }, t("demarrer.js.redaction.repondre", { question: q.titre }), fleche()))));
    $("#ecran").querySelector("#redaction-suite button")?.focus();
    return;
  }
  // 2. Temporary failures (drafting service unavailable, timeout): one message per cause, and "Try again"
  const nonBloquants = new Set(["teaser", "etude-marche"]);
  const bloquantes = erreurs.filter((e) => !nonBloquants.has(e.k));
  if (bloquantes.length) {
    const causes = new Map();
    for (const e of bloquantes) causes.set(e.message, [...(causes.get(e.message) || []), libelle[e.k]]);
    remplacer(suite, el("div", { class: "carte guide-todo" },
      el("h2", { text: t("demarrer.js.redaction.echecs", { n: bloquantes.length }) }),
      el("ul", {}, ...[...causes].map(([m, l]) => el("li", {}, el("strong", { text: t("demarrer.js.redaction.cause", { liste: l.join(", ") }) }), m))),
      el("p", { class: "petit", text: t("demarrer.js.redaction.conserve") }),
      el("button", { type: "button", class: "btn btn-noir", onclick: () => redaction() }, t("demarrer.js.redaction.relancer"))));
    return;
  }
  if (erreurs.some((e) => e.k === "teaser")) message(t("demarrer.js.redaction.teaser_anonymat"), true);
  await api(`${base}/termine`, { method: "POST" }).catch(() => null);
  S.complet = true;
  aller("pret");
}

// ================================================================== Review and sending
/** Final screen: same state as the file page (etatParcours), so same status, same percentage, same range
 *  and same tasks. "Ready" only if everything required is done; otherwise "drafted" and what is left. */
async function pret() {
  const e = (await rafraichirEtat()) || etatParcours(S.dossier, null);
  const f = ecranFinal(e), v = e.valeur;
  const memo = await api(`${base}/documents/memo`).catch(() => null);
  const doc = (cle) => e.documents.find((x) => x.cle === cle);
  const restent = f.reste.filter((x) => !x.facultatif), facultatives = f.reste.filter((x) => x.facultatif);
  const lienTache = (x) => (x.pieces ? lien(`/espace/?dossier=${id}#checklist`) : x.href.startsWith("#") ? lien(`/espace/?dossier=${id}${x.href}`) : x.href);
  const etatDoc = (d) => el("span", { class: `etat etat-${d.etat}`, text: d.badge || t(`espace.js.etats.${d.etat}`) });
  // Le mémorandum, document principal : miniature de sa couverture (nom de code, logo et photo choisis)
  const m = doc("memo");
  const photo = memo?.photos?.length ? `${base}/documents/memo/photos/${rangPhoto("couverture", memo.photos.length)}` : null;
  const couverture = el("div", { class: "fin-couverture", "aria-hidden": "true" },
    photo ? el("span", { class: "fin-couv-photo", style: `background-image:url('${photo}')` }) : null,
    memo?.logo ? el("img", { class: "fin-couv-logo", src: `${base}/documents/memo/logo`, alt: "" }) : null,
    el("span", { class: "fin-couv-titre", text: S.dossier?.nom_de_code || t("memo.memorandum_information") }),
    el("span", { class: "fin-couv-sous", text: t("memo.memorandum_information") }));
  const principal = m.actions.find((a) => a.principal);
  const pdf = m.actions.find((a) => !a.principal);
  // Les autres documents : leur nature (PDF, Excel, page web) et leur état
  const TYPES = { teaser: "pdf", datapack: "xlsx", valorisation: "web" };
  const autres = ["teaser", "datapack", "valorisation"].map(doc).map((d) => {
    const a = d.actions.find((x) => x.principal);
    return el("li", { class: `fin-doc doc-${d.etat}` },
      el("span", { class: `fin-type fin-type-${TYPES[d.cle]}`, text: t(`demarrer.js.pret.types.${TYPES[d.cle]}`) }),
      el("div", {}, el("strong", { text: d.titre }), el("span", { class: "petit", text: t(`espace.js.natures.${d.cle}`) })),
      etatDoc(d),
      a ? el("a", { class: "fin-ouvrir", href: a.href, download: a.telecharger ? "" : null, "aria-label": t("espace.js.action_de", { action: a.libelle, objet: d.titre }) }, a.libelle) : el("span"));
  });
  remplir(...titre(f.titre, f.aide),
    v.bas != null && v.haut != null ? el("p", { class: "fin-valeur" }, el("span", { text: v.etiquette }), el("strong", { class: "chiffre", text: fourchette(v.bas, v.haut) }), el("a", { href: v.lien.href, text: v.lien.texte })) : null,
    restent.length ? el("div", { class: "fin-reste" }, el("h2", { text: f.resteTitre }),
      el("ul", {}, ...restent.map((x) => el("li", {}, el("a", { href: lienTache(x), text: x.titre }), x.detail ? el("span", { class: "petit", text: ` · ${x.detail}` }) : null)))) : null,
    el("section", { class: "fin-memo", "aria-labelledby": "fin-memo-titre" }, couverture,
      el("div", { class: "fin-memo-texte" }, etatDoc(m),
        el("h2", { id: "fin-memo-titre", text: t("memo.memorandum_information") }),
        el("p", { class: "petit", text: t("demarrer.js.pret.memo_aide", { n: memo?.photos?.length || 0, photos: memo?.photos?.length || 0 }) }),
        el("div", { class: "fin-memo-actions" },
          principal ? el("a", { class: "btn btn-vert", href: principal.href }, principal.libelle === t("dossier.actions.ouvrir") ? t("demarrer.js.pret.relire_memo") : principal.libelle, fleche()) : null,
          pdf ? el("a", { class: "btn btn-contour", href: pdf.href }, pdf.libelle) : null))),
    el("ul", { class: "fin-docs" }, ...autres),
    facultatives.length ? el("div", { class: "fin-facultatif" }, el("p", { text: t("dossier.final.plus_loin") }),
      el("ul", {}, ...facultatives.map((x) => el("li", {}, el("a", { href: lienTache(x), text: x.titre }))))) : null,
    el("p", { class: "q-usage" }, el("a", { href: lien(`/espace/demarrer/?dossier=${id}&etape=questions`), text: t("demarrer.js.pret.revoir_reponses") })));
}

// ================================================================== Loading
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace(lien("/espace/")); return; }
  $("#lien-dossier").href = lien(`/espace/?dossier=${id}`);
  try {
    const [moi, dossier, ch, rep, props] = await Promise.all([api("/api/me"), api(base), api(`${base}/financials`), api(`${base}/answers`), api(`${base}/documents/memo/propositions`).catch(() => ({}))]);
    S.propositions = props.propositions || {};
    S.email = moi.email; S.dossier = dossier; S.chiffres = ch; S.reponses = rep.reponses || {}; S.vues = vuesDe(S.reponses);
    S.etat = etatParcours(dossier, ...(await documentsPourEtat(dossier)));
    $("#guide-entreprise").textContent = dossier.entreprise.nom || t("demarrer.votre_dossier");
    // Code name above the real name, as on the file page: the file will circulate under this name
    if (dossier.nom_de_code) { $("#guide-code").textContent = dossier.nom_de_code; $("#guide-nom-code").hidden = false; }
    document.title = `${dossier.entreprise.nom} · Passation`;
    S.complet = Boolean(dossier.documents?.memo && dossier.documents?.teaser && dossier.documents?.datapack && dossier.parcours?.valorisation);
    // Documents already drafted: reopen on the final screen (summary and points to complete), not on an optional
    // question left empty; ?etape=… still allows going back to it (audit, point 17)
    aller(etapeDemandee() || (S.complet || S.reponses.suivi?.pret_envoye ? "pret" : etapeCourante()));
    if (!S.complet && dossier.entreprise?.naf) lancerEtudeMarche(); // during the questions, not at the end
  } catch (e) { if (e.message !== "non_connecte") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
})();
