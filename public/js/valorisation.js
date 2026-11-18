// Mode détaillé « Valorisation approfondie » : 1. Vos chiffres (liasse PDF + validation ligne par ligne),
// 2. Votre entreprise (questionnaire, sauvegarde automatique), 3. Votre valorisation (calcul du serveur, réglages).
// Aucun calcul de valeur ici : tout vient de l'API (code testé). Cette page affiche et recueille.
import { CHAMPS } from "/js/champs-financiers.js";
import { ETAPES, REGIONS } from "/js/questionnaire.js";

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
  document.querySelectorAll(".etapes a").forEach((a) => { if (a.dataset.etape === cle) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
  if (cle === "valorisation") calculer();
  if (cle === "entreprise") dessinerQuestionnaire();
}
window.addEventListener("hashchange", () => { montrer(); $(`#titre-${location.hash.slice(1)}`)?.focus?.(); });

// ================================================================== 1. Vos chiffres
let chiffres = null;
function etatLigne(cle, annees) {
  const cases = annees.map((a) => chiffres.exercices[a]?.[cle]).filter((c) => c && c.valeur != null);
  if (!cases.length) return "vide";
  return cases.every((c) => c.valide) ? "validee" : "a_valider";
}
function dessinerChiffres() {
  const annees = Object.keys(chiffres.exercices).map(Number).sort((a, b) => a - b);
  const table = $("#tableau-chiffres");
  const tete = el("tr", {}, el("th", { scope: "col", text: "Poste" }), ...annees.map((a) => el("th", { scope: "col", class: "num" }, `${a} `, el("button", { type: "button", class: "lien-simple retirer", "aria-label": `Retirer l'exercice ${a}`, title: `Retirer ${a}`, onclick: () => retirerExercice(a) }, "×"))), el("th", { scope: "col", class: "col-ligne", text: "Ligne" }));
  table.tHead.replaceChildren(tete);
  const corps = [];
  for (const [groupe, titre] of [["resultat", "Compte de résultat"], ["bilan", "Bilan"]]) {
    corps.push(el("tr", { class: "groupe" }, el("th", { scope: "colgroup", colspan: String(annees.length + 2), text: titre })));
    for (const c of CHAMPS.filter((x) => x.groupe === groupe)) {
      const etat = etatLigne(c.cle, annees);
      const tr = el("tr", { class: `ligne-${etat}`, "data-cle": c.cle });
      tr.append(el("th", { scope: "row" }, el("span", { class: "poste", text: c.libelle }), c.obligatoire ? el("abbr", { class: "obligatoire", title: "Obligatoire pour le calcul", text: "*" }) : null, el("span", { class: "aide", text: c.aide })));
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
  table.tBodies[0].replaceChildren(...corps);

  const manque = Object.entries(chiffres.manquants).filter(([, l]) => l.length);
  const complets = annees.length - manque.length;
  $("#etat-chiffres").textContent = `${complets}/${Math.max(annees.length, 3)}`;
  $("#etat-chiffres").setAttribute("aria-label", `${complets} exercices complets`);
  const resume = manque.map(([a, l]) => `${a} : ${l.length} ligne${l.length > 1 ? "s" : ""} obligatoire${l.length > 1 ? "s" : ""} à compléter ou valider (${l.map((k) => CHAMPS.find((c) => c.cle === k)?.libelle).join(", ")})`);
  message(resume.length ? resume.join(" · ") : annees.length ? "Tous les exercices sont complets et validés." : "", false, "#message-liasse");
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
    $(`tr[data-cle="${cle}"] input[data-annee="${annee}"]`)?.focus();
  } catch (e) { message(e.message, true, "#message-liasse"); }
}
async function validerLigne(cle, annees) {
  const ligne = $(`tr[data-cle="${cle}"]`);
  try {
    for (const a of annees) {
      const v = lireNombre(ligne.querySelector(`input[data-annee="${a}"]`).value);
      if (v === null) continue;
      if (Number.isNaN(v)) throw new Error("Un montant de cette ligne est illisible.");
      chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee: a, valeurs: { [cle]: v }, valider: true }) });
    }
    dessinerChiffres();
    const suivant = $(`tr[data-cle="${cle}"]`)?.nextElementSibling?.querySelector("button.btn-mini:not([disabled]), input");
    (suivant || $(`tr[data-cle="${cle}"] .valide-texte`))?.focus?.();
  } catch (e) { message(e.message, true, "#message-liasse"); }
}
async function retirerExercice(a) {
  if (!confirm(`Retirer l'exercice ${a} et ses chiffres ?`)) return;
  try { chiffres = await api(`${base}/financials/${a}`, { method: "DELETE" }); dessinerChiffres(); } catch (e) { message(e.message, true, "#message-liasse"); }
}
$("#btn-exercice").addEventListener("click", async () => {
  const a = Number($("#nouvel-exercice").value);
  if (!Number.isInteger(a) || a < 1990 || a > 2100) return message("Indiquez une année sur 4 chiffres.", true, "#message-liasse");
  try { chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee: a, valeurs: {}, valider: false }) }); chiffres.exercices[a] ??= {}; dessinerChiffres(); $("#nouvel-exercice").value = ""; }
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
  $("#sous-etapes").replaceChildren(...ETAPES.map((e, i) => el("li", {}, el("button", { type: "button", class: "lien-simple", "aria-current": i === etapeQ ? "step" : null, onclick: () => { etapeQ = i; dessinerQuestionnaire(); } }, `${i + 1}. ${e.titre}`))));
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
  form.replaceChildren(
    el("h3", { text: `${etapeQ + 1}. ${e.titre}` }), el("p", { class: "petit", text: e.intro }),
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
function majEtatQuestionnaire() {
  let t = 0, f = 0;
  for (const e of ETAPES) for (const q of e.questions) { t++; const v = reponses[e.cle]?.[q.cle]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) f++; }
  $("#etat-entreprise").textContent = `${Math.round((f / t) * 100)} %`;
}

