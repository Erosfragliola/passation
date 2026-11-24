// Parcours guidé : une étape à la fois, une seule action principale par écran, reprise là où l'on s'est arrêté.
// Les étapes sont celles de la page du dossier (liste unique ETAPES_PARCOURS, état calculé par etatParcours) :
//   Estimation (faite : le dossier vient de la fiche de l'accueil)
//   Vos chiffres : ce que Passation sait déjà, puis la liasse PDF ; à défaut, saisie de l'essentiel du dernier
//      exercice (le seul indispensable) ; puis un clic de confirmation, seules les lignes signalées demandent attention
//   Vos réponses : une question par écran, la première sur le site internet (proposé depuis l'adresse e-mail), lu
//      pendant les questions suivantes ; puis les faits relevés sur le site (décochez ce qui est faux) et le logo
//   Rédaction : valorisation, datapack, teaser et mémorandum générés d'un coup
//   Relecture et envoi : « prêt » seulement si tout l'indispensable est fait, sinon ce qui reste (même décompte que
//      la page du dossier)
import { CHAMPS, exercicesAttendus, libelleEcran, aideEcran, aideEbe as texteAideEbe } from "/js/champs-financiers.js";
import { REGIONS, libelleOption, detailOption } from "/js/questionnaire.js";
import { QUESTIONS, questionRepondue, requisManquants, questionsIncompletes, siteDepuisEmail, questionsAPoser, vuesDe, VALORISATION, champsVisibles, manquesValorisation, etatValorisation, MURS } from "/js/parcours.js";
import { TEMPS, ETAPE_DE_L_ECRAN, etiquetteExpress, etiquetteTitres, etatParcours, ecranFinal, alertesDirigeant, explicationEcart, resumeValorisation } from "/js/dossier-parcours.js";
import { apercuRetraitements, ebeExercice, kEuros, fois, pontValeur, situationAncc, texteAncc } from "/js/valeur-pont.js";
import { moisSource } from "/js/landing/estimation.js";
import { fourchette } from "/js/landing/estimation.js";
import { placementPhotos } from "/js/memo-format.js";
import { listePhotos } from "/js/photos-fiches.js";
import { zoneDepotPhotos, zoneLogo } from "/js/depot-photos.js";
import { ROLES, FORMATIONS, TYPES_EXPERIENCE, APRES, PERSONNES_MAX, EXPERIENCES_MAX, BORNES, normaliserEquipe, nouvelId, initiales, libelleRole, libelleApres, personneComplete } from "/js/equipe.js";
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
/** Remplace le contenu d'un nœud en ignorant null, undefined et false (sinon le navigateur écrit « null »). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
const fmt = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 });
const court = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? euros((v / 1e6).toLocaleString(locale(), { maximumFractionDigits: 2 }), "M") : euros(Math.round(v / 1e3).toLocaleString(locale()), "k"));
/** « 1,2 M€ » en français, « €1.2M » en anglais. */
const euros = (n, unite) => (langue() === "fr" ? `${n} ${unite}€` : `€${n}${unite === "k" ? "K" : unite}`);
const lireNombre = (s) => lireNombreSaisi(s);
/** Remplit l'écran en ignorant les emplacements vides (jamais de « null » affiché). */
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

// ================================================================== Où en est-on ?
const exercicesComplets = () => Object.entries(S.chiffres?.manquants || {}).filter(([, l]) => !l.length).length;
/** Le dernier exercice (le seul indispensable, règle partagée exercicesAttendus) est-il confirmé ? */
const dernierConfirme = () => exercicesAttendus(S.chiffres?.exercices).dernier_complet;
const aDesChiffresAValider = () => Object.values(S.chiffres?.exercices || {}).some((l) => Object.values(l).some((x) => x.valeur != null && x.source !== "inpi"));
/** The two previous fiscal years: confirmed, or skipped knowingly ("exercices_passes"). */
const exercicesFaits = () => { const x = exercicesAttendus(S.chiffres?.exercices); return x.dernier_complet && (!x.recommandes_manquants.length || S.vues.includes("exercices_passes")); };
/** First stage ("Your valuation") validated: the memorandum can start. */
const valeurValidee = () => Boolean(etatValorisation(S.reponses, S.vues).validation);
function etapeCourante() {
  // Accueil de l'analyse approfondie : une fois, avant toute saisie
  if (!S.vues.includes("accueil") && !dernierConfirme() && !aDesChiffresAValider() && !S.complet) return "accueil";
  // 1. Votre valorisation : chiffres (3 exercices), retraitements, dette nette et périmètre, valeur validée
  if (!dernierConfirme()) return aDesChiffresAValider() ? "chiffres" : "comptes";
  if (!exercicesFaits()) return "exercices";
  const ev = etatValorisation(S.reponses, S.vues);
  if (!ev.retraitements) return "retraitements";
  if (!ev.dette) return "dette";
  if (!ev.validation) return "valeur";
  // 2. Votre mémorandum, seulement après la validation des chiffres : entreprise (site, puis questions), photos et
  // logo, équipe dirigeante, rédaction
  if (siteARepondre() && !S.complet && !S.reponses.suivi?.pret_envoye) { S.q = -1; return "questions"; }
  if (siteAValider()) return "site";
  const iq = QUESTIONS.findIndex((q) => !questionRepondue(q, S.reponses, S.vues));
  if (iq >= 0) { S.q = iq; return "questions"; }
  if (!S.vues.includes("photos")) return "photos";
  if (equipeAPresenter()) return "equipe";
  if (!S.reponses.suivi?.pret_envoye && !S.complet) return "redaction";
  return "pret";
}
/** Étape demandée par la page du dossier (?etape=…) : pour revoir une étape faite ou aller droit au but. Sans
 *  chiffres, « chiffres » mène à l'envoi des comptes ; « questions » reprend à la première question sans réponse. */
function etapeDemandee() {
  const e = new URLSearchParams(location.search).get("etape");
  if (e === "chiffres") return exercicesComplets() || aDesChiffresAValider() ? "chiffres" : "comptes";
  // Exercices précédents (facultatifs) : saisie directe du premier qui manque
  if (e === "exercice") { const x = exercicesAttendus(S.chiffres?.exercices); S.saisie = { annee: x.recommandes_manquants?.[0] ?? anneesSaisie().defaut, valeurs: {} }; return "saisie"; }
  if (e === "questions") {
    if (siteARepondre()) { S.q = -1; return "questions"; }
    const iq = QUESTIONS.findIndex((q) => !questionRepondue(q, S.reponses, S.vues)); S.q = Math.max(0, iq); return "questions";
  }
  if (e === "exercices") return dernierConfirme() ? "exercices" : null;
  if (["retraitements", "dette", "valeur"].includes(e)) return dernierConfirme() ? e : null;
  // The memorandum starts once the figures are validated
  if (["photos", "equipe", "redaction"].includes(e)) return valeurValidee() || S.complet ? e : null;
  if (e === "pret") return e;
  return null;
}
const siteARepondre = () => !S.reponses.site?.url && !S.reponses.site?.aucun;
/** Fil des étapes : la liste et l'état fait / à venir sont ceux de la page du dossier (etatParcours) ; l'étape de
 *  l'écran affiché est mise en avant. Le pourcentage est le même que celui de la page du dossier. */
function dessinerEtapes() {
  const ici = ETAPE_DE_L_ECRAN[S.etape];
  const etats = Object.fromEntries((S.etat?.etapes || []).map((x) => [x.cle, x.etat]));
  // Two stages, each with its steps: "1. Your valuation" then "2. Your memorandum"
  let j = 0;
  remplacer($("#guide-etapes"), ...TEMPS.map((tp, n) => el("li", { class: `temps${tp.etapes.includes(ici) ? " temps-actif" : ""}` },
    el("span", { class: "temps-titre", text: `${n + 1}. ${tp.titre}` }),
    el("ol", { class: "temps-etapes" }, ...tp.etapes.map((k) => { j += 1; return el("li", { class: k === ici ? "actif" : etats[k] === "fait" ? "fait" : null, "aria-current": k === ici ? "step" : null },
      el("span", { text: etats[k] === "fait" && k !== ici ? "✓" : String(j) }), t(`dossier.etapes.${k}`), el("span", { class: "visuellement-cache", text: etats[k] === "fait" ? t("demarrer.js.faite") : "" })); })))));
  const pct = S.etat?.avancement ?? 0;
  $("#guide-barre span").style.width = `${pct}%`;
  $("#guide-barre").setAttribute("aria-valuenow", String(pct));
}
/** État du dossier relu au serveur (même calcul que la page du dossier), puis fil redessiné. */
/** Mémorandum et teaser lus comme sur la page du dossier : même état, mêmes tâches (un teaser vide n'est pas « prêt »). */
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
  ({ accueil, comptes, saisie, chiffres, exercices, retraitements, dette, valeur, questions, site, photos, equipe, redaction, pret })[etape](); $("#ecran").querySelector("h1, h2")?.focus?.(); window.scrollTo({ top: 0 });
}
const titre = (texte, aide) => [el("h1", { class: "guide-titre", tabindex: "-1", text: texte }), aide ? el("p", { class: "chapo-petit", text: aide }) : null].filter(Boolean);

/** Propositions recalculées quand de nouvelles données arrivent (comptes confirmés, site lu). */
function rafraichirPropositions() {
  return api(`${base}/documents/memo/propositions`).then((p) => { S.propositions = p.propositions || {}; }).catch(() => null);
}
// ================================================================== 1. Vos comptes
function lancerLectureSite(url) {
  S.lectureSite = api(`${base}/documents/memo/site`, { method: "POST", body: JSON.stringify({ url }) })
    .then((m) => { S.memo = m; S.reponses.site = m.site; rafraichirPropositions(); return m; })
    .catch((e) => { S.erreurSite = e.message; return null; });
}
/** Ce que Passation sait déjà : le dirigeant ne part pas de zéro. */
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

// ================================================================== 1 bis. Saisie de l'essentiel (sans liasse)
const DETAIL_CHARGES = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"];
const BILAN_ESSENTIEL = ["stocks", "creances_clients", "tresorerie", "capitaux_propres", "emprunts", "dettes_fournisseurs", "dettes_fiscales_sociales"];
const FACULTATIFS = new Set(["impots_taxes", "resultat_net"]);
/** Exercice proposé : le dernier exercice connu s'il n'est pas confirmé (le seul indispensable), sinon le premier
 *  des deux précédents qui manque, sinon le dernier exercice clos. Jamais une année isolée plus ancienne. */
