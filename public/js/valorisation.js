// Detailed mode "Detailed valuation", in three tabs (not numbered: the progress line is that of the
// file page): Your figures (PDF tax return + line-by-line approval; only the latest fiscal year is
// required), Going further (optional questions, missing from the guided steps), Your valuation
// (server calculation, settings). Range only, never a central value; industry multiples only,
// the adjusted net assets serve as a check. No value calculation here: everything comes from the API (tested code).
import { CHAMPS, exercicesAttendus, libelleEcran, aideEcran, aideEbe as texteAideEbe } from "/js/champs-financiers.js";
import { REGIONS, libelleOption } from "/js/questionnaire.js";
import { POUR_ALLER_PLUS_LOIN as ETAPES } from "/js/parcours.js";
import { etiquetteTitres, resumeValorisation, explicationEcart, alertesDirigeant } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js";
import { situationAncc, texteAncc } from "/js/valeur-pont.js";
import { lien, t, langue, locale, lireNombreSaisi } from "/js/i18n.js";

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
/** Replaces the content of a node, ignoring null, undefined and false (otherwise the browser writes "null"). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
const fmt = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 });
const fr = () => langue() === "fr";
const euros = (v) => (v == null || !Number.isFinite(v) ? "–" : fr() ? `${fmt.format(Math.round(v))} €` : `€${fmt.format(Math.round(v))}`);
const court = (v) => {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) { const n = (v / 1e6).toLocaleString(locale(), { maximumFractionDigits: 2 }); return fr() ? `${n} M€` : `€${n}M`; }
  if (a >= 1e3) { const n = Math.round(v / 1e3).toLocaleString(locale()); return fr() ? `${n} k€` : `€${n}K`; }
  return fr() ? `${Math.round(v)} €` : `€${Math.round(v)}`;
};
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "–" : t("espace.js.pct", { n: (v * 100).toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }) }));
/** "1 234 567", "-12 000", "12,5" → number; empty → null. */
const lireNombre = (s) => lireNombreSaisi(s);

