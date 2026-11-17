// Page du mémorandum : site et logo (faits validés un par un), sections rédigées à la demande, impression.
const $ = (s) => document.querySelector(s);
import { CARTE } from "/js/carte-france.js";
import { kEuros, montant, pourcent, ratioTableau, multiple, moisAnnee } from "/js/memo-format.js";
const id = new URLSearchParams(location.search).get("dossier") || "";
const base = `/api/dossiers/${id}/documents/memo`;
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
let etat = null;
function message(t, erreur = false) { const m = $("#message"); m.textContent = t; m.hidden = !t; m.classList.toggle("erreur", erreur); }
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: enJson ? { "content-type": "application/json" } : {} });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Une erreur est survenue.");
  return d;
}

function dessinerSite() {
  const s = etat.site;
  if (s?.url) $("#url-site").value = s.url;
  const faits = s?.faits || [];
  $("#faits").replaceChildren(faits.length ? el("fieldset", { class: "faits" },
    el("legend", { text: `Faits relevés (${faits.filter((f) => f.valide).length}/${faits.length} validés) : cochez ceux qui sont exacts` }),
    ...faits.map((f) => {
      const cb = el("input", { type: "checkbox", id: `fait-${f.id}`, checked: f.valide });
      cb.addEventListener("change", async () => {
        f.valide = cb.checked;
        try { await api(`/api/dossiers/${id}/answers/site`, { method: "PUT", body: JSON.stringify({ data: s }) }); dessinerSite(); $(`#fait-${f.id}`)?.focus(); }
        catch (e) { message(e.message, true); }
      });
      return el("label", { class: "fait", for: `fait-${f.id}` }, cb, el("span", {}, el("span", { text: f.fait }), el("a", { href: f.source, target: "_blank", rel: "noopener", class: "petit", text: " source" })));
    })) : null);
  const logos = s?.logos || [];
  const fichier = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "fichier-logo", class: "visuellement-cache" });
  fichier.addEventListener("change", async () => {
    const f = fichier.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("fichier", f);
    try { etat = await api(`${base}/logo`, { method: "POST", body: fd }); etat.versionPhotos = Date.now(); tout(); message("Logo enregistré."); } catch (e) { message(e.message, true); }
  });
  $("#logos").replaceChildren(el("div", { class: "logos" },
    el("p", { class: "petit", text: etat.logo ? "Logo retenu : voir la couverture ci-dessous. Vous pouvez en choisir un autre." : "Choisissez le logo de l'entreprise (ou déposez-le)." }),
    el("div", { class: "logos-liste" }, ...logos.map((l) => el("button", { type: "button", class: "logo-choix", title: l.origine, onclick: async () => {
      try { etat = await api(`${base}/logo`, { method: "POST", body: JSON.stringify({ url: l.url }) }); tout(); message("Logo enregistré."); } catch (e) { message(e.message, true); }
    } }, el("img", { src: l.url, alt: `Candidat : ${l.origine}`, loading: "lazy", referrerpolicy: "no-referrer" })))),
    el("label", { class: "btn btn-contour btn-mini", for: "fichier-logo" }, "Déposer un logo (PNG, JPEG, WebP)"), fichier));
}

function dessinerPhotos() {
  const s = etat.site || {};
  const atteste = el("input", { type: "checkbox", id: "attestation-photo" });
  const ajouter = async (corpsRequete) => {
    if (!atteste.checked) { message("Cochez d'abord l'attestation : les photos doivent appartenir à l'entreprise.", true); atteste.focus(); return; }
    try { etat = await api(`${base}/photos`, { method: "POST", body: corpsRequete }); etat.versionPhotos = Date.now(); tout(); message("Photo ajoutée."); } catch (e) { message(e.message, true); }
  };
  const fichier = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "fichier-photo", class: "visuellement-cache" });
  fichier.addEventListener("change", () => { const f = fichier.files[0]; if (!f) return; const fd = new FormData(); fd.append("fichier", f); fd.append("attestation", atteste.checked ? "oui" : "non"); ajouter(fd); fichier.value = ""; });
  $("#photos").replaceChildren(el("div", { class: "photos-panneau" },
    el("p", { class: "petit", text: `Photos du mémorandum (${(etat.photos || []).length}/6) : couverture, activité, équipe.` }),
    el("label", { class: "fait", for: "attestation-photo" }, atteste, el("span", { text: "J'atteste que les photos ajoutées appartiennent à l'entreprise ou que j'ai le droit de les utiliser." })),
    el("div", { class: "logos-liste" },
      ...(etat.photos || []).map((ph) => el("div", { class: "photo-choisie" }, el("img", { src: `${base}/photos/${ph.n}?v=${etat.versionPhotos}`, alt: ph.legende || `Photo ${ph.n + 1}` }),
        el("button", { type: "button", class: "lien-simple", onclick: async () => { try { etat = await api(`${base}/photos/${ph.n}`, { method: "DELETE" }); etat.versionPhotos = Date.now(); tout(); } catch (e) { message(e.message, true); } } }, "Retirer"))),
      ...(s.photos_candidates || []).slice(0, 12).map((u) => el("button", { type: "button", class: "logo-choix photo-choix", title: "Ajouter cette photo du site", onclick: () => ajouter(JSON.stringify({ url: u, attestation: atteste.checked })) }, el("img", { src: u, alt: "Photo du site (candidate)", loading: "lazy", referrerpolicy: "no-referrer" })))),
    el("label", { class: "btn btn-contour btn-mini", for: "fichier-photo" }, "Déposer une photo (3 Mo au plus)"), fichier));
}