function anneesSaisie() {
  const y = new Date().getFullYear();
  const x = exercicesAttendus(S.chiffres?.exercices);
  const toutes = [...new Set([...(x.dernier != null ? [x.dernier, ...x.recommandes] : []), y - 1, y - 2, y - 3])].sort((a, b) => b - a);
  const defaut = x.dernier == null ? y - 1 : !x.dernier_complet ? x.dernier : x.recommandes_manquants[0] ?? x.dernier;
  return { toutes, defaut };
}
/** « L'essentiel de vos comptes » en deux écrans (19/11/2026) : ce que l'entreprise gagne, puis ce qu'elle possède et
 *  doit. Les montants tapés sont gardés d'un écran à l'autre ; l'exercice est enregistré en une fois, au second écran. */
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
    const comp = champMontant({ id: `s-${cle}`, libelle: cle === "ebe" ? t("demarrer.js.saisie.ebe") : libelleEcran(c), unite: "€", min: ["resultat_net", "ebe", "capitaux_propres"].includes(cle) ? Math.min(-Math.round(max / 4), Number.isFinite(actuel) ? actuel : 0) : 0, max, // peut être négatif
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
  /** Lit les montants des clés données : { valeurs } ou un message d'erreur (champ illisible ou obligatoire vide). */
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
          // Ce que le dirigeant vient de taper n'a pas à être reconfirmé sur l'écran suivant : on confirme d'office,
          // sauf si un contrôle automatique signale une incohérence (l'écran « Vos chiffres » l'affiche alors)
          const alerte = (S.chiffres.controles?.[annee] || []).some((c) => c.niveau === "alerte");
          if (!alerte && !(S.chiffres.manquants?.[annee] || []).length) S.chiffres = await api(`${base}/financials/${annee}/valider`, { method: "POST" });
          S.saisie = null;
          if (alerte || !dernierConfirme()) { message(""); aller("chiffres"); }
          else { message(t("demarrer.js.saisie.enregistre", { annee })); aller(etapeCourante()); }
        } catch (e) { message(e.message, true); bouton.disabled = false; }
      } }, t("demarrer.js.saisie.enregistrer"), fleche())));
}

// ================================================================== 2. Vos chiffres
/** Exercices à confirmer : le dernier (indispensable) et, s'ils ont été saisis ou lus dans la liasse, les deux qui le
 *  précèdent (facultatifs). Une année plus ancienne publiée isolément n'est pas présentée. */
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

// ================================================================== 1 ter. Les deux exercices précédents
/** A buyer reasons over 3 years: the two previous fiscal years are asked for; the owner may skip them, knowing what
 *  the range loses (the EBITDA used then rests on fewer years). */
function exercices() {
  const x = exercicesAttendus(S.chiffres?.exercices);
  const manque = [...x.recommandes_manquants].sort((a, b) => b - a);
  if (!x.dernier_complet || !manque.length) { aller(etapeCourante()); return; }
  const complets = [x.dernier, ...x.recommandes].filter((a) => !manque.includes(a)).sort((a, b) => a - b);
  const lecture = S.chiffres?.lecture_automatique !== false;
  remplir(...titre(t("demarrer.js.exercices.titre"), t("demarrer.js.exercices.aide", { dernier: x.dernier })),
    el("ul", { class: "exercices-manquants" }, ...manque.map((a) => el("li", { class: "carte" },
      el("strong", { text: t("demarrer.js.chiffres.exercice", { annee: a }) }),
      el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => { S.saisie = { annee: a, valeurs: {}, ecran: 1 }; aller("saisie"); } }, t("demarrer.js.exercices.saisir", { annee: a }))))),
    lecture ? el("p", { class: "petit" }, t("demarrer.js.exercices.liasse"), " ", el("button", { type: "button", class: "lien-simple", onclick: () => aller("comptes") }, t("demarrer.js.exercices.deposer"))) : null,
    el("div", { class: "carte exercices-perte" }, el("p", { class: "etiquette", text: t("demarrer.js.exercices.perte_titre") }),
      el("p", { text: t("demarrer.js.exercices.perte", { annees: complets.join(", ") }) })),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => aller("chiffres") }, t("demarrer.js.retour")),
      el("button", { type: "button", class: "btn btn-contour", onclick: async (ev) => { ev.currentTarget.disabled = true; await marquerVue("exercices_passes"); aller(etapeCourante()); } }, t("demarrer.js.exercices.passer"), fleche())));
}

// ================================================================== Valorisation : champs communs
/** Values of a fiscal year as a plain object { cle: valeur } (the lines entered or read, approved or not). */
const valeursExercice = (annee) => Object.fromEntries(Object.entries(S.chiffres?.exercices?.[annee] || {}).filter(([, c]) => c?.valeur != null).map(([k, c]) => [k, c.valeur]));
const reponse = (c) => S.reponses[c.etape]?.[c.cle];
/** Amount field of a valuation screen: label, help, formatted field + slider; never a proposed value. */
function montantValorisation(c, surChange) {
  const id = `v-${c.etape}-${c.cle}`;
  const comp = champMontant({ id, libelle: c.libelle, etiquette: `${id}-lib`, unite: "€", min: 0, max: Math.max(c.max, Number(reponse(c)) || 0), valeur: Number.isFinite(reponse(c)) ? reponse(c) : null });
  comp.addEventListener("input", () => surChange?.());
  comp.dataset.cle = c.cle;
  return { comp, noeud: el("div", { class: "guide-champ" }, el("label", { class: "guide-lib", id: `${id}-lib`, for: id }, c.libelle), c.aide ? el("p", { class: "guide-aide", text: c.aide }) : null, comp) };
}
/** Single choice (chips), never preselected unless the owner already answered. */
function choixValorisation(c, valeurs, surChange) {
  const groupe = el("div", { class: "puces-choix", role: "radiogroup", "aria-labelledby": `v-${c.cle}-lib` });
  groupe.append(...c.options.map((o) => el("button", { type: "button", role: "radio", class: `puce${valeurs[c.cle] === o ? " choisie" : ""}`, "aria-checked": String(valeurs[c.cle] === o), onclick: (ev) => {
    valeurs[c.cle] = o;
    for (const b of groupe.children) { const oui = b === ev.currentTarget; b.classList.toggle("choisie", oui); b.setAttribute("aria-checked", String(oui)); }
    surChange?.();
  } }, libelleOption(c.cle, o))));
  return el("div", { class: "guide-champ" }, el("p", { class: "guide-lib", id: `v-${c.cle}-lib`, text: c.libelle }), c.aide ? el("p", { class: "guide-aide", text: c.aide }) : null, groupe);
}
const signe = (v) => (v > 0 ? `+${kEuros(v)}` : kEuros(v));
/** Saves several answers (one request per step) and the screen as validated. */
async function enregistrerValorisation(valeurs, vue) {
  const parEtape = {};
  for (const [chemin, v] of Object.entries(valeurs)) { const [e, k] = chemin.split("."); (parEtape[e] ||= {})[k] = v; }
  for (const [e, l] of Object.entries(parEtape)) {
    S.reponses[e] = { ...(S.reponses[e] || {}), ...l };
    await api(`${base}/answers/${e}`, { method: "PUT", body: JSON.stringify({ data: S.reponses[e] }) });
  }
  await marquerVue(vue);
}

// ================================================================== 2. Retraitements
/** One required screen, never validated in bulk: pay, rent, exceptional items, leasing. Each block shows its effect
 *  live, and the total: "Reported EBITDA 89 k€ → restated EBITDA X k€" (same rule as the engine). */
