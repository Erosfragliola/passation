// Page du mémorandum : site et logo (faits validés un par un), sections rédigées à la demande, impression.
const $ = (s) => document.querySelector(s);
import { CARTE } from "/js/carte-france.js";
const id = new URLSearchParams(location.search).get("dossier") || "";
const base = `/api/dossiers/${id}/documents/memo`;
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
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

/** Texte de section → paragraphes et listes (texte brut, jamais de HTML injecté). */
function corps(texte) {
  const blocs = [];
  for (const b of String(texte).split(/\n\s*\n/)) {
    const lignes = b.split("\n").filter((l) => l.trim());
    if (!lignes.length) continue;
    if (lignes.every((l) => /^\s*[-•]\s+/.test(l))) blocs.push(el("ul", {}, ...lignes.map((l) => el("li", { text: l.replace(/^\s*[-•]\s+/, "") }))));
    else blocs.push(el("p", { text: lignes.join(" ") }));
  }
  return blocs;
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

const court = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€` : `${Math.round(v / 1e3).toLocaleString("fr-FR")} k€`);
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...enfants) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...enfants.filter(Boolean)); return e; };
const COURTS = { synthese: "Synthèse", histoire: "Histoire", activite: "Activité", marche: "Marché et clients", organisation: "Organisation", finances: "Finances", perspectives: "Perspectives", operation: "Opération" };

// Pictogrammes au trait (originaux, 24 × 24), pour les indicateurs et les cartes
const ICONES = {
  valide: "M5 12l4 4 10-10",
  equipe: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m2-5c3 0 6 2 6 5",
  croissance: "M3 17l6-6 4 4 8-8M15 7h6v6",
  qualite: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  activite: "M3 12h4l3-8 4 16 3-8h4",
  metier: "M4 7h16v12H4zM9 7V4h6v3",
  euro: "M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9",
  pourcent: "M6 18L18 6M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  calendrier: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  lieu: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  poignee: "M3 12l4-4 5 3 4-3 5 4-5 5-4-3-4 3z",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2",
  document: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  loupe: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L21 21",
  signature: "M3 17c3-1 4-8 6-8s0 7 3 7 3-4 5-4 2 3 4 3M3 21h18",
  cadenas: "M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
};
const ORDRE_CARTES = ["valide", "equipe", "croissance", "qualite", "activite", "metier"];
const icone = (nom, classe = "dp-picto") => svg("svg", { viewBox: "0 0 24 24", class: classe, "aria-hidden": "true" }, svg("path", { d: ICONES[nom] || ICONES.valide }));
const picto = (i) => icone(ORDRE_CARTES[i % ORDRE_CARTES.length]);

/** Indicateur à pictogramme : icône, valeur, libellé, précision éventuelle. */
const kpi = (nom, valeur, libelle, precision) => el("div", { class: "dp-kpi" }, icone(nom, "dp-kpi-icone"), el("div", {}, el("span", { class: "dp-kpi-val", text: valeur }), el("span", { class: "dp-kpi-lib", text: libelle }), precision ? el("span", { class: "dp-kpi-plus", text: precision }) : null));
const rangeeKpi = (...k) => el("div", { class: "dp-kpis-ligne" }, ...k.filter(Boolean));

/** Logo Passation (symbole « Le Seuil » + nom), en bas à droite de chaque diapositive. */
const logoPassation = (clair = false) => el("span", { class: `dp-logo-passation${clair ? " clair" : ""}` },
  svg("svg", { viewBox: "0 0 32 32", "aria-hidden": "true" }, svg("path", { d: "M9 27V15a7 7 0 0 1 14 0v12", fill: "none", stroke: "currentColor", "stroke-width": "2.4" }), svg("path", { d: "M5 27h22", stroke: "currentColor", "stroke-width": "2.4" }), svg("circle", { cx: "16", cy: "21", r: "2.8", fill: "#A8653A" })),
  "Passation");

/** Texte → paragraphes et puces séparés (pour placer les puces en cartes). */
function decouperTexte(texte) {
  const paragraphes = [], puces = [];
  for (const b of String(texte || "").split(/\n\s*\n/)) {
    const lignes = b.split("\n").filter((l) => l.trim());
    if (lignes.length && lignes.every((l) => /^\s*[-•]\s+/.test(l))) puces.push(...lignes.map((l) => l.replace(/^\s*[-•]\s+/, "")));
    else if (lignes.length) paragraphes.push(lignes.join(" "));
  }
  return { paragraphes, puces };
}
const paras = (l) => l.map((t) => el("p", { text: t }));

function tableauFinancier() {
  const t = etat.tableau;
  if (!t.annees.length) return el("p", { class: "a-rediger", text: "Tableau financier : À compléter (aucun exercice validé)." });
  return el("table", { class: "dp-tableau" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "En k€" }), ...t.annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })))),
    el("tbody", {}, ...t.lignes.map((l) => el("tr", {}, el("th", { scope: "row", text: l.libelle }), ...l.valeurs.map((v) => el("td", { class: "num", text: v == null ? "–" : fmt.format(Math.round(v / 1000)) }))))));
}
const effectifCourt = () => (etat.profil?.effectif || "–").replace(/^de /, "").replace(/ personnes$/, "").replace(/^plus de (.*) personnes$/, "> $1");
const derniere = (cle) => etat.tableau.lignes.find((l) => l.cle === cle)?.valeurs.at(-1) ?? null;
function tuiles(liste) {
  return el("div", { class: "dp-tuiles" }, ...liste.map(([l, x]) => el("div", { class: "dp-tuile" }, el("span", { class: "dp-tuile-val", text: x }), el("span", { class: "dp-tuile-lib", text: l }))));
}
const serie = (cle) => etat.tableau.lignes.find((l) => l.cle === cle)?.valeurs || [];
function tcam() {
  const ca = serie("chiffre_affaires"), an = etat.tableau.annees;
  if (an.length < 2 || !(ca[0] > 0) || !(ca.at(-1) > 0)) return null;
  return Math.pow(ca.at(-1) / ca[0], 1 / (an.at(-1) - an[0])) - 1;
}
const signe = (x) => (x == null ? null : `${x >= 0 ? "+" : ""}${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);
function chiffresCles() {
  const ca = derniere("chiffre_affaires"), ebe = derniere("ebe"), an = etat.tableau.annees.at(-1), t = tcam();
  return rangeeKpi(
    kpi("euro", court(ca), `Chiffre d'affaires ${an ?? ""}`, t != null ? `${signe(t)} par an depuis ${etat.tableau.annees[0]}` : null),
    kpi("activite", court(ebe), "EBE", null),
    kpi("pourcent", ca > 0 && ebe != null ? `${((ebe / ca) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "–", "Marge d'EBE"),
    kpi("equipe", effectifCourt(), "Salariés"));
}

/** Graphique : chiffre d'affaires et EBE (barres) par exercice, valeurs écrites. */
function graphiqueFinances() {
  const t = etat.tableau, ca = serie("chiffre_affaires"), ebe = serie("ebe");
  if (!t.annees.length) return null;
  const L = 520, H = 250, bas = 214, max = Math.max(...ca.filter(Number.isFinite), 1);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "dp-graph", role: "img", "aria-label": `Chiffre d'affaires et EBE : ${t.annees.map((a, i) => `${a} : ${court(ca[i])} et ${court(ebe[i])}`).join(" ; ")}` });
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "dp-axe" }));
  const pas = L / t.annees.length;
  t.annees.forEach((a, i) => {
    const x0 = i * pas + pas * 0.18, w = pas * 0.3;
    const h1 = Number.isFinite(ca[i]) ? (ca[i] / max) * 170 : 0, h2 = Number.isFinite(ebe[i]) ? (ebe[i] / max) * 170 : 0;
    g.append(svg("rect", { x: x0, y: bas - h1, width: w, height: h1, rx: 3, class: "dp-barre-ca" }));
    g.append(svg("rect", { x: x0 + w + 4, y: bas - h2, width: w, height: h2, rx: 3, class: "dp-barre-ebe" }));
    const t1 = svg("text", { x: x0 + w / 2, y: bas - h1 - 6, class: "dp-graph-val", "text-anchor": "middle" }); t1.textContent = court(ca[i]); g.append(t1);
    const t2 = svg("text", { x: x0 + w * 1.5 + 4, y: bas - h2 - 6, class: "dp-graph-val", "text-anchor": "middle" }); t2.textContent = court(ebe[i]); g.append(t2);
    const ta = svg("text", { x: x0 + w + 2, y: bas + 22, class: "dp-graph-an", "text-anchor": "middle" }); ta.textContent = String(a); g.append(ta);
  });
  return el("figure", { class: "dp-figure" }, el("p", { class: "dp-mini-titre", text: "Chiffre d'affaires et EBE" }), g, el("figcaption", { class: "dp-legende" }, el("span", { class: "dp-pastille ca" }), "Chiffre d'affaires", el("span", { class: "dp-pastille ebe" }), "EBE"));
}
/** Évolution de la marge d'EBE (ligne et points, valeurs écrites). */
function graphiqueMarge() {
  const t = etat.tableau, ca = serie("chiffre_affaires"), ebe = serie("ebe");
  const m = t.annees.map((_, i) => (ca[i] > 0 && Number.isFinite(ebe[i]) ? ebe[i] / ca[i] : null));
  if (m.filter((x) => x != null).length < 2) return null;
  const L = 360, H = 250, bas = 214, haut = 40, vals = m.filter((x) => x != null), mn = Math.min(0, ...vals), mx = Math.max(...vals) * 1.25;
  const x = (i) => 30 + (i * (L - 60)) / Math.max(1, t.annees.length - 1), y = (v) => bas - ((v - mn) / (mx - mn)) * (bas - haut);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "dp-graph", role: "img", "aria-label": `Marge d'EBE : ${t.annees.map((a, i) => `${a} : ${m[i] == null ? "non disponible" : `${(m[i] * 100).toFixed(1)} %`}`).join(" ; ")}` });
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "dp-axe" }));
  const pts = m.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  g.append(svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "dp-ligne" }));
  m.forEach((v, i) => {
    const ta = svg("text", { x: x(i), y: bas + 22, class: "dp-graph-an", "text-anchor": "middle" }); ta.textContent = String(t.annees[i]); g.append(ta);
    if (v == null) return;
    g.append(svg("circle", { cx: x(i), cy: y(v), r: 6, class: "dp-point" }));
    const tv = svg("text", { x: x(i), y: y(v) - 14, class: "dp-graph-val", "text-anchor": "middle" }); tv.textContent = `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`; g.append(tv);
  });
  return el("figure", { class: "dp-figure" }, el("p", { class: "dp-mini-titre", text: "Marge d'EBE" }), g);
}