// ================================================================== 3. Votre valorisation
let dernier = null;
async function calculer() {
  const zone = $("#resultat");
  zone.setAttribute("aria-busy", "true");
  try {
    dernier = await api(`${base}/valuation`, { method: "POST" });
    dessinerResultat();
  } catch (e) { zone.replaceChildren(el("p", { class: "message-carte erreur", text: e.message })); }
  finally { zone.removeAttribute("aria-busy"); }
}

function footballField(lignes) {
  // lignes : [{ libelle, bas, central, haut, point, fort }] — une seule teinte, la ligne porte l'identité
  const valeurs = lignes.flatMap((l) => [l.bas, l.haut, l.central, l.point]).filter(Number.isFinite);
  if (!valeurs.length) return null;
  let min = Math.min(0, ...valeurs), max = Math.max(...valeurs);
  const marge = (max - min) * 0.08; max += marge;
  const L = 560, G = 150, D = 20, hL = 46, H = lignes.length * hL + 34;
  const x = (v) => G + ((v - min) / (max - min)) * (L - G - D);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${H}`);
  svg.setAttribute("class", "football");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Fourchettes de valeur des titres par méthode : ${lignes.map((l) => `${l.libelle} ${l.point != null ? court(l.point) : `${court(l.bas)} à ${court(l.haut)}`}`).join(" ; ")}`);
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
      if (Number.isFinite(l.central)) svg.append(ns("line", { x1: x(l.central), x2: x(l.central), y1: y, y2: y + 24, class: "ff-central" }));
    } else {
      const t = ns("text", { x: G, y: y + 17, class: "ff-axe" }); t.textContent = "à compléter"; svg.append(t);
    }
    if (cible) {
      const texte = l.point != null ? `${l.libelle} : ${euros(l.point)}` : `${l.libelle} : ${euros(l.bas)} à ${euros(l.haut)}${Number.isFinite(l.central) ? `, central ${euros(l.central)}` : ""}`;
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

function sourceH(h) {
  if (!h) return null;
  return el("span", { class: "petit source-h" }, h.source ? `Source : ${h.source}` : "", h.url ? [" · ", el("a", { href: h.url, target: "_blank", rel: "noopener", text: "voir" })] : null);
}

function dessinerResultat() {
  const { resultat: r, hypotheses: H, entree } = dernier;
  const zone = $("#resultat");
  if (r?.statut === "hypotheses_invalides") {
    zone.replaceChildren(el("div", { class: "carte vide" }, el("p", { text: "Certains réglages sont hors des bornes admises :" }),
      el("ul", {}, ...r.alertes.map((t) => el("li", { text: t }))),
      (r.erreurs || []).some((x) => x.champ.startsWith("reglages")) ? el("button", { type: "button", class: "btn btn-noir", onclick: async () => {
        if (!confirm("Rétablir les réglages par défaut (prime de taille, décotes, pondération, hypothèses) ?")) return;
        try { reponses.reglages = {}; await api(`${base}/answers/reglages`, { method: "PUT", body: JSON.stringify({ data: {} }) }); await calculer(); }
        catch (e) { message(e.message, true); }
      } }, "Rétablir les réglages par défaut") : null,
      el("a", { class: "btn btn-contour", href: "#entreprise" }, "Corriger mes réponses")));
    $("#etat-valorisation").textContent = "";
    return;
  }
  if (!r || r.statut !== "ok") {
    zone.replaceChildren(el("div", { class: "carte vide" }, el("p", { text: "Validez un exercice complet (chiffre d'affaires, charges et bilan) pour obtenir une valorisation." }),
      ...(r?.alertes || []).map((t) => el("p", { class: "petit", text: t })), el("a", { class: "btn btn-noir", href: "#chiffres" }, "Compléter mes chiffres")));
    $("#etat-valorisation").textContent = "";
    return;
  }
  const s = r.synthese;
  $("#etat-valorisation").textContent = s.central != null ? court(s.central) : "à compléter";
  const reg = reponses.reglages || {};

  // --- Synthèse
  const tete = el("div", { class: "synthese-valeur carte" },
    el("p", { class: "etiquette", text: "Valeur de vos titres (fonds propres)" }),
    s.central != null
      ? [el("p", { class: "valeur-centrale chiffre", text: euros(s.central) }), el("p", { class: "fourchette", text: `Fourchette : ${euros(s.bas)} – ${euros(s.haut)}` })]
      : el("p", { class: "valeur-centrale", text: "À compléter" }),
    el("p", { class: "petit", text: s.ponderation.dcf > 0 ? `Pondération : multiples ${pct(s.ponderation.multiples, 0)}, DCF ${pct(s.ponderation.dcf, 0)}. Actif net corrigé (plancher, présenté à part) : ${euros(s.plancher_ancc)}.`
      : `Valeur fondée sur les multiples, la référence des cessions de PME. ${r.dcf?.statut === "ok" ? "Le DCF est calculé à titre indicatif et peut être ajouté dans « Affiner »." : "Le DCF est une option : il se calcule une fois la prime de taille renseignée dans « Affiner »."} Actif net corrigé (plancher, présenté à part) : ${euros(s.plancher_ancc)}.` }),
    el("p", { class: "estimation-mention", text: "Estimation indicative, non contractuelle. Elle ne remplace pas l'avis d'un expert-comptable ou d'un conseil en cession." }),
    el("a", { class: "btn btn-sable", href: `${base}/documents/datapack`, download: "" }, "Télécharger le datapack Excel ", el("span", { class: "fleche", "aria-hidden": "true", text: "↓" })));
  const alertes = s.alertes.length ? el("ul", { class: "alertes" }, ...s.alertes.map((a) => el("li", { text: a }))) : null;

  const m = r.multiples, d = r.dcf;
  const ff = footballField([
    { libelle: "Multiples d'EBE", bas: m.titres?.bas, central: m.titres?.central, haut: m.titres?.haut },
    { libelle: "DCF", bas: d.titres?.bas, central: d.titres?.central, haut: d.titres?.haut ?? d.titres?.central },
    { libelle: "Actif net corrigé", point: r.ancc.valeur },
    { libelle: "Synthèse", bas: s.bas, central: s.central, haut: s.haut, fort: true },
  ]);

  // --- Réglages (prime de taille, décotes, pondération, hypothèses)
  const champPct = (cle, libelle, valeur, aideNoeud, { min, max, pas = 0.1 } = {}) => {
    const idc = `reg-${cle}`;
    const input = el("input", { id: idc, type: "number", step: String(pas), min: min ?? null, max: max ?? null, value: valeur != null ? String(Math.round(valeur * 10000) / 100) : "" });
    input.addEventListener("change", () => { const n = lireNombre(input.value); reg[cle] = n == null || Number.isNaN(n) ? null : n / 100; });
    return el("div", { class: "q" }, el("label", { for: idc, text: libelle }), el("div", { class: "champ-unite" }, input, el("span", { class: "unite", text: "%" })), aideNoeud);
  };
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
  const poids = el("input", { id: "reg-poids", type: "range", min: "0", max: "100", step: "5", value: String(Math.round((reg.poids_multiples ?? H.ponderation.multiples) * 100)) });
  const poidsLu = el("output", { for: "reg-poids", text: `${poids.value} % / ${100 - poids.value} %` });
  poids.addEventListener("input", () => { reg.poids_multiples = Number(poids.value) / 100; poidsLu.textContent = `${poids.value} % / ${100 - poids.value} %`; });
  const modeEbe = el("select", { id: "reg-mode-ebe" }, el("option", { value: "moyenne", selected: reg.mode_ebe !== "dernier", text: "Moyenne des exercices retraités" }), el("option", { value: "dernier", selected: reg.mode_ebe === "dernier", text: "Dernier exercice retraité" }));
  modeEbe.addEventListener("change", () => { reg.mode_ebe = modeEbe.value; });

  const reglages = el("details", { class: "carte reglages" },
    el("summary", {}, el("strong", { text: "Affiner (pour votre conseil)" }), el("span", { class: "petit", text: " · hypothèses, prime de taille, décotes, pondération : chacune avec sa source" })),
    el("div", { class: "reglages-grille" },
      champPct("prime_taille", "Prime de taille et de risque spécifique (DCF)", reg.prime_taille, el("span", { class: "petit aide-q", text: H.prime_taille.note }), { min: 0, max: 20 }),
      champPct("taux_sans_risque", "Taux sans risque", reg.taux_sans_risque ?? H.taux_sans_risque.valeur, sourceH(H.taux_sans_risque)),
      champPct("prime_risque_marche", "Prime de risque du marché (France)", reg.prime_risque_marche ?? H.prime_risque_marche.valeur, sourceH(H.prime_risque_marche)),
      champPct("cout_dette_avant_impot", "Coût de la dette avant impôt", reg.cout_dette_avant_impot ?? H.cout_dette_avant_impot.valeur, sourceH(H.cout_dette_avant_impot)),
      champPct("croissance_terminale", "Croissance à l'infini", reg.croissance_terminale ?? H.croissance_terminale.valeur, sourceH(H.croissance_terminale)),
      el("div", { class: "q" }, el("label", { for: "reg-mode-ebe", text: "EBE normatif" }), modeEbe),
      el("div", { class: "q" }, el("label", { for: "reg-poids", text: "Multiples / DCF (le DCF est une option : 0 % par défaut, à activer si votre conseil le souhaite)" }), poids, poidsLu)),
    el("h4", { text: "Décotes et primes" }), el("p", { class: "petit", text: H.decotes_primes.note }),
    el("div", { class: "decotes" }, ...decotes),
    el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
      const bouton = ev.currentTarget; // vidé après « await »
      bouton.disabled = true;
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

  // --- Pont VE → titres
  const pt = r.pont_titres;
  const pontTitres = m.statut === "ok" ? tableau(["Multiples d'EBE (centrale)", "Montant"], [
    { cellules: [`EBE normatif × ${String(m.multiples.central).replace(".", ",")}`, euros(m.ve.central)] },
    { cellules: [`Décotes et primes (× ${pt.facteur_decotes.toLocaleString("fr-FR", { maximumFractionDigits: 3 })})`, euros(m.ve.central * pt.facteur_decotes - m.ve.central)] },
    ...r.dette_nette.lignes.filter((l) => l.montant).map((l) => ({ classe: "sous", cellules: [`  ${l.libelle}`, euros(-l.montant)] })),
    { cellules: ["Écart de BFR (réel − normatif)", euros(pt.ecart_bfr)] },
    ...(pt.hors_exploitation ? [{ cellules: ["Actifs hors exploitation", euros(pt.hors_exploitation)] }] : []),
    { classe: "total fort", cellules: ["Valeur des titres", euros(m.titres.central)] },
  ], { legende: `Multiples du secteur : ${[m.multiples.bas, m.multiples.central, m.multiples.haut].map((x) => x.toLocaleString("fr-FR")).join(" / ")} × EBE (croisement de trois sources datées, voir la méthode)` }) : el("p", { class: "petit", text: "Méthode des multiples non applicable ou à compléter." });

  // --- DCF
  let blocDcf;
  if (d.statut === "ok") {
    const c = d.cmpc, hy = d.hypotheses;
    blocDcf = [
      tableau(["Coût du capital (CMPC)", "Valeur"], [
        { cellules: ["Taux sans risque", pct(H.taux_sans_risque.valeur, 2)] },
        { cellules: [`Bêta désendetté du secteur (${H.betas.secteurs[entree.secteur]?.industrie_damodaran ?? "–"})`, c.beta_desendette.toLocaleString("fr-FR", { maximumFractionDigits: 3 })] },
        { cellules: ["Bêta endetté (structure cible du secteur)", c.beta_endette.toLocaleString("fr-FR", { maximumFractionDigits: 3 })] },
        { cellules: ["Prime de risque du marché", pct(H.prime_risque_marche.valeur, 2)] },
        { cellules: ["Prime de taille (vos réglages)", pct(entree.primeTaille, 2)] },
        { cellules: ["Coût des fonds propres", pct(c.cout_fonds_propres, 2)] },
        { cellules: ["Coût de la dette après impôt", pct(c.cout_dette_apres_impot, 2)] },
        { cellules: ["Part de la dette", pct(c.poids_dette, 1)] },
        { classe: "total fort", cellules: ["CMPC", pct(c.valeur, 2)] },
      ]),
      tableau(["Hypothèse (origine)", "Valeur"], Object.entries({ croissance: "Croissance annuelle du CA", marge_ebe: "Marge d'EBE", amortissements_pct: "Amortissements / CA", investissements_pct: "Investissements / CA", croissance_terminale: "Croissance à l'infini" })
        .map(([k, lib]) => ({ cellules: [`${lib} (${hy[k].origine})`, pct(hy[k].valeur, 1)] })).concat([{ cellules: [`BFR en jours de CA (${hy.bfr_jours.origine})`, `${Math.round(hy.bfr_jours.valeur)} j`] }])),
      null,
    ];
    // Tableau des flux, transposé (lignes = postes)
    const postes = [["ca", "Chiffre d'affaires"], ["ebe", "EBE"], ["impot", "Impôt sur EBIT"], ["investissements", "Investissements"], ["variation_bfr", "Variation du BFR"], ["flux", "Flux disponible"], ["actualise", "Flux actualisé"]];
    blocDcf[2] = tableau(["Flux (€)", ...d.detail.flux.map((f) => `An ${f.annee}`)], postes.map(([k, lib]) => ({ classe: k === "flux" ? "total" : null, cellules: [lib, ...d.detail.flux.map((f) => court(f[k]))] })));
    blocDcf.push(el("p", { class: "petit", text: `Valeur terminale actualisée : ${euros(d.detail.vt_actualisee)} (${pct(d.detail.part_vt, 0)} de la valeur). Valeur d'entreprise DCF : ${euros(d.ve.central)} ; titres : ${euros(d.titres.central)}.` }));
  } else {
    blocDcf = [el("p", { class: "message-carte", text: d.statut === "a_completer" ? `DCF à compléter : ${d.manquant.join(", ")}. Renseignez-la dans « Hypothèses et réglages » ci-dessus.` : d.message || "DCF non applicable." })];
  }

  // --- Sensibilités
  const sens = r.sensibilites;
  const lignesSens = [];
  if (sens.multiple) lignesSens.push({ cellules: ["Multiple d'EBE − 1x / + 1x", court(sens.multiple.moins), court(sens.multiple.central), court(sens.multiple.plus)] });
  if (sens.cmpc) lignesSens.push({ cellules: ["CMPC + 1 pt / − 1 pt (DCF)", court(sens.cmpc.plus_1pt), court(sens.cmpc.central), court(sens.cmpc.moins_1pt)] });
  if (sens.croissance_terminale) lignesSens.push({ cellules: ["Croissance à l'infini − 0,5 pt / + 0,5 pt (DCF)", court(sens.croissance_terminale.moins_05pt), court(sens.croissance_terminale.central), court(sens.croissance_terminale.plus_05pt)] });

  zone.replaceChildren(
    el("div", { class: "resultat-tete" }, tete, el("div", { class: "carte" }, el("h3", { text: "Fourchettes par méthode" }), el("p", { class: "petit", text: "Valeur des titres. Barre : fourchette ; trait : valeur centrale ; point : actif net corrigé." }), ff)),
    ...(alertes ? [alertes] : []), reglages,
    el("div", { class: "resultat-detail" },
      el("section", { class: "carte" }, el("h3", { text: "1. De l'EBE comptable à l'EBE normatif" }), tableau(["Pont EBE", "Montant"], pontLignes)),
      el("section", { class: "carte" }, el("h3", { text: "2. Multiples et passage à la valeur des titres" }), pontTitres),
      el("section", { class: "carte" }, el("h3", { text: "3. DCF sur 5 ans" }), ...blocDcf),
      el("section", { class: "carte" }, el("h3", { text: "4. Actif net comptable corrigé" }), tableau(["Poste", "Montant"], [...r.ancc.lignes.filter((l) => l.montant).map((l) => ({ cellules: [l.libelle, euros(l.montant)] })), { classe: "total fort", cellules: ["Actif net corrigé", euros(r.ancc.valeur)] }])),
      lignesSens.length ? el("section", { class: "carte" }, el("h3", { text: "5. Sensibilités (valeur des titres)" }), tableau(["Variation", "Basse", "Centrale", "Haute"], lignesSens)) : null),
    el("p", { class: "petit", text: `Hypothèses Passation du ${H.version}. ${H.modifiees?.length ? `Modifiées par vous : ${H.modifiees.join(", ")}.` : ""} Le calcul est fait par du code vérifié ; aucune intelligence artificielle n'intervient dans les montants.` }),
  );
}

// ================================================================== Chargement
async function charger() {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace("/espace/"); return; }
  $("#lien-dossier").href = `/espace/?dossier=${id}`;
  document.querySelectorAll(".lien-guide").forEach((a) => { a.href = `/espace/demarrer/?dossier=${id}`; });
  const [dossier, ch, rep] = await Promise.all([api(base), api(`${base}/financials`), api(`${base}/answers`)]);
  document.title = `Valorisation · ${dossier.entreprise.nom} · Passation`;
  $("#dossier-nom").textContent = dossier.entreprise.nom;
  chiffres = ch; reponses = rep.reponses || {};
  dessinerChiffres();
  majEtatQuestionnaire();
  if (dossier.parcours?.valorisation?.central != null) $("#etat-valorisation").textContent = court(dossier.parcours.valorisation.central);
  montrer();
  $("main").removeAttribute("aria-busy");
}
charger().catch((e) => { if (e.message !== "non connecté") message(e.message, true); });