function retraitements() {
  const C = Object.fromEntries(VALORISATION.retraitements.map((c) => [c.cle, c]));
  const x = exercicesAttendus(S.chiffres?.exercices);
  const annee = x.dernier;
  const ebeComptable = ebeExercice(valeursExercice(annee));
  const choix = { murs: S.reponses.retraitements?.murs ?? null, exceptionnel_signale: S.reponses.retraitements?.exceptionnel_signale ?? null };
  const annees = [x.dernier, ...x.recommandes].filter((a) => a != null);
  // Exceptional items: an expense is added back (+), an income removed (−); stored as a signed amount (unchanged format)
  const liste = (Array.isArray(S.reponses.retraitements?.exceptionnels) ? S.reponses.retraitements.exceptionnels : [])
    .map((e) => ({ annee: e.annee ?? annee, libelle: e.libelle || "", sens: Number(e.montant) < 0 ? "produit" : "charge", montant: Number.isFinite(Number(e.montant)) ? Math.abs(Number(e.montant)) : null, justification: e.justification || "" }));
  const effets = {};
  const total = el("p", { class: "retraitements-total", "aria-live": "polite" });
  const lire = () => {
    const v = (cle) => champs[cle]?.comp.lire().valeur ?? null;
    const exc = choix.exceptionnel_signale === "Oui" ? liste.filter((e) => Number.isFinite(e.montant) && e.montant !== 0).map((e) => ({ annee: Number(e.annee), libelle: e.libelle.trim().slice(0, 120), montant: e.sens === "produit" ? -e.montant : e.montant, justification: e.justification.trim().slice(0, 300) })) : [];
    const loyer = choix.murs === MURS.dirigeant;
    return { remuneration_dirigeant_reelle: v("remuneration_dirigeant_reelle"), remuneration_normative: v("remuneration_normative"),
      loyer_paye: loyer ? v("loyer_paye") : null, loyer_marche: loyer ? v("loyer_marche") : null, exceptionnels: exc };
  };
  const maj = () => {
    const r = lire();
    const a = apercuRetraitements(ebeComptable, r, annee);
    const de = (cle) => (a?.lignes || []).filter((l) => l.cle === cle).reduce((s, l) => s + l.montant, 0);
    effets.dirigeant.textContent = Number.isFinite(r.remuneration_dirigeant_reelle) && Number.isFinite(r.remuneration_normative) ? t("demarrer.js.retraitements.effet", { montant: signe(r.remuneration_dirigeant_reelle - r.remuneration_normative) }) : t("demarrer.js.retraitements.effet_attente");
    effets.loyer.textContent = Number.isFinite(r.loyer_paye) && Number.isFinite(r.loyer_marche) ? t("demarrer.js.retraitements.effet", { montant: signe(r.loyer_paye - r.loyer_marche) }) : choix.murs && choix.murs !== MURS.dirigeant ? t("demarrer.js.retraitements.sans_effet") : t("demarrer.js.retraitements.effet_attente");
    effets.exceptionnel.textContent = choix.exceptionnel_signale === "Non" ? t("demarrer.js.retraitements.sans_effet") : t("demarrer.js.retraitements.effet_annee", { montant: signe(de("exceptionnel")), annee });
    blocLoyer.hidden = choix.murs !== MURS.dirigeant;
    blocExc.hidden = choix.exceptionnel_signale !== "Oui";
    remplacer(total, a ? [t("demarrer.js.retraitements.total_avant", { annee }), " ", el("strong", { text: kEuros(a.ebe_comptable) }), " → ", t("demarrer.js.retraitements.total_apres"), " ", el("strong", { text: kEuros(a.ebe_retraite) })] : t("demarrer.js.retraitements.total_inconnu"));
  };
  const champs = Object.fromEntries(["remuneration_dirigeant_reelle", "remuneration_normative", "loyer_paye", "loyer_marche"].map((k) => [k, montantValorisation(C[k], () => maj())]));
  for (const k of ["dirigeant", "loyer", "exceptionnel"]) effets[k] = el("p", { class: "retraitement-effet", "aria-live": "polite" });
  const blocLoyer = el("div", { class: "saisie-deux" }, champs.loyer_paye.noeud, champs.loyer_marche.noeud);
  const lignesExc = el("div", { class: "exceptionnels" });
  const dessinerExc = () => remplacer(lignesExc, ...liste.map((e, k) => {
    const montant = el("input", { type: "text", inputmode: "decimal", value: e.montant != null ? formaterSaisie(String(e.montant)) : "", placeholder: t("demarrer.js.exc.montant_euros"), "aria-label": t("demarrer.js.exc.montant") });
    montant.addEventListener("input", () => { montant.value = formaterSaisie(montant.value); e.montant = lireMontant(montant.value); maj(); });
    const sens = el("select", { "aria-label": t("demarrer.js.retraitements.sens"), onchange: (ev) => { e.sens = ev.target.value; maj(); } },
      el("option", { value: "charge", selected: e.sens === "charge", text: t("demarrer.js.retraitements.charge") }), el("option", { value: "produit", selected: e.sens === "produit", text: t("demarrer.js.retraitements.produit") }));
    const an = el("select", { "aria-label": t("demarrer.js.exc.exercice"), onchange: (ev) => { e.annee = Number(ev.target.value); maj(); } }, ...annees.map((a) => el("option", { value: String(a), selected: Number(e.annee) === a, text: String(a) })));
    return el("div", { class: "exc" }, an, sens,
      el("input", { type: "text", value: e.libelle, placeholder: t("demarrer.js.exc.libelle"), "aria-label": t("demarrer.js.exc.libelle"), oninput: (ev) => { e.libelle = ev.target.value; } }),
      montant,
      el("input", { type: "text", value: e.justification, placeholder: t("demarrer.js.exc.pourquoi"), "aria-label": t("demarrer.js.exc.justification"), oninput: (ev) => { e.justification = ev.target.value; } }),
      el("button", { type: "button", class: "lien-simple", onclick: () => { liste.splice(k, 1); dessinerExc(); maj(); } }, t("espace.js.retirer")));
  }), el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => { liste.push({ annee, libelle: "", sens: "charge", montant: null, justification: "" }); dessinerExc(); lignesExc.querySelectorAll(".exc input")[0]?.focus(); } }, t("demarrer.js.exc.ajouter")));
  if (!liste.length) liste.push({ annee, libelle: "", sens: "charge", montant: null, justification: "" });
  dessinerExc();
  const blocExc = el("div", {}, lignesExc);
  const bloc = (titreBloc, aide, ...contenu) => el("section", { class: "carte retraitement" }, el("h2", { text: titreBloc }), aide ? el("p", { class: "petit", text: aide }) : null, ...contenu);
  const valider = el("button", { type: "button", class: "btn btn-vert" }, t("demarrer.js.retraitements.valider"), fleche());
  valider.addEventListener("click", async () => {
    for (const k of Object.keys(champs)) if (champs[k].comp.lire().illisible) { champs[k].comp.champ.focus(); message(t("demarrer.js.erreurs.montant_illisible"), true); return; }
    const r = lire();
    const futur = { ...S.reponses, dirigeant: { ...(S.reponses.dirigeant || {}), ...r }, retraitements: { ...(S.reponses.retraitements || {}), ...choix, loyer_paye: r.loyer_paye, loyer_marche: r.loyer_marche, exceptionnels: r.exceptionnels } };
    const manque = manquesValorisation("retraitements", futur);
    if (manque.length) { message(t("demarrer.js.retraitements.il_manque", { liste: manque.map((c) => c.libelle).join(", ") }), true); return; }
    if (choix.exceptionnel_signale === "Oui" && !r.exceptionnels.length) { message(t("demarrer.js.retraitements.exc_vide"), true); return; }
    valider.disabled = true;
    try {
      await enregistrerValorisation({ "dirigeant.remuneration_dirigeant_reelle": r.remuneration_dirigeant_reelle, "dirigeant.remuneration_normative": r.remuneration_normative,
        "retraitements.murs": choix.murs, "retraitements.loyer_paye": r.loyer_paye, "retraitements.loyer_marche": r.loyer_marche,
        "retraitements.exceptionnel_signale": choix.exceptionnel_signale, "retraitements.exceptionnels": r.exceptionnels }, "retraitements");
      message(""); aller(etapeCourante() === "retraitements" ? "dette" : etapeCourante());
    } catch (e) { message(e.message, true); valider.disabled = false; }
  });
  remplir(...titre(t("demarrer.js.retraitements.titre"), t("demarrer.js.retraitements.aide")),
    el("div", { class: "carte retraitements-tete" }, total),
    bloc(t("demarrer.js.retraitements.dirigeant_titre"), t("demarrer.js.retraitements.dirigeant_aide"), el("div", { class: "saisie-deux" }, champs.remuneration_dirigeant_reelle.noeud, champs.remuneration_normative.noeud), effets.dirigeant),
    bloc(t("demarrer.js.retraitements.loyer_titre"), null, choixValorisation(C.murs, choix, maj), blocLoyer, effets.loyer),
    bloc(t("demarrer.js.retraitements.exc_titre"), null, choixValorisation(C.exceptionnel_signale, choix, maj), blocExc, effets.exceptionnel),
    bloc(t("demarrer.js.retraitements.credit_bail_titre"), t("demarrer.js.retraitements.credit_bail_aide")),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => aller(exercicesFaits() ? "chiffres" : "exercices") }, t("demarrer.js.retour")), valider),
    el("p", { class: "q-usage", text: t("demarrer.js.retraitements.usage") }));
  maj();
}

// ================================================================== 3. Dette nette et périmètre
function dette() {
  const C = Object.fromEntries(VALORISATION.dette.map((c) => [c.cle, c]));
  const annee = exercicesAttendus(S.chiffres?.exercices).dernier;
  const ex = valeursExercice(annee);
  const choix = { detention: S.reponses.operation?.detention ?? null, murs_cession: S.reponses.retraitements?.murs_cession ?? null, part_cedee: S.reponses.operation?.part_cedee ?? null };
  const mursAVous = S.reponses.retraitements?.murs === MURS.dirigeant;
  const champs = Object.fromEntries(["comptes_courants_remboursables", "credit_bail_restant", "dividendes_a_verser", "actifs_hors_exploitation"].map((k) => [k, montantValorisation(C[k])]));
  // What the balance sheet already says (latest fiscal year), read only: corrected on "Your figures"
  const bilan = [["tresorerie", 1], ["placements", 1], ["emprunts", -1], ["provisions_risques", -1]].filter(([k]) => ex[k] != null);
  const valider = el("button", { type: "button", class: "btn btn-vert" }, t("demarrer.js.dette.valider"), fleche());
  valider.addEventListener("click", async () => {
    for (const k of Object.keys(champs)) if (champs[k].comp.lire().illisible) { champs[k].comp.champ.focus(); message(t("demarrer.js.erreurs.montant_illisible"), true); return; }
    const v = (k) => champs[k].comp.lire().valeur;
    const futur = { ...S.reponses, operation: { ...(S.reponses.operation || {}), detention: choix.detention, part_cedee: choix.part_cedee }, retraitements: { ...(S.reponses.retraitements || {}), murs_cession: choix.murs_cession } };
    const manque = manquesValorisation("dette", futur);
    if (manque.length) { message(t("demarrer.js.retraitements.il_manque", { liste: manque.map((c) => c.libelle).join(", ") }), true); return; }
    valider.disabled = true;
    try {
      await enregistrerValorisation({ ...Object.fromEntries(Object.keys(champs).map((k) => [`bilan.${k}`, v(k)])),
        "operation.detention": choix.detention, "operation.part_cedee": choix.part_cedee, ...(mursAVous ? { "retraitements.murs_cession": choix.murs_cession } : {}) }, "dette");
      message(""); aller(etapeCourante() === "dette" ? "valeur" : etapeCourante());
    } catch (e) { message(e.message, true); valider.disabled = false; }
  });
  remplir(...titre(t("demarrer.js.dette.titre"), t("demarrer.js.dette.aide")),
    el("section", { class: "carte retraitement" }, el("h2", { text: t("demarrer.js.dette.bilan_titre", { annee }) }),
      bilan.length ? el("dl", { class: "guide-resume dette-bilan" }, ...bilan.map(([k, s]) => el("div", {}, el("dt", { text: libelleEcran(CHAMPS.find((c) => c.cle === k)) }), el("dd", { text: kEuros(s * ex[k]) })))) : el("p", { class: "petit", text: t("demarrer.js.dette.bilan_vide") }),
      el("p", { class: "petit" }, t("demarrer.js.dette.bilan_aide"), " ", el("button", { type: "button", class: "lien-simple", onclick: () => aller("chiffres") }, t("demarrer.js.dette.corriger")))),
    el("section", { class: "carte retraitement" }, el("h2", { text: t("demarrer.js.dette.autres_titre") }), el("p", { class: "petit", text: t("demarrer.js.dette.autres_aide") }),
      el("div", { class: "saisie-deux" }, ...Object.values(champs).map((x) => x.noeud))),
    el("section", { class: "carte retraitement" }, el("h2", { text: t("demarrer.js.dette.perimetre_titre") }), el("p", { class: "petit", text: t("demarrer.js.dette.perimetre_aide") }),
      choixValorisation(C.detention, choix),
      el("p", { class: "petit dette-murs" }, t("demarrer.js.dette.murs", { murs: S.reponses.retraitements?.murs ? libelleOption("murs", S.reponses.retraitements.murs) : "–" }), " ", el("button", { type: "button", class: "lien-simple", onclick: () => aller("retraitements") }, t("demarrer.js.dette.modifier"))),
      mursAVous ? choixValorisation(C.murs_cession, choix) : null,
      choixValorisation(C.part_cedee, choix)),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => aller("retraitements") }, t("demarrer.js.retour")), valider),
    el("p", { class: "q-usage", text: t("demarrer.js.dette.usage") }));
}