function dessinerVerrou() {
  const v = etat.deverrouille;
  $("#verrou").replaceChildren(v.ok ? "" : el("div", { class: "message-carte" }, el("p", { text: "Avant de rédiger le mémorandum :" }),
    el("ul", {}, ...v.manque.map((m) => el("li", { text: m }))),
    el("a", { class: "btn btn-noir btn-mini", href: `/espace/valorisation/?dossier=${id}#entreprise` }, "Ouvrir le questionnaire")));
  $("#btn-tout").disabled = !v.ok;
}

// ================================================================== Le mémorandum, présenté comme ceux des banques d'affaires
// Couverture au nom de code, sommaire paginé, synthèse et six points forts numérotés (un par chapitre), titres qui
// affirment, source sous chaque chiffre, compte de résultat, EBE retraité, endettement, périmètre de l'opération.
// Tous les chiffres viennent du serveur (calculés par le code) ; la page ne fait que les mettre en forme.

const pct0 = (x) => pourcent(x, { decimales: 0 });
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...enfants) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...enfants.filter(Boolean)); return e; };
const ok = (v) => typeof v === "number" && Number.isFinite(v);

// Pictogrammes au trait (originaux, 24 × 24)
const ICONES = {
  cadenas: "M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4",
  document: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  poignee: "M3 12l4-4 5 3 4-3 5 4-5 5-4-3-4 3z",
  loupe: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L21 21",
  signature: "M3 17c3-1 4-8 6-8s0 7 3 7 3-4 5-4 2 3 4 3M3 21h18",
};
const icone = (nom, classe = "dp-picto") => svg("svg", { viewBox: "0 0 24 24", class: classe, "aria-hidden": "true" }, svg("path", { d: ICONES[nom] }));

/** Logo Passation (symbole « Le Seuil » + nom). */
const logoPassation = (clair = false) => el("span", { class: `dp-logo-passation${clair ? " clair" : ""}` },
  svg("svg", { viewBox: "0 0 32 32", "aria-hidden": "true" }, svg("path", { d: "M9 27V15a7 7 0 0 1 14 0v12", fill: "none", stroke: "currentColor", "stroke-width": "2.4" }), svg("path", { d: "M5 27h22", stroke: "currentColor", "stroke-width": "2.4" }), svg("circle", { cx: "16", cy: "21", r: "2.8", fill: "#A8653A" })),
  "Passation");

/** Texte avec **gras** → nœuds texte et <strong> (jamais de HTML injecté). */
function enrichi(texte) {
  return String(texte).split(/\*\*(.+?)\*\*/g).map((morceau, i) => (i % 2 ? el("strong", { text: morceau }) : document.createTextNode(morceau)));
}
/** Texte de chapitre → paragraphes et puces séparés. */
function decouperTexte(texte) {
  const paragraphes = [], puces = [];
  for (const b of String(texte || "").split(/\n\s*\n/)) {
    const lignes = b.split("\n").filter((l) => l.trim());
    if (!lignes.length) continue;
    const items = lignes.filter((l) => /^\s*[-•▪]\s+/.test(l));
    if (items.length === lignes.length) puces.push(...lignes.map((l) => l.replace(/^\s*[-•▪]\s+/, "")));
    else paragraphes.push(lignes.join(" "));
  }
  return { paragraphes, puces };
}
/** Bloc de texte courant (découpable sur une page « suite ») : paragraphes puis puces carrées. */
function flux(texte, classe = "") {
  const { paragraphes, puces } = decouperTexte(texte);
  return el("div", { class: `dp-flux ${classe}`.trim() },
    ...paragraphes.map((t) => el("p", {}, ...enrichi(t))),
    ...puces.map((t) => el("p", { class: "dp-puce" }, ...enrichi(t))));
}
const aRediger = (s) => el("div", { class: "dp-flux" }, el("p", { class: "a-rediger", text: s ? `${s} : à rédiger.` : "À compléter." }));

// ------------------------------------------------------------------ Données
const ch = () => etat.chiffres || {};
const cr = () => ch().compte_resultat || { annees: [], lignes: [] };
const serie = (cle) => cr().lignes.find((l) => l.cle === cle)?.valeurs || [];
const derniere = (cle) => serie(cle).at(-1) ?? null;
const section = (cle) => etat.sections.find((s) => s.cle === cle);
const titreDe = (s) => s.titre_affirme || s.titre;
const p = () => etat.profil || {};
const faitsSite = (...cats) => (etat.site?.faits || []).some((f) => f.valide && cats.includes(f.categorie));
const sourceChiffres = () => ch().sources || "chiffres validés par le dirigeant";

/** Ligne de source, sous chaque page de chiffres. */
const source = (...elements) => el("p", { class: "dp-source-ligne" }, `Source${elements.filter(Boolean).length > 1 ? "s" : ""} : ${elements.filter(Boolean).join(" ; ")}`);

/** Chiffre clé, à la manière des tableaux de bord des mémorandums : valeur, libellé, précision. */
const chiffre = (valeur, libelle, precision) => el("div", { class: "dp-chiffre" }, el("span", { class: "dp-chiffre-val", text: valeur }), el("span", { class: "dp-chiffre-lib", text: libelle }), precision ? el("span", { class: "dp-chiffre-plus", text: precision }) : null);
const rangee = (...c) => el("div", { class: "dp-chiffres" }, ...c.filter(Boolean));
const effectifCourt = () => (p().effectif || "n.d.").replace(/^de /, "").replace(/ personnes$/, "").replace(/^plus de (.*) personnes$/, "> $1");

