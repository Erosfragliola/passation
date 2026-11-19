// Mode détaillé « Valorisation approfondie », en trois onglets (non numérotés : le fil du parcours est celui de la
// page du dossier) : Vos chiffres (liasse PDF + validation ligne par ligne ; seul le dernier exercice est
// indispensable), Pour aller plus loin (questions facultatives, absentes du parcours guidé), Votre valorisation
// (calcul du serveur, réglages). Fourchette seule, jamais de valeur centrale ; multiples du secteur seulement,
// l'actif net corrigé sert de contrôle. Aucun calcul de valeur ici : tout vient de l'API (code testé).
import { CHAMPS, exercicesAttendus, libelleEcran, aideEcran, AIDE_EBE } from "/js/champs-financiers.js";
import { REGIONS } from "/js/questionnaire.js";
import { POUR_ALLER_PLUS_LOIN as ETAPES } from "/js/parcours.js";
import { ETIQUETTE_TITRES, resumeValorisation, explicationEcart, alertesDirigeant } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js";

const $ = (s, r = document) => r.querySelector(s);
const params = new URLSearchParams(location.search);
const id = params.get("dossier") || "";
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
/** Remplace le contenu d'un nœud en ignorant null, undefined et false (sinon le navigateur écrit « null »). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const euros = (v) => (v == null || !Number.isFinite(v) ? "–" : `${fmt.format(Math.round(v))} €`);
const court = (v) => {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(v)} €`;
};
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "–" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
/** « 1 234 567 », « -12 000 », « 12,5 » → nombre ; vide → null. */
const lireNombre = (s) => {
  const t = String(s ?? "").replace(/[\s  €%]/g, "").replace(",", ".");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function message(texte, erreur = false, cible = "#parcours-message") {
  const m = $(cible);
  m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
}
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: { ...(enJson ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Une erreur est survenue.");
  return d;
}
const base = `/api/dossiers/${id}`;

// ================================================================== Navigation entre les 3 étapes
const PANNEAUX = ["chiffres", "entreprise", "valorisation"];
function montrer() {
  const cle = PANNEAUX.includes(location.hash.slice(1)) ? location.hash.slice(1) : "chiffres";
  for (const p of PANNEAUX) $(`#${p}`).hidden = p !== cle;
  document.querySelectorAll(".etapes a").forEach((a) => { if (a.dataset.etape === cle) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  if (cle === "valorisation") calculer();
  if (cle === "entreprise") dessinerQuestionnaire();
  window.scrollTo({ top: 0 }); // l'ancre ne fait plus glisser l'en-tête sous la barre du site
}
window.addEventListener("hashchange", () => { montrer(); $(`#titre-${location.hash.slice(1)}`)?.focus?.(); });
// Onglets : pas de saut à l'ancre (l'en-tête resterait sous la barre du site), même sur l'onglet déjà ouvert
document.querySelectorAll(".etapes a[href^='#']").forEach((a) => a.addEventListener("click", (ev) => {
  ev.preventDefault();
  if (location.hash !== a.getAttribute("href")) history.pushState(null, "", a.getAttribute("href"));
  montrer();
  $(`#titre-${a.dataset.etape}`)?.focus?.({ preventScroll: true });
}));
window.addEventListener("popstate", montrer);

// ================================================================== 1. Vos chiffres (un exercice à la fois)
// Les lignes obligatoires sur deux colonnes (ce que l'entreprise gagne ; ce qu'elle possède et doit), les lignes
// facultatives repliées : l'onglet tient sur un écran. Rôle de chaque exercice : le dernier est indispensable, les deux
// précédents facultatifs, les plus anciens pour information. Rien n'entre dans le calcul sans validation.
let chiffres = null;
let anneeCourante = null;
const SOURCE = { inpi: "montant des comptes publics (registre national des entreprises)", liasse: "montant lu dans votre PDF" }; // formulation de la légende de main
const DETAIL = new Set(["achats_consommes", "charges_externes", "charges_personnel"]);
const aideEbe = () => el("span", { class: "aide-bulle" }, el("button", { type: "button", class: "aide-rond", "aria-describedby": "aide-ebe-chiffres", "aria-label": "Qu'est-ce que l'EBE ?" }, "?"),
  el("span", { role: "tooltip", id: "aide-ebe-chiffres", text: AIDE_EBE }));
function ligneChiffre(c, a) {
  const v = chiffres.exercices[a]?.[c.cle];
  const input = el("input", { type: "text", inputmode: "decimal", class: "montant", id: `m-${c.cle}`, value: v?.valeur != null ? fmt.format(v.valeur) : "" });
  input.addEventListener("change", () => enregistrerCase(c.cle, a, input));
  const etat = v?.valide ? el("span", { class: "valide-marque", title: "Ligne validée" }, "✓", el("span", { class: "visuellement-cache", text: "validée" }))
    : el("button", { type: "button", class: "btn btn-mini", disabled: v?.valeur == null, onclick: () => validerLigne(c.cle, a) }, "Valider");
  return el("div", { class: `chiffre-ligne${v?.valide ? " validee" : ""}`, "data-cle": c.cle },
    el("label", { for: `m-${c.cle}` }, libelleEcran(c),
      v?.valeur != null && SOURCE[v.source] ? el("small", { text: SOURCE[v.source] }) : !c.obligatoire && v?.valeur == null ? el("small", { text: aideEcran(c) }) : null),
    el("span", { class: "champ-montant" }, input, el("span", { "aria-hidden": "true", text: "€" })), etat);
}
function dessinerChiffres() {
  const annees = Object.keys(chiffres.exercices).map(Number).sort((a, b) => a - b);
  const att = exercicesAttendus(chiffres.exercices);
  const role = (a) => (a === att.dernier ? "indispensable" : att.recommandes.includes(a) ? "facultatif" : "information");
  const table = $("#tableau-chiffres");
  const tete = el("tr", {}, el("th", { scope: "col", text: "Poste" }), ...annees.map((a) => el("th", { scope: "col", class: "num" }, `${a} `, el("button", { type: "button", class: "lien-simple retirer", "aria-label": `Retirer l'exercice ${a}`, title: `Retirer ${a}`, onclick: () => retirerExercice(a) }, "×"), el("br"), el("span", { class: "petit", text: role(a) }))), el("th", { scope: "col", class: "col-ligne", text: "Ligne" }));
  remplacer(table.tHead, tete);
  const corps = [];
  for (const [groupe, titre] of [["resultat", "Compte de résultat"], ["bilan", "Bilan"]]) {
    corps.push(el("tr", { class: "groupe" }, el("th", { scope: "colgroup", colspan: String(annees.length + 2), text: titre })));
    for (const c of CHAMPS.filter((x) => x.groupe === groupe)) {
      const etat = etatLigne(c.cle, annees);
      const tr = el("tr", { class: `ligne-${etat}`, "data-cle": c.cle });
      tr.append(el("th", { scope: "row" }, el("span", { class: "poste", text: c.libelle }), c.obligatoire && att.dernier != null ? el("abbr", { class: "obligatoire", title: `Nécessaire pour l'exercice ${att.dernier}`, text: "*" }) : null, el("span", { class: "aide", text: c.aide })));
      for (const a of annees) {
        const v = chiffres.exercices[a]?.[c.cle];
        const input = el("input", { type: "text", inputmode: "decimal", class: "montant", "aria-label": `${c.libelle}, ${a}`, value: v?.valeur != null ? fmt.format(v.valeur) : "", "data-annee": String(a) });
        input.addEventListener("change", () => enregistrerCase(c.cle, a, input));
        const src = v?.valeur != null ? el("span", { class: `source source-${v.source}`, text: { inpi: "INPI", liasse: "Liasse", dirigeant: "Vous" }[v.source] }) : null;
        tr.append(el("td", { class: "num" }, input, src, v?.valide ? el("span", { class: "valide-marque", "aria-label": "validée", text: "✓" }) : null));
      }
      tr.append(el("td", { class: "col-ligne" }, etat === "validee"
        ? el("span", { class: "petit valide-texte", text: "Validée" })
        : el("button", { type: "button", class: "btn btn-mini", disabled: etat === "vide", onclick: () => validerLigne(c.cle, annees) }, "Valider")));
      corps.push(tr);
    }
  }

  // Seul le dernier exercice est réclamé ; les deux précédents sont proposés, jamais exigés ; les plus anciens, ignorés
  $("#etat-chiffres").textContent = att.dernier == null ? "" : att.dernier_complet ? `✓ ${att.dernier}` : `${att.dernier} à confirmer`;
  const libelles = (l) => l.map((k) => libelleEcran(CHAMPS.find((c) => c.cle === k))).join(", ");
  const manqueDernier = att.dernier != null ? chiffres.manquants[att.dernier] || [] : [];
  const resume = [];
  if (manqueDernier.length) resume.push(`${att.dernier} : ${manqueDernier.length} ligne${manqueDernier.length > 1 ? "s" : ""} à compléter ou valider (${libelles(manqueDernier)})`);
  if (att.dernier != null && att.recommandes_manquants.length) resume.push(`Facultatif : ajouter ${[...att.recommandes_manquants].sort((a, b) => b - a).join(" et ")} fiabilise la fourchette`);
  message(resume.length ? resume.join(" · ") : annees.length ? "Vos exercices sont complets et validés." : "", false, "#message-liasse");
  if (!chiffres.lecture_automatique) message("La lecture automatique des liasses n'est pas encore activée sur ce site : saisissez vos chiffres à la main, ou réessayez plus tard.", false, "#message-liasse");
  $("#btn-liasse").disabled = !chiffres.lecture_automatique || chiffres.lectures_restantes === 0;
}
async function enregistrerCase(cle, annee, input) {
  const v = lireNombre(input.value);
  if (Number.isNaN(v)) { input.setAttribute("aria-invalid", "true"); message("Montant illisible : utilisez des chiffres, par exemple 1 250 000.", true, "#message-liasse"); return; }
  input.removeAttribute("aria-invalid");
  try {
    chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee, valeurs: { [cle]: v }, valider: false }) });
    dessinerChiffres();
    $(`#m-${cle}`)?.focus();
  } catch (e) { message(e.message, true, "#message-liasse"); }
}
async function validerLigne(cle, annee) {
  try {
    const v = lireNombre($(`#m-${cle}`).value);
    if (v === null) return;
    if (Number.isNaN(v)) throw new Error("Ce montant est illisible.");
    chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee, valeurs: { [cle]: v }, valider: true }) });
    dessinerChiffres();
    const lignes = [...document.querySelectorAll("#chiffres-annee .chiffre-ligne")];
    const i = lignes.findIndex((x) => x.dataset.cle === cle);
    (lignes.slice(i + 1).find((x) => !x.classList.contains("validee"))?.querySelector("input") || $(`#m-${cle}`))?.focus();
  } catch (e) { message(e.message, true, "#message-liasse"); }
}
async function validerExercice(a) {
  try { chiffres = await api(`${base}/financials/${a}/valider`, { method: "POST" }); dessinerChiffres(); }
  catch (e) { message(e.message, true, "#message-liasse"); }
}
async function retirerExercice(a) {
  if (!confirm(`Retirer l'exercice ${a} et ses chiffres ?`)) return;
  try { chiffres = await api(`${base}/financials/${a}`, { method: "DELETE" }); dessinerChiffres(); } catch (e) { message(e.message, true, "#message-liasse"); }
}
$("#btn-exercice").addEventListener("click", async () => {
  const a = Number($("#nouvel-exercice").value);
  if (!Number.isInteger(a) || a < 1990 || a > 2100) return message("Indiquez une année sur 4 chiffres.", true, "#message-liasse");
  try { chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee: a, valeurs: {}, valider: false }) }); chiffres.exercices[a] ??= {}; anneeCourante = a; dessinerChiffres(); $("#nouvel-exercice").value = ""; }
  catch (e) { message(e.message, true, "#message-liasse"); }
});
$("#btn-liasse").addEventListener("click", () => $("#fichier-liasse").click());
$("#fichier-liasse").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) return message("Le fichier dépasse 10 Mo.", true, "#message-liasse");
  const corps = new FormData();
  corps.append("fichier", f);
  $("#btn-liasse").disabled = true;
  $("#depot").setAttribute("aria-busy", "true");
  message("Lecture de la liasse en cours… (30 secondes environ)", false, "#message-liasse");
  try {
    const r = await api(`${base}/uploads`, { method: "POST", body: corps });
    chiffres = r;
    dessinerChiffres();
    const n = r.proposes.reduce((s, e) => s + e.champs.length, 0);
    message(n
      ? `${n} montants lus (exercices ${r.proposes.map((e) => e.annee).join(", ")}). Vérifiez chaque ligne avec votre liasse, puis cliquez sur « Valider ».${r.remarques ? ` Remarque : ${r.remarques}` : ""}`
      : `Aucun montant reconnu dans ce document.${r.remarques ? ` ${r.remarques}` : ""} Saisissez vos chiffres à la main.`, !n, "#message-liasse");
  } catch (e) { message(e.message, true, "#message-liasse"); }
  finally { $("#depot").removeAttribute("aria-busy"); $("#btn-liasse").disabled = !chiffres?.lecture_automatique; }
});