// ================================================================== 4. Votre valeur
/** Summary a banker can read: the bridge visible without a click (k€, negatives in brackets), the points of attention
 *  visible, the adjusted net assets presented consistently, the passage from the quick estimate, and "I approve these
 *  figures". Everything comes from the engine's result (POST …/valuation). */
async function valeur() {
  remplir(...titre(t("demarrer.js.valeur.titre"), t("demarrer.js.valeur.calcul")));
  let d;
  try { d = await api(`${base}/valuation`, { method: "POST" }); }
  catch (e) { message(e.message, true); return; }
  if (S.etape !== "valeur") return;
  const r = d.resultat, v = resumeValorisation(r);
  const validee = etatValorisation(S.reponses, S.vues).validation;
  const modifier = el("p", { class: "petit valeur-modifier" },
    t("demarrer.js.valeur.modifier"), " ",
    el("button", { type: "button", class: "lien-simple", onclick: () => aller("chiffres") }, t("dossier.etapes.chiffres")), " · ",
    el("button", { type: "button", class: "lien-simple", onclick: () => aller("retraitements") }, t("dossier.etapes.retraitements")), " · ",
    el("button", { type: "button", class: "lien-simple", onclick: () => aller("dette") }, t("dossier.etapes.dette")));
  const bouton = el("button", { type: "button", class: "btn btn-vert" }, validee ? t("demarrer.js.valeur.continuer") : t("demarrer.js.valeur.valider"), fleche());
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    try {
      const x = await api(`${base}/valuation/validation`, { method: "POST" });
      S.reponses.validation = x.validation;
      await rafraichirEtat();
      if (S.dossier?.entreprise?.naf && !S.complet) lancerEtudeMarche(); // the memorandum starts now
      message(""); aller(etapeCourante());
    } catch (e) { message(e.message, true); bouton.disabled = false; }
  });
  if (r?.statut !== "ok" || !v) {
    remplir(...titre(t("demarrer.js.valeur.titre"), t("demarrer.js.valeur.impossible")),
      el("ul", { class: "alertes" }, ...alertesDirigeant(r?.alertes || r?.synthese?.alertes || []).map((a) => el("li", { text: a }))),
      modifier, el("div", { class: "q-nav" }, el("span"), r?.statut === "ok" ? bouton : null));
    return;
  }
  const p = pontValeur(r);
  const dettes = Object.fromEntries(r.dette_nette.lignes.map((l) => [`dette_${l.cle}`, l.libelle]));
  const libelle = (l) => (dettes[l.cle] ? `${l.bas >= 0 ? "+" : "−"} ${dettes[l.cle]}`
    : l.cle === "ebe_comptable" ? t(p.annees.length > 1 ? "demarrer.js.valeur.pont.ebe_comptable_moyen" : "demarrer.js.valeur.pont.ebe_comptable", { annees: p.annees.join(", ") })
    : t(`demarrer.js.valeur.pont.${l.cle}`));
  const cellule = (x) => (l) => (l.cle === "multiples" ? fois(l[x]) : kEuros(l[x]));
  const lignes = p ? p.lignes.map((l) => el("tr", { class: l.cle === "titres" ? "total fort" : l.total ? "total" : null },
    el("th", { scope: "row", text: libelle(l) }),
    // EBITDA lines: the same amount for both ends of the range, written in both columns
    ...(Number.isFinite(l.montant) ? [0, 1].map(() => el("td", { class: "num", text: l.cle === "ebe_comptable" || l.total ? kEuros(l.montant) : signe(l.montant) })) : [el("td", { class: "num", text: cellule("bas")(l) }), el("td", { class: "num", text: cellule("haut")(l) })]))) : [];
  const mois = moisSource(r.multiples?.source);
  const ancc = texteAncc(situationAncc(v.bas, v.haut, r.ancc.valeur), v);
  // Points of attention, visible; the adjusted-net-assets alert is replaced by the sentence below the bridge
  const points = alertesDirigeant(r.synthese.alertes).filter((a) => !/actif net corrigé de l'entreprise|company’s adjusted net assets/i.test(a));
  const ecart = explicationEcart(S.dossier?.estimation, v);
  remplir(...titre(t("demarrer.js.valeur.titre"), t("demarrer.js.valeur.aide")),
    el("div", { class: "carte valeur-tete" }, el("p", { class: "etiquette", text: etiquetteTitres() }), el("p", { class: "valeur-fourchette chiffre", text: fourchette(v.bas, v.haut) }),
      ecart ? el("p", { class: "petit", text: ecart }) : null,
      validee ? el("p", { class: "petit valeur-validee", text: t("demarrer.js.valeur.validee_le", { date: new Date(validee.le * 1000).toLocaleDateString(locale()) }) }) : null),
    p ? el("section", { class: "carte valeur-pont" }, el("h2", { text: t("demarrer.js.valeur.pont_titre") }),
      el("div", { class: "tableau-defile", tabindex: "0" }, el("table", { class: "tableau-resultat" },
        el("caption", { class: "visuellement-cache", text: t("demarrer.js.valeur.pont_titre") }),
        el("thead", {}, el("tr", {}, el("th", { scope: "col", text: t("demarrer.js.valeur.pont.etape") }), el("th", { scope: "col", class: "num", text: t("demarrer.js.valeur.pont.bas") }), el("th", { scope: "col", class: "num", text: t("demarrer.js.valeur.pont.haut") }))),
        el("tbody", {}, ...lignes))),
      el("p", { class: "petit", text: t("demarrer.js.valeur.source_multiples", { mois: mois || "–" }) })) : null,
    points.length ? el("section", { class: "carte valeur-points" }, el("h2", { text: t("demarrer.js.valeur.points_titre", { n: points.length }) }), el("ul", { class: "alertes" }, ...points.map((a) => el("li", { text: a })))) : null,
    ancc ? el("section", { class: "carte valeur-ancc" }, el("h2", { text: t("demarrer.js.valeur.ancc_titre") }), el("p", { text: ancc })) : null,
    modifier,
    el("p", { class: "petit" }, el("a", { href: lien(`/espace/valorisation/?dossier=${id}#valorisation`), text: t("demarrer.js.valeur.detail") })),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => aller("dette") }, t("demarrer.js.retour")), bouton),
    el("p", { class: "q-usage", text: t("demarrer.js.valeur.usage") }));
}

// ================================================================== 3. Questions (une par écran)
async function enregistrer(etape, cle, valeur) {
  S.reponses[etape] = { ...(S.reponses[etape] || {}), [cle]: valeur };
  await api(`${base}/answers/${etape}`, { method: "PUT", body: JSON.stringify({ data: S.reponses[etape] }) });
}
/** Proposition de Passation pour ce champ, tant que le dirigeant n'a rien enregistré. */
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
  const choisies = new Set(limiterChoix(Array.isArray(v) ? v : [], c.max));
  const proposees = new Set(S.reponses[c.etape]?.[c.cle] == null && Array.isArray(proposition(q, c)) ? proposition(q, c) : []);
  const compte = c.max ? el("p", { class: "guide-compte", "aria-live": "polite" }) : null;
  const zone = el("div", { class: "tuiles-choix", role: "group", "aria-labelledby": c.libelle ? `${idChamp(c)}-lib` : null, "aria-label": c.libelle ? null : q.titre, "data-etape": c.etape, "data-cle": c.cle, "data-type": "multi" });
  const maj = () => {
    const n = zone.querySelectorAll('[aria-pressed="true"]').length;
    if (c.max) {
      for (const b of zone.querySelectorAll(".tuile-choix")) { const bloque = b.getAttribute("aria-pressed") !== "true" && n >= c.max; b.disabled = bloque; }
      compte.textContent = n >= c.max ? t("demarrer.js.question.choix_max_atteint", { n, max: c.max }) : t("demarrer.js.question.choix_max", { n, max: c.max });
    }
    zone.dispatchEvent(new Event("change", { bubbles: true }));
  };
  zone.append(...c.options.map(([val, ic]) => el("button", { type: "button", class: "tuile-choix", "aria-pressed": String(choisies.has(val)), "data-valeur": val, onclick: (ev) => {
    const b = ev.currentTarget;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    maj();
  } }, picto(ic), el("span", { class: "tuile-txt" }, el("strong", { text: libelleOption(c.cle, val) }), detailOption(c.cle, val) ? el("span", { text: detailOption(c.cle, val) }) : null),
    proposees.has(val) ? el("span", { class: "tuile-source", title: S.propositions[q.id]?.source || null, text: t("demarrer.js.question.propose") }) : null)));
  queueMicrotask(maj);
  return el("div", { class: "guide-champ" }, ...entete(c), zone, compte);
}

/** Phrase d'activité : proposée à partir des métiers et des clients cochés, tant que le dirigeant ne l'a pas modifiée. */
function champPhrase(c) {
  const enregistree = S.reponses[c.etape]?.[c.cle];
  const ta = el("textarea", { id: idChamp(c), rows: "3", "data-etape": c.etape, "data-cle": c.cle, "data-type": "phrase" });
  ta.value = enregistree || "";
  let modifiee = Boolean(enregistree);
  ta.addEventListener("input", () => { modifiee = true; });
  ta.proposer = () => {
    if (modifiee) return;
    const ecran = $("#ecran");
    const metiers = [...ecran.querySelectorAll('[data-cle="metiers"] input[type=checkbox]:checked')].map((x) => x.value);
    const clients = [...ecran.querySelectorAll('[data-cle="type_clientele"] [aria-pressed="true"]')].map((b) => libelleOption("type_clientele", b.dataset.valeur));
    ta.value = phraseActivite({ nom: S.dossier?.entreprise?.nom, metiers, clients, l: langue() });
  };
  return el("div", { class: "guide-champ guide-phrase" }, ...entete(c, idChamp(c)), ta);
}