function chiffresFinanciers() {
  const an = cr().annees.at(-1), ca = derniere("chiffre_affaires"), t = cr().tcam;
  const er = ch().ebe_retraite || {}, retraite = er.ebe_retraite?.at(-1), marge = er.marge_retraitee?.at(-1);
  const endet = ch().endettement;
  return [
    ok(ca) ? chiffre(montant(ca), `Chiffre d'affaires ${an}`, t && ok(t.ca) ? `${pourcent(t.ca, { signe: true })} par an depuis ${t.de}` : null) : null,
    ok(retraite) ? chiffre(montant(retraite), `EBE retraité ${an}`, ok(marge) ? `${pourcent(marge)} du chiffre d'affaires` : null) : null,
    endet && ok(endet.total) ? (endet.total <= 0 ? chiffre(montant(-endet.total), `Trésorerie nette ${endet.annee}`, "après dettes financières") : chiffre(montant(endet.total), `Dette nette ${endet.annee}`, ok(endet.sur_ebe) ? `${multiple(endet.sur_ebe)} l'EBE retraité` : null)) : null,
  ];
}

// ------------------------------------------------------------------ Cadre commun des pages
/** Page de chapitre : rubrique et logo, numéro de point fort et titre affirmatif, contenu, source, pied. */
function cadre(s, contenu, { titre = null, suite = false, sources = null } = {}) {
  const i = etat.sections.indexOf(s);
  return el("div", { class: `diapo dp-page dp-${s.cle}`, "data-section": s.cle, id: suite ? null : `s-${s.cle}` },
    el("header", { class: "dp-entete" },
      el("div", { class: "dp-rubrique" }, el("span", { text: `${String(i + 1).padStart(2, "0")} · ${s.court}` }), logoBloc("dp-logo-tete")),
      el("div", { class: "dp-titre-ligne" },
        s.point_fort ? el("span", { class: "dp-badge", text: String(s.point_fort), "aria-label": `Point fort ${s.point_fort}` }) : null,
        el("h3", { text: titre || titreDe(s) + (suite ? " (suite)" : "") }))),
    el("div", { class: "dp-zone" }, ...contenu.filter(Boolean)),
    sources,
    el("footer", { class: "dp-pied" },
      el("span", { text: `${p().nom_de_code || "Projet"} · Mémorandum d'information · ${moisAnnee()}` }),
      el("span", { class: "dp-pied-conf", text: "Strictement confidentiel" }),
      el("span", { class: "dp-num" })));
}
const logoBloc = (classe) => (etat.logo ? el("span", { class: classe }, el("img", { src: `${base}/logo?v=${etat.versionPhotos}`, alt: `Logo de ${etat.entreprise}` })) : el("span", { class: `${classe} dp-logo-texte`, text: etat.entreprise || "" }));

// ------------------------------------------------------------------ Graphiques et tableaux
/** Chiffre d'affaires et EBE par exercice (barres, valeurs écrites). */
function graphiqueFinances() {
  const an = cr().annees, ca = serie("chiffre_affaires"), ebe = serie("ebe");
  if (!an.length) return null;
  const L = 520, H = 250, bas = 214, max = Math.max(...ca.filter(ok), 1);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "dp-graph", role: "img", "aria-label": `Chiffre d'affaires et EBE : ${an.map((a, i) => `${a} : ${montant(ca[i])} et ${montant(ebe[i])}`).join(" ; ")}` });
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "dp-axe" }));
  const pas = L / an.length;
  an.forEach((a, i) => {
    const x0 = i * pas + pas * 0.18, w = pas * 0.3;
    const h1 = ok(ca[i]) ? (ca[i] / max) * 170 : 0, h2 = ok(ebe[i]) ? (Math.max(0, ebe[i]) / max) * 170 : 0;
    g.append(svg("rect", { x: x0, y: bas - h1, width: w, height: h1, class: "dp-barre-ca" }));
    g.append(svg("rect", { x: x0 + w + 4, y: bas - h2, width: w, height: h2, class: "dp-barre-ebe" }));
    const t1 = svg("text", { x: x0 + w / 2, y: bas - h1 - 6, class: "dp-graph-val", "text-anchor": "middle" }); t1.textContent = montant(ca[i]); g.append(t1);
    const t2 = svg("text", { x: x0 + w * 1.5 + 4, y: bas - h2 - 6, class: "dp-graph-val", "text-anchor": "middle" }); t2.textContent = montant(ebe[i]); g.append(t2);
    const ta = svg("text", { x: x0 + w + 2, y: bas + 22, class: "dp-graph-an", "text-anchor": "middle" }); ta.textContent = String(a); g.append(ta);
  });
  return el("figure", { class: "dp-figure" }, el("p", { class: "dp-mini-titre", text: "Chiffre d'affaires et EBE (comptable)" }), g, el("figcaption", { class: "dp-legende" }, el("span", { class: "dp-pastille ca" }), "Chiffre d'affaires", el("span", { class: "dp-pastille ebe" }), "EBE"));
}
/** Marge d'EBE comptable et retraitée (lignes et points, valeurs écrites). */
function graphiqueMarge() {
  const an = cr().annees, m = serie("ebe_pct"), r = ch().ebe_retraite?.marge_retraitee || [];
  const vals = [...m, ...r].filter(ok);
  if (m.filter(ok).length < 2) return null;
  const L = 360, H = 250, bas = 214, haut = 40, mn = Math.min(0, ...vals), mx = Math.max(...vals) * 1.3 || 1;
  const x = (i) => 30 + (i * (L - 60)) / Math.max(1, an.length - 1), y = (v) => bas - ((v - mn) / (mx - mn)) * (bas - haut);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "dp-graph", role: "img", "aria-label": `Marge d'EBE : ${an.map((a, i) => `${a} : ${pourcent(m[i])}`).join(" ; ")}` });
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "dp-axe" }));
  const ligne = (serieV, classe, dessous) => {
    const pts = serieV.map((v, i) => (ok(v) ? [x(i), y(v)] : null)).filter(Boolean);
    if (pts.length < 2) return;
    g.append(svg("polyline", { points: pts.map((q) => q.join(",")).join(" "), class: classe }));
    serieV.forEach((v, i) => { if (!ok(v)) return; g.append(svg("circle", { cx: x(i), cy: y(v), r: 5, class: `${classe}-point` })); const tv = svg("text", { x: x(i), y: y(v) + (dessous ? 24 : -12), class: `dp-graph-val${dessous ? "" : " retraite"}`, "text-anchor": "middle" }); tv.textContent = pourcent(v); g.append(tv); });
  };
  const retraiteDiffere = r.some((v, i) => ok(v) && ok(m[i]) && Math.abs(v - m[i]) > 1e-9);
  if (retraiteDiffere) ligne(r, "dp-ligne-retraitee", false);
  ligne(m, "dp-ligne", retraiteDiffere);
  an.forEach((a, i) => { const ta = svg("text", { x: x(i), y: bas + 22, class: "dp-graph-an", "text-anchor": "middle" }); ta.textContent = String(a); g.append(ta); });
  return el("figure", { class: "dp-figure" }, el("p", { class: "dp-mini-titre", text: "Marge d'EBE" }), g,
    el("figcaption", { class: "dp-legende" }, el("span", { class: "dp-pastille ca" }), "Comptable", retraiteDiffere ? [el("span", { class: "dp-pastille retraite" }), "Retraitée"] : null));
}

