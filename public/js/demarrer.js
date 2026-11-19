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
import { CHAMPS, exercicesAttendus, libelleEcran, aideEcran, AIDE_EBE } from "/js/champs-financiers.js";
import { REGIONS } from "/js/questionnaire.js";
import { QUESTIONS, questionRepondue, requisManquants, questionsIncompletes, siteDepuisEmail, questionsAPoser, vuesDe } from "/js/parcours.js";
import { ETAPES_PARCOURS, ETAPE_DE_L_ECRAN, ETIQUETTE_EXPRESS, etatParcours, ecranFinal } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js";

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
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const court = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(v / 1e3).toLocaleString("fr-FR")} k€`);
const lireNombre = (s) => { const t = String(s ?? "").replace(/[\s  €%]/g, "").replace(",", "."); if (t === "" || t === "-") return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
/** Remplit l'écran en ignorant les emplacements vides (jamais de « null » affiché). */
const remplir = (...enfants) => remplacer($("#ecran"), ...enfants);
function message(t, erreur = false) { const m = $("#message"); m.textContent = t; m.hidden = !t; m.classList.toggle("erreur", erreur); }
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: enJson ? { "content-type": "application/json" } : {} });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || "Une erreur est survenue."), { statut: r.status });
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
function etapeCourante() {
  if (!dernierConfirme()) return aDesChiffresAValider() ? "chiffres" : "comptes";
  if (siteARepondre() && !S.complet && !S.reponses.suivi?.pret_envoye) { S.q = -1; return "questions"; }
  const iq = QUESTIONS.findIndex((q) => !questionRepondue(q, S.reponses, S.vues));
  if (iq >= 0) { S.q = iq; return "questions"; }
  const site = S.reponses.site || {};
  if (site.url && !site.confirme && ((site.faits || []).length || (site.logos || []).length)) return "site";
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
  if (e === "redaction" || e === "pret") return e;
  return null;
}
const siteARepondre = () => !S.reponses.site?.url && !S.reponses.site?.aucun;
/** Fil des étapes : la liste et l'état fait / à venir sont ceux de la page du dossier (etatParcours) ; l'étape de
 *  l'écran affiché est mise en avant. Le pourcentage est le même que celui de la page du dossier. */
function dessinerEtapes() {
  const ici = ETAPE_DE_L_ECRAN[S.etape];
  const etats = Object.fromEntries((S.etat?.etapes || []).map((x) => [x.cle, x.etat]));
  remplacer($("#guide-etapes"), ...ETAPES_PARCOURS.map(([k, t], j) => el("li", { class: k === ici ? "actif" : etats[k] === "fait" ? "fait" : null, "aria-current": k === ici ? "step" : null },
    el("span", { text: etats[k] === "fait" && k !== ici ? "✓" : String(j + 1) }), t, el("span", { class: "visuellement-cache", text: etats[k] === "fait" ? " : faite" : "" }))));
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
  ({ comptes, saisie, chiffres, questions, site, redaction, pret })[etape](); $("#ecran").querySelector("h1, h2")?.focus?.(); window.scrollTo({ top: 0 });
}
const titre = (t, aide) => [el("h1", { class: "guide-titre", tabindex: "-1", text: t }), aide ? el("p", { class: "chapo-petit", text: aide }) : null].filter(Boolean);

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
    `Entreprise identifiée : ${e.nom || "votre société"}`,
    publics.length ? `Comptes publics récupérés : ${publics.join(", ")}` : null,
    est?.statut === "ok" ? `${ETIQUETTE_EXPRESS}${est.exercice ? ` (comptes ${est.exercice})` : ""} : ${fourchette(est.bas, est.haut)}` : null,
  ].filter(Boolean);
  return el("div", { class: "carte guide-deja" }, el("p", { class: "etiquette", text: "Déjà fait" }),
    el("ul", {}, ...faits.map((t) => el("li", { text: t }))));
}
function comptes() {
  const lecture = S.chiffres?.lecture_automatique !== false;
  const fichier = el("input", { type: "file", accept: "application/pdf", id: "liasse", class: "visuellement-cache" });
  fichier.addEventListener("change", async () => {
    const f = fichier.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("fichier", f);
    message("Lecture de votre liasse… (30 secondes environ)");
    $("#zone-depot").setAttribute("aria-busy", "true");
    try { S.chiffres = await api(`${base}/uploads`, { method: "POST", body: fd }); message(""); aller("chiffres"); }
    catch (e) { message(e.message, true); }
    finally { $("#zone-depot")?.removeAttribute("aria-busy"); }
  });
  const versSaisie = (texte, classe = "lien-simple") => el("button", { type: "button", class: classe, onclick: () => { S.saisie = null; aller("saisie"); } }, texte);
  const suite = dernierConfirme() || aDesChiffresAValider() ? el("button", { type: "button", class: "btn btn-vert", onclick: () => aller("chiffres") }, "Continuer") : null;
  if (!lecture) {
    remplir(dejaFait(), ...titre("Saisissez l'essentiel de vos comptes", "Une dizaine de montants, à recopier de votre liasse fiscale ou de vos comptes annuels. C'est ce qui transforme la première valeur en une valeur que vous pourrez défendre."),
      el("p", { class: "petit", text: "La lecture automatique des liasses n'est pas disponible pour le moment." }),
      versSaisie("Saisir mes chiffres", "btn btn-noir"), suite);
    return;
  }
  remplir(dejaFait(), ...titre("Déposez votre dernière liasse fiscale", "C'est ce qui transforme la première valeur en une valeur que vous pourrez défendre. Nous lisons les chiffres ; vous n'aurez qu'à les confirmer."),
    el("div", { class: "depot depot-grand", id: "zone-depot" },
      el("div", { class: "depot-texte" }, el("strong", { text: "Liasse fiscale en PDF" }), el("span", { class: "petit", text: "Formulaires 2033 ou 2050 à 2059, 10 Mo au plus. Elle contient en général deux exercices." })),
      el("label", { class: "btn btn-noir", for: "liasse" }, "Choisir le PDF"), fichier),
    el("p", { class: "petit" }, "Pas de liasse sous la main ? ", versSaisie("Saisir l'essentiel à la main"), " : une dizaine de montants."),
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
  const aideEbe = () => el("span", { class: "aide-bulle" }, el("button", { type: "button", class: "aide-rond", "aria-describedby": "aide-ebe-saisie", "aria-label": "Qu'est-ce que l'EBE ?" }, "?"),
    el("span", { role: "tooltip", id: "aide-ebe-saisie", text: AIDE_EBE }));
  const champ = (cle) => {
    const c = CHAMPS.find((x) => x.cle === cle), cell = l[cle];
    const input = el("input", { type: "text", inputmode: "decimal", id: `s-${cle}`, "data-cle": cle, value: brut(cle), autocomplete: "off" });
    input.addEventListener("input", () => { S.saisie.valeurs[cle] = input.value; });
    const aide = cell?.source === "inpi" ? "Repris des comptes publics (registre national des entreprises) : vérifiez-le avec vos comptes." : aideEcran(c);
    return el("div", { class: "guide-champ saisie-champ" },
      el("label", { class: "guide-lib", for: `s-${cle}` }, cle === "ebe" ? ["EBE ", aideEbe()] : libelleEcran(c), FACULTATIFS.has(cle) ? el("span", { class: "facultatif", text: " · facultatif" }) : null),
      el("p", { class: "petit", text: aide }),
      el("div", { class: "champ-unite" }, input, el("span", { class: "unite", text: "€" })));
  };
  /** Lit les montants des clés données : { valeurs } ou un message d'erreur (champ illisible ou obligatoire vide). */
  const lire = (cles) => {
    const valeurs = {}, manque = [];
    for (const cle of cles) {
      const v = lireNombre(brut(cle));
      const lib = cle === "ebe" ? "EBE" : libelleEcran(CHAMPS.find((x) => x.cle === cle));
      if (Number.isNaN(v)) return { erreur: `Montant illisible : ${lib}.`, cle };
      if (v === null) { if (!FACULTATIFS.has(cle)) manque.push(lib); continue; }
      valeurs[cle] = v;
    }
    return manque.length ? { erreur: `Il manque : ${manque.join(", ")}. Indiquez 0 si le poste n'existe pas.`, cle: null } : { valeurs };
  };
  const choixAnnee = el("select", { id: "s-annee" }, ...toutes.map((a) => el("option", { value: String(a), selected: a === annee }, String(a))));
  choixAnnee.addEventListener("change", () => { S.saisie = { annee: Number(choixAnnee.value), valeurs: {}, ecran: 1 }; saisie(); });
  const basculer = ebePublie ? el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie.detail = !detail; saisie(); } },
    detail ? "Reprendre l'EBE des comptes publics" : "Je préfère détailler mes charges") : null;
  const erreur = (r) => { message(r.erreur, true); if (r.cle && ecran === 1) $(`#s-${r.cle}`)?.focus(); return false; };

  if (ecran === 1) {
    remplir(...titre("L'essentiel de vos comptes", "Écran 1 sur 2 : ce que l'entreprise gagne. À recopier de vos comptes annuels ; indiquez 0 si un poste n'existe pas."),
      el("div", { class: "guide-champ saisie-annee" }, el("label", { class: "guide-lib", for: "s-annee", text: "Exercice clos en" }), choixAnnee),
      el("fieldset", { class: "saisie-groupe saisie-deux" }, el("legend", { text: "Ce que l'entreprise gagne" }), ...cles1.map(champ), basculer),
      el("div", { class: "q-nav" },
        el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie = null; message(""); aller(exercicesComplets() || aDesChiffresAValider() ? "chiffres" : "comptes"); } }, "Retour"),
        el("button", { type: "button", class: "btn btn-noir", onclick: () => {
          const r = lire(cles1);
          if (r.erreur) return erreur(r);
          message(""); S.saisie.ecran = 2; saisie();
        } }, "Suivant : ce qu'elle possède et doit ", fleche())));
    return;
  }
  remplir(...titre("L'essentiel de vos comptes", `Écran 2 sur 2 : ce que l'entreprise possède et doit, à la clôture ${annee}. Indiquez 0 si un poste n'existe pas.`),
    el("fieldset", { class: "saisie-groupe saisie-deux" }, el("legend", { text: "Ce qu'elle possède et doit" }), ...BILAN_ESSENTIEL.map(champ)),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { message(""); S.saisie.ecran = 1; saisie(); } }, "← Ce que l'entreprise gagne"),
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
          else { message(`Exercice ${annee} enregistré.`); aller(etapeCourante()); }
        } catch (e) { message(e.message, true); bouton.disabled = false; }
      } }, "Enregistrer cet exercice ", fleche())));
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
      el("header", {}, el("h2", { text: `Exercice ${a}` }), valide ? el("span", { class: "pastille-ok", text: "✓ Confirmé" }) : a !== annees[0] ? el("span", { class: "petit", text: "Facultatif" }) : null),
      el("dl", { class: "guide-resume" },
        ...[["Chiffre d'affaires", val("chiffre_affaires")], ["EBE", ebe], ["Résultat net", val("resultat_net")], ["Capitaux propres", val("capitaux_propres")]]
          .map(([t, x]) => el("div", {}, el("dt", { text: t }), el("dd", { text: court(x) })))),
      ...alertes.map((c) => el("p", { class: "controle alerte", text: c.message })),
      ...attentions.map((c) => el("p", { class: "controle attention", text: c.message })),
      bloquees.length ? el("div", { class: "guide-lignes" }, ...bloquees.map((k) => ligneAVerifier(a, k, l[k]))) : null,
      valide ? null : el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        try { S.chiffres = await api(`${base}/financials/${a}/valider`, { method: "POST" }); chiffres(); }
        catch (e) { message(e.message, true); }
      } }, alertes.length ? "Confirmer les autres lignes" : "Ces chiffres sont justes"));
  });
  remplir(...titre("Vos chiffres sont-ils justes ?", "Comparez avec votre liasse. Nos contrôles automatiques signalent ce qui mérite votre attention ; le reste se confirme d'un clic."),
    ...cartes,
    el("p", { class: "petit" },
      el("button", { type: "button", class: "lien-simple", onclick: () => { S.saisie = null; aller("saisie"); } }, "Saisir un autre exercice"), " · ",
      el("button", { type: "button", class: "lien-simple", onclick: () => aller("comptes") }, "Déposer une autre liasse"), " · ",
      el("a", { href: `/espace/valorisation/?dossier=${id}#chiffres`, text: "Mode détaillé (toutes les lignes)" })),
    dernierConfirme() ? el("button", { type: "button", class: "btn btn-vert", onclick: () => aller(etapeCourante()) }, "Continuer ", fleche()) : null);
}
function ligneAVerifier(annee, cle, cellule) {
  const c = CHAMPS.find((x) => x.cle === cle);
  const input = el("input", { type: "text", inputmode: "decimal", value: cellule?.valeur != null ? fmt.format(cellule.valeur) : "", "aria-label": `${libelleEcran(c)}, ${annee}` });
  return el("div", { class: "guide-ligne" }, el("label", { text: libelleEcran(c) || cle }), input,
    el("button", { type: "button", class: "btn btn-mini", onclick: async () => {
      const v = lireNombre(input.value);
      if (v === null || Number.isNaN(v)) { message("Indiquez un montant lisible.", true); input.focus(); return; }
      try { S.chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee, valeurs: { [cle]: v }, valider: true }) }); message(""); chiffres(); }
      catch (e) { message(e.message, true); }
    } }, "Valider"));
}