/** Montant ou pourcentage : champ formaté + curseur. Proposition (donnée publique ou valeur neutre) à confirmer. */
function champNombre(c, q) {
  const pct = c.type === "pourcentage";
  const facteur = pct && c.fraction ? 100 : 1;
  const enregistre = S.reponses[c.etape]?.[c.cle];
  const brutPropose = c.propose ? valeurDe(c.propose) : proposition(q, c);
  const propose = enregistre == null && Number.isFinite(brutPropose) ? Math.round(brutPropose * facteur * 10) / 10 : null;
  const comp = champMontant({ id: idChamp(c), libelle: c.libelle, etiquette: `${idChamp(c)}-lib`, unite: pct ? "%" : "€", min: c.min ?? 0, max: c.max,
    valeur: Number.isFinite(enregistre) ? Math.round(enregistre * facteur * 10) / 10 : null, proposition: propose });
  Object.assign(comp.dataset, { etape: c.etape, cle: c.cle, type: "nombre", facteur: String(facteur) });
  const raison = c.propose ? t("demarrer.js.montants.raison_neutre") : S.propositions[q.id]?.source || "";
  // Repère sous le champ : la valeur proposée, d'où elle vient, et « C'est mon estimation » pour la confirmer
  const texte = el("span");
  const repere = el("div", { class: "guide-repere", hidden: true }, texte,
    el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => { comp.confirmer(); repere.remove(); } }, t("demarrer.js.montants.confirmer")));
  const montrer = (v) => { repere.hidden = v == null; if (v != null) texte.textContent = t("demarrer.js.montants.propose", { valeur: texteMontant(v, pct ? "%" : "€"), raison }); };
  montrer(propose);
  comp.addEventListener("confirme", () => repere.remove(), { once: true });
  // Proposition qui suit un autre montant du même écran (rémunération de remplacement = rémunération tapée)
  if (c.propose) comp.suivre = (v) => { if (comp.proposer(v)) montrer(v); else if (v == null) montrer(null); };
  return el("div", { class: "guide-champ" }, ...entete(c, idChamp(c)), comp, repere);
}

/** Dates clés : lignes date / type d'événement / précision, pré-remplies depuis les registres (source affichée). */
function champDates(c, q) {
  const v = S.reponses[c.etape]?.[c.cle] ?? proposition(q, c);
  const lignes = lignesDates(v);
  if (!lignes.length) lignes.push({ date: "", type: "autre", precision: "", source: null });
  const zone = el("div", { class: "guide-champ dates-cles", "data-etape": c.etape, "data-cle": c.cle, "data-type": "dates" });
  const dessiner = () => remplacer(zone,
    el("div", { class: "dates-tete", "aria-hidden": "true" }, el("span", { text: t("demarrer.js.dates.date") }), el("span", { text: t("demarrer.js.dates.evenement") }), el("span", { text: t("demarrer.js.dates.precision") }), el("span")),
    el("ul", { class: "dates-liste" }, ...lignes.map((x, k) => {
      const n = k + 1;
      const date = el("input", { type: "text", class: "dates-date", value: x.date, inputmode: "numeric", placeholder: t("demarrer.js.dates.exemple_date"), "aria-label": t("demarrer.js.dates.date_n", { n }), onchange: (e) => { x.date = e.target.value.trim(); } });
      const type = el("select", { "aria-label": t("demarrer.js.dates.evenement_n", { n }), onchange: (e) => { x.type = e.target.value; } },
        ...TYPES_EVENEMENT.map((ty) => el("option", { value: ty, selected: ty === x.type }, t(`parcours.evenements.${ty}`))));
      const prec = el("input", { type: "text", class: "dates-precision", value: x.precision, maxlength: "120", "aria-label": t("demarrer.js.dates.precision_n", { n }), onchange: (e) => { x.precision = e.target.value; } });
      return el("li", {}, date, type, prec,
        el("button", { type: "button", class: "dates-retirer", "aria-label": t("demarrer.js.dates.retirer_n", { n }), onclick: () => { lignes.splice(k, 1); dessiner(); zone.querySelector(".dates-date")?.focus(); } }, "×"),
        x.source ? el("span", { class: "guide-source" }, el("span", { class: "src", "aria-hidden": "true" }), x.source) : null);
    })),
    el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => { lignes.push({ date: "", type: "autre", precision: "", source: null }); dessiner(); zone.querySelectorAll(".dates-date")[lignes.length - 1]?.focus(); } }, t("demarrer.js.dates.ajouter")),
    el("p", { class: "guide-aide", text: t("demarrer.js.dates.formats") }));
  zone._lignes = lignes;
  dessiner();
  return zone;
}

/** Choix unique (puces) ; un écran à un seul choix avance tout de suite. La suite éventuelle s'affiche sans
 *  redessiner l'écran (les montants tapés sont gardés). */
function champChoix(c, q) {
  const v = S.reponses[c.etape]?.[c.cle] ?? proposition(q, c);
  return el("div", { class: "guide-champ" }, ...entete(c), el("div", { class: "puces-choix", role: "group", "aria-labelledby": c.libelle ? `${idChamp(c)}-lib` : null, "aria-label": c.libelle ? null : q.titre },
    ...c.options.map((o) => el("button", { type: "button", class: `puce${v === o ? " choisie" : ""}`, "aria-pressed": String(v === o), "data-propose": proposition(q, c) === o ? "1" : null, onclick: async (ev) => {
      const bouton = ev.currentTarget; // ev.currentTarget est vidé après le premier « await »
      try {
        await enregistrer(c.etape, c.cle, o);
        bouton.parentElement.querySelectorAll(".puce").forEach((b) => { b.classList.toggle("choisie", b === bouton); b.setAttribute("aria-pressed", String(b === bouton)); });
        if (q.champs.length === 1 && !q.suite?.si(S.reponses) && !S.propositions[q.id]) suivante(q);
        const suite = $("#ecran [data-suite]");
        if (suite) suite.hidden = !q.suite.si(S.reponses);
      } catch (e) { message(e.message, true); }
    } }, libelleOption(c.cle, o)))));
}

function champRegions(c) {
  const choisies = new Set(Array.isArray(S.reponses[c.etape]?.[c.cle]) ? S.reponses[c.etape][c.cle] : []);
  return el("fieldset", { class: "guide-champ regions-choix" }, el("legend", { text: c.libelle }),
    ...REGIONS.map((r, k) => { const cb = el("input", { type: "checkbox", id: `reg-${k}`, checked: choisies.has(r) }); cb.addEventListener("change", () => { if (cb.checked) choisies.add(r); else choisies.delete(r); enregistrer(c.etape, c.cle, [...choisies]).catch((e) => message(e.message, true)); }); return el("label", { class: "choix", for: `reg-${k}` }, cb, ` ${r}`); }));
}

function champTopClients(c) {
  // Cinq lignes anonymes : part du chiffre d'affaires (%), ancienneté de la relation (ans), activité du client
  const v = S.reponses[c.etape]?.[c.cle];
  const lignes = Array.isArray(v) ? v : [];
  return el("div", { class: "guide-champ top-clients", "data-etape": c.etape, "data-cle": c.cle, "data-type": "top_clients" },
    el("p", { class: "guide-lib", text: c.libelle }),
    el("div", { class: "top-clients-tete", "aria-hidden": "true" }, el("span"), el("span", { text: t("demarrer.js.clients.part") }), el("span", { text: t("demarrer.js.clients.depuis") }), el("span", { text: t("demarrer.js.clients.activite") })),
    ...[0, 1, 2, 3, 4].map((k) => {
      const x = lignes[k] || {};
      return el("div", { class: "top-clients-ligne" },
        el("span", { class: "top-clients-rang", text: t("demarrer.js.clients.client", { n: k + 1 }) }),
        el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "decimal", "data-col": "part", placeholder: t("demarrer.js.clients.part_court"), "aria-label": t("demarrer.js.clients.part_aria", { n: k + 1 }), value: Number.isFinite(x.part) ? fmt.format(Math.round(x.part * 1000) / 10) : "" }), el("span", { class: "unite", text: "%" })),
        el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "numeric", "data-col": "anciennete", placeholder: t("demarrer.js.clients.depuis_court"), "aria-label": t("demarrer.js.clients.depuis_aria", { n: k + 1 }), value: Number.isFinite(x.anciennete) ? String(x.anciennete) : "" }), el("span", { class: "unite", text: t("demarrer.js.clients.ans") })),
        el("input", { type: "text", "data-col": "secteur", maxlength: "40", "aria-label": t("demarrer.js.clients.activite_aria", { n: k + 1 }), placeholder: t("demarrer.js.clients.activite_exemple"), value: x.secteur || "" }));
    }));
}