/** Tableau financier : en-tête des exercices, lignes typées (total en gras, ratio en italique), négatifs entre parenthèses. */
function tableau({ annees, lignes, enTete = "En k€", colonneSup = null, notes = [] }) {
  return el("div", { class: "dp-tableau-zone" },
    el("table", { class: "dp-tableau" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: enTete }), ...annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })), colonneSup ? el("th", { scope: "col", class: "num sup", text: colonneSup.titre }) : null)),
      el("tbody", {}, ...lignes.map((l) => el("tr", { class: `t-${l.type || "montant"}` },
        el("th", { scope: "row" }, l.libelle, l.renvoi ? el("sup", { text: `(${l.renvoi})` }) : null),
        ...l.valeurs.map((v, k) => el("td", { class: "num", text: !ok(v) && (l.vide === "tiret" || (l.cle === "croissance" && k === 0)) ? "–" : l.type === "ratio" ? ratioTableau(v) : l.type === "texte" ? (ok(v) ? `${Math.round(v)} j` : "n.d.") : kEuros(v) })),
        colonneSup ? el("td", { class: "num sup", text: colonneSup.valeurs[l.cle] ?? "" }) : null)))),
    notes.length ? el("ol", { class: "dp-notes" }, ...notes.map((n) => el("li", { text: n }))) : null);
}

function tableauCompteResultat() {
  const c = cr();
  if (!c.annees.length) return el("p", { class: "a-rediger", text: "Compte de résultat : à compléter (aucun exercice validé)." });
  const t = c.tcam, sup = t && c.annees.length >= 2 ? { titre: `TCAM ${String(t.de).slice(2)}-${String(t.a).slice(2)}`, valeurs: { chiffre_affaires: ok(t.ca) ? pourcent(t.ca, { signe: true }) : "n.d.", ebe: ok(t.ebe) ? pourcent(t.ebe, { signe: true }) : "n.d." } } : null;
  return tableau({ annees: c.annees, lignes: c.lignes, colonneSup: sup, notes: c.consecutifs ? [] : ["Exercices non consécutifs : croissance annualisée entre deux exercices présentés."] });
}

function tableauEbe() {
  const t = ch().ebe_retraite;
  if (!t?.annees?.length) return null;
  const notes = [], lignes = [{ cle: "ebe_comptable", libelle: "EBE comptable", type: "total", valeurs: t.ebe_comptable }];
  for (const r of t.retraitements) {
    let renvoi = null;
    if (r.justification) { notes.push(`${r.libelle} : ${r.justification}`); renvoi = notes.length; }
    lignes.push({ cle: r.cle, libelle: r.libelle, type: "montant", valeurs: r.valeurs, renvoi, vide: "tiret" });
  }
  if (!t.retraitements.length) notes.push("Aucun retraitement déclaré : l'EBE retraité est égal à l'EBE comptable.");
  lignes.push({ cle: "ebe_retraite", libelle: "EBE retraité", type: "total", valeurs: t.ebe_retraite }, { cle: "marge", libelle: "Marge d'EBE retraitée", type: "ratio", valeurs: t.marge_retraitee });
  if (t.normatif && ok(t.normatif.valeur)) notes.push(`EBE normatif retenu : ${montant(t.normatif.valeur)} (${t.normatif.mode === "dernier" ? `exercice ${t.normatif.annees.at(-1)}` : `moyenne ${t.normatif.annees.join(", ")}`}).`);
  return el("div", {}, el("p", { class: "dp-mini-titre", text: "Passage de l'EBE comptable à l'EBE retraité" }), tableau({ annees: t.annees, lignes, notes }));
}