/** Carte des régions : siège, régions des clients, reste du territoire. */
function carteFrance() {
  const p = etat.profil || {};
  const clients = new Set(p.clients?.regions || []);
  const zone = (p.zone || "").toLowerCase();
  const nationale = zone.startsWith("nationale") || zone.startsWith("internationale");
  const g = svg("svg", { viewBox: `-10 -10 ${CARTE.largeur + 20} ${CARTE.hauteur + 20}`, class: "dp-carte-svg", role: "img",
    "aria-label": `Carte de France : siège en ${p.region || "région non renseignée"}${clients.size ? `, clients en ${[...clients].join(", ")}` : ""}${nationale ? ", présence nationale" : ""}` });
  for (const [nom, r] of Object.entries(CARTE.regions)) {
    const classe = nom === p.region ? "siege" : clients.has(nom) ? "clients" : nationale ? "national" : "autre";
    g.append(svg("path", { d: r.d, class: `dp-region ${classe}` }));
  }
  if (p.region && CARTE.regions[p.region]) {
    const [cx, cy] = CARTE.regions[p.region].centre;
    g.append(svg("circle", { cx, cy, r: 16, class: "dp-carte-siege" }));
    const t = svg("text", { x: cx, y: cy - 28, class: "dp-carte-txt", "text-anchor": "middle" }); t.textContent = p.ville || "Siège"; g.append(t);
  }
  return el("figure", { class: "dp-figure dp-carte-zone" }, g,
    el("figcaption", { class: "dp-legende" },
      el("span", { class: "dp-pastille siege" }), "Siège",
      clients.size ? [el("span", { class: "dp-pastille clients" }), "Régions clientes"] : null,
      nationale ? [el("span", { class: "dp-pastille national" }), "Présence nationale"] : null),
    el("p", { class: "dp-source", text: "Fond de carte : IGN Admin Express, Licence ouverte." }));
}