function champExceptionnels(c) {
  const v = S.reponses[c.etape]?.[c.cle];
  const liste = Array.isArray(v) && v.length ? v : [{ annee: Number(Object.keys(S.chiffres?.exercices || {}).sort().at(-1)) || null, libelle: "", montant: null, justification: "" }];
  const zone = el("div", { class: "guide-champ exceptionnels" });
  const dessiner = () => remplacer(zone, ...liste.map((x, k) => {
    const montant = el("input", { type: "text", inputmode: "decimal", value: x.montant != null ? formaterSaisie(String(x.montant)) : "", placeholder: t("demarrer.js.exc.montant_euros"), "aria-label": t("demarrer.js.exc.montant") });
    montant.addEventListener("input", () => { montant.value = formaterSaisie(montant.value); x.montant = lireMontant(montant.value); });
    return el("div", { class: "exc" },
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
/** Valide l'écran : les choix proposés que le dirigeant a gardés tels quels sont enregistrés. */
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
/** Écran vu : enregistré (« Passer » compte comme une réponse), pour que la page du dossier compte pareil. Sert aussi
 *  aux écrans qui ne sont pas des questions (« accueil », « photos »), sans effet sur le décompte. */
function marquerVue(qid) {
  if (S.vues.includes(qid)) return Promise.resolve();
  S.vues.push(qid);
  S.reponses.parcours = { ...(S.reponses.parcours || {}), vues: [...S.vues] };
  return api(`${base}/answers/parcours`, { method: "PUT", body: JSON.stringify({ data: S.reponses.parcours }) }).then(() => rafraichirEtat()).catch(() => null);
}
/** Compteur « Question N sur M » : M = questions qui restaient à montrer en arrivant sur les questions (celles déjà
 *  répondues, validées dans le récapitulatif ou passées n'y sont pas) ; il ne bouge pas d'un écran à l'autre. */
const cleEcran = () => (S.q < 0 ? "site" : QUESTIONS[S.q]?.id);
function compteur() {
  if (!S.aPoser) S.aPoser = questionsAPoser(S.reponses, S.vues);
  const cle = cleEcran();
  if (cle && !S.aPoser.includes(cle)) S.aPoser = [...S.aPoser, cle].sort((a, b) => ordre(a) - ordre(b)); // revenue d'elle-même (« Retour »)
  const n = S.aPoser.indexOf(cle) + 1, total = S.aPoser.length;
  return el("div", { class: "q-tete" }, el("p", { class: "q-compteur", text: t("demarrer.js.question_n", { n, total }) }),
    el("span", { class: "q-jauge", "aria-hidden": "true" }, el("span", { style: `width:${Math.round((n / total) * 100)}%` })));
}
const ordre = (cle) => (cle === "site" ? -1 : QUESTIONS.findIndex((q) => q.id === cle));
/** « Retour » : l'écran précédent dans la liste des questions montrées ; avant la première, les chiffres. */
function precedente() {
  const i = (S.aPoser || []).indexOf(cleEcran());
  const prec = i > 0 ? S.aPoser[i - 1] : null;
  if (prec == null) { aller("valeur"); return; }
  S.q = ordre(prec); questions();
}
/** Le site vient d'être lu : ses faits, son logo et ses photos sont à valider (juste après la lecture). */
const siteAValider = () => { const s = S.reponses.site || {}; return Boolean(s.url && !s.confirme && ((s.faits || []).length || (s.logos || []).length)); };
const photosAChoisir = () => { const s = S.reponses.site || {}; return Boolean(s.url && s.confirme && !S.vues.includes("photos") && ((s.photos_candidates || []).length || (s.logos || []).length)); };
function suivante(q) {
  marquerVue(q.id);
  // Venu de la rédaction pour compléter une réponse indispensable : on y retourne dès que tout est rempli
  if (S.retour === "redaction") {
    const reste = questionsIncompletes(S.reponses);
    if (reste.length) { S.q = QUESTIONS.indexOf(reste[0]); questions(); } else { S.retour = null; aller("redaction"); }
    return;
  }
  // Lecture du site terminée pendant la question : on valide ses faits, son logo et ses photos maintenant
  if (siteAValider()) { aller("site"); return; }
  // Question suivante encore sans réponse (celles validées dans le récapitulatif sont sautées)
  const i = QUESTIONS.indexOf(q);
  const j = QUESTIONS.findIndex((x, k) => k > i && !questionRepondue(x, S.reponses, S.vues));
  if (j >= 0) { S.q = j; questions(); } else aller(etapeCourante());
}
/** « Où va votre réponse » : une ligne discrète. */
const ouVa = (q) => (q.chapitre ? el("p", { class: "q-usage" }, t("demarrer.js.question.nourrit"), " ", el("strong", { text: q.chapitre }), ".") : null);
/** Première question : le site internet. Sa lecture se poursuit pendant les questions suivantes. */
function questionSite() {
  const proposition = S.reponses.site?.url || siteDepuisEmail(S.email) || "";
  const input = el("input", { type: "text", id: "site-url", inputmode: "url", value: proposition, placeholder: t("memo.www_mon_entreprise_fr"), autocomplete: "url" });
  // Question suivante encore sans réponse (le site n'est plus à poser)
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
// ---- Récapitulatif : toutes les réponses préparées sur un écran, validées d'un clic (le reste se pose ensuite)
const cleRecap = `passation-recap-${id}`;
const recapVu = () => { try { return Boolean(sessionStorage.getItem(cleRecap)); } catch { return S.recapVu; } };
const marquerRecap = () => { S.recapVu = true; try { sessionStorage.setItem(cleRecap, "1"); } catch { /* sans stockage */ } };
// Seules les réponses à choix unique se valident d'un clic ; métiers, dates et curseurs se vérifient sur leur écran
const RECAP_TYPES = new Set(["choix", "regions"]);
const champDeCle = (q, cle) => [...q.champs, ...(q.suite?.champs || [])].find((x) => `${x.etape}.${x.cle}` === cle);
const clesEnAttente = (q) => Object.keys(S.propositions[q.id]?.valeurs || {}).filter((k) => { const [e, c] = k.split("."); return S.reponses[e]?.[c] == null && RECAP_TYPES.has(champDeCle(q, k)?.type); });
const questionsPreparees = () => QUESTIONS.filter((q) => clesEnAttente(q).length && !S.propositions[q.id]?.a_completer && !questionRepondue(q, S.reponses, S.vues));
/** Valeur proposée en clair (libellé du choix, liste). */
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
      marquerRecap(); message(""); S.aPoser = null; // le compteur ne compte plus les réponses qui viennent d'être validées
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
  // Le récapitulatif des réponses préparées vient avant la première question : le compteur « Question N sur M » est
  // fixé ensuite, une fois pour toutes (il ne repart pas de 1 après la validation des réponses préparées)
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

// ================================================================== 4. Votre site : faits, puis logo et photos
const cleFaits = (f) => `f-${f.id}`;
/** Faits regroupés par thème : contradictions avec les registres d'abord (à trancher), puis 4 faits essentiels, le
 *  reste replié par thème. Un fait retiré n'est pas utilisé ; il peut être remis. */
async function site() {
  if (S.lectureSite) { message(t("demarrer.js.site.lecture")); await S.lectureSite; message(""); }
  const s = S.reponses.site || {};
  if (!s.url || !((s.faits || []).length || (s.logos || []).length)) { aller(etapeCourante()); return; }
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
    ...titre(t("demarrer.js.site.retenu_titre"), faits.length ? t("demarrer.js.site.retenu_aide", { n: faits.length }) : t("demarrer.js.site.aucun_fait")),
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
          aller(etapeCourante());
        } catch (e) { message(e.message, true); bouton.disabled = false; }
      } }, faits.length ? t("demarrer.js.site.valider_faits") : t("demarrer.js.continuer"), fleche())),
    el("p", { class: "q-usage", text: t("demarrer.js.site.usage_faits") }));
}

/** « Photos et logo » (part D, 24/11/2026), with or without a website: 1. the logo, chosen among those of the website
 *  or uploaded, with its preview; 2. the photos of the website to click and the upload of several files at once
 *  (drag and drop, progress per file, reduction in the browser), the attestation above, never lost; 3. the photos
 *  kept, each with Claude's assessment and where it will appear in the memorandum. */
let focusPhotoParcours = null;
async function photos() {
  const memo = await api(`${base}/documents/memo`).catch(() => S.memo);
  S.memo = memo;
  const s = memo?.site || S.reponses.site || {};
  const max = memo?.photos_max || 12;
  const deja = memo?.photos || [];
  const baseMemo = `${base}/documents/memo`;
  const candidates = (s.photos_candidates || []).filter((u) => !deja.some((p) => p.origine === u)).slice(0, Math.max(0, max - deja.length));
  const ecartees = s.photos_ecartees || [];
  // A decision, a new order or an assessment redraws the list only: the upload rows (and their advice) and the logo
  // status stay in place
  const redessiner = (m, cible) => { if (m) S.memo = m; focusPhotoParcours = cible || null; majListe(); };
  // Upload: the list below is redrawn after each photo, the upload zone (and its progress rows) stays in place
  const depot = zoneDepotPhotos({ memo, baseMemo, idBase: "parcours-photos",
    surAjout: (m) => { S.memo = m; majListe(); }, surCandidate: (m) => { S.memo = m; majListe(); } });
  const zoneListe = el("div", { class: "guide-champ" });
  const majListe = () => {
    const m = S.memo || {};
    depot.majMemo(m); // a photo removed frees a place
    const liste = listePhotos({ memo: m, baseMemo, message, focus: focusPhotoParcours, maj: redessiner });
    focusPhotoParcours = null;
    remplacer(zoneListe, el("h2", { class: "photos-sous-titre", text: t("demarrer.js.photos.vos_photos", { n: (m.photos || []).length, max }) }),
      liste || el("p", { class: "petit", text: t("demarrer.js.photos.aucune_choisie") }));
    bouton.replaceChildren((m.photos || []).length ? t("demarrer.js.photos.utiliser", { n: m.photos.length }) : t("demarrer.js.photos.sans_photo"), fleche());
  };
  const grille = candidates.length ? el("div", { class: "photos-grille", role: "group", "aria-labelledby": "photos-site-titre" }, ...candidates.map((u, k) => el("button", { type: "button", class: "photo-tuile", "aria-label": t("demarrer.js.photos.ajouter_n", { n: k + 1 }), onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const ok = await depot.ajouterSite(u, (texte) => message(texte, true));
    if (ok) { b.remove(); message(""); } else b.disabled = false;
  } }, el("img", { src: u, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.currentTarget.closest(".photo-tuile")?.remove() }), el("span", { class: "photo-coche", "aria-hidden": "true", text: "+" })))) : null;
  const bouton = el("button", { type: "button", class: "btn btn-vert" });
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    try { await marquerVue("photos"); message(""); aller(etapeCourante()); }
    catch (e) { message(e.message, true); bouton.disabled = false; }
  });
  remplir(
    s.url ? el("p", { class: "q-compteur", text: new URL(/^https?:/.test(s.url) ? s.url : `https://${s.url}`).hostname }) : null,
    ...titre(t("demarrer.js.photos.titre"), t("demarrer.js.photos.aide_jugement")),
    el("section", { class: "carte photos-bloc" }, el("h2", { class: "photos-sous-titre", text: t("demarrer.js.photos.logo_titre") }),
      zoneLogo({ memo, baseMemo, logos: s.logos || [], idBase: "parcours-logo", surChange: (m) => { S.memo = m; } })),
    el("section", { class: "carte photos-bloc" }, el("h2", { class: "photos-sous-titre", text: t("demarrer.js.photos.ajouter_titre") }),
      el("p", { class: "petit", text: s.url ? t("demarrer.js.photos.aide_site") : t("demarrer.js.photos.aide_sans_site") }),
      depot,
      grille ? el("div", { class: "guide-champ" }, el("p", { class: "guide-lib", id: "photos-site-titre", text: t("demarrer.js.photos.cliquez_ajouter") }), el("p", { class: "guide-aide", text: t("demarrer.js.photos.usage", { max }) }), grille) : null,
      ecartees.length ? el("p", { class: "petit", text: t("memo.js.photos.ecartees", { n: ecartees.length, raisons: [...new Set(ecartees.map((x) => t(`memo.js.photos.raisons.${x.raison}`)))].join(", ") }) }) : null),
    zoneListe,
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { S.q = QUESTIONS.length - 1; aller("questions"); } }, t("demarrer.js.retour")),
      bouton),
    el("p", { class: "q-usage", text: t("demarrer.js.photos.ou_va") }));
  majListe();
}

// ================================================================== Équipe dirigeante (mémorandum seulement)
const equipeAPresenter = () => !S.vues.includes("equipe_dirigeante");
/** Une carte repliable par personne (1 à 4) : nom, rôle, ancienneté et expérience, formation, 1 à 3 expériences,
 *  place après la cession, photo facultative avec le consentement de la personne. Sauvegarde automatique. */