// ================================================================== 3. Questions (une par écran)
async function enregistrer(etape, cle, valeur) {
  S.reponses[etape] = { ...(S.reponses[etape] || {}), [cle]: valeur };
  await api(`${base}/answers/${etape}`, { method: "PUT", body: JSON.stringify({ data: S.reponses[etape] }) });
}
function brouillonActivite() {
  const f = (S.reponses.site?.faits || []).filter((x) => ["activite", "produits", "clients", "qualite"].includes(x.categorie)).slice(0, 5).map((x) => x.fait);
  return f.length ? f.join(" ") : "";
}
/** Proposition de Passation pour ce champ, tant que le dirigeant n'a rien enregistré. */
const proposition = (q, c) => (S.reponses[c.etape]?.[c.cle] == null ? S.propositions[q.id]?.valeurs?.[`${c.etape}.${c.cle}`] : undefined);
function champ(c, q) {
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
    // Plusieurs réponses : tuiles à pictogramme, enregistrées à la validation de l'écran
    const choisies = new Set(Array.isArray(v) ? v : []);
    const zone = el("div", { class: "tuiles-choix", role: "group", "aria-label": c.libelle || q.titre, "data-etape": c.etape, "data-cle": c.cle, "data-type": "multi" },
      ...c.options.map(([t, ic, d]) => el("button", { type: "button", class: "tuile-choix", "aria-pressed": String(choisies.has(t)), "data-valeur": t, onclick: (ev) => {
        const b = ev.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
      } }, picto(ic), el("strong", { text: t }), d ? el("span", { text: d }) : null)));
    return el("div", { class: "guide-champ" }, lib, zone);
  }
  if (c.type === "euros" || c.type === "curseur") {
    if (c.type === "curseur") {
      const r = el("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round((v ?? 0.1) * 100)), "aria-label": c.libelle, "data-etape": c.etape, "data-cle": c.cle, "data-type": "curseur" });
      const out = el("output", { text: `${r.value} %` });
      r.addEventListener("input", () => { out.textContent = `${r.value} %`; });
      return el("div", { class: "guide-champ" }, lib, el("div", { class: "guide-curseur" }, r, out));
    }
    const i = el("input", { type: "text", inputmode: "decimal", value: v != null ? fmt.format(v) : "", "aria-label": c.libelle, "data-etape": c.etape, "data-cle": c.cle, "data-type": "euros" });
    return el("div", { class: "guide-champ" }, lib, el("div", { class: "champ-unite" }, i, el("span", { class: "unite", text: "€" })));
  }
  if (c.type === "choix" || c.type === "valeurs") {
    const opts = c.type === "choix" ? c.options.map((o) => [o, o]) : c.options;
    return el("div", { class: "guide-champ" }, lib, el("div", { class: "puces-choix", role: "group", "aria-label": c.libelle || q.titre },
      ...opts.map(([t, val]) => el("button", { type: "button", class: `puce${v === val ? " choisie" : ""}`, "aria-pressed": String(v === val), "data-propose": proposition(q, c) === val ? "1" : null, onclick: async (ev) => {
        const bouton = ev.currentTarget; // ev.currentTarget est vidé après le premier « await »
        try {
          await enregistrer(c.etape, c.cle, val);
          bouton.parentElement.querySelectorAll(".puce").forEach((b) => { b.classList.toggle("choisie", b === bouton); b.setAttribute("aria-pressed", String(b === bouton)); });
          // Écran à un seul choix : on avance tout de suite ; sinon on affiche la suite éventuelle
          if (q.champs.length === 1 && !q.suite?.si(S.reponses) && !S.propositions[q.id]) suivante(q);
          else if (q.suite) questions();
        } catch (e) { message(e.message, true); }
      } }, t))));
  }
  if (c.type === "regions") {
    const choisies = new Set(Array.isArray(v) ? v : []);
    return el("fieldset", { class: "guide-champ regions-choix" }, el("legend", { text: c.libelle }),
      ...REGIONS.map((r, k) => { const cb = el("input", { type: "checkbox", id: `reg-${k}`, checked: choisies.has(r) }); cb.addEventListener("change", () => { if (cb.checked) choisies.add(r); else choisies.delete(r); enregistrer(c.etape, c.cle, [...choisies]).catch((e) => message(e.message, true)); }); return el("label", { class: "choix", for: `reg-${k}` }, cb, ` ${r}`); }));
  }
  if (c.type === "top_clients") {
    // Cinq lignes anonymes : part du chiffre d'affaires (%), ancienneté de la relation (ans), activité du client
    const lignes = Array.isArray(v) ? v : [];
    const zone = el("div", { class: "guide-champ top-clients", "data-etape": c.etape, "data-cle": c.cle, "data-type": "top_clients" },
      el("div", { class: "top-clients-tete", "aria-hidden": "true" }, el("span"), el("span", { text: "Part du CA" }), el("span", { text: "Client depuis" }), el("span", { text: "Activité du client (facultatif)" })),
      ...[0, 1, 2, 3, 4].map((k) => {
        const x = lignes[k] || {};
        return el("div", { class: "top-clients-ligne" },
          el("span", { class: "top-clients-rang", text: `Client ${k + 1}` }),
          el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "decimal", "data-col": "part", placeholder: "part", "aria-label": `Client ${k + 1} : part du chiffre d'affaires en %`, value: Number.isFinite(x.part) ? fmt.format(Math.round(x.part * 1000) / 10) : "" }), el("span", { class: "unite", text: "%" })),
          el("div", { class: "champ-unite" }, el("input", { type: "text", inputmode: "numeric", "data-col": "anciennete", placeholder: "depuis", "aria-label": `Client ${k + 1} : nombre d'années de relation`, value: Number.isFinite(x.anciennete) ? String(x.anciennete) : "" }), el("span", { class: "unite", text: "ans" })),
          el("input", { type: "text", "data-col": "secteur", maxlength: "40", "aria-label": `Client ${k + 1} : activité du client`, placeholder: "ex. industrie", value: x.secteur || "" }));
      }));
    return zone;
  }
  if (c.type === "exceptionnels") {
    const liste = Array.isArray(v) && v.length ? v : [{ annee: Number(Object.keys(S.chiffres?.exercices || {}).sort().at(-1)) || null, libelle: "", montant: null, justification: "" }];
    const zone = el("div", { class: "guide-champ exceptionnels" });
    const dessiner = () => remplacer(zone, ...liste.map((x, k) => el("div", { class: "exc" },
      el("input", { type: "text", value: x.annee ?? "", "aria-label": "Exercice", inputmode: "numeric", onchange: (e) => { x.annee = Number(e.target.value); } }),
      el("input", { type: "text", value: x.libelle, placeholder: "Libellé", "aria-label": "Libellé", onchange: (e) => { x.libelle = e.target.value; } }),
      el("input", { type: "text", inputmode: "decimal", value: x.montant != null ? fmt.format(x.montant) : "", placeholder: "Montant (€)", "aria-label": "Montant", onchange: (e) => { x.montant = lireNombre(e.target.value); } }),
      el("input", { type: "text", value: x.justification, placeholder: "Pourquoi ne se répétera-t-il pas ?", "aria-label": "Justification", onchange: (e) => { x.justification = e.target.value; } }),
      el("button", { type: "button", class: "lien-simple", onclick: () => { liste.splice(k, 1); dessiner(); } }, "Retirer"))),
      el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => { liste.push({ annee: liste.at(-1)?.annee ?? null, libelle: "", montant: null, justification: "" }); dessiner(); } }, "Ajouter un élément"));
    zone.dataset.etape = c.etape; zone.dataset.cle = c.cle; zone.dataset.type = "exceptionnels"; zone._liste = liste;
    dessiner();
    return zone;
  }
  return null;
}
/** Valide l'écran : les choix proposés que le dirigeant a gardés tels quels sont enregistrés. */
async function validerPropositions(q) {
  for (const c of [...q.champs, ...(q.suite?.si(S.reponses) ? q.suite.champs : [])]) {
    if (!["choix", "valeurs", "regions"].includes(c.type)) continue;
    const pv = proposition(q, c);
    if (pv !== undefined) await enregistrer(c.etape, c.cle, pv);
  }
}
async function enregistrerEcran() {
  for (const n of $("#ecran").querySelectorAll("[data-cle]")) {
    const { etape, cle, type } = n.dataset;
    if (n.tagName === "TEXTAREA" || type === "ligne") { if (n.value.trim()) await enregistrer(etape, cle, n.value.trim()); }
    else if (type === "multi") await enregistrer(etape, cle, [...n.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.valeur));
    else if (type === "euros") { const x = lireNombre(n.value); if (Number.isNaN(x)) throw new Error("Un montant est illisible."); await enregistrer(etape, cle, x); }
    else if (type === "curseur") await enregistrer(etape, cle, Number(n.value) / 100);
    else if (type === "exceptionnels") await enregistrer(etape, cle, n._liste.filter((x) => Number.isFinite(x.montant) && x.montant !== 0));
    else if (type === "top_clients") {
      const lignes = [];
      for (const l of n.querySelectorAll(".top-clients-ligne")) {
        const part = lireNombre(l.querySelector('[data-col="part"]').value), anc = lireNombre(l.querySelector('[data-col="anciennete"]').value);
        if (Number.isNaN(part) || Number.isNaN(anc)) throw new Error("Une part ou une ancienneté est illisible.");
        if (part == null) continue;
        if (part <= 0 || part > 100) throw new Error("Chaque part doit être comprise entre 0 et 100 %.");
        lignes.push({ part: part / 100, anciennete: anc == null ? null : Math.round(anc), secteur: l.querySelector('[data-col="secteur"]').value.trim().slice(0, 40) || null });
      }
      if (lignes.reduce((a, x) => a + x.part, 0) > 1.0001) throw new Error("Les cinq parts additionnées dépassent 100 % du chiffre d'affaires.");
      await enregistrer(etape, cle, lignes);
    }
  }
}
/** Écran vu : enregistré (« Passer » compte comme une réponse), pour que la page du dossier compte pareil. */
function marquerVue(qid) {
  if (S.vues.includes(qid)) return;
  S.vues.push(qid);
  S.reponses.parcours = { ...(S.reponses.parcours || {}), vues: [...S.vues] };
  api(`${base}/answers/parcours`, { method: "PUT", body: JSON.stringify({ data: S.reponses.parcours }) }).then(() => rafraichirEtat()).catch(() => null);
}
/** Compteur « Question N sur M » : M = questions qui restaient à montrer en arrivant sur les questions (celles déjà
 *  répondues, validées dans le récapitulatif ou passées n'y sont pas) ; il ne bouge pas d'un écran à l'autre. */