function tableauDette() {
  const e = ch().endettement;
  if (!e) return null;
  const lignes = e.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, type: "montant", valeurs: [l.montant] }));
  lignes.push({ cle: "total", libelle: e.total <= 0 ? "Trésorerie nette" : "Dette financière nette", type: "total", valeurs: [e.total <= 0 ? -e.total : e.total] });
  const notes = ["Dette positive, trésorerie et placements en déduction (entre parenthèses)."];
  if (ok(e.sur_ebe) && e.total > 0) notes.push(`Dette nette / EBE normatif : ${multiple(e.sur_ebe)}.`);
  const bfr = (e.bfr || []).filter((b) => ok(b.jours));
  return el("div", {}, el("p", { class: "dp-mini-titre", text: `Endettement net au 31 décembre ${e.annee ?? ""}`.trim() }),
    tableau({ annees: [e.annee ?? ""], lignes, notes }),
    bfr.length ? el("div", {}, el("p", { class: "dp-mini-titre", text: "Besoin en fonds de roulement d'exploitation" }),
      tableau({ annees: bfr.map((b) => b.annee), enTete: "", lignes: [{ cle: "bfr", libelle: "BFR en k€", type: "montant", valeurs: bfr.map((b) => b.montant) }, { cle: "jours", libelle: "En jours de chiffre d'affaires", type: "texte", valeurs: bfr.map((b) => b.jours) }] })) : null);
}

/** Cinq premiers clients, anonymes : part du chiffre d'affaires (barre), ancienneté de la relation. */
function tableauClients() {
  const c = ch().clients;
  if (!c?.lignes?.length) return null;
  const an = new Date().getFullYear();
  return el("div", { class: "dp-clients" }, el("p", { class: "dp-mini-titre", text: `${c.lignes.length === 5 ? "Les cinq" : "Les"} premiers clients (anonymisés)` }),
    el("table", { class: "dp-tableau dp-tableau-clients" },
      el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Client" }), el("th", { scope: "col", text: "Activité" }), el("th", { scope: "col", text: "Part du chiffre d'affaires" }), el("th", { scope: "col", class: "num", text: "Client depuis" }))),
      el("tbody", {}, ...c.lignes.map((x) => el("tr", {},
        el("th", { scope: "row", text: `Client ${x.rang}` }), el("td", { text: x.secteur || "n.d." }),
        el("td", {}, el("span", { class: "dp-barre-part" }, el("span", { style: `width:${Math.min(100, x.part * 100 / Math.max(...c.lignes.map((y) => y.part)) )}%` })), el("span", { class: "dp-part-val", text: pct0(x.part) })),
        el("td", { class: "num", text: ok(x.anciennete) ? String(an - x.anciennete) : "n.d." }))))));
}

/** Carte des régions : siège, régions des clients, reste du territoire. */
function carteFrance() {
  const q = p();
  const clients = new Set(q.clients?.regions || []);
  const zone = (q.zone || "").toLowerCase();
  const nationale = zone.startsWith("nationale") || zone.startsWith("internationale");
  const g = svg("svg", { viewBox: `-10 -10 ${CARTE.largeur + 20} ${CARTE.hauteur + 20}`, class: "dp-carte-svg", role: "img",
    "aria-label": `Carte de France : siège en ${q.region || "région non renseignée"}${clients.size ? `, clients en ${[...clients].join(", ")}` : ""}${nationale ? ", présence nationale" : ""}` });
  for (const [nom, r] of Object.entries(CARTE.regions)) g.append(svg("path", { d: r.d, class: `dp-region ${nom === q.region ? "siege" : clients.has(nom) ? "clients" : nationale ? "national" : "autre"}` }));
  if (q.region && CARTE.regions[q.region]) {
    const [cx, cy] = CARTE.regions[q.region].centre;
    g.append(svg("circle", { cx, cy, r: 16, class: "dp-carte-siege" }));
  }
  return el("figure", { class: "dp-figure dp-carte-zone" }, g,
    el("figcaption", { class: "dp-legende" }, el("span", { class: "dp-pastille siege" }), "Siège",
      clients.size ? [el("span", { class: "dp-pastille clients" }), "Régions clientes"] : null,
      nationale ? [el("span", { class: "dp-pastille national" }), "Présence nationale"] : null));
}