/** Répartition du chiffre d'affaires en anneau, à partir de puces du type « Libellé : environ 45 % ». */
function repartitionAnneau(puces) {
  const items = puces.map((p) => { const m = /^(.*?)\s*[:–-]\s*(?:environ\s*)?(\d{1,3})\s*%/i.exec(p); return m ? { lib: m[1].replace(/\s*\(.*?\)\s*/g, " ").trim(), v: Number(m[2]) } : null; }).filter(Boolean);
  if (items.length < 2) return null;
  const teintes = ["#1E3A2E", "#4E7A63", "#9DB8A8", "#C9A37E", "#E3D4BC"];
  const r = 70, c = 2 * Math.PI * r, total = items.reduce((a, x) => a + x.v, 0) || 1;
  const g = svg("svg", { viewBox: "0 0 200 200", class: "dp-donut", role: "img", "aria-label": `Répartition du chiffre d'affaires : ${items.map((x) => `${x.lib} ${x.v} %`).join(", ")}` });
  let cumul = 0;
  items.forEach((x, i) => {
    const part = x.v / total;
    g.append(svg("circle", { cx: 100, cy: 100, r, fill: "none", stroke: teintes[i % teintes.length], "stroke-width": 34, "stroke-dasharray": `${Math.max(0, c * part - 3)} ${c}`, "stroke-dashoffset": String(-c * cumul), transform: "rotate(-90 100 100)" }));
    cumul += part;
  });
  return el("div", { class: "dp-repart-donut" }, el("p", { class: "dp-mini-titre", text: "Répartition du chiffre d'affaires" }),
    el("div", { class: "dp-donut-grille" }, g, el("ul", { class: "dp-donut-legende" }, ...items.map((x, i) => el("li", {}, el("span", { class: "dp-pastille", style: `background:${teintes[i % teintes.length]}` }), el("span", { text: x.lib }), el("strong", { text: `${x.v} %` }))))));
}