// ================================================================== 2. Votre entreprise
let reponses = {}, etapeQ = 0, minuterie = null;
function dessinerSousEtapes() {
  remplacer($("#sous-etapes"), ...ETAPES.map((e, i) => el("li", {}, el("button", { type: "button", class: "lien-simple", "aria-current": i === etapeQ ? "true" : null, onclick: () => { etapeQ = i; dessinerQuestionnaire(); } }, e.titre))));
}
function champQuestion(e, q) {
  const v = reponses[e.cle]?.[q.cle];
  const idq = `q-${e.cle}-${q.cle}`;
  const aide = q.aide ? el("span", { class: "petit aide-q", id: `${idq}-aide`, text: q.aide }) : null;
  const sauver = (val) => { (reponses[e.cle] ??= {})[q.cle] = val; programmerSauvegarde(e.cle); };
  if (q.type === "oui_non" || q.type === "choix") {
    const fs = el("fieldset", { class: "q" }, el("legend", { text: q.libelle }), aide);
    const options = q.type === "choix" ? q.options.map((o, i) => [o, o, i]) : [["oui", "Oui"], ["non", "Non"]];
    for (const [val, lib, i] of options.map((o, i) => [o[0], o[1], i])) {
      const r = el("input", { type: "radio", name: idq, value: val, id: `${idq}-${i}`, checked: v === val });
      r.addEventListener("change", () => sauver(val));
      fs.append(el("label", { class: "choix", for: `${idq}-${i}` }, r, ` ${lib}`));
    }
    return fs;
  }
  if (q.type === "regions") {
    const choisies = new Set(Array.isArray(v) ? v : []);
    const fs = el("fieldset", { class: "q regions-choix" }, el("legend", { text: q.libelle }), aide);
    REGIONS.forEach((r, i) => {
      const cb = el("input", { type: "checkbox", id: `${idq}-${i}`, checked: choisies.has(r) });
      cb.addEventListener("change", () => { if (cb.checked) choisies.add(r); else choisies.delete(r); sauver([...choisies]); });
      fs.append(el("label", { class: "choix", for: `${idq}-${i}` }, cb, ` ${r}`));
    });
    return fs;
  }
  if (q.type === "exceptionnels") {
    const liste = Array.isArray(v) ? v : [];
    const annees = Object.keys(chiffres?.exercices || {});
    const conteneur = el("fieldset", { class: "q exceptionnels" }, el("legend", { text: q.libelle }), aide);
    const dessiner = () => {
      conteneur.querySelectorAll(".exc").forEach((n) => n.remove());
      liste.forEach((x, i) => {
        const maj = (k, val) => { x[k] = val; sauver(liste); };
        const sel = el("select", { "aria-label": "Exercice" }, ...annees.map((a) => el("option", { value: a, selected: String(x.annee) === a, text: a })));
        sel.addEventListener("change", () => maj("annee", Number(sel.value)));
        const lib = el("input", { type: "text", placeholder: "Libellé", "aria-label": "Libellé", value: x.libelle || "" }); lib.addEventListener("change", () => maj("libelle", lib.value));
        const mt = el("input", { type: "text", inputmode: "decimal", placeholder: "Montant (€)", "aria-label": "Montant en euros", value: x.montant != null ? fmt.format(x.montant) : "" }); mt.addEventListener("change", () => maj("montant", lireNombre(mt.value)));
        const just = el("input", { type: "text", placeholder: "Justification", "aria-label": "Justification", value: x.justification || "" }); just.addEventListener("change", () => maj("justification", just.value));
        conteneur.append(el("div", { class: "exc" }, sel, lib, mt, just, el("button", { type: "button", class: "lien-simple", onclick: () => { liste.splice(i, 1); sauver(liste); dessiner(); } }, "Retirer")));
      });
    };
    dessiner();
    conteneur.append(el("button", { type: "button", class: "btn btn-contour btn-mini", disabled: !annees.length, onclick: () => { liste.push({ annee: Number(annees.at(-1)), libelle: "", montant: null, justification: "" }); sauver(liste); dessiner(); } }, "Ajouter un élément"));
    return conteneur;
  }
  const affiche = v == null ? "" : q.type === "pct" ? String(Math.round(v * 1000) / 10).replace(".", ",") : q.type === "euros" ? fmt.format(v) : v;
  const input = q.type === "texte"
    ? el("textarea", { id: idq, rows: "3", "aria-describedby": aide ? `${idq}-aide` : null }, affiche)
    : el("input", { id: idq, type: "text", inputmode: "decimal", value: affiche, "aria-describedby": aide ? `${idq}-aide` : null });
  input.addEventListener("input", () => {
    if (q.type === "texte") return sauver(input.value);
    const n = lireNombre(input.value);
    if (Number.isNaN(n)) { input.setAttribute("aria-invalid", "true"); return; }
    input.removeAttribute("aria-invalid");
    sauver(n == null ? null : q.type === "pct" ? n / 100 : n);
  });
  const unite = { euros: "€", pct: "%" }[q.type];
  return el("div", { class: "q" }, el("label", { for: idq, text: q.libelle }), aide, el("div", { class: "champ-unite" }, input, unite ? el("span", { class: "unite", text: unite }) : null));
}
function dessinerQuestionnaire() {
  const e = ETAPES[etapeQ];
  dessinerSousEtapes();
  const form = $("#questionnaire");
  remplacer(form, 
    el("h3", { text: e.titre }), el("p", { class: "petit", text: e.intro }),
    ...e.questions.map((q) => champQuestion(e, q)),
    el("div", { class: "q-nav" },
      etapeQ > 0 ? el("button", { type: "button", class: "btn btn-contour", onclick: () => { etapeQ--; dessinerQuestionnaire(); form.querySelector("input,textarea")?.focus(); } }, "Précédent") : el("span"),
      etapeQ < ETAPES.length - 1
        ? el("button", { type: "button", class: "btn btn-noir", onclick: () => { etapeQ++; dessinerQuestionnaire(); form.querySelector("input,textarea")?.focus(); } }, "Suivant ", el("span", { class: "fleche", "aria-hidden": "true", text: "→" }))
        : el("a", { class: "btn btn-vert", href: "#valorisation" }, "Voir ma valorisation ", el("span", { class: "fleche", "aria-hidden": "true", text: "→" }))),
  );
}
function programmerSauvegarde(etape) {
  $("#etat-enregistrement").textContent = "Enregistrement…";
  clearTimeout(minuterie);
  minuterie = setTimeout(async () => {
    try {
      await api(`${base}/answers/${etape}`, { method: "PUT", body: JSON.stringify({ data: reponses[etape] || {} }) });
      $("#etat-enregistrement").textContent = "Enregistré.";
      majEtatQuestionnaire();
    } catch (err) { $("#etat-enregistrement").textContent = `Non enregistré : ${err.message}`; }
  }, 600);
}
/** Questions facultatives : pas de pourcentage (il ferait concurrence au décompte des questions du parcours). */
function majEtatQuestionnaire() { $("#etat-entreprise").textContent = "facultatif"; }