/** Frise : années citées (texte, création), 6 au plus. */
function frise(texte) {
  const phrases = String(texte).replace(/\*\*/g, "").replace(/\n/g, " ").replace(/\s+-\s+/g, " ").split(/(?<=\.)\s+/);
  const points = new Map();
  if (p().creation) points.set(p().creation, "Création de l'entreprise");
  for (const ph of phrases) for (const m of ph.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (!points.has(Number(m[1]))) points.set(Number(m[1]), ph.replace(/^[-•▪\s]*\d{4}\s*[:–-]\s*/, "").replace(/^./, (c) => c.toUpperCase()).slice(0, 90));
  const l = [...points.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
  if (l.length < 2) return null;
  return el("ol", { class: "dp-frise" }, ...l.map(([a, t]) => el("li", {}, el("span", { class: "dp-frise-an", text: String(a) }), el("span", { class: "dp-frise-point" }), el("span", { class: "dp-frise-txt", text: t }))));
}

/** Schéma du périmètre : cédant, holding éventuelle, société, murs (dans ou hors du périmètre). */
function schemaPerimetre() {
  const pe = ch().perimetre || {};
  const boite = (titre, detail, classe = "") => el("div", { class: `dp-boite ${classe}`.trim() }, el("strong", { text: titre }), detail ? el("span", { text: detail }) : null);
  const fleche = (texte) => el("div", { class: "dp-fleche" }, el("span", { text: texte || "" }));
  const cedant = boite(pe.associes ? "Dirigeant et associés" : "Dirigeant cédant", pe.detention ? null : "Détention des titres : à compléter", "dp-boite-cedant");
  const societe = boite(etat.entreprise || "Société", "Société d'exploitation", "dp-boite-societe");
  const mursDedans = pe.murs === "À l'entreprise elle-même" || (pe.murs_cession || "").startsWith("Oui");
  const murs = pe.murs && pe.murs !== "Pas de locaux en propre"
    ? boite("Murs de l'exploitation", pe.murs === "À l'entreprise elle-même" ? "Détenus par la société" : pe.murs === "À un propriétaire extérieur" ? "Propriétaire extérieur : bail en cours" : `Détenus par le dirigeant ou sa famille · ${pe.murs_cession ? pe.murs_cession.replace(/^Oui, /, "").replace(/^Non, /, "") : "cession à préciser"}`, "dp-boite-murs")
    : null;
  return el("div", { class: "dp-perimetre" },
    el("div", { class: "dp-perimetre-colonne" },
      cedant,
      fleche(pe.part_cedee ? `${pe.part_cedee} cédé${/^100/.test(pe.part_cedee) ? "s" : ""}` : ""),
      pe.holding ? [boite("Holding du cédant", "Société de détention"), fleche("")] : null,
      el("div", { class: "dp-perimetre-cadre" }, el("span", { class: "dp-perimetre-legende", text: "Périmètre de l'opération" }), societe, mursDedans && murs ? murs : null)),
    !mursDedans && murs ? el("div", { class: "dp-perimetre-hors" }, el("span", { class: "dp-perimetre-legende", text: "Hors périmètre" }), murs) : null);
}

/** Étapes indicatives d'un processus de cession (chevrons). */
function processus() {
  const etapes = [["cadenas", "Engagement de confidentialité"], ["document", "Mémorandum et échanges"], ["poignee", "Offres indicatives"], ["loupe", "Audits d'acquisition"], ["signature", "Signature et transmission"]];
  return el("div", { class: "dp-processus" }, el("p", { class: "dp-mini-titre", text: "Déroulement indicatif du processus" }),
    el("ol", {}, ...etapes.map(([ic, t], k) => el("li", {}, icone(ic, "dp-kpi-icone"), el("span", { class: "dp-etape-num", text: String(k + 1) }), el("span", { text: t })))));
}

const photoUrl = (n) => (etat.photos?.[n] ? `${base}/photos/${n}?v=${etat.versionPhotos}` : null);
function photo(n) {
  const u = photoUrl(n);
  if (!u) return null;
  return el("figure", { class: "dp-photo" }, el("img", { src: u, alt: etat.photos[n].legende || "Photo de l'entreprise" }), etat.photos[n].legende ? el("figcaption", { text: etat.photos[n].legende }) : null);
}

// ------------------------------------------------------------------ Pages
const SOURCES = {
  publiques: "registres publics (INSEE, INPI)",
  site: "site internet de l'entreprise",
  dirigeant: "déclarations du dirigeant",
  calculs: "calculs Passation",
};

function pagesSynthese(s) {
  const pages = [];
  const q = p(), an = cr().annees.at(-1), cl = ch().clients || {};
  const age = q.creation ? `${new Date().getFullYear() - q.creation} ans` : null;
  pages.push(cadre(s, [
    rangee(...chiffresFinanciers(), chiffre(effectifCourt(), "Salariés", q.secteur || null), age ? chiffre(age, "D'existence", `Créée en ${q.creation}`) : null,
      ok(cl.recurrent) ? chiffre(pct0(cl.recurrent), "Chiffre d'affaires récurrent", "déclaré par le dirigeant") : null),
    el("div", { class: "dp-split dp-split-synthese" },
      s.redigee ? flux(s.contenu) : aRediger("La synthèse"),
      el("aside", { class: "dp-encadre" }, el("p", { class: "dp-mini-titre", text: "L'opération envisagée" }),
        el("dl", {}, ...[["Part du capital cédée", q.operation?.part_cedee], ["Motif du cédant", q.operation?.motif], ["Calendrier souhaité", q.operation?.calendrier], ["Accompagnement", q.operation?.accompagnement]]
          .map(([t, v]) => el("div", {}, el("dt", { text: t }), el("dd", { text: v || "À compléter" }))))))
  ], { sources: source(sourceChiffres(), SOURCES.publiques, SOURCES.dirigeant, SOURCES.calculs) }));
  // Les six points forts : le titre affirmatif de chaque chapitre, son accroche et sa page
  pages.push(cadre(s, [
    el("ol", { class: "dp-points-forts" }, ...etat.sections.filter((x) => x.point_fort).map((x) => el("li", {},
      el("span", { class: "dp-badge", text: String(x.point_fort) }),
      el("div", {}, el("strong", { text: titreDe(x) }), x.accroche ? el("span", { text: x.accroche }) : null),
      el("a", { class: "dp-renvoi", href: `#s-${x.cle}`, "data-renvoi": x.cle, text: "p. –" }))))
  ], { titre: "Les six points forts du dossier", suite: true }));
  return pages;
}

function pageChapitre(s) {
  const q = p(), cl = ch().clients || {};
  const texte = s.redigee ? flux(s.contenu) : aRediger(s.court);
  switch (s.cle) {
    case "histoire":
      return [cadre(s, [rangee(q.creation ? chiffre(String(q.creation), "Année de création") : null, q.creation ? chiffre(`${new Date().getFullYear() - q.creation} ans`, "D'existence") : null, chiffre(q.region || "n.d.", "Région du siège", q.ville || null)),
        s.redigee ? frise(s.contenu) : null, el("div", { class: "dp-deux-col-zone" }, texte)],
        { sources: source(SOURCES.publiques, faitsSite("histoire", "implantation") ? SOURCES.site : null, SOURCES.dirigeant) })];
    case "activite": {
      const ph = photo(0);
      return [cadre(s, [rangee(q.secteur ? chiffre(q.secteur, "Secteur", "nomenclature INSEE") : null, chiffre(effectifCourt(), "Salariés", "tranche INSEE"), q.zone ? chiffre(q.zone, "Zone commerciale") : null, ok(derniere("chiffre_affaires")) ? chiffre(montant(derniere("chiffre_affaires")), `Chiffre d'affaires ${cr().annees.at(-1)}`) : null),
        ph ? el("div", { class: "dp-split" }, texte, ph) : texte], { sources: source(SOURCES.publiques, SOURCES.dirigeant, faitsSite("activite", "produits", "qualite") ? SOURCES.site : null) })];
    }
    case "marche":
      return [cadre(s, [
        rangee(ok(cl.premier) ? chiffre(pct0(cl.premier), "Premier client", "part du chiffre d'affaires") : null, ok(cl.cinq) && cl.cinq_complet ? chiffre(pct0(cl.cinq), "Cinq premiers clients", "part du chiffre d'affaires") : null,
          ok(cl.recurrent) ? chiffre(pct0(cl.recurrent), "Chiffre d'affaires récurrent") : null, q.zone ? chiffre(q.zone, "Zone commerciale") : null),
        el("div", { class: "dp-split dp-split-carte" }, el("div", {}, tableauClients(), carteFrance()), texte)
      ], { sources: source(SOURCES.dirigeant, faitsSite("clients", "marche") ? SOURCES.site : null, "fond de carte IGN Admin Express (Licence ouverte)") })];
    case "organisation": {
      const ph = photo(1);
      return [cadre(s, [rangee(chiffre(effectifCourt(), "Salariés", "tranche INSEE"), q.creation ? chiffre(String(q.creation), "Création") : null, chiffre(q.ville || "n.d.", "Site principal")),
        ph ? el("div", { class: "dp-split" }, texte, ph) : texte], { sources: source(SOURCES.publiques, SOURCES.dirigeant, faitsSite("equipe") ? SOURCES.site : null) })];
    }
    case "finances": {
      const src = () => source(sourceChiffres(), "retraitements déclarés par le dirigeant", SOURCES.calculs); // une ligne par page
      return [
        cadre(s, [rangee(...chiffresFinanciers()), el("div", { class: "dp-split dp-split-graph" }, graphiqueFinances(), graphiqueMarge())], { sources: src() }),
        cadre(s, [el("div", { class: "dp-split dp-split-tableau" }, texte, tableauCompteResultat())], { titre: `Compte de résultat ${cr().annees.length ? `${cr().annees[0]}-${cr().annees.at(-1)}` : ""}`.trim(), suite: true, sources: src() }),
        cadre(s, [el("div", { class: "dp-split dp-split-tableaux" }, tableauEbe(), tableauDette())], { titre: "De l'EBE comptable à l'EBE retraité ; endettement net", suite: true, sources: src() }),
      ];
    }
    case "perspectives":
      return [cadre(s, [rangee(ok(q.perspectives?.croissance) ? chiffre(`${pourcent(q.perspectives.croissance, { signe: true, decimales: 0 })} par an`, "Croissance anticipée", "estimation du dirigeant, non auditée") : null,
        ok(q.perspectives?.marge_ebe) ? chiffre(pourcent(q.perspectives.marge_ebe, { decimales: 0 }), "Marge d'EBE visée", "estimation du dirigeant") : null,
        ok(cr().tcam?.ca) ? chiffre(`${pourcent(cr().tcam.ca, { signe: true })} par an`, "Croissance historique", `${cr().tcam.de}-${cr().tcam.a}`) : null), texte],
        { sources: source(SOURCES.dirigeant, ok(cr().tcam?.ca) ? sourceChiffres() : null, faitsSite("autre") ? SOURCES.site : null) })];
    case "operation":
      return [cadre(s, [el("div", { class: "dp-split dp-split-operation" }, el("div", {}, el("p", { class: "dp-mini-titre", text: "Périmètre de l'opération" }), schemaPerimetre()), texte), processus()],
        { sources: source(SOURCES.dirigeant) })];
    default:
      return [cadre(s, [texte])];
  }
}

function dessinerMemo() {
  etat.versionPhotos ??= Date.now();
  const q = p();
  const enfants = [];
  // Couverture : le nom de code seul, jamais le nom de l'entreprise ni sa photo (le document peut traîner sur un bureau)
  enfants.push(el("div", { class: "diapo dp-couverture" },
    el("div", { class: "dp-couv-panneau" },
      el("div", { class: "dp-couv-haut" }, el("span", { class: "dp-ruban", text: "Strictement confidentiel" })),
      el("div", { class: "dp-couv-centre" }, el("p", { class: "dp-etiquette", text: "Mémorandum d'information" }), el("h2", { text: q.nom_de_code || "Projet" }),
        el("p", { class: "dp-sous-titre", text: [q.secteur, q.region].filter(Boolean).join(" · ") }), el("span", { class: "dp-filet" })),
      el("div", { class: "dp-couv-bas" }, el("span", { text: moisAnnee().replace(/^./, (c) => c.toUpperCase()) }), logoPassation(true))),
    el("div", { class: "dp-couv-photo dp-couv-texture" })));
  // Sommaire : chapitres et pages (numéros posés après le découpage)
  enfants.push(el("div", { class: "diapo dp-sommaire" },
    el("div", { class: "dp-som-liste" }, el("p", { class: "dp-etiquette", text: "Sommaire" }),
      el("ol", {}, ...etat.sections.map((s, i) => el("li", {}, el("span", { class: "dp-li-num", text: String(i + 1).padStart(2, "0") }),
        el("a", { href: `#s-${s.cle}` }, el("strong", { text: s.court }), el("span", { text: titreDe(s) })), el("span", { class: "dp-som-page", "data-renvoi": s.cle, text: "" })))),
      logoPassation())));
  etat.sections.forEach((s) => {
    enfants.push(...(s.cle === "synthese" ? pagesSynthese(s) : pageChapitre(s)));
    const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
      el("strong", { class: "petit", text: s.court }),
      s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
      s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: "À compléter : " }), s.a_completer.join(" ; ")) : null,
      el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
      s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, "Modifier") : null);
    enfants.push(outils);
  });
  // Avertissement (dernière page)
  enfants.push(el("div", { class: "diapo dp-fin" },
    el("div", { class: "dp-fin-texte" }, el("p", { class: "dp-etiquette", text: "Avertissement" }),
      el("p", { text: "Ce mémorandum a été établi à partir d'informations fournies par le dirigeant et de données publiques. Il n'a fait l'objet d'aucun audit. Il ne constitue ni une offre, ni un engagement, et ne remplace pas les vérifications d'usage (audit comptable, juridique, social et fiscal)." }),
      el("p", { text: "Il est remis sous engagement de confidentialité : toute reproduction ou diffusion, totale ou partielle, est interdite." }),
      el("p", { class: "dp-contact", text: "Contact : par l'intermédiaire de Passation" }), logoPassation()),
    el("div", { class: "dp-fin-photo dp-couv-texture" })));
  $("#memo").replaceChildren(...enfants);
  decouper();
  // Numérotation : couverture = 1 ; renvois du sommaire et des points forts
  const diapos = [...$("#memo").querySelectorAll(".diapo")];
  diapos.forEach((d, k) => { const n = d.querySelector(".dp-num"); if (n) n.textContent = String(k + 1); });
  const premiere = (cle) => diapos.findIndex((d) => d.dataset.section === cle) + 1;
  $("#memo").querySelectorAll("[data-renvoi]").forEach((r) => { const n = premiere(r.dataset.renvoi); r.textContent = n > 0 ? (r.classList.contains("dp-renvoi") ? `p. ${n}` : String(n)) : ""; });
}