/** Étapes indicatives d'un processus de cession (diagramme en chevrons). */
function processus() {
  const etapes = [["cadenas", "Engagement de confidentialité"], ["document", "Mémorandum et échanges"], ["poignee", "Offres indicatives"], ["loupe", "Audits d'acquisition"], ["signature", "Signature et transmission"]];
  return el("div", { class: "dp-processus" }, el("p", { class: "dp-mini-titre", text: "Déroulement indicatif du processus" }),
    el("ol", {}, ...etapes.map(([ic, t], k) => el("li", {}, icone(ic, "dp-kpi-icone"), el("span", { class: "dp-etape-num", text: String(k + 1) }), el("span", { text: t })))));
}

/** Anneau de pourcentage (concentration clients, récurrence). */
function anneau(valeur, libelle) {
  const r = 34, c = 2 * Math.PI * r, v = Number.isFinite(valeur) ? Math.max(0, Math.min(1, valeur)) : null;
  const g = svg("svg", { viewBox: "0 0 90 90", class: "dp-anneau", "aria-hidden": "true" },
    svg("circle", { cx: 45, cy: 45, r, class: "dp-anneau-fond" }),
    v != null ? svg("circle", { cx: 45, cy: 45, r, class: "dp-anneau-val", "stroke-dasharray": `${c * v} ${c}`, transform: "rotate(-90 45 45)" }) : null);
  return el("div", { class: "dp-kpi-anneau" }, el("div", { class: "dp-anneau-boite" }, g, el("span", { class: "dp-anneau-txt", text: v == null ? "–" : pct(v) })), el("span", { class: "dp-tuile-lib", text: libelle }));
}

/** Barres horizontales de répartition, à partir de puces du type « Libellé : environ 45 % ». */
function repartition(puces) {
  const items = puces.map((p) => { const m = /^(.*?)\s*[:–-]\s*(?:environ\s*)?(\d{1,3})\s*%/i.exec(p); return m ? { lib: m[1].replace(/\s*\(.*?\)\s*/g, " ").trim(), v: Number(m[2]) } : null; }).filter(Boolean);
  if (items.length < 2) return null;
  return el("div", { class: "dp-repart" }, el("p", { class: "dp-mini-titre", text: "Répartition du chiffre d'affaires" }),
    ...items.map((x) => el("div", { class: "dp-repart-ligne" }, el("span", { class: "dp-repart-lib", text: x.lib }), el("span", { class: "dp-repart-barre" }, el("span", { style: `width:${x.v}%` })), el("span", { class: "dp-repart-v", text: `${x.v} %` }))));
}