let equipeEtat = null, equipeOuverte = null, sauverEquipeMinuteur = null;
function sauverEquipe(immediat = false) {
  clearTimeout(sauverEquipeMinuteur);
  const go = () => api(`${base}/answers/equipe`, { method: "PUT", body: JSON.stringify({ data: { personnes: equipeEtat.personnes.map(({ photo, ...x }) => x) } }) })
    .then(() => { S.reponses.equipe = normaliserEquipe(equipeEtat, S.reponses.equipe); }).catch((e) => message(e.message, true));
  if (immediat) return go();
  sauverEquipeMinuteur = setTimeout(go, 600);
  return Promise.resolve();
}
function equipe() {
  if (!equipeEtat) {
    equipeEtat = { personnes: (S.reponses.equipe?.personnes || []).map((p) => ({ ...p, experiences: [...(p.experiences || [])] })) };
    if (!equipeEtat.personnes.length) equipeEtat.personnes.push({ id: nouvelId(), nom: "", experiences: [] });
    equipeOuverte = equipeEtat.personnes.find((p) => !personneComplete(p))?.id || equipeEtat.personnes[0].id;
  }
  const L = equipeEtat.personnes;
  const carte = (p, k) => {
    const pref = `pers-${p.id}`;
    const champ = (cle, valeur) => { p[cle] = valeur; sauverEquipe(); };
    const curseur = (cle, [min, max], libelle) => {
      const out = el("output", { id: `${pref}-${cle}-v`, text: p[cle] == null ? t("demarrer.js.equipe.non_renseigne") : t("demarrer.js.equipe.ans", { n: p[cle] }) });
      const r = el("input", { type: "range", min: String(min), max: String(max), value: String(p[cle] ?? min), id: `${pref}-${cle}`, class: p[cle] == null ? "curseur-vide" : null, "aria-describedby": `${pref}-${cle}-v` });
      r.addEventListener("input", () => { r.classList.remove("curseur-vide"); out.textContent = t("demarrer.js.equipe.ans", { n: Number(r.value) }); champ(cle, Number(r.value)); });
      return el("div", { class: "eq-curseur" }, el("label", { class: "tres-petit", for: `${pref}-${cle}`, text: libelle }), out, r);
    };
    const puces = (nom, valeurs, courant, libelle, surChoix) => el("div", { class: "puces-choix", role: "radiogroup", "aria-label": libelle }, ...valeurs.map((v) => {
      const r = el("input", { type: "radio", name: `${pref}-${nom}`, value: v, checked: courant === v, class: "visuellement-cache", id: `${pref}-${nom}-${v}` });
      r.addEventListener("change", () => surChoix(v));
      return el("label", { class: "puce-case", for: `${pref}-${nom}-${v}` }, r, libelleChoix(nom, v));
    }));
    const libelleChoix = (nom, v) => (nom === "formation" ? t(`memo.equipe.formations.${v}`) : t(`memo.equipe.apres.${v}`));
    const mois = p.apres === "accompagne" ? curseur("mois", BORNES.mois, t("demarrer.js.equipe.pendant")) : null;
    if (mois) mois.querySelector("output").textContent = p.mois == null ? t("demarrer.js.equipe.non_renseigne") : t("demarrer.js.equipe.mois", { n: p.mois });
    mois?.querySelector("input").addEventListener("input", (e) => { mois.querySelector("output").textContent = t("demarrer.js.equipe.mois", { n: Number(e.target.value) }); });
    const exps = el("div", { class: "eq-experiences" }, ...p.experiences.map((x, j) => el("div", { class: "eq-exp" },
      el("select", { "aria-label": t("demarrer.js.equipe.type_experience", { n: j + 1 }), onchange: (e) => { x.type = e.target.value; sauverEquipe(); } },
        el("option", { value: "", text: t("demarrer.js.equipe.choisir") }), ...TYPES_EXPERIENCE.map((ty) => el("option", { value: ty, selected: x.type === ty, text: t(`memo.equipe.experiences.${ty}`) }))),
      el("input", { type: "text", maxlength: "80", value: x.precision || "", placeholder: t("demarrer.js.equipe.precision_exemple"), "aria-label": t("demarrer.js.equipe.precision", { n: j + 1 }), oninput: (e) => { x.precision = e.target.value; sauverEquipe(); } }),
      el("button", { type: "button", class: "lien-simple", onclick: () => { p.experiences.splice(j, 1); sauverEquipe(); equipe(); } }, t("espace.js.retirer")))),
      p.experiences.length < EXPERIENCES_MAX ? el("button", { type: "button", class: "lien-simple", onclick: () => { p.experiences.push({ type: "", precision: "" }); equipeOuverte = p.id; equipe(); } }, t("demarrer.js.equipe.ajouter_experience")) : null);
    const consent = el("input", { type: "checkbox", id: `${pref}-consent` });
    const fichierPhoto = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: `${pref}-fichier`, class: "visuellement-cache" });
    fichierPhoto.addEventListener("change", async () => {
      const f = fichierPhoto.files[0]; fichierPhoto.value = ""; if (!f) return;
      if (!consent.checked) { message(t("demarrer.js.equipe.cochez_consentement"), true); consent.focus(); return; }
      if (!p.nom.trim()) { message(t("demarrer.js.equipe.nom_d_abord"), true); return; }
      await sauverEquipe(true);
      const fd = new FormData(); fd.append("fichier", f); fd.append("consentement", "oui");
      try { const m = await api(`${base}/documents/memo/equipe/${p.id}/photo`, { method: "POST", body: fd }); p.photo = { a: true }; S.memo = m; message(t("demarrer.js.equipe.photo_enregistree")); equipe(); }
      catch (e) { message(e.message, true); }
    });
    const zonePhoto = p.photo
      ? el("div", { class: "eq-photo-zone" }, el("img", { class: "eq-apercu", src: `${base}/documents/memo/equipe/${p.id}/photo?v=${Date.now()}`, alt: t("memo.js.equipe.photo_de", { nom: p.nom }) }),
        el("div", {}, el("p", { class: "petit", text: t("demarrer.js.equipe.accord_enregistre") }),
          el("button", { type: "button", class: "lien-simple", onclick: async () => { try { await api(`${base}/documents/memo/equipe/${p.id}/photo`, { method: "DELETE" }); delete p.photo; equipe(); } catch (e) { message(e.message, true); } } }, t("demarrer.js.equipe.retirer_photo"))))
      : el("div", { class: "eq-photo-zone" }, el("span", { class: "eq-apercu eq-vide", "aria-hidden": "true", text: initiales(p.nom) }),
        el("div", {}, el("p", { class: "tres-petit", text: t("demarrer.js.equipe.photo_facultative") }),
          el("label", { class: "case", for: `${pref}-consent` }, consent, el("span", {}, el("strong", { text: t("demarrer.js.equipe.consentement") }), " ", t("demarrer.js.equipe.consentement_aide"))),
          el("label", { class: "btn btn-contour btn-mini", for: `${pref}-fichier`, tabindex: "0", onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fichierPhoto.click(); } } }, t("demarrer.js.equipe.ajouter_photo")), fichierPhoto));
    const d = el("details", { class: "eq-personne", open: equipeOuverte === p.id, ontoggle: (e) => { if (e.currentTarget.open) equipeOuverte = p.id; } },
      el("summary", {},
        p.photo ? el("span", { class: "eq-av" }, el("img", { src: `${base}/documents/memo/equipe/${p.id}/photo?v=${Date.now()}`, alt: "" })) : el("span", { class: "eq-av", "aria-hidden": "true", text: initiales(p.nom) }),
        el("span", { class: "eq-resume" }, el("strong", { text: p.nom || t("demarrer.js.equipe.nouvelle_personne") }), el("small", { text: [libelleRole(p), libelleApres(p)].filter(Boolean).join(" · ") || t("demarrer.js.equipe.a_completer") })),
        el("span", { class: `pastille-etat ${personneComplete(p) ? "ok" : "a-faire"}`, text: personneComplete(p) ? t("demarrer.js.equipe.complet") : t("demarrer.js.equipe.a_completer") })),
      el("div", { class: "eq-fiche" },
        el("div", { class: "eq-deux" },
          el("div", { class: "guide-champ" }, el("label", { class: "guide-lib", for: `${pref}-nom`, text: t("demarrer.js.equipe.nom") }), el("input", { type: "text", id: `${pref}-nom`, maxlength: "80", value: p.nom || "", autocomplete: "off", oninput: (e) => champ("nom", e.target.value),
            // Summary updated in place: redrawing the screen on blur swallowed the click on « Continuer » (24/11/2026)
            onchange: (e) => { const det = e.target.closest(".eq-personne"); det.querySelector(".eq-resume strong").textContent = p.nom || t("demarrer.js.equipe.nouvelle_personne"); const av = det.querySelector("summary .eq-av"); if (av && !p.photo) av.textContent = initiales(p.nom); } })),
          el("div", { class: "guide-champ" }, el("label", { class: "guide-lib", for: `${pref}-role`, text: t("demarrer.js.equipe.role") }),
            el("select", { id: `${pref}-role`, onchange: (e) => { champ("role", e.target.value || null); equipe(); } }, el("option", { value: "", text: t("demarrer.js.equipe.choisir") }), ...ROLES.map((r) => el("option", { value: r, selected: p.role === r, text: t(`memo.equipe.roles.${r}`) }))),
            p.role === "autre" ? el("input", { type: "text", maxlength: "60", value: p.role_autre || "", "aria-label": t("demarrer.js.equipe.role_autre"), placeholder: t("demarrer.js.equipe.role_autre"), oninput: (e) => champ("role_autre", e.target.value) }) : null)),
        el("div", { class: "eq-deux" }, curseur("anciennete", BORNES.anciennete, t("demarrer.js.equipe.anciennete")), curseur("experience", BORNES.experience, t("demarrer.js.equipe.experience"))),
        el("fieldset", { class: "eq-groupe" }, el("legend", { text: t("demarrer.js.equipe.formation") }), puces("formation", FORMATIONS, p.formation, t("demarrer.js.equipe.formation"), (v) => champ("formation", v))),
        el("fieldset", { class: "eq-groupe" }, el("legend", { text: t("demarrer.js.equipe.experiences", { max: EXPERIENCES_MAX }) }), exps),
        el("fieldset", { class: "eq-groupe" }, el("legend", { text: t("demarrer.js.equipe.apres") }), puces("apres", APRES, p.apres, t("demarrer.js.equipe.apres"), (v) => { champ("apres", v); if (v !== "accompagne") p.mois = null; equipeOuverte = p.id; equipe(); }), mois),
        zonePhoto,
        L.length > 1 ? el("button", { type: "button", class: "lien-simple eq-retirer", onclick: async () => { L.splice(k, 1); await sauverEquipe(true); equipe(); } }, t("demarrer.js.equipe.retirer_personne", { nom: p.nom || t("demarrer.js.equipe.nouvelle_personne") })) : null));
    return d;
  };
  const ajouterP = el("button", { type: "button", class: "eq-ajouter", disabled: L.length >= PERSONNES_MAX, onclick: () => { const n = { id: nouvelId(), nom: "", experiences: [] }; L.push(n); equipeOuverte = n.id; equipe(); document.getElementById(`pers-${n.id}-nom`)?.focus(); } },
    L.length >= PERSONNES_MAX ? t("demarrer.js.equipe.max", { max: PERSONNES_MAX }) : t("demarrer.js.equipe.ajouter", { n: L.length, max: PERSONNES_MAX }));
  const continuer = el("button", { type: "button", class: "btn btn-vert" }, t("demarrer.js.continuer"), fleche());
  continuer.addEventListener("click", async () => {
    continuer.disabled = true;
    await sauverEquipe(true);
    await marquerVue("equipe_dirigeante");
    equipeEtat = null;
    aller(etapeCourante());
  });
  remplir(
    ...titre(t("demarrer.js.equipe.titre"), t("demarrer.js.equipe.aide")),
    el("div", { class: "eq-personnes" }, ...L.map(carte), ajouterP),
    el("p", { class: "petit eq-rgpd", text: t("demarrer.js.equipe.rgpd") }),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => { sauverEquipe(true); equipeEtat = null; aller("photos"); } }, t("demarrer.js.retour")), continuer),
    el("p", { class: "q-usage", text: t("demarrer.js.equipe.ou_va") }));
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