// ================================================================== 3. Votre valorisation
let dernier = null, dossierCourant = null;
async function calculer() {
  const zone = $("#resultat");
  zone.setAttribute("aria-busy", "true");
  try {
    dernier = await api(`${base}/valuation`, { method: "POST" });
    dessinerResultat();
  } catch (e) { remplacer(zone, el("p", { class: "message-carte erreur", text: e.message })); }
  finally { zone.removeAttribute("aria-busy"); }
}

function footballField(lignes) {
  // lignes : [{ libelle, bas, haut, point, fort }] — une seule teinte, la ligne porte l'identité ; jamais de valeur centrale
  const valeurs = lignes.flatMap((l) => [l.bas, l.haut, l.point]).filter(Number.isFinite);
  if (!valeurs.length) return null;
  let min = Math.min(0, ...valeurs), max = Math.max(...valeurs);
  const marge = (max - min) * 0.08; max += marge;
  const L = 560, G = 150, D = 20, hL = 46, H = lignes.length * hL + 34;
  const x = (v) => G + ((v - min) / (max - min)) * (L - G - D);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${H}`);
  svg.setAttribute("class", "football");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Valeur des titres : ${lignes.map((l) => `${l.libelle} ${l.point != null ? court(l.point) : fourchette(l.bas, l.haut)}`).join(" ; ")}`);
  const ns = (t, a) => { const n = document.createElementNS("http://www.w3.org/2000/svg", t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  // Graduations recessives
  const pas = Math.pow(10, Math.floor(Math.log10((max - min) / 4)));
  const pasR = [1, 2, 5, 10].map((k) => k * pas).find((p) => (max - min) / p <= 5) || pas * 10;
  for (let v = Math.ceil(min / pasR) * pasR; v <= max; v += pasR) {
    svg.append(ns("line", { x1: x(v), x2: x(v), y1: 6, y2: H - 22, class: v === 0 ? "ff-zero" : "ff-grille" }));
    const t = ns("text", { x: x(v), y: H - 6, class: "ff-axe", "text-anchor": "middle" }); t.textContent = court(v); svg.append(t);
  }
  const bulle = el("div", { class: "ff-bulle", hidden: true, "aria-hidden": "true" });
  lignes.forEach((l, i) => {
    const y = 10 + i * hL;
    const lab = ns("text", { x: 0, y: y + 17, class: `ff-libelle${l.fort ? " fort" : ""}` }); lab.textContent = l.libelle; svg.append(lab);
    let cible;
    if (l.point != null) {
      cible = ns("circle", { cx: x(l.point), cy: y + 12, r: 6, class: "ff-point" });
      svg.append(cible);
    } else if (Number.isFinite(l.bas) && Number.isFinite(l.haut)) {
      cible = ns("rect", { x: x(Math.min(l.bas, l.haut)), y: y + 3, width: Math.max(2, Math.abs(x(l.haut) - x(l.bas))), height: 18, rx: 4, class: `ff-barre${l.fort ? " fort" : ""}` });
      svg.append(cible);
    } else {
      const t = ns("text", { x: G, y: y + 17, class: "ff-axe" }); t.textContent = "à compléter"; svg.append(t);
    }
    if (cible) {
      const texte = l.point != null ? `${l.libelle} : ${euros(l.point)}` : `${l.libelle} : ${fourchette(l.bas, l.haut)}`;
      const zoneSurvol = ns("rect", { x: G, y, width: L - G, height: hL - 8, fill: "transparent" });
      zoneSurvol.addEventListener("pointermove", (ev) => { const r = svg.getBoundingClientRect(); bulle.textContent = texte; bulle.hidden = false; bulle.style.left = `${ev.clientX - r.left}px`; bulle.style.top = `${ev.clientY - r.top}px`; });
      zoneSurvol.addEventListener("pointerleave", () => { bulle.hidden = true; });
      svg.append(zoneSurvol);
    }
  });
  return el("div", { class: "ff-zone" }, svg, bulle);
}

function tableau(entetes, lignes, { legende } = {}) {
  return el("div", { class: "tableau-defile", tabindex: "0" }, el("table", { class: "tableau-resultat" },
    legende ? el("caption", { text: legende }) : null,
    el("thead", {}, el("tr", {}, ...entetes.map((h, i) => el("th", { scope: "col", class: i ? "num" : null, text: h })))),
    el("tbody", {}, ...lignes.map((l) => el("tr", { class: l.classe || null }, ...l.cellules.map((c, i) => (i === 0 ? el("th", { scope: "row", text: c }) : el("td", { class: "num", text: c }))))))));
}

function dessinerResultat() {
  const { resultat: r, hypotheses: H, entree } = dernier;
  const zone = $("#resultat");
  if (r?.statut === "hypotheses_invalides") {
    remplacer(zone, el("div", { class: "carte vide" }, el("p", { text: "Certains réglages sont hors des bornes admises :" }),
      el("ul", {}, ...r.alertes.map((t) => el("li", { text: t }))),
      (r.erreurs || []).some((x) => x.champ.startsWith("reglages")) ? el("button", { type: "button", class: "btn btn-noir", onclick: async () => {
        if (!confirm("Rétablir les réglages par défaut (EBE retenu, décotes et primes) ?")) return;
        try { reponses.reglages = {}; await api(`${base}/answers/reglages`, { method: "PUT", body: JSON.stringify({ data: {} }) }); await calculer(); }
        catch (e) { message(e.message, true); }
      } }, "Rétablir les réglages par défaut") : null,
      el("a", { class: "btn btn-contour", href: "#entreprise" }, "Corriger mes réponses")));
    $("#etat-valorisation").textContent = "";
    return;
  }
  if (!r || r.statut !== "ok") {
    remplacer(zone, el("div", { class: "carte vide" }, el("p", { text: "Validez un exercice complet (chiffre d'affaires, charges et bilan) pour obtenir une valorisation." }),
      ...(r?.alertes || []).map((t) => el("p", { class: "petit", text: t })), el("a", { class: "btn btn-noir", href: "#chiffres" }, "Compléter mes chiffres")));
    $("#etat-valorisation").textContent = "";
    return;
  }
  const s = r.synthese;
  const v = resumeValorisation(r);
  $("#etat-valorisation").textContent = v ? fourchette(v.bas, v.haut) : "à compléter";
  const reg = reponses.reglages || {};

  // --- Synthèse : la fourchette seule (même format et même étiquette que la page du dossier), et ce qui l'explique
  const ecart = v ? explicationEcart(dossierCourant?.estimation, v) : null;
  const tete = el("div", { class: "synthese-valeur carte" },
    el("p", { class: "etiquette", text: ETIQUETTE_TITRES }),
    el("p", { class: "valeur-centrale chiffre", text: v ? fourchette(v.bas, v.haut) : "À compléter" }),
    el("p", { class: "petit", text: `Fondée sur les multiples d'EBE (excédent brut d'exploitation) de votre secteur, la référence des cessions de PME, après dettes et trésorerie. Contrôle par l'actif net corrigé (plancher de négociation) : ${euros(s.plancher_ancc)}.` }),
    ecart ? el("p", { class: "petit", text: ecart }) : null,
    el("p", { class: "estimation-mention", text: "Estimation indicative, non contractuelle. Elle ne remplace pas l'avis d'un expert-comptable ou d'un conseil en cession." }),
    el("a", { class: "btn btn-sable", href: `${base}/documents/datapack`, download: "" }, "Télécharger le datapack Excel ", el("span", { class: "fleche", "aria-hidden": "true", text: "↓" })));
  const visibles = alertesDirigeant(s.alertes);
  const alertes = visibles.length ? el("ul", { class: "alertes" }, ...visibles.map((a) => el("li", { text: a }))) : null;

  // --- Fourchette et son contrôle : la barre des multiples, le point de l'actif net corrigé
  const m = r.multiples;
  const ff = footballField([
    { libelle: "Multiples d'EBE", bas: s.bas, haut: s.haut, fort: true },
    { libelle: "Actif net (contrôle)", point: r.ancc.valeur },
  ]);

  // --- Réglages (EBE retenu, décotes et primes)
  const facteurs = H.decotes_primes.facteurs;
  const decotes = facteurs.map((f) => {
    const existant = (reg.decotes || []).find((x) => x.cle === f.cle) || { cle: f.cle, pct: 0, justification: "" };
    const idc = `dec-${f.cle}`;
    const curseur = el("input", { id: idc, type: "range", min: String(f.min * 100), max: String(f.max * 100), step: "1", value: String(Math.round((existant.pct || 0) * 100)) });
    const lu = el("output", { for: idc, text: pct(existant.pct || 0, 0) });
    const just = el("input", { type: "text", placeholder: "Justification (obligatoire si différent de 0 %)", "aria-label": `Justification : ${f.libelle}`, value: existant.justification || "" });
    const maj = () => {
      const liste = (reg.decotes ||= []);
      let x = liste.find((y) => y.cle === f.cle);
      if (!x) { x = { cle: f.cle, pct: 0, justification: "" }; liste.push(x); }
      x.pct = Number(curseur.value) / 100; x.justification = just.value; lu.textContent = pct(x.pct, 0);
    };
    curseur.addEventListener("input", maj); just.addEventListener("change", maj);
    return el("div", { class: "decote" }, el("label", { for: idc, text: f.libelle }), curseur, lu, just);
  });
  const modeEbe = el("select", { id: "reg-mode-ebe" }, el("option", { value: "moyenne", selected: reg.mode_ebe !== "dernier", text: "Moyenne des exercices retraités" }), el("option", { value: "dernier", selected: reg.mode_ebe === "dernier", text: "Dernier exercice retraité" }));
  modeEbe.addEventListener("change", () => { reg.mode_ebe = modeEbe.value; });

  const reglages = el("details", { class: "carte reglages" },
    el("summary", {}, el("strong", { text: "Affiner (pour votre conseil)" }), el("span", { class: "petit", text: " · EBE retenu, décotes et primes : chacune avec sa justification" })),
    el("div", { class: "reglages-grille" },
      el("div", { class: "q" }, el("label", { for: "reg-mode-ebe", text: "EBE normatif (EBE de référence)" }), modeEbe)),
    el("h4", { text: "Décotes et primes" }), el("p", { class: "petit", text: H.decotes_primes.note }),
    el("div", { class: "decotes" }, ...decotes),
    el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
      const bouton = ev.currentTarget; // vidé après « await »
      bouton.disabled = true;
      // La pondération avec les flux actualisés n'est plus proposée : un réglage ancien est retiré (multiples seuls)
      delete reg.poids_multiples;
      try { reponses.reglages = reg; await api(`${base}/answers/reglages`, { method: "PUT", body: JSON.stringify({ data: reg }) }); await calculer(); }
      catch (e) { message(e.message, true); } finally { bouton.disabled = false; }
    } }, "Recalculer"));

  // --- Pont EBE
  const pontLignes = [];
  for (const p of r.pont_ebe) {
    pontLignes.push({ cellules: [`EBE comptable ${p.annee}`, euros(p.ebe_comptable)] });
    for (const l of p.lignes) pontLignes.push({ classe: "sous", cellules: [`  ${l.libelle}${l.justification ? ` (${l.justification})` : ""}`, `${l.montant >= 0 ? "+" : ""}${euros(l.montant)}`] });
    pontLignes.push({ classe: "total", cellules: [`EBE retraité ${p.annee}`, euros(p.ebe_retraite)] });
  }
  pontLignes.push({ classe: "total fort", cellules: [`EBE normatif (${r.ebe_normatif.mode === "dernier" ? "dernier exercice" : `moyenne ${r.ebe_normatif.annees.join(", ")}`})`, euros(r.ebe_normatif.valeur)] });

  // --- De la valeur d'entreprise à la valeur des titres, pour le bas et le haut de la fourchette
  const pt = r.pont_titres;
  const mult = (x) => `× ${x.toLocaleString("fr-FR")}`;
  const deuxCols = (lib, f) => ({ cellules: [lib, f("bas"), f("haut")] });
  const pontTitres = m.statut === "ok" ? tableau(["De l'entreprise aux titres", "Bas", "Haut"], [
    deuxCols("Multiple d'EBE du secteur", (k) => mult(m.multiples[k])),
    deuxCols("Valeur d'entreprise (EBE normatif × multiple)", (k) => euros(m.ve[k])),
    deuxCols(`Décotes et primes (× ${pt.facteur_decotes.toLocaleString("fr-FR", { maximumFractionDigits: 3 })})`, (k) => euros(m.ve[k] * pt.facteur_decotes - m.ve[k])),
    ...r.dette_nette.lignes.filter((l) => l.montant).map((l) => ({ classe: "sous", cellules: [`  ${l.libelle}`, euros(-l.montant), euros(-l.montant)] })),
    deuxCols("Écart de besoin en fonds de roulement (réel − normal)", () => euros(pt.ecart_bfr)),
    ...(pt.hors_exploitation ? [deuxCols("Actifs hors exploitation", () => euros(pt.hors_exploitation))] : []),
    { classe: "total fort", cellules: ["Valeur des titres", euros(m.titres.bas), euros(m.titres.haut)] },
  ], { legende: "Multiples du secteur : croisement de trois sources datées, voir la méthode" }) : el("p", { class: "petit", text: "Méthode des multiples non applicable ou à compléter." });

  // --- Sensibilité au multiple (valeur des titres)
  const sens = r.sensibilites;
  const lignesSens = sens.multiple ? [{ cellules: ["Multiple d'EBE retenu, un point de moins / de plus", court(sens.multiple.moins), court(sens.multiple.plus)] }] : [];

  remplacer(zone, 
    el("div", { class: "resultat-tete" }, tete, el("div", { class: "carte" }, el("h3", { text: "Votre fourchette et son contrôle" }), el("p", { class: "petit", text: "Valeur des titres. Barre : fourchette des multiples du secteur ; point : actif net corrigé, qui sert de contrôle et de plancher." }), ff)),
    ...(alertes ? [alertes] : []), reglages,
    el("div", { class: "resultat-detail" },
      el("section", { class: "carte" }, el("h3", { text: "De l'EBE comptable à l'EBE normatif" }), tableau(["Pont EBE", "Montant"], pontLignes)),
      el("section", { class: "carte" }, el("h3", { text: "Multiples et passage à la valeur des titres" }), pontTitres),
      el("section", { class: "carte" }, el("h3", { text: "Contrôle : actif net comptable corrigé" }), tableau(["Poste", "Montant"], [...r.ancc.lignes.filter((l) => l.montant).map((l) => ({ cellules: [l.libelle, euros(l.montant)] })), { classe: "total fort", cellules: ["Actif net corrigé", euros(r.ancc.valeur)] }])),
      lignesSens.length ? el("section", { class: "carte" }, el("h3", { text: "Sensibilité (valeur des titres)" }), tableau(["Variation", "Un point de moins", "Un point de plus"], lignesSens)) : null)),
    reglages),
    el("p", { class: "petit", text: `Hypothèses Passation du ${H.version}. Le calcul est fait par du code vérifié ; aucune intelligence artificielle n'intervient dans les montants.` }),
  );
}

// ================================================================== Chargement
async function charger() {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace("/espace/"); return; }
  $("#lien-dossier").href = `/espace/?dossier=${id}`;
  document.querySelectorAll(".lien-guide").forEach((a) => { a.href = `/espace/demarrer/?dossier=${id}`; });
  const [dossier, ch, rep] = await Promise.all([api(base), api(`${base}/financials`), api(`${base}/answers`)]);
  dossierCourant = dossier;
  document.title = `Valorisation · ${dossier.entreprise.nom} · Passation`;
  $("#dossier-nom").textContent = dossier.entreprise.nom;
  chiffres = ch; reponses = rep.reponses || {};
  dessinerChiffres();
  majEtatQuestionnaire();
  const v = dossier.parcours?.valorisation;
  if (v) $("#etat-valorisation").textContent = fourchette(v.bas, v.haut);
  montrer();
  $("main").removeAttribute("aria-busy");
}
charger().catch((e) => { if (e.message !== "non connecté") message(e.message, true); });