const cleEcran = () => (S.q < 0 ? "site" : QUESTIONS[S.q]?.id);
function compteur() {
  if (!S.aPoser) S.aPoser = questionsAPoser(S.reponses, S.vues);
  const cle = cleEcran();
  if (cle && !S.aPoser.includes(cle)) S.aPoser = [...S.aPoser, cle].sort((a, b) => ordre(a) - ordre(b)); // revenue d'elle-même (« Retour »)
  const n = S.aPoser.indexOf(cle) + 1, total = S.aPoser.length;
  return el("div", { class: "q-tete" }, el("p", { class: "etiquette", text: `Question ${n} sur ${total}` }),
    el("span", { class: "q-jauge", "aria-hidden": "true" }, el("span", { style: `width:${Math.round((n / total) * 100)}%` })));
}
const ordre = (cle) => (cle === "site" ? -1 : QUESTIONS.findIndex((q) => q.id === cle));
/** « Retour » : l'écran précédent dans la liste des questions montrées ; avant la première, les chiffres. */
function precedente() {
  const i = (S.aPoser || []).indexOf(cleEcran());
  const prec = i > 0 ? S.aPoser[i - 1] : null;
  if (prec == null) { aller("chiffres"); return; }
  S.q = ordre(prec); questions();
}
function suivante(q) {
  marquerVue(q.id);
  // Venu de la rédaction pour compléter une réponse indispensable : on y retourne dès que tout est rempli
  if (S.retour === "redaction") {
    const reste = questionsIncompletes(S.reponses);
    if (reste.length) { S.q = QUESTIONS.indexOf(reste[0]); questions(); } else { S.retour = null; aller("redaction"); }
    return;
  }
  // Question suivante encore sans réponse (celles validées dans le récapitulatif sont sautées)
  const i = QUESTIONS.indexOf(q);
  const j = QUESTIONS.findIndex((x, k) => k > i && !questionRepondue(x, S.reponses, S.vues));
  if (j >= 0) { S.q = j; questions(); } else aller(etapeCourante());
}
/** Première question : le site internet. Sa lecture se poursuit pendant les questions suivantes. */
function questionSite() {
  const proposition = S.reponses.site?.url || siteDepuisEmail(S.email) || "";
  const input = el("input", { type: "text", id: "site-url", inputmode: "url", value: proposition, placeholder: "www.votre-entreprise.fr", autocomplete: "url" });
  // Question suivante encore sans réponse (le site n'est plus à poser)
  const suivanteQ = () => { message(""); const j = QUESTIONS.findIndex((x) => !questionRepondue(x, S.reponses, S.vues)); if (j >= 0) { S.q = j; questions(); } else aller(etapeCourante()); };
  remplir(
    compteur(),
    ...titre(proposition ? "Est-ce bien le site de votre entreprise ?" : "Votre entreprise a-t-elle un site internet ?",
      "Nous y relevons votre activité et votre logo pour le mémorandum, pendant que vous répondez aux questions suivantes. Vous validerez chaque élément."),
    el("div", { class: "guide-champ" }, el("label", { class: "guide-lib", for: "site-url", text: "Adresse du site" }), input),
    el("p", { class: "petit" }, el("button", { type: "button", class: "lien-simple", onclick: async () => {
      try { S.reponses.site = { aucun: true }; await api(`${base}/answers/site`, { method: "PUT", body: JSON.stringify({ data: S.reponses.site }) }); rafraichirEtat(); suivanteQ(); }
      catch (e) { message(e.message, true); }
    } }, "Nous n'avons pas de site")),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => precedente() }, "Retour"),
      el("button", { type: "button", class: "btn btn-noir", onclick: () => {
        const url = input.value.trim();
        if (!url) { message("Indiquez l'adresse du site, ou choisissez « Nous n'avons pas de site ».", true); input.focus(); return; }
        lancerLectureSite(url);
        S.reponses.site = { ...(S.reponses.site || {}), url, aucun: undefined };
        suivanteQ();
      } }, proposition ? "Oui, lire ce site " : "Lire ce site ", fleche())));
}
// ---- Récapitulatif : toutes les réponses préparées sur un écran, validées d'un clic (le reste se pose ensuite)
const cleRecap = `passation-recap-${id}`;
const recapVu = () => { try { return Boolean(sessionStorage.getItem(cleRecap)); } catch { return S.recapVu; } };
const marquerRecap = () => { S.recapVu = true; try { sessionStorage.setItem(cleRecap, "1"); } catch { /* sans stockage */ } };
const clesEnAttente = (q) => Object.keys(S.propositions[q.id]?.valeurs || {}).filter((k) => { const [e, c] = k.split("."); return S.reponses[e]?.[c] == null; });
const questionsPreparees = () => QUESTIONS.filter((q) => clesEnAttente(q).length && !S.propositions[q.id]?.a_completer && !questionRepondue(q, S.reponses, S.vues));
/** Valeur proposée en clair (libellé du choix, pourcentage, liste, texte abrégé). */
function libelleValeur(q, cle, v) {
  const c = [...q.champs, ...(q.suite?.champs || [])].find((x) => `${x.etape}.${x.cle}` === cle);
  if (c?.type === "valeurs") return c.options.find(([, val]) => val === v)?.[0] ?? String(v);
  if (Array.isArray(v)) return v.join(", ");
  const t = String(v).replace(/\s+/g, " ");
  return t.length > 170 ? `${t.slice(0, 168).replace(/\s+\S*$/, "")}…` : t;
}
function recapitulatif() {
  const liste = questionsPreparees();
  const coches = new Map(liste.map((q) => [q.id, true]));
  const bouton = el("button", { type: "button", class: "btn btn-vert" });
  const majBouton = () => { const n = [...coches.values()].filter(Boolean).length; bouton.textContent = n ? `Valider ${n} réponse${n > 1 ? "s" : ""} ` : "Continuer "; bouton.append(fleche()); };
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
    el("p", { class: "etiquette", text: `${liste.length} réponses préparées` }),
    ...titre("Nous avons préparé vos réponses", "Vérifiez-les d'un coup d'œil. Décochez ce qui est inexact : vous le corrigerez juste après, avec les quelques questions qui restent."),
    el("ul", { class: "recap-liste" }, ...liste.map((q) => {
      const cb = el("input", { type: "checkbox", id: `recap-${q.id}`, checked: true });
      cb.addEventListener("change", () => { coches.set(q.id, cb.checked); cb.closest("li").classList.toggle("decoche", !cb.checked); majBouton(); });
      const p = S.propositions[q.id];
      return el("li", {}, el("label", { for: `recap-${q.id}`, class: "recap-carte" }, cb,
        el("span", { class: "recap-texte" }, el("strong", { text: q.titre }),
          el("span", { class: "recap-valeurs" }, ...clesEnAttente(q).map((k) => el("span", { text: libelleValeur(q, k, p.valeurs[k]) }))),
          el("small", { text: p.source }))));
    })),
    el("div", { class: "q-nav" }, el("button", { type: "button", class: "lien-simple", onclick: () => { marquerRecap(); S.aPoser = null; questions(); } }, "Répondre question par question"), bouton));
}