/** Frise : années citées (texte, création, frise publique), 6 au plus. */
function frise(texte) {
  const phrases = String(texte).replace(/\n/g, " ").split(/(?<=\.)\s+/);
  const points = new Map();
  if (etat.profil?.creation) points.set(etat.profil.creation, "Création de l'entreprise");
  for (const ph of phrases) for (const m of ph.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (!points.has(Number(m[1]))) points.set(Number(m[1]), ph.length > 95 ? `${ph.slice(0, 92)}…` : ph);
  const l = [...points.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
  if (l.length < 2) return null;
  return el("ol", { class: "dp-frise" }, ...l.map(([a, t]) => el("li", {}, el("span", { class: "dp-frise-an", text: String(a) }), el("span", { class: "dp-frise-point" }), el("span", { class: "dp-frise-txt", text: t }))));
}

const photoUrl = (n) => (etat.photos?.[n] ? `${base}/photos/${n}?v=${etat.versionPhotos}` : null);
function photo(n, classe = "dp-photo") {
  const u = photoUrl(n);
  if (!u) return el("div", { class: `${classe} dp-photo-vide` }, el("span", { text: "Photo de l'entreprise à ajouter" }));
  return el("figure", { class: classe }, el("img", { src: u, alt: etat.photos[n].legende || "Photo de l'entreprise" }), etat.photos[n].legende ? el("figcaption", { text: etat.photos[n].legende }) : null);
}
const logoBloc = (classe = "dp-logo") => (etat.logo ? el("span", { class: classe }, el("img", { src: `${base}/logo?v=${etat.versionPhotos}`, alt: `Logo de ${etat.entreprise}` })) : el("span", { class: `${classe} dp-logo-texte`, text: etat.entreprise || "" }));

/** Cadre commun : bandeau latéral (logo, chapitres, confidentialité), titre, pied. */
function cadre(s, i, contenu, { suite = false } = {}) {
  return el("div", { class: `diapo dp-page dp-${s.cle}`, "data-section": s.cle, "data-index": String(i), id: suite ? null : `s-${s.cle}` },
    el("aside", { class: "dp-bandeau" },
      logoBloc(),
      el("ol", { class: "dp-chapitres" }, ...etat.sections.map((x, k) => el("li", { class: k === i ? "actif" : null }, el("span", { text: String(k + 1).padStart(2, "0") }), COURTS[x.cle] || x.titre))),
      el("span", { class: "dp-bandeau-conf", text: "Strictement confidentiel" })),
    el("div", { class: "dp-corps" },
      el("header", { class: "dp-entete" }, el("span", { class: "dp-kicker", text: `${String(i + 1).padStart(2, "0")} · ${COURTS[s.cle] || ""}` }), el("h3", { text: s.titre + (suite ? " (suite)" : "") })),
      el("div", { class: "dp-zone" }, ...contenu),
      el("footer", { class: "dp-pied" }, el("span", { text: `Mémorandum d'information · ${etat.entreprise || ""} · Strictement confidentiel` }), el("span", { class: "dp-num" }), logoPassation())));
}

/** Contenu propre à chaque chapitre ; le texte courant est dans .dp-flux (découpé si trop long). */
function contenuSection(s) {
  if (!s.redigee) return [el("div", { class: "dp-flux" }, el("p", { class: "a-rediger", text: "À compléter." }))];
  const { paragraphes, puces } = decouperTexte(s.contenu);
  const flux = (l = paragraphes) => el("div", { class: "dp-flux" }, ...paras(l));
  const p = etat.profil || {};
  const age = p.creation ? `${new Date().getFullYear() - p.creation} ans` : "–";
  switch (s.cle) {
    case "synthese":
      return [chiffresCles(), el("div", { class: "dp-intro" }, ...paras(paragraphes.slice(0, 1))),
        el("p", { class: "dp-mini-titre", text: "Points clés de l'investissement" }),
        el("div", { class: "dp-cartes" }, ...(puces.length ? puces : paragraphes.slice(1, 4)).slice(0, 6).map((t, k) => el("div", { class: "dp-carte" }, picto(k), el("p", { text: t })))),
        el("div", { class: "dp-flux" }, ...paras(puces.length ? paragraphes.slice(1) : paragraphes.slice(4)))];
    case "histoire":
      return [rangeeKpi(kpi("calendrier", p.creation ? String(p.creation) : "–", "Année de création"), kpi("horloge", age, "D'existence"), kpi("lieu", p.ville || p.region || "–", "Siège")),
        frise(s.contenu), el("div", { class: "dp-flux dp-deux-col" }, ...paras(paragraphes), ...(puces.length ? [el("ul", {}, ...puces.map((t) => el("li", { text: t })))] : []))];
    case "activite":
      return [el("div", { class: "dp-split" }, el("div", {}, flux(), repartitionAnneau(puces) || repartition(puces) || (puces.length ? el("ul", { class: "dp-puces" }, ...puces.map((t) => el("li", { text: t }))) : null)), photo(0))];
    case "marche":
      return [el("div", { class: "dp-split dp-split-carte" }, carteFrance(),
        el("div", {}, rangeeKpi(kpi("poignee", pct(p.clients?.premier), "Premier client"), kpi("equipe", pct(p.clients?.cinq), "Cinq premiers"), kpi("croissance", pct(p.clients?.recurrent), "CA récurrent"), kpi("globe", p.zone || "–", "Zone commerciale")), flux()))];
    case "organisation":
      return [el("div", { class: "dp-split" }, el("div", {}, rangeeKpi(kpi("equipe", effectifCourt(), "Salariés"), kpi("calendrier", p.creation ? String(p.creation) : "–", "Création"), kpi("lieu", p.ville || "–", "Site")), flux(), puces.length ? el("ul", { class: "dp-puces" }, ...puces.map((t) => el("li", { text: t }))) : null), photo(1))];
    case "finances":
      return [chiffresCles(), el("div", { class: "dp-split dp-split-graph" }, graphiqueFinances(), graphiqueMarge())];
    case "perspectives":
      return [el("div", { class: "dp-split" }, flux(), el("div", { class: "dp-cartes dp-cartes-col" }, ...puces.slice(0, 5).map((t, k) => el("div", { class: "dp-carte" }, picto(k + 2), el("p", { text: t })))))];
    case "operation":
      return [el("div", { class: "dp-operation" },
        el("div", { class: "dp-gros" }, el("span", { class: "dp-gros-val", text: p.operation?.part_cedee || "À compléter" }), el("span", { class: "dp-tuile-lib", text: "du capital proposé à la cession" })),
        el("div", { class: "dp-carte" }, icone("equipe"), el("p", {}, el("strong", { text: "Motif : " }), p.operation?.motif || "À compléter")),
        el("div", { class: "dp-carte" }, icone("poignee"), el("p", {}, el("strong", { text: "Accompagnement : " }), p.operation?.accompagnement || "À compléter")),
        el("div", { class: "dp-carte" }, icone("calendrier"), el("p", {}, el("strong", { text: "Calendrier : " }), p.operation?.calendrier || "À compléter"))),
        processus(), flux()];
    default:
      return [flux(), puces.length ? el("ul", { class: "dp-puces" }, ...puces.map((t) => el("li", { text: t }))) : null];
  }
}

function dessinerMemo() {
  etat.versionPhotos ??= Date.now();
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const p = etat.profil || {};
  const sousTitre = [p.secteur, p.ville || p.region, p.creation ? `depuis ${p.creation}` : null].filter(Boolean).join(" · ");
  const enfants = [];
  // Couverture : panneau sombre + photo pleine hauteur
  enfants.push(el("div", { class: "diapo dp-couverture" },
    el("div", { class: "dp-couv-panneau" },
      el("div", { class: "dp-couv-haut" }, logoBloc("dp-logo dp-logo-grand"), el("span", { class: "dp-ruban", text: "Strictement confidentiel" })),
      el("div", { class: "dp-couv-centre" }, el("p", { class: "dp-etiquette", text: "Mémorandum d'information" }), el("h2", { text: etat.entreprise || "Entreprise" }), el("p", { class: "dp-sous-titre", text: sousTitre }), el("span", { class: "dp-filet" })),
      el("div", { class: "dp-couv-bas" }, el("span", { text: date }), logoPassation(true))),
    photoUrl(0) ? el("div", { class: "dp-couv-photo", style: `background-image:url('${photoUrl(0)}')`, role: "img", "aria-label": etat.photos[0].legende || "Photo de l'entreprise" }) : el("div", { class: "dp-couv-photo dp-couv-texture" })));
  // Sommaire : photo + chapitres
  enfants.push(el("div", { class: "diapo dp-sommaire" },
    photoUrl(1) ? el("div", { class: "dp-som-photo", style: `background-image:url('${photoUrl(1)}')` }) : el("div", { class: "dp-som-photo dp-couv-texture" }),
    el("div", { class: "dp-som-liste" }, logoBloc(), el("p", { class: "dp-etiquette", text: "Sommaire" }),
      el("ol", {}, ...etat.sections.map((s, i) => el("li", {}, el("span", { class: "dp-li-num", text: String(i + 1).padStart(2, "0") }), el("a", { href: `#s-${s.cle}`, text: s.titre })))))));
  etat.sections.forEach((s, i) => {
    enfants.push(cadre(s, i, contenuSection(s)));
    if (s.cle === "finances") {
      const { paragraphes } = decouperTexte(s.contenu);
      enfants.push(cadre({ ...s, titre: "Comptes de synthèse" }, i, [tableauFinancier(), el("div", { class: "dp-flux" }, ...paras(s.redigee ? paragraphes : []))], { suite: true }));
    }
    const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
      s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
      s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: "À compléter : " }), s.a_completer.join(" ; ")) : null,
      el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
      s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, "Modifier") : null);
    enfants.push(outils);
  });
  // Avertissement
  enfants.push(el("div", { class: "diapo dp-fin" },
    el("div", { class: "dp-fin-texte" }, logoBloc("dp-logo dp-logo-grand"), el("p", { class: "dp-etiquette", text: "Avertissement" }),
      el("p", { text: "Ce mémorandum a été établi à partir d'informations fournies par le dirigeant et de données publiques. Il n'a fait l'objet d'aucun audit. Il ne constitue ni une offre, ni un engagement, et ne remplace pas les vérifications d'usage (audit comptable, juridique, social et fiscal)." }),
      el("p", { text: "Il est remis sous engagement de confidentialité : toute reproduction ou diffusion, totale ou partielle, est interdite." }),
      el("p", { class: "dp-contact", text: "Contact : par l'intermédiaire de Passation" }), logoPassation()),
    photoUrl(2) ? el("div", { class: "dp-fin-photo", style: `background-image:url('${photoUrl(2)}')` }) : el("div", { class: "dp-fin-photo dp-couv-texture" })));
  $("#memo").replaceChildren(...enfants);
  decouper();
  $("#memo").querySelectorAll(".dp-num").forEach((n, k) => { n.textContent = String(k + 3); });
  $("#memo").querySelectorAll(".dp-page").forEach((d) => { if (d.querySelector(".dp-entete h3")?.textContent.endsWith("(suite)") && d.querySelector(".dp-entete h3").textContent.startsWith("Comptes")) d.querySelector(".dp-entete h3").textContent = "Comptes de synthèse"; });
}