// ================================================================== 5. Rédaction (tout d'un coup)
/** Étude de marché lancée dès l'ouverture du parcours (registres + recherche web, une à deux minutes) : elle ne dépend
 *  que de l'entreprise, et se fait pendant que le dirigeant répond aux questions. Une seule fois par dossier. */
function lancerEtudeMarche() {
  if (S.marche) return S.marche;
  const cle = `passation-marche-${id}`;
  try { const t = Number(localStorage.getItem(cle)); if (t && Date.now() - t < 10 * 60 * 1000) return null; localStorage.setItem(cle, String(Date.now())); } catch { /* stockage indisponible */ }
  // En cas d'échec, l'erreur est gardée : la rédaction ne relance pas une deuxième recherche (deux minutes de plus et
  // un essai consommé), sauf si l'étude était déjà en cours (409), auquel cas elle attend son résultat
  S.marche = api(`${base}/documents/memo`).then((m) => (m.marche?.date ? m : api(`${base}/documents/memo/marche`, { method: "POST" }))).catch((e) => ({ echec: e }));
  return S.marche;
}

/** Exécute des tâches avec au plus n en parallèle (file continue : une tâche démarre dès qu'une autre finit). */
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
      if (m?.echec && m.echec.statut !== 409) throw m.echec; // déjà tentée pendant les questions : pas de seconde recherche
      try { await api(`${base}/documents/memo/marche`, { method: "POST" }); }
      catch (e) {
        if (e.statut !== 409) throw e;
        // Déjà en cours (lancée au début du parcours) : on attend son résultat, deux minutes au plus
        for (let k = 0; k < 24; k++) { await new Promise((r) => setTimeout(r, 5000)); const x = await api(`${base}/documents/memo`).catch(() => null); if (x?.marche?.date || !x?.marche?.en_cours) return; }
      }
    }],
    ["datapack", t("dossier.documents.datapack"), () => api(`${base}/documents/datapack`, { method: "POST" })],
    ["teaser", t("dossier.documents.teaser"), () => api(`${base}/documents/teaser`, { method: "POST" })],
    ...SECTIONS.map(([k, nom]) => [`memo-${k}`, t("demarrer.js.redaction.memo_section", { section: nom }), () => api(`${base}/documents/memo/sections/${k}`, { method: "POST" })]),
    // Passage automatique de la relecture critique, une fois les chapitres rédigés (remarques dans le panneau)
    ["relecture", t("demarrer.js.redaction.relecture"), () => api(`${base}/documents/memo/relecture`, { method: "POST" })],
  ];
  const libelle = Object.fromEntries(taches.map(([k, lib]) => [k, lib]));
  // Réponses indispensables au mémorandum : vérifiées avant de lancer quoi que ce soit (sinon 9 échecs sans issue)
  const incompletes = questionsIncompletes(S.reponses);
  // Ce qui est déjà rédigé n'est pas refait (reprise après une interruption)
  const deja = new Set();
  try {
    const [d, m] = await Promise.all([api(base), api(`${base}/documents/memo`)]);
    if (d.parcours?.valorisation) deja.add("valorisation");
    if (d.documents?.datapack) deja.add("datapack");
    if (d.documents?.teaser) deja.add("teaser");
    for (const x of m.sections || []) if (x.redigee) deja.add(`memo-${x.cle}`);
    if (m.marche?.date) deja.add("etude-marche");
    if (m.relecture?.date) deja.add("relecture");
  } catch { /* on refait tout */ }
  const lignes = Object.fromEntries(taches.map(([k, lib]) => [k, el("li", { class: deja.has(k) ? "fait" : incompletes.length && (k.startsWith("memo-") || k === "relecture") ? "attente" : null }, el("span", { class: "etat", "aria-hidden": "true" }), lib)]));
  const chrono = el("span", { class: "petit guide-chrono", "aria-hidden": "true" });
  remplir(...titre(t("demarrer.js.redaction.titre"), t("demarrer.js.redaction.aide")),
    chrono, el("ul", { class: "guide-taches" }, ...Object.values(lignes)), el("div", { id: "redaction-suite" }));
  const debut = Date.now(), minuterie = setInterval(() => { const s = Math.round((Date.now() - debut) / 1000); chrono.textContent = t("demarrer.js.redaction.chrono", { s, n: $("#ecran .guide-taches")?.querySelectorAll("li.fait").length ?? 0, total: taches.length }); }, 1000);
  const erreurs = [];
  const executer = async ([k, , f]) => {
    if (deja.has(k) || (incompletes.length && (k.startsWith("memo-") || k === "relecture"))) return;
    lignes[k].classList.add("en-cours");
    try { await f(); lignes[k].classList.replace("en-cours", "fait"); }
    catch (e) { lignes[k].classList.replace("en-cours", "erreur"); erreurs.push({ k, message: e.message, statut: e.statut }); }
  };
  try {
    await executer(taches[0]); // the valuation first: the datapack, the teaser and the memorandum rely on it
    // L'étude de marché tourne pendant tout le reste ; seuls les chapitres qui la citent (marché, synthèse,
    // perspectives) l'attendent, et ils passent en dernier
    const marche = executer(taches[1]);
    const citent = new Set(["memo-marche", "memo-synthese", "memo-perspectives"]);
    const memo = taches.filter(([k]) => k.startsWith("memo-"));
    await enParallele([...taches.slice(2).filter(([k]) => !k.startsWith("memo-") && k !== "relecture"), ...memo.filter(([k]) => !citent.has(k))], 4, executer);
    await marche;
    await enParallele(memo.filter(([k]) => citent.has(k)), 3, executer);
    if (!erreurs.some((e) => e.k.startsWith("memo-"))) await executer(taches.find(([k]) => k === "relecture"));
  } finally { clearInterval(minuterie); }

  const suite = $("#redaction-suite");
  // 1. Réponses indispensables manquantes : on les demande ici, avec un accès direct à la question
  let manquantes = incompletes;
  if (!manquantes.length && erreurs.some((e) => e.statut === 409 && e.k.startsWith("memo-"))) {
    S.reponses = (await api(`${base}/answers`).catch(() => ({}))).reponses || S.reponses; // réponses peut-être modifiées ailleurs
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
  // 2. Échecs passagers (service de rédaction indisponible, délai) : un message par cause, et « Réessayer »
  const nonBloquants = new Set(["teaser", "etude-marche", "relecture"]);
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

// ================================================================== Relecture et envoi
/** Écran final : même état que la page du dossier (etatParcours), donc même statut, même pourcentage, même fourchette
 *  et mêmes tâches. « Prêt » seulement si tout l'indispensable est fait ; sinon « rédigé » et ce qui reste. */
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
  const nCouv = placementPhotos(memo?.photos || []).couverture;
  const photo = nCouv != null ? `${base}/documents/memo/photos/${nCouv}` : null;
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

// ================================================================== Chargement
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace(lien("/espace/")); return; }
  $("#lien-dossier").href = lien(`/espace/?dossier=${id}`);
  try {
    const [moi, dossier, ch, rep, props] = await Promise.all([api("/api/me"), api(base), api(`${base}/financials`), api(`${base}/answers`), api(`${base}/documents/memo/propositions`).catch(() => ({}))]);
    S.propositions = props.propositions || {};
    S.email = moi.email; S.dossier = dossier; S.chiffres = ch; S.reponses = rep.reponses || {}; S.vues = vuesDe(S.reponses);
    S.etat = etatParcours(dossier, ...(await documentsPourEtat(dossier)));
    // Nom de code et nom réel sur une ligne, dans la barre (même en-tête sobre que la page du dossier)
    $("#guide-entreprise").textContent = nomLisible(dossier.entreprise.nom) || t("demarrer.votre_dossier");
    $("#guide-code").textContent = dossier.nom_de_code || ""; $("#guide-code").hidden = !dossier.nom_de_code;
    document.title = `${dossier.entreprise.nom} · Passation`;
    S.complet = Boolean(dossier.documents?.memo && dossier.documents?.teaser && dossier.documents?.datapack && dossier.parcours?.valorisation);
    // Documents déjà rédigés : on rouvre sur l'écran final (récapitulatif et points à compléter), pas sur une question
    // facultative laissée vide ; ?etape=… permet toujours d'y revenir (audit, point 17)
    aller(etapeDemandee() || (S.complet || S.reponses.suivi?.pret_envoye ? "pret" : etapeCourante()));
    if (!S.complet && dossier.entreprise?.naf && valeurValidee()) lancerEtudeMarche(); // pendant les questions du mémorandum, pas à la fin
  } catch (e) { if (e.message !== "non_connecte") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
})();