/** Chapitre trop long : les derniers paragraphes du texte courant passent sur une page « (suite) ». */
function decouper() {
  for (const d of [...$("#memo").querySelectorAll(".dp-page")]) {
    let courante = d;
    for (let garde = 0; garde < 5; garde++) {
      const zone = courante.querySelector(".dp-zone"), texte = courante.querySelector(".dp-flux");
      if (!texte || zone.scrollHeight <= zone.clientHeight + 2 || texte.children.length < 2) break;
      const reports = [];
      while (zone.scrollHeight > zone.clientHeight + 2 && texte.children.length > 1) reports.unshift(texte.removeChild(texte.lastElementChild));
      const s = section(courante.dataset.section);
      const suite = cadre(s, [el("div", { class: "dp-flux dp-deux-col" }, ...reports)], { suite: true, sources: courante.querySelector(".dp-source-ligne")?.cloneNode(true) });
      courante.after(suite);
      courante = suite;
    }
  }
}

function editer(outils, s) {
  const titre = el("input", { type: "text", maxlength: "110", value: s.titre_affirme || "", "aria-label": `Titre du chapitre ${s.court}`, placeholder: s.titre });
  const ta = el("textarea", { rows: "12", "aria-label": `Texte : ${s.court}` }); ta.value = s.contenu;
  const ok = el("button", { type: "button", class: "btn btn-noir btn-mini" }, "Enregistrer");
  ok.addEventListener("click", async () => {
    try { etat = await api(`${base}/sections/${s.cle}`, { method: "PUT", body: JSON.stringify({ titre: titre.value, contenu: ta.value }) }); tout(); message("Chapitre enregistré."); } catch (e) { message(e.message, true); }
  });
  outils.replaceChildren(el("label", { class: "petit", text: "Titre (la conclusion du chapitre, une ligne)" }), titre,
    el("label", { class: "petit", text: "Texte (« - » en début de ligne pour une puce, **gras** pour le fait clé)" }), ta,
    el("div", { class: "doc-edition" }, ok, el("button", { type: "button", class: "lien-simple", onclick: tout }, "Annuler")));
  titre.focus();
}
async function rediger(cle, bouton) {
  if (bouton) bouton.disabled = true;
  message(`Rédaction de la section en cours… (20 secondes environ)`);
  try { etat = await api(`${base}/sections/${cle}`, { method: "POST" }); tout(); message("Section rédigée. Relisez-la avant toute diffusion."); $(`#s-${cle}`)?.scrollIntoView({ block: "start" }); }
  catch (e) { message(e.message, true); if (bouton) bouton.disabled = false; }
}
function tout() { dessinerVerrou(); dessinerSite(); dessinerPhotos(); dessinerMemo(); }

$("#form-site").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const b = ev.target.querySelector("button"); b.disabled = true;
  message("Lecture du site en cours… (une minute environ)");
  try { etat = await api(`${base}/site`, { method: "POST", body: JSON.stringify({ url: $("#url-site").value }) }); tout(); message(`${etat.site.faits.length} faits relevés sur ${etat.site.pages.length} pages. Cochez ceux qui sont exacts : seuls ceux-là seront utilisés.`); }
  catch (e) { message(e.message, true); }
  finally { b.disabled = false; }
});
$("#btn-tout").addEventListener("click", async (ev) => {
  const b = ev.currentTarget; b.disabled = true;
  for (const s of etat.sections.filter((x) => !x.redigee)) await rediger(s.cle);
  b.disabled = false;
});
$("#btn-imprimer").addEventListener("click", () => window.print());
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace("/espace/"); return; }
  $("#lien-dossier").href = `/espace/?dossier=${id}`;
  try { etat = await api(base); tout(); } catch (e) { if (e.message !== "non connecté") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
})();