function questions() {
  // Le récapitulatif des réponses préparées vient avant la première question : le compteur « Question N sur M » est
  // fixé ensuite, une fois pour toutes (il ne repart pas de 1 après la validation des réponses préparées)
  if (!recapVu() && questionsPreparees().length >= 3) return recapitulatif();
  if (S.q < 0) return questionSite();
  const q = QUESTIONS[S.q];
  const champs = [...q.champs, ...(q.suite?.si(S.reponses) ? q.suite.champs : [])];
  const prop = S.propositions[q.id];
  const aValider = prop && Object.keys(prop.valeurs).some((k) => { const [e, c] = k.split("."); return S.reponses[e]?.[c] == null; });
  const seulChoix = !aValider && q.champs.length === 1 && ["choix", "valeurs"].includes(q.champs[0].type) && !q.suite?.si(S.reponses);
  remplir(
    compteur(),
    aValider ? el("p", { class: "proposition-bandeau" }, el("strong", { text: "Réponse préparée par Passation" }), ` · ${prop.source}. Vérifiez, corrigez si besoin, puis validez.`) : null,
    ...titre(q.titre, q.aide),
    q.champs.some((c) => c.requis) ? el("p", { class: "petit requis-note", text: `Indispensable pour rédiger le mémorandum : ${q.champs.filter((c) => c.requis).map((c) => c.requis).join(", ")}.` }) : null,
    ...champs.map((c) => champ(c, q)),
    el("div", { class: "q-nav" },
      el("button", { type: "button", class: "lien-simple", onclick: () => precedente() }, "Retour"),
      seulChoix ? el("button", { type: "button", class: "lien-simple", onclick: () => suivante(q) }, "Passer")
        : el("button", { type: "button", class: `btn ${aValider ? "btn-vert" : "btn-noir"}`, onclick: async (ev) => {
          const bouton = ev.currentTarget;
          bouton.disabled = true;
          try {
            if (aValider) await validerPropositions(q);
            await enregistrerEcran();
            const manque = requisManquants(q, S.reponses);
            if (manque.length) { message(`Il manque ${manque.join(" et ")} : c'est indispensable pour rédiger le mémorandum.`, true); bouton.disabled = false; $("#ecran").querySelector("textarea, .puces-choix .puce")?.focus(); return; }
            message(""); suivante(q);
          } catch (e) { message(e.message, true); bouton.disabled = false; }
        } }, aValider ? "C'est exact, continuer " : "Continuer ", fleche())),
    q.chapitre ? el("aside", { class: "q-usage" }, el("p", { class: "etiquette", text: "Où va votre réponse" }), el("strong", { text: q.chapitre }), q.pourquoi ? el("p", { class: "petit", text: q.pourquoi }) : null) : null);
}