function message(texte, erreur = false, cible = "#parcours-message") {
  const m = $(cible);
  m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
}
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: { ...(enJson ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
  if (r.status === 401) { location.replace(lien("/connexion")); throw new Error("non_connecte"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || t("teaser.js.erreur"));
  return d;
}
const base = `/api/dossiers/${id}`;

// ================================================================== Navigation between the 3 steps
const PANNEAUX = ["chiffres", "entreprise", "valorisation"];
function montrer() {
  const cle = PANNEAUX.includes(location.hash.slice(1)) ? location.hash.slice(1) : "chiffres";
  for (const p of PANNEAUX) $(`#${p}`).hidden = p !== cle;
  document.querySelectorAll(".etapes a").forEach((a) => { if (a.dataset.etape === cle) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  if (cle === "valorisation") calculer();
  if (cle === "entreprise") dessinerQuestionnaire();
  window.scrollTo({ top: 0 }); // the anchor no longer slides the header under the site bar
}
window.addEventListener("hashchange", () => { montrer(); $(`#titre-${location.hash.slice(1)}`)?.focus?.(); });
// Tabs: no jump to the anchor (the header would stay under the site bar), even on the tab already open
document.querySelectorAll(".etapes a[href^='#']").forEach((a) => a.addEventListener("click", (ev) => {
  ev.preventDefault();
  if (location.hash !== a.getAttribute("href")) history.pushState(null, "", a.getAttribute("href"));
  montrer();
  $(`#titre-${a.dataset.etape}`)?.focus?.({ preventScroll: true });
}));
window.addEventListener("popstate", montrer);

// ================================================================== 1. Your figures (one fiscal year at a time)
// Required lines in two columns (what the company earns; what it owns and owes), optional lines
// collapsed: the tab fits on one screen. Role of each fiscal year: the latest is required, the two
// previous ones optional, the older ones for information. Nothing enters the calculation without approval.
let chiffres = null;
let anneeCourante = null;
const SOURCE = { get inpi() { return t("valorisation.js.source_inpi"); }, get liasse() { return t("valorisation.js.source_liasse"); } }; // wording of the legend by hand
const DETAIL = new Set(["achats_consommes", "charges_externes", "charges_personnel"]);
const aideEbe = () => el("span", { class: "aide-bulle" }, el("button", { type: "button", class: "aide-rond", "aria-describedby": "aide-ebe-chiffres", "aria-label": t("demarrer.js.saisie.quest_ce_ebe") }, "?"),
  el("span", { role: "tooltip", id: "aide-ebe-chiffres", text: texteAideEbe() }));
function ligneChiffre(c, a) {
  const v = chiffres.exercices[a]?.[c.cle];
  const input = el("input", { type: "text", inputmode: "decimal", class: "montant", id: `m-${c.cle}`, value: v?.valeur != null ? fmt.format(v.valeur) : "" });
  input.addEventListener("change", () => enregistrerCase(c.cle, a, input));
  const etat = v?.valide ? el("span", { class: "valide-marque", title: t("valorisation.js.ligne_validee") }, "✓", el("span", { class: "visuellement-cache", text: t("valorisation.js.validee") }))
    : el("button", { type: "button", class: "btn btn-mini", disabled: v?.valeur == null, onclick: () => validerLigne(c.cle, a) }, t("valorisation.js.valider"));
  return el("div", { class: `chiffre-ligne${v?.valide ? " validee" : ""}`, "data-cle": c.cle },
    el("label", { for: `m-${c.cle}` }, libelleEcran(c),
      v?.valeur != null && SOURCE[v.source] ? el("small", { text: SOURCE[v.source] }) : !c.obligatoire && v?.valeur == null ? el("small", { text: aideEcran(c) }) : null),
    el("span", { class: "champ-montant" }, input, el("span", { "aria-hidden": "true", text: "€" })), etat);
}
function dessinerChiffres() {
  const annees = Object.keys(chiffres.exercices).map(Number).sort((a, b) => a - b);
  const att = exercicesAttendus(chiffres.exercices);
  const role = (a) => t(a === att.dernier ? "valorisation.js.role.indispensable" : att.recommandes.includes(a) ? "valorisation.js.role.facultatif" : "valorisation.js.role.information");
  if (!annees.includes(anneeCourante)) anneeCourante = att.dernier ?? annees.at(-1) ?? null;
  const manq = (a) => chiffres.manquants?.[a] || [];
  remplacer($("#choix-annee"), el("span", { class: "petit", text: t("valorisation.js.exercice_deux_points") }), ...annees.map((a) => el("button", { type: "button", class: "annee", "aria-pressed": String(a === anneeCourante),
    onclick: () => { anneeCourante = a; dessinerChiffres(); } }, `${a}`, el("small", { text: ` · ${role(a)}${manq(a).length ? "" : " ✓"}` }))));
  const zone = $("#chiffres-annee");
  if (anneeCourante == null) {
    remplacer(zone, el("p", { class: "carte vide", text: t("valorisation.js.aucun_exercice") }));
  } else {
    const a = anneeCourante, l = chiffres.exercices[a] || {};
    const detail = [...DETAIL].some((k) => l[k]?.valeur != null);
    const principal = (c) => c.obligatoire || (c.cle === "ebe" && !detail && l.ebe?.valeur != null);
    const bloc = (groupe, titre) => el("section", { class: "chiffres-bloc", "aria-label": titre }, el("h3", { text: titre }),
      ...CHAMPS.filter((c) => c.groupe === groupe && principal(c) && !(DETAIL.has(c.cle) && !detail && l.ebe?.valeur != null)).map((c) => ligneChiffre(c, a)));
    const facultatifs = CHAMPS.filter((c) => !principal(c));
    const remplis = facultatifs.filter((c) => l[c.cle]?.valeur != null).length;
    remplacer(zone, 
      el("div", { class: "chiffres-grille" }, bloc("resultat", t("valorisation.js.gagne", { annee: a })), bloc("bilan", t("valorisation.js.possede", { annee: a }))),
      el("details", { class: "chiffres-facultatifs" }, el("summary", {}, remplis ? t("valorisation.js.facultatives_remplies", { total: facultatifs.length, n: remplis }) : t("valorisation.js.facultatives", { total: facultatifs.length })),
        el("div", { class: "chiffres-grille" }, ...facultatifs.map((c) => ligneChiffre(c, a)))),
      el("div", { class: "chiffres-pied" },
        el("span", { class: "petit" }, aideEbe(), " ", el("button", { type: "button", class: "lien-simple", onclick: () => retirerExercice(a) }, t("espace.js.retirer_fichier", { fichier: a }))),
        el("span", { class: "chiffres-actions-pied" },
          manq(a).length ? el("button", { type: "button", class: "btn btn-contour btn-petit", onclick: () => validerExercice(a) }, t("valorisation.js.valider_remplies", { annee: a })) : null,
          el("a", { class: "btn btn-vert btn-petit", href: "#entreprise" }, t("valorisation.js.continuer_entreprise"), el("span", { class: "fleche", "aria-hidden": "true", text: "→" })))));
  }

  // Only the latest fiscal year is requested; the two previous ones are offered, never required; older ones, ignored
  $("#etat-chiffres").textContent = att.dernier == null ? "" : att.dernier_complet ? `✓ ${att.dernier}` : t("valorisation.js.a_confirmer", { annee: att.dernier });
  const libelles = (l) => l.map((k) => libelleEcran(CHAMPS.find((c) => c.cle === k))).join(", ");
  const manqueDernier = att.dernier != null ? chiffres.manquants[att.dernier] || [] : [];
  const resume = [];
  if (manqueDernier.length) resume.push(t("valorisation.js.lignes_a_completer", { annee: att.dernier, n: manqueDernier.length, liste: libelles(manqueDernier) }));
  if (att.dernier != null && att.recommandes_manquants.length) resume.push(t("valorisation.js.facultatif_ajouter", { annees: (([...l]) => (l.length > 1 ? t("dossier.annees.liste", { debut: l.slice(0, -1).join(", "), fin: l.at(-1) }) : l[0]))([...att.recommandes_manquants].sort((a, b) => b - a)) }));
  message(resume.length ? resume.join(" · ") : annees.length ? t("valorisation.js.complets") : "", false, "#message-liasse");
  if (!chiffres.lecture_automatique) message(t("valorisation.js.lecture_inactive"), false, "#message-liasse");
  $("#btn-liasse").disabled = !chiffres.lecture_automatique || chiffres.lectures_restantes === 0;
}
async function enregistrerCase(cle, annee, input) {
  const v = lireNombre(input.value);
  if (Number.isNaN(v)) { input.setAttribute("aria-invalid", "true"); message(t("valorisation.js.montant_illisible_exemple"), true, "#message-liasse"); return; }
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
    if (Number.isNaN(v)) throw new Error(t("valorisation.js.montant_illisible"));
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
  if (!confirm(t("valorisation.js.retirer_confirmer", { annee: a }))) return;
  try { chiffres = await api(`${base}/financials/${a}`, { method: "DELETE" }); dessinerChiffres(); } catch (e) { message(e.message, true, "#message-liasse"); }
}
$("#btn-exercice").addEventListener("click", async () => {
  const a = Number($("#nouvel-exercice").value);
  if (!Number.isInteger(a) || a < 1990 || a > 2100) return message(t("valorisation.js.annee_4"), true, "#message-liasse");
  try { chiffres = await api(`${base}/financials`, { method: "PUT", body: JSON.stringify({ annee: a, valeurs: {}, valider: false }) }); chiffres.exercices[a] ??= {}; anneeCourante = a; dessinerChiffres(); $("#nouvel-exercice").value = ""; }
  catch (e) { message(e.message, true, "#message-liasse"); }
});
$("#btn-liasse").addEventListener("click", () => $("#fichier-liasse").click());
$("#fichier-liasse").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) return message(t("valorisation.js.trop_gros"), true, "#message-liasse");
  const corps = new FormData();
  corps.append("fichier", f);
  $("#btn-liasse").disabled = true;
  $("#depot").setAttribute("aria-busy", "true");
  message(t("demarrer.js.comptes.lecture"), false, "#message-liasse");
  try {
    const r = await api(`${base}/uploads`, { method: "POST", body: corps });
    chiffres = r;
    dessinerChiffres();
    const n = r.proposes.reduce((s, e) => s + e.champs.length, 0);
    message(n
      ? t("valorisation.js.lus", { n, annees: r.proposes.map((e) => e.annee).join(", ") }) + (r.remarques ? t("valorisation.js.remarque", { texte: r.remarques }) : "")
      : t("valorisation.js.aucun_reconnu", { remarques: r.remarques ? ` ${r.remarques}` : "" }), !n, "#message-liasse");
  } catch (e) { message(e.message, true, "#message-liasse"); }
  finally { $("#depot").removeAttribute("aria-busy"); $("#btn-liasse").disabled = !chiffres?.lecture_automatique; }
});

// ================================================================== 2. Your company
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
    const options = q.type === "choix" ? q.options.map((o, i) => [o, libelleOption(q.cle, o), i]) : [["oui", t("valorisation.js.oui")], ["non", t("valorisation.js.non")]];
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
        const sel = el("select", { "aria-label": t("demarrer.js.exc.exercice") }, ...annees.map((a) => el("option", { value: a, selected: String(x.annee) === a, text: a })));
        sel.addEventListener("change", () => maj("annee", Number(sel.value)));
        const lib = el("input", { type: "text", placeholder: t("demarrer.js.exc.libelle"), "aria-label": t("demarrer.js.exc.libelle"), value: x.libelle || "" }); lib.addEventListener("change", () => maj("libelle", lib.value));
        const mt = el("input", { type: "text", inputmode: "decimal", placeholder: t("demarrer.js.exc.montant_euros"), "aria-label": t("valorisation.js.montant_euros"), value: x.montant != null ? fmt.format(x.montant) : "" }); mt.addEventListener("change", () => maj("montant", lireNombre(mt.value)));
        const just = el("input", { type: "text", placeholder: t("demarrer.js.exc.justification"), "aria-label": t("demarrer.js.exc.justification"), value: x.justification || "" }); just.addEventListener("change", () => maj("justification", just.value));
        conteneur.append(el("div", { class: "exc" }, sel, lib, mt, just, el("button", { type: "button", class: "lien-simple", onclick: () => { liste.splice(i, 1); sauver(liste); dessiner(); } }, t("espace.js.retirer"))));
      });
    };
    dessiner();
    conteneur.append(el("button", { type: "button", class: "btn btn-contour btn-mini", disabled: !annees.length, onclick: () => { liste.push({ annee: Number(annees.at(-1)), libelle: "", montant: null, justification: "" }); sauver(liste); dessiner(); } }, t("demarrer.js.exc.ajouter")));
    return conteneur;
  }
  const affiche = v == null ? "" : q.type === "pct" ? (fr() ? String(Math.round(v * 1000) / 10).replace(".", ",") : String(Math.round(v * 1000) / 10)) : q.type === "euros" ? fmt.format(v) : v;
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
      etapeQ > 0 ? el("button", { type: "button", class: "btn btn-contour", onclick: () => { etapeQ--; dessinerQuestionnaire(); form.querySelector("input,textarea")?.focus(); } }, t("valorisation.js.precedent")) : el("span"),
      etapeQ < ETAPES.length - 1
        ? el("button", { type: "button", class: "btn btn-noir", onclick: () => { etapeQ++; dessinerQuestionnaire(); form.querySelector("input,textarea")?.focus(); } }, t("valorisation.js.suivant"), el("span", { class: "fleche", "aria-hidden": "true", text: "→" }))
        : el("a", { class: "btn btn-vert", href: "#valorisation" }, t("valorisation.js.voir_valo"), el("span", { class: "fleche", "aria-hidden": "true", text: "→" }))),
  );
}
function programmerSauvegarde(etape) {
  $("#etat-enregistrement").textContent = t("valorisation.js.enregistrement");
  clearTimeout(minuterie);
  minuterie = setTimeout(async () => {
    try {
      await api(`${base}/answers/${etape}`, { method: "PUT", body: JSON.stringify({ data: reponses[etape] || {} }) });
      $("#etat-enregistrement").textContent = t("valorisation.js.enregistre");
      majEtatQuestionnaire();
    } catch (err) { $("#etat-enregistrement").textContent = t("valorisation.js.non_enregistre", { erreur: err.message }); }
  }, 600);
}
/** Optional questions: no percentage (it would compete with the count of the flow's questions). */
function majEtatQuestionnaire() { $("#etat-entreprise").textContent = t("valorisation.js.role.facultatif"); }