/** Chapitre trop long : les derniers paragraphes du texte courant passent sur une diapositive « (suite) ». */
function decouper() {
  for (const d of [...$("#memo").querySelectorAll(".dp-page")]) {
    let courante = d;
    for (let garde = 0; garde < 5; garde++) {
      const zone = courante.querySelector(".dp-zone"), flux = courante.querySelector(".dp-flux");
      if (!flux || zone.scrollHeight <= zone.clientHeight + 2 || flux.children.length < 2) break;
      const reports = [];
      while (zone.scrollHeight > zone.clientHeight + 2 && flux.children.length > 1) reports.unshift(flux.removeChild(flux.lastElementChild));
      const s = etat.sections.find((x) => x.cle === courante.dataset.section);
      const suite = cadre(s, Number(courante.dataset.index), [el("div", { class: "dp-flux dp-deux-col" }, ...reports)], { suite: true });
      courante.after(suite);
      courante = suite;
    }
  }
}

function editer(outils, s) {
  const ta = el("textarea", { rows: "10", "aria-label": `Texte : ${s.titre}` }); ta.value = s.contenu;
  const ok = el("button", { type: "button", class: "btn btn-noir btn-mini" }, "Enregistrer");
  ok.addEventListener("click", async () => {
    try { etat = await api(`${base}/sections/${s.cle}`, { method: "PUT", body: JSON.stringify({ contenu: ta.value }) }); tout(); message("Section enregistrée."); } catch (e) { message(e.message, true); }
  });
  outils.replaceChildren(ta, el("div", { class: "doc-edition" }, ok, el("button", { type: "button", class: "lien-simple", onclick: tout }, "Annuler")));
  ta.focus();
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