// ================================================================== 4. Votre site
async function site() {
  if (S.lectureSite) { message("Lecture de votre site en cours…"); await S.lectureSite; message(""); }
  const s = S.reponses.site || {};
  if (!s.url || !((s.faits || []).length || (s.logos || []).length)) { aller(etapeCourante() === "site" ? "redaction" : etapeCourante()); return; }
  const faits = (s.faits || []).map((f) => ({ ...f, valide: f.valide || !s.confirme }));
  let logo = s.logos?.[0]?.url ?? null;
  remplir(...titre("Ce que nous avons retenu de votre site", "Tout est coché : décochez ce qui est inexact. Seuls les faits cochés seront utilisés dans le mémorandum."),
    el("fieldset", { class: "faits" }, el("legend", { class: "visuellement-cache", text: "Faits relevés" }),
      ...faits.map((f) => { const cb = el("input", { type: "checkbox", id: `f-${f.id}`, checked: f.valide }); cb.addEventListener("change", () => { f.valide = cb.checked; }); return el("label", { class: "fait", for: `f-${f.id}` }, cb, el("span", { text: f.fait })); })),
    (s.logos || []).length ? el("div", {}, el("p", { class: "guide-lib", text: "Votre logo" }),
      el("div", { class: "logos-liste", role: "radiogroup", "aria-label": "Choix du logo" }, ...s.logos.map((l, k) => {
        const r = el("input", { type: "radio", name: "logo", id: `logo-${k}`, checked: k === 0, class: "visuellement-cache" });
        r.addEventListener("change", () => { logo = l.url; });
        return el("label", { class: "logo-choix", for: `logo-${k}` }, r, el("img", { src: l.url, alt: l.origine, referrerpolicy: "no-referrer" }));
      }), el("label", { class: "logo-choix logo-aucun", for: "logo-aucun" }, (() => { const r = el("input", { type: "radio", name: "logo", id: "logo-aucun", class: "visuellement-cache" }); r.addEventListener("change", () => { logo = null; }); return r; })(), "Aucun"))) : null,
    el("button", { type: "button", class: "btn btn-vert", onclick: async (ev) => {
      const bouton = ev.currentTarget;
      bouton.disabled = true;
      try {
        if (logo) await api(`${base}/documents/memo/logo`, { method: "POST", body: JSON.stringify({ url: logo }) }).catch(() => null);
        const site = { ...(S.reponses.site || {}), faits, confirme: true };
        await api(`${base}/answers/site`, { method: "PUT", body: JSON.stringify({ data: site }) });
        S.reponses.site = site;
        aller("redaction");
      } catch (e) { message(e.message, true); bouton.disabled = false; }
    } }, "C'est exact, continuer"));
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
  const SECTIONS = [["synthese", "synthèse"], ["histoire", "histoire"], ["activite", "savoir-faire"], ["organisation", "équipe"], ["marche", "marché"], ["clients", "clients"], ["finances", "finances"], ["perspectives", "perspectives"], ["operation", "opération"]];
  const taches = [
    ["valorisation", "Valorisation (multiples d'EBE du secteur)", () => api(`${base}/valuation`, { method: "POST" })],
    ["etude-marche", "Étude de marché sur le web (deux minutes au plus)", async () => {
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
    ["datapack", "Datapack Excel", () => api(`${base}/documents/datapack`, { method: "POST" })],
    ["teaser", "Teaser anonyme", () => api(`${base}/documents/teaser`, { method: "POST" })],
    ...SECTIONS.map(([k, t]) => [`memo-${k}`, `Mémorandum : ${t}`, () => api(`${base}/documents/memo/sections/${k}`, { method: "POST" })]),
  ];
  const libelle = Object.fromEntries(taches.map(([k, t]) => [k, t]));
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
  } catch { /* on refait tout */ }
  const lignes = Object.fromEntries(taches.map(([k, t]) => [k, el("li", { class: deja.has(k) ? "fait" : incompletes.length && k.startsWith("memo-") ? "attente" : null }, el("span", { class: "etat", "aria-hidden": "true" }), t)]));
  const chrono = el("span", { class: "petit guide-chrono", "aria-hidden": "true" });
  remplir(...titre("Nous rédigeons votre dossier", "Une à deux minutes. Si vous quittez cette page, la rédaction reprendra à votre retour, sans refaire ce qui est fini."),
    chrono, el("ul", { class: "guide-taches" }, ...Object.values(lignes)), el("div", { id: "redaction-suite" }));
  const debut = Date.now(), minuterie = setInterval(() => { const s = Math.round((Date.now() - debut) / 1000); chrono.textContent = `${s} s · ${$("#ecran .guide-taches")?.querySelectorAll("li.fait").length ?? 0} sur ${taches.length}`; }, 1000);
  const erreurs = [];
  const executer = async ([k, , f]) => {
    if (deja.has(k) || (incompletes.length && k.startsWith("memo-"))) return;
    lignes[k].classList.add("en-cours");
    try { await f(); lignes[k].classList.replace("en-cours", "fait"); }
    catch (e) { lignes[k].classList.replace("en-cours", "erreur"); erreurs.push({ k, message: e.message, statut: e.statut }); }
  };
  try {
    await executer(taches[0]); // la valorisation d'abord : le datapack, le teaser et le mémorandum s'en servent
    // L'étude de marché tourne pendant tout le reste ; seuls les chapitres qui la citent (marché, synthèse,
    // perspectives) l'attendent, et ils passent en dernier
    const marche = executer(taches[1]);
    const citent = new Set(["memo-marche", "memo-synthese", "memo-perspectives"]);
    const memo = taches.filter(([k]) => k.startsWith("memo-"));
    await enParallele([...taches.slice(2).filter(([k]) => !k.startsWith("memo-")), ...memo.filter(([k]) => !citent.has(k))], 4, executer);
    await marche;
    await enParallele(memo.filter(([k]) => citent.has(k)), 3, executer);
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
      el("h2", { text: "Une réponse manque pour rédiger le mémorandum" }),
      el("p", { class: "petit", text: "La valorisation, le datapack et le teaser sont prêts. Répondez ci-dessous : la rédaction du mémorandum reprendra aussitôt." }),
      ...manquantes.map((q) => el("button", { type: "button", class: "btn btn-noir", onclick: () => { S.retour = "redaction"; S.q = QUESTIONS.indexOf(q); aller("questions"); } }, `Répondre : ${q.titre} `, fleche()))));
    $("#ecran").querySelector("#redaction-suite button")?.focus();
    return;
  }
  // 2. Échecs passagers (service de rédaction indisponible, délai) : un message par cause, et « Réessayer »
  const nonBloquants = new Set(["teaser", "etude-marche"]);
  const bloquantes = erreurs.filter((e) => !nonBloquants.has(e.k));
  if (bloquantes.length) {
    const causes = new Map();
    for (const e of bloquantes) causes.set(e.message, [...(causes.get(e.message) || []), libelle[e.k]]);
    remplacer(suite, el("div", { class: "carte guide-todo" },
      el("h2", { text: `${bloquantes.length} rédaction${bloquantes.length > 1 ? "s n'ont" : " n'a"} pas abouti` }),
      el("ul", {}, ...[...causes].map(([m, l]) => el("li", {}, el("strong", { text: `${l.join(", ")} : ` }), m))),
      el("p", { class: "petit", text: "Ce qui est terminé est conservé : seules ces rédactions seront relancées." }),
      el("button", { type: "button", class: "btn btn-noir", onclick: () => redaction() }, "Relancer ces rédactions")));
    return;
  }
  if (erreurs.some((e) => e.k === "teaser")) message("Le teaser n'a pas passé le contrôle d'anonymat : reprenez-le depuis sa page (une réponse contient sans doute un nom ou une marque).", true);
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
  remplir(...titre(f.titre, f.aide),
    v.bas != null && v.haut != null ? el("div", { class: "carte synthese-valeur guide-valeur" }, el("p", { class: "etiquette", text: v.etiquette }),
      el("p", { class: "valeur-centrale chiffre", text: fourchette(v.bas, v.haut) }), el("p", { class: "petit", text: v.base }), v.ecart ? el("p", { class: "petit", text: v.ecart }) : null) : null,
    f.reste.length ? el("div", { class: "carte guide-todo" }, el("h2", { text: f.resteTitre }),
      el("ul", {}, ...f.reste.map((t) => el("li", {}, t.pieces
        ? el("a", { href: `/espace/?dossier=${id}#checklist`, text: t.titre })
        : el("a", { href: t.href.startsWith("#") ? `/espace/?dossier=${id}${t.href}` : t.href, text: t.titre }), el("span", { class: "petit", text: ` · ${t.detail}` }))))) : null,
    el("div", { class: "guide-docs" },
      ...[["Valorisation détaillée", "Multiples du secteur, hypothèses et sources", `/espace/valorisation/?dossier=${id}#valorisation`],
        ["Datapack Excel", "9 onglets, formules vivantes", `${base}/documents/datapack`, true],
        ["Teaser anonyme", "Une page pour éveiller l'intérêt", `/espace/documents/teaser/?dossier=${id}`],
        ["Mémorandum d'information", "La présentation complète, en diapositives", `/espace/documents/memo/?dossier=${id}`]]
        .map(([t, d, href, dl]) => el("a", { class: "carte guide-doc", href, download: dl ? "" : null }, el("strong", { text: t }), el("span", { class: "petit", text: d }), el("span", { class: "fleche", "aria-hidden": "true", text: dl ? "↓" : "→" })))),
    el("p", { class: "petit" }, "Pour affiner (décotes et primes, EBE retenu) : ", el("a", { href: `/espace/valorisation/?dossier=${id}#valorisation`, text: "réglages de la valorisation" }), ". Pour ajouter des photos au mémorandum : ", el("a", { href: `/espace/documents/memo/?dossier=${id}`, text: "page du mémorandum" }), "."));
}