// ================================================================== 3. Your valuation
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
  // lignes: [{ libelle, bas, haut, point, fort }] — a single hue, the row carries the identity; never a central value
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
  svg.setAttribute("aria-label", t("valorisation.js.ff_aria", { titre: etiquetteTitres(), lignes: lignes.map((l) => `${l.libelle} ${l.point != null ? court(l.point) : fourchette(l.bas, l.haut)}`).join(" ; ") }));
  const ns = (t, a) => { const n = document.createElementNS("http://www.w3.org/2000/svg", t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  // Recessive gridlines
  const pas = Math.pow(10, Math.floor(Math.log10((max - min) / 4)));
  const pasR = [1, 2, 5, 10].map((k) => k * pas).find((p) => (max - min) / p <= 5) || pas * 10;
  for (let v = Math.ceil(min / pasR) * pasR; v <= max; v += pasR) {
    svg.append(ns("line", { x1: x(v), x2: x(v), y1: 6, y2: H - 22, class: v === 0 ? "ff-zero" : "ff-grille" }));
    const tx = ns("text", { x: x(v), y: H - 6, class: "ff-axe", "text-anchor": "middle" }); tx.textContent = court(v); svg.append(tx);
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
      const tx = ns("text", { x: G, y: y + 17, class: "ff-axe" }); tx.textContent = t("teaser.js.a_completer_minuscule"); svg.append(tx);
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
    remplacer(zone, el("div", { class: "carte vide" }, el("p", { text: t("valorisation.js.hors_bornes") }),
      el("ul", {}, ...r.alertes.map((x) => el("li", { text: x }))),
      (r.erreurs || []).some((x) => x.champ.startsWith("reglages")) ? el("button", { type: "button", class: "btn btn-noir", onclick: async () => {
        if (!confirm(t("valorisation.js.retablir_confirmer"))) return;
        try { reponses.reglages = {}; await api(`${base}/answers/reglages`, { method: "PUT", body: JSON.stringify({ data: {} }) }); await calculer(); }
        catch (e) { message(e.message, true); }
      } }, t("valorisation.js.retablir")) : null,
      el("a", { class: "btn btn-contour", href: "#entreprise" }, t("valorisation.js.corriger"))));
    $("#etat-valorisation").textContent = "";
    return;
  }
  if (!r || r.statut !== "ok") {
    remplacer(zone, el("div", { class: "carte vide" }, el("p", { text: t("valorisation.js.validez_exercice") }),
      ...(r?.alertes || []).map((x) => el("p", { class: "petit", text: x })), el("a", { class: "btn btn-noir", href: "#chiffres" }, t("valorisation.js.completer_chiffres"))));
    $("#etat-valorisation").textContent = "";
    return;
  }
  const s = r.synthese;
  const v = resumeValorisation(r);
  $("#etat-valorisation").textContent = v ? fourchette(v.bas, v.haut) : t("teaser.js.a_completer_minuscule");
  const reg = reponses.reglages || {};

  // --- Summary: the range only (same format and same label as the file page), and what explains it
  const ecart = v ? explicationEcart(dossierCourant?.estimation, v) : null;
  const tete = el("div", { class: "synthese-valeur carte" },
    el("p", { class: "etiquette", text: etiquetteTitres() }),
    el("p", { class: "valeur-centrale chiffre", text: v ? fourchette(v.bas, v.haut) : t("teaser.js.a_completer") }),
    el("p", { class: "petit", text: t("valorisation.js.fondee") }),
    // Adjusted net assets next to the range: "floor" only when they are below it (defect 5 of 24/11/2026)
    v ? el("p", { class: "petit", text: texteAncc(situationAncc(v.bas, v.haut, s.plancher_ancc), v) }) : null,
    ecart ? el("p", { class: "petit", text: ecart }) : null,
    el("p", { class: "estimation-mention", text: t("valorisation.js.mention") }),
    el("a", { class: "btn btn-sable", href: `${base}/documents/datapack`, download: "" }, t("valorisation.js.telecharger_datapack"), el("span", { class: "fleche", "aria-hidden": "true", text: "↓" })));
  const visibles = alertesDirigeant(s.alertes).filter((a) => !/actif net corrigé de l'entreprise|company’s adjusted net assets/i.test(a));
  const alertes = visibles.length ? el("ul", { class: "alertes" }, ...visibles.map((a) => el("li", { text: a }))) : null;

  // --- Range and its check: the multiples bar, the adjusted net assets point
  const m = r.multiples;
  const ff = footballField([
    { libelle: t("valorisation.js.ff_multiples"), bas: s.bas, haut: s.haut, fort: true },
    { libelle: t("valorisation.js.ff_actif"), point: r.ancc.valeur },
  ]);

  // --- Settings (EBITDA used, discounts and premiums)
  const facteurs = H.decotes_primes.facteurs;
  const decotes = facteurs.map((f) => {
    const existant = (reg.decotes || []).find((x) => x.cle === f.cle) || { cle: f.cle, pct: 0, justification: "" };
    const idc = `dec-${f.cle}`;
    const curseur = el("input", { id: idc, type: "range", min: String(f.min * 100), max: String(f.max * 100), step: "1", value: String(Math.round((existant.pct || 0) * 100)) });
    const lu = el("output", { for: idc, text: pct(existant.pct || 0, 0) });
    const just = el("input", { type: "text", placeholder: t("valorisation.js.justif_obligatoire"), "aria-label": t("valorisation.js.justif_de", { libelle: f.libelle }), value: existant.justification || "" });
    const maj = () => {
      const liste = (reg.decotes ||= []);
      let x = liste.find((y) => y.cle === f.cle);
      if (!x) { x = { cle: f.cle, pct: 0, justification: "" }; liste.push(x); }
      x.pct = Number(curseur.value) / 100; x.justification = just.value; lu.textContent = pct(x.pct, 0);
    };
    curseur.addEventListener("input", maj); just.addEventListener("change", maj);
    return el("div", { class: "decote" }, el("label", { for: idc, text: f.libelle }), curseur, lu, just);
  });
  const modeEbe = el("select", { id: "reg-mode-ebe" }, el("option", { value: "moyenne", selected: reg.mode_ebe !== "dernier", text: t("valorisation.js.mode_moyenne") }), el("option", { value: "dernier", selected: reg.mode_ebe === "dernier", text: t("valorisation.js.mode_dernier") }));
  modeEbe.addEventListener("change", () => { reg.mode_ebe = modeEbe.value; });

  const reglages = el("details", { class: "carte reglages" },
    el("summary", {}, el("strong", { text: t("valorisation.js.affiner") }), el("span", { class: "petit", text: t("valorisation.js.affiner_detail") })),
    el("div", { class: "reglages-grille" },
      el("div", { class: "q" }, el("label", { for: "reg-mode-ebe", text: t("valorisation.js.ebe_normatif_ref") }), modeEbe)),
    el("h4", { text: t("valorisation.js.decotes_primes") }), el("p", { class: "petit", text: H.decotes_primes.note }),
    el("div", { class: "decotes" }, ...decotes),
    el("button", { type: "button", class: "btn btn-noir", onclick: async (ev) => {
      const bouton = ev.currentTarget; // emptied after "await"
      bouton.disabled = true;
      // Weighting with the discounted cash flows is no longer offered: an old setting is removed (multiples only)
      delete reg.poids_multiples;
      try { reponses.reglages = reg; await api(`${base}/answers/reglages`, { method: "PUT", body: JSON.stringify({ data: reg }) }); await calculer(); }
      catch (e) { message(e.message, true); } finally { bouton.disabled = false; }
    } }, t("valorisation.js.recalculer")));

  // --- EBITDA bridge
  const pontLignes = [];
  for (const p of r.pont_ebe) {
    pontLignes.push({ cellules: [t("valorisation.js.ebe_comptable", { annee: p.annee }), euros(p.ebe_comptable)] });
    for (const l of p.lignes) pontLignes.push({ classe: "sous", cellules: [`  ${l.libelle}${l.justification ? ` (${l.justification})` : ""}`, `${l.montant >= 0 ? "+" : ""}${euros(l.montant)}`] });
    pontLignes.push({ classe: "total", cellules: [t("valorisation.js.ebe_retraite", { annee: p.annee }), euros(p.ebe_retraite)] });
  }
  pontLignes.push({ classe: "total fort", cellules: [t("valorisation.js.ebe_normatif", { base: r.ebe_normatif.mode === "dernier" ? t("valorisation.js.dernier_exercice") : t("valorisation.js.moyenne", { annees: r.ebe_normatif.annees.join(", ") }) }), euros(r.ebe_normatif.valeur)] });

  // --- From enterprise value to the value of the shares, for the low and high ends of the range
  const pt = r.pont_titres;
  const mult = (x) => `× ${x.toLocaleString(locale())}`;
  const deuxCols = (lib, f) => ({ cellules: [lib, f("bas"), f("haut")] });
  const pontTitres = m.statut === "ok" ? tableau([t("valorisation.js.pont.titre"), t("valorisation.js.pont.bas"), t("valorisation.js.pont.haut")], [
    deuxCols(t("valorisation.js.pont.multiple"), (k) => mult(m.multiples[k])),
    deuxCols(t("valorisation.js.pont.ve"), (k) => euros(m.ve[k])),
    deuxCols(t("valorisation.js.pont.decotes", { facteur: pt.facteur_decotes.toLocaleString(locale(), { maximumFractionDigits: 3 }) }), (k) => euros(m.ve[k] * pt.facteur_decotes - m.ve[k])),
    ...r.dette_nette.lignes.filter((l) => l.montant).map((l) => ({ classe: "sous", cellules: [`  ${l.libelle}`, euros(-l.montant), euros(-l.montant)] })),
    deuxCols(t("valorisation.js.pont.bfr"), () => euros(pt.ecart_bfr)),
    ...(pt.hors_exploitation ? [deuxCols(t("valorisation.js.pont.hors_exploitation"), () => euros(pt.hors_exploitation))] : []),
    { classe: "total fort", cellules: [t("valorisation.js.pont.titres"), euros(m.titres.bas), euros(m.titres.haut)] },
  ], { legende: t("valorisation.js.pont.legende") }) : el("p", { class: "petit", text: t("valorisation.js.pont.non_applicable") });

  // --- Sensitivity to the multiple (value of the shares)
  const sens = r.sensibilites;
  const lignesSens = sens.multiple ? [{ cellules: [t("valorisation.js.sens.ligne"), court(sens.multiple.moins), court(sens.multiple.plus)] }] : [];

  remplacer(zone, 
    el("div", { class: "resultat-tete" }, tete, el("div", { class: "carte" }, el("h3", { text: t("valorisation.js.ff_titre") }), el("p", { class: "petit", text: t("valorisation.js.ff_legende") }), ff)),
    ...(alertes ? [el("details", { class: "carte alertes-repli", open: true }, el("summary", {}, t("valorisation.js.points_attention", { n: alertes.childElementCount })), alertes)] : []),
    el("div", { class: "resultat-deplis" },
    el("details", { class: "carte calcul-detail", open: true }, el("summary", {}, el("strong", { text: t("valorisation.js.comment") })),
    el("div", { class: "resultat-detail" },
      el("section", { class: "carte" }, el("h3", { text: t("valorisation.js.titre_pont_ebe") }), tableau([t("valorisation.js.pont_ebe"), t("demarrer.js.exc.montant")], pontLignes)),
      el("section", { class: "carte" }, el("h3", { text: t("valorisation.js.titre_pont_titres") }), pontTitres),
      el("section", { class: "carte" }, el("h3", { text: t("valorisation.js.titre_ancc") }), tableau([t("valorisation.js.poste"), t("demarrer.js.exc.montant")], [...r.ancc.lignes.filter((l) => l.montant).map((l) => ({ cellules: [l.libelle, euros(l.montant)] })), { classe: "total fort", cellules: [t("valorisation.js.actif_net_corrige"), euros(r.ancc.valeur)] }])),
      lignesSens.length ? el("section", { class: "carte" }, el("h3", { text: t("valorisation.js.sens.titre") }), tableau([t("valorisation.js.sens.variation"), t("valorisation.js.sens.moins"), t("valorisation.js.sens.plus")], lignesSens)) : null)),
    reglages),
    el("p", { class: "petit", text: t("valorisation.js.hypotheses", { version: H.version }) }),
  );
}

// ================================================================== Loading
async function charger() {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace(lien("/espace/")); return; }
  $("#lien-dossier").href = lien(`/espace/?dossier=${id}`);
  document.querySelectorAll(".lien-guide").forEach((a) => { a.href = lien(`/espace/demarrer/?dossier=${id}`); });
  const [dossier, ch, rep] = await Promise.all([api(base), api(`${base}/financials`), api(`${base}/answers`)]);
  dossierCourant = dossier;
  document.title = t("valorisation.js.titre_page", { nom: dossier.entreprise.nom });
  $("#dossier-nom").textContent = dossier.entreprise.nom;
  chiffres = ch; reponses = rep.reponses || {};
  dessinerChiffres();
  majEtatQuestionnaire();
  const v = dossier.parcours?.valorisation;
  if (v) $("#etat-valorisation").textContent = fourchette(v.bas, v.haut);
  montrer();
  $("main").removeAttribute("aria-busy");
}
charger().catch((e) => { if (e.message !== "non_connecte") message(e.message, true); });