// ================================================================== Chargement
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace("/espace/"); return; }
  $("#lien-dossier").href = `/espace/?dossier=${id}`;
  try {
    const [moi, dossier, ch, rep, props] = await Promise.all([api("/api/me"), api(base), api(`${base}/financials`), api(`${base}/answers`), api(`${base}/documents/memo/propositions`).catch(() => ({}))]);
    S.propositions = props.propositions || {};
    S.email = moi.email; S.dossier = dossier; S.chiffres = ch; S.reponses = rep.reponses || {}; S.vues = vuesDe(S.reponses);
    S.etat = etatParcours(dossier, ...(await documentsPourEtat(dossier)));
    $("#guide-entreprise").textContent = dossier.entreprise.nom || "Votre dossier";
    // Nom de code au-dessus du nom réel, comme sur la page du dossier : c'est sous ce nom que le dossier circulera
    if (dossier.nom_de_code) { $("#guide-code").textContent = dossier.nom_de_code; $("#guide-nom-code").hidden = false; }
    document.title = `${dossier.entreprise.nom} · Passation`;
    S.complet = Boolean(dossier.documents?.memo && dossier.documents?.teaser && dossier.documents?.datapack && dossier.parcours?.valorisation);
    // Documents déjà rédigés : on rouvre sur l'écran final (récapitulatif et points à compléter), pas sur une question
    // facultative laissée vide ; ?etape=… permet toujours d'y revenir (audit, point 17)
    aller(etapeDemandee() || (S.complet || S.reponses.suivi?.pret_envoye ? "pret" : etapeCourante()));
    if (!S.complet && dossier.entreprise?.naf) lancerEtudeMarche(); // pendant les questions, pas à la fin
  } catch (e) { if (e.message !== "non connecté") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
})();
