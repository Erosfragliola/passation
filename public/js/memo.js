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

const THEMES_FAITS = { taille: "Taille du marché", tendance: "Tendance", demande: "Demande", reglementation: "Réglementation", concurrence: "Concurrence" };
function dessinerMarche() {
  const m = etat.marche || {};
  const faits = m.faits || [];
  const bouton = el("button", { type: "button", class: "btn btn-noir btn-mini", disabled: !m.essais_restants, onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    message("Étude de marché en cours : registres publics et recherche web (une à deux minutes)…");
    try { etat = await api(`${base}/marche`, { method: "POST" }); tout(); message(`${(etat.marche.faits || []).length} faits de marché retenus, chacun avec sa source. Décochez ceux qui ne correspondent pas à votre marché.`); }
    catch (e) { message(e.message, true); b.disabled = false; }
  } }, m.date ? "Relancer l'étude" : "Lancer l'étude de marché");
  const sct = m.secteur;
  $("#marche").replaceChildren(
    sct ? el("p", { class: "petit", text: `Registres : ${sct.region_total.toLocaleString("fr-FR")} entreprises actives du code NAF ${sct.naf} en ${sct.region}, dont ${pct0(sct.part_moins_10)} de moins de 10 salariés.` }) : null,
    faits.length ? el("fieldset", { class: "faits" }, el("legend", { text: `Faits de marché (${faits.filter((f) => f.valide).length}/${faits.length} retenus)` }),
      ...faits.map((f) => {
        const cb = el("input", { type: "checkbox", id: `marche-${f.id}`, checked: f.valide });
        cb.addEventListener("change", async () => {
          f.valide = cb.checked;
          const { essais_restants, ...donnees } = m;
          try { await api(`/api/dossiers/${id}/answers/marche`, { method: "PUT", body: JSON.stringify({ data: donnees }) }); dessinerMarche(); dessinerMemo(); $(`#marche-${f.id}`)?.focus(); }
          catch (e) { message(e.message, true); }
        });
        return el("label", { class: "fait", for: `marche-${f.id}` }, cb, el("span", {}, el("strong", { text: `${THEMES_FAITS[f.theme] || f.theme} · ` }), el("span", { text: f.fait }), el("a", { href: f.url, target: "_blank", rel: "noopener", class: "petit", text: ` ${f.source || "source"}${f.annee ? `, ${f.annee}` : ""}` })));
      })) : m.date ? el("p", { class: "petit", text: "Aucun chiffre de marché suffisamment sourcé n'a été trouvé : le chapitre Marché s'appuiera sur les registres publics." }) : null,
    el("div", { class: "doc-edition" }, bouton, el("span", { class: "petit", text: `${m.essais_restants ?? 0} étude${(m.essais_restants ?? 0) > 1 ? "s" : ""} restante${(m.essais_restants ?? 0) > 1 ? "s" : ""}` })));
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
  valide: "M5 12l4 4 10-10",
  equipe: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m2-5c3 0 6 2 6 5",
  croissance: "M3 17l6-6 4 4 8-8M15 7h6v6",
  qualite: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  metier: "M4 7h16v12H4zM9 7V4h6v3",
  euro: "M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9",
  calendrier: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  lieu: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  balance: "M12 4v16M6 20h12M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z",
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
/** Page de chapitre : rubrique et logo, numéro de point fort et titre affirmatif, contenu, « À retenir », source, pied. */
function cadre(s, contenu, { titre = null, suite = false, sources = null, retenu = null } = {}) {
  const partie = (etat.parties || []).find((x) => x.n === s.partie);
  return el("div", { class: `diapo dp-page dp-${s.cle}`, "data-section": s.cle, id: suite ? null : `s-${s.cle}` },
    el("header", { class: "dp-entete" },
      el("div", { class: "dp-rubrique" }, el("span", { text: [String(s.partie || 0).padStart(2, "0"), partie?.titre, partie?.titre === s.court ? null : s.court].filter(Boolean).join(" · ") }), logoBloc("dp-logo-tete")),
      el("div", { class: "dp-titre-ligne" },
        s.point_fort ? el("span", { class: "dp-badge", text: String(s.point_fort), "aria-label": `Point fort ${s.point_fort}` }) : null,
        el("h3", { text: titre || titreDe(s) + (suite ? " (suite)" : "") }))),
    el("div", { class: "dp-zone" }, ...contenu.filter(Boolean)),
    retenir(retenu),
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

// ------------------------------------------------------------------ Blocs visuels
/** Bande « À retenir » en bas de page : la conclusion du chapitre (accroche rédigée), flèche à gauche. */
const retenir = (texte) => (texte ? el("div", { class: "dp-retenir" }, el("span", { class: "dp-retenir-fleche", "aria-hidden": "true" }), el("p", {}, el("strong", { text: "À retenir · " }), texte)) : null);

/** Bloc titré (bandeau vert) : l'unité de base des pages denses. */
const bloc = (titre, ...contenu) => el("section", { class: "dp-bloc" }, el("h4", { class: "dp-bloc-titre", text: titre }), el("div", { class: "dp-bloc-corps" }, ...contenu.filter(Boolean)));

/** Puce rédigée « **Fait clé** : explication » → { titre, texte }. */
function eclaterPuce(t) {
  const m = /^\*\*(.+?)\*\*\s*[:–-]?\s*(.*)$/s.exec(String(t).trim());
  if (m) return { titre: m[1].replace(/[\s:]+$/, ""), texte: m[2] };
  const i = String(t).indexOf(" : ");
  return i > 0 && i < 70 ? { titre: t.slice(0, i), texte: t.slice(i + 3) } : { titre: null, texte: t };
}
const PICTOS_CARTES = ["valide", "metier", "equipe", "qualite", "croissance", "globe", "loupe", "horloge"];
/** Puces → cartes à pictogramme (découpables d'une page à l'autre). */
function cartes(puces, { colonnes = 3, pictos = PICTOS_CARTES, numeros = false } = {}) {
  if (!puces.length) return null;
  return el("div", { class: `dp-cartes-puces col-${colonnes}${numeros ? " numerotees" : ""}`, "data-decoupable": "" }, ...puces.map((t, k) => {
    const { titre, texte } = eclaterPuce(t);
    return el("article", { class: "dp-carte-puce" },
      numeros ? el("span", { class: "dp-carte-num", text: String(k + 1).padStart(2, "0") }) : icone(pictos[k % pictos.length], "dp-carte-picto"),
      el("div", {}, titre ? el("strong", {}, ...enrichi(titre)) : null, el("p", {}, ...enrichi(texte))));
  }));
}
/** Paragraphes d'introduction d'un chapitre. */
const chapeau = (paragraphes) => (paragraphes.length ? el("div", { class: "dp-chapeau", "data-decoupable": "" }, ...paragraphes.map((t) => el("p", {}, ...enrichi(t)))) : null);

/** Anneau de pourcentage avec valeur au centre (synthèse, clients). */
function anneau(part, valeur, libelle, precision) {
  const r = 34, c = 2 * Math.PI * r, v = ok(part) ? Math.max(0, Math.min(1, part)) : 1;
  return el("div", { class: "dp-anneau-kpi" },
    el("div", { class: "dp-anneau-boite" }, svg("svg", { viewBox: "0 0 90 90", "aria-hidden": "true" },
      svg("circle", { cx: 45, cy: 45, r, class: "dp-anneau-fond" }),
      svg("circle", { cx: 45, cy: 45, r, class: "dp-anneau-val", "stroke-dasharray": `${c * v} ${c}`, transform: "rotate(-90 45 45)" })),
      el("span", { class: "dp-anneau-txt", text: valeur })),
    el("span", { class: "dp-chiffre-lib", text: libelle }), precision ? el("span", { class: "dp-chiffre-plus", text: precision }) : null);
}

/** Structure du secteur : barre empilée par taille, grands chiffres, place de l'entreprise (registres publics). */
function structureSecteurVisuel() {
  const s = etat.marche?.secteur;
  if (!s) return el("p", { class: "a-rediger", text: "Structure du secteur : lancez l'étude de marché (registres publics)." });
  const teintes = { sans: "#D8CFBF", "1_9": "#9DB8A8", "10_49": "#4E7A63", "50_plus": "#1E3A2E" };
  const barre = el("div", { class: "dp-barre-empilee", role: "img", "aria-label": s.repartition.map((x) => `${x.libelle} : ${pct0(x.part)}`).join(" ; ") },
    ...s.repartition.filter((x) => x.part > 0).map((x) => el("span", { class: x.cle === s.bande_entreprise ? "entreprise" : null, style: `flex-basis:${(x.part * 100).toFixed(2)}%;background:${teintes[x.cle]}` }, x.part >= 0.07 ? pct0(x.part) : "")));
  const legende = el("ul", { class: "dp-legende-barre" }, ...s.repartition.map((x) => el("li", { class: x.cle === s.bande_entreprise ? "entreprise" : null },
    el("span", { class: "dp-pastille", style: `background:${teintes[x.cle]}` }), el("span", { text: x.libelle }), el("strong", { text: x.n == null ? "n.d." : x.n.toLocaleString("fr-FR") }))));
  return el("div", { class: "dp-secteur" },
    rangee(chiffre(`${s.region_plafonne ? "> " : ""}${s.region_total.toLocaleString("fr-FR")}`, `Entreprises actives en ${s.region}`, `code NAF ${s.naf}`),
      chiffre(pct0(s.part_moins_10), "Ont moins de 10 salariés", "un secteur fragmenté"),
      s.part_meme_taille_ou_plus != null ? chiffre(pct0(s.part_meme_taille_ou_plus), "Sont de sa taille ou plus grandes", `${s.nombre_meme_taille_ou_plus_region.toLocaleString("fr-FR")} entreprises dans la région`) : null,
      s.france_10_plus != null ? chiffre(`${s.france_10_plus_plafonne ? "> " : ""}${s.france_10_plus.toLocaleString("fr-FR")}`, "Entreprises de 10 salariés et plus", "en France") : null),
    el("p", { class: "dp-mini-titre", text: `Répartition des entreprises actives par taille · ${s.region}` }), barre, legende);
}

const LIBELLES_THEMES = { taille: "Taille du marché", tendance: "Tendance", demande: "Demande", reglementation: "Réglementation", concurrence: "Concurrence" };
const PICTOS_THEMES = { taille: "euro", tendance: "croissance", demande: "equipe", reglementation: "balance", concurrence: "loupe" };
const faitsMarche = () => (etat.marche?.faits || []).filter((f) => f.valide);
/** Faits de marché sourcés : cartes à grand chiffre (convention des pages « moteurs du marché »). */
function cartesMarche(faits) {
  return el("div", { class: "dp-cartes-marche", "data-decoupable": "" }, ...faits.map((f) => el("article", { class: `dp-carte-marche theme-${f.theme}` },
    el("header", {}, icone(PICTOS_THEMES[f.theme] || "valide", "dp-carte-picto"), el("span", { text: LIBELLES_THEMES[f.theme] || f.theme })),
    f.chiffre ? el("p", { class: "dp-carte-chiffre", text: f.chiffre }) : null,
    el("p", { class: "dp-carte-texte", text: f.fait }),
    el("p", { class: "dp-carte-source", text: `${f.source || new URL(f.url).hostname}${f.annee ? `, ${f.annee}` : ""}` }))));
}

/** Frise des étapes : flèche horizontale, années posées dessus, libellés dessous (6 au plus). */
function frise(texte) {
  const phrases = String(texte).replace(/\*\*/g, "").replace(/\n/g, " ").replace(/\s+-\s+/g, " ").split(/(?<=\.)\s+/);
  const points = new Map();
  if (p().creation) points.set(p().creation, "Création de l'entreprise");
  for (const ph of phrases) for (const m of ph.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (!points.has(Number(m[1]))) points.set(Number(m[1]), ph.replace(/^[-•▪\s]*\d{4}\s*[:–-]\s*/, "").replace(/^./, (c) => c.toUpperCase()).slice(0, 80));
  const l = [...points.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
  if (l.length < 2) return null;
  return el("ol", { class: "dp-frise-fleche" }, ...l.map(([a, t], k) => el("li", { class: k === l.length - 1 ? "dernier" : null }, el("span", { class: "dp-frise-an", text: String(a) }), el("span", { class: "dp-frise-txt", text: t }))));
}

// ------------------------------------------------------------------ Pages
const SOURCES = {
  publiques: "registres publics (INSEE, INPI)",
  site: "site internet de l'entreprise",
  dirigeant: "déclarations du dirigeant",
  calculs: "calculs Passation",
};

/** Page d'ouverture de partie : grand numéro, titre, chapitres de la partie (convention des banques d'affaires). */
function pageOuverture(partie, k) {
  const chapitres = etat.sections.filter((s) => s.partie === partie.n);
  const u = photoUrl(k % Math.max(1, etat.photos?.length || 1));
  return el("div", { class: "diapo dp-ouverture", "data-partie": String(partie.n) },
    el("div", { class: `dp-ouverture-fond${u ? "" : " dp-couv-texture"}`, style: u ? `background-image:url('${u}')` : null }),
    el("div", { class: "dp-ouverture-contenu" },
      el("p", { class: "dp-ouverture-num", "aria-hidden": "true" }, el("span", { class: "zero", text: "0" }), String(partie.n)),
      el("div", {}, el("h2", { text: partie.titre }), el("p", { class: "dp-ouverture-detail", text: partie.detail }),
        el("ol", { class: "dp-ouverture-liste" }, ...chapitres.map((s) => el("li", {}, s.point_fort ? el("span", { class: "dp-badge", text: String(s.point_fort) }) : el("span", { class: "dp-badge vide" }), el("span", { text: titreDe(s) })))))),
    el("footer", { class: "dp-ouverture-pied" }, el("span", { text: `${p().nom_de_code || "Projet"} · Mémorandum d'information` }), el("span", { text: "Strictement confidentiel" }), el("span", { class: "dp-num" })));
}

function pagesSynthese(s) {
  const pages = [];
  const q = p(), cl = ch().clients || {}, er = ch().ebe_retraite || {};
  const ca = derniere("chiffre_affaires"), t = cr().tcam, retraite = er.ebe_retraite?.at(-1), marge = er.marge_retraitee?.at(-1), endet = ch().endettement;
  const age = q.creation ? new Date().getFullYear() - q.creation : null;
  const { paragraphes, puces } = decouperTexte(s.contenu);
  pages.push(cadre(s, [
    el("div", { class: "dp-kpis-anneaux" },
      ok(ca) ? anneau(1, montant(ca), `Chiffre d'affaires ${cr().annees.at(-1)}`, t && ok(t.ca) ? `${pourcent(t.ca, { signe: true })} par an depuis ${t.de}` : null) : null,
      ok(retraite) ? anneau(marge, montant(retraite), "EBE retraité", ok(marge) ? `${pourcent(marge)} du chiffre d'affaires` : null) : null,
      endet && ok(endet.total) ? anneau(1, montant(Math.abs(endet.total)), endet.total <= 0 ? "Trésorerie nette" : "Dette nette", endet.total > 0 && ok(endet.sur_ebe) ? `${multiple(endet.sur_ebe)} l'EBE` : `au 31/12/${endet.annee}`) : null,
      ok(cl.recurrent) ? anneau(cl.recurrent, pct0(cl.recurrent), "Chiffre d'affaires récurrent", "déclaré par le dirigeant") : null,
      anneau(1, effectifCourt(), "Salariés", q.secteur || null),
      age ? anneau(1, `${age} ans`, "D'existence", `créée en ${q.creation}`) : null),
    el("div", { class: "dp-split dp-split-synthese" },
      el("div", {}, s.redigee ? chapeau(paragraphes) : aRediger("La synthèse"), cartes(puces, { colonnes: 2 })),
      el("aside", { class: "dp-encadre" }, el("p", { class: "dp-mini-titre", text: "L'opération envisagée" }),
        el("dl", {}, ...[["Part du capital cédée", q.operation?.part_cedee], ["Motif du cédant", q.operation?.motif], ["Calendrier souhaité", q.operation?.calendrier], ["Accompagnement", q.operation?.accompagnement]]
          .map(([tt, v]) => el("div", {}, el("dt", { text: tt }), el("dd", { text: v || "À compléter" })))))),
  ], { sources: source(sourceChiffres(), SOURCES.publiques, SOURCES.dirigeant, SOURCES.calculs), retenu: s.redigee ? titreDe(s) : null }));
  // Les six points forts, regroupés par thème autour du nom de code
  const pf = (n) => etat.sections.find((x) => x.point_fort === n);
  const groupes = [["L'entreprise", [1, 2]], ["Marché et clients", [3, 4]], ["Finances et perspectives", [5, 6]]];
  pages.push(cadre(s, [el("div", { class: "dp-points-forts-grille" },
    el("div", { class: "dp-medaillon" }, logoBloc("dp-medaillon-logo"), el("strong", { text: q.nom_de_code || "Projet" }), el("span", { text: [q.secteur, q.region].filter(Boolean).join(" · ") })),
    el("div", { class: "dp-points-forts-groupes" }, ...groupes.map(([g, ns]) => el("div", { class: "dp-pf-groupe" },
      el("div", { class: "dp-pf-theme", text: g }),
      el("div", { class: "dp-pf-cartes" }, ...ns.map((n) => pf(n)).filter(Boolean).map((x) => el("article", { class: "dp-pf-carte" },
        el("span", { class: "dp-badge", text: String(x.point_fort) }),
        el("div", {}, el("strong", { text: titreDe(x) }), x.accroche ? el("span", { text: x.accroche }) : null),
        el("a", { class: "dp-renvoi", href: `#s-${x.cle}`, "data-renvoi": x.cle, text: "p. –" }))))))))],
  { titre: "Les six points forts du dossier", suite: true }));
  return pages;
}

function pageChapitre(s) {
  const q = p(), cl = ch().clients || {};
  const { paragraphes, puces } = decouperTexte(s.contenu);
  const vide = s.redigee ? null : aRediger(s.court);
  const retenu = s.accroche;
  switch (s.cle) {
    case "histoire":
      return [cadre(s, [rangee(q.creation ? chiffre(String(q.creation), "Année de création") : null, q.creation ? chiffre(`${new Date().getFullYear() - q.creation} ans`, "D'existence") : null, chiffre(q.region || "n.d.", "Région du siège", q.ville || null), chiffre(effectifCourt(), "Salariés", "tranche INSEE")),
        s.redigee ? frise(s.contenu) : null, vide, chapeau(paragraphes),
        cartes(frise(s.contenu) ? puces.filter((t) => !/^\d{4}$/.test(eclaterPuce(t).titre || "")) : puces, { colonnes: 3, pictos: ["qualite", "lieu", "croissance", "metier", "equipe", "calendrier"] })],
        { sources: source(SOURCES.publiques, faitsSite("histoire", "implantation") ? SOURCES.site : null, SOURCES.dirigeant), retenu })];
    case "activite": {
      const ph = photo(0);
      const corps = el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: ph ? 2 : 3, pictos: ["metier", "qualite", "valide", "loupe", "croissance", "equipe"] }));
      return [cadre(s, [rangee(q.secteur ? chiffre(q.secteur, "Secteur", "nomenclature INSEE") : null, chiffre(effectifCourt(), "Salariés", "tranche INSEE"), q.zone ? chiffre(q.zone, "Zone commerciale") : null, ok(derniere("chiffre_affaires")) ? chiffre(montant(derniere("chiffre_affaires")), `Chiffre d'affaires ${cr().annees.at(-1)}`) : null),
        ph ? el("div", { class: "dp-split dp-split-photo" }, corps, ph) : corps], { sources: source(SOURCES.publiques, SOURCES.dirigeant, faitsSite("activite", "produits", "qualite") ? SOURCES.site : null), retenu })];
    }
    case "organisation": {
      const ph = photo(1);
      const corps = el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: 2, pictos: ["equipe", "metier", "valide", "horloge", "signature", "loupe"] }));
      return [cadre(s, [rangee(chiffre(effectifCourt(), "Salariés", "tranche INSEE"), q.creation ? chiffre(String(q.creation), "Création") : null, chiffre(q.ville || "n.d.", "Site principal")),
        ph ? el("div", { class: "dp-split dp-split-photo" }, corps, ph) : corps], { sources: source(SOURCES.publiques, SOURCES.dirigeant, faitsSite("equipe") ? SOURCES.site : null), retenu })];
    }
    case "marche": {
      const faits = faitsMarche();
      const pages = [cadre(s, [el("div", { class: "dp-split dp-split-marche" }, el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: 1, pictos: ["globe", "croissance", "equipe", "balance", "loupe"] })), structureSecteurVisuel())],
        { sources: source(etat.marche?.secteur?.source || "Annuaire des entreprises (INSEE Sirene)", faits.length ? "sources publiques citées en page suivante" : null), retenu })];
      if (faits.length) pages.push(cadre(s, [cartesMarche(faits)], { titre: "Les moteurs du marché, chiffres sourcés", suite: true,
        sources: source(...[...new Set(faits.map((f) => `${f.source || new URL(f.url).hostname}${f.annee ? ` (${f.annee})` : ""}`))].slice(0, 6)) }));
      return pages;
    }
    case "clients":
      return [cadre(s, [
        el("div", { class: "dp-clients-haut" },
          el("div", { class: "dp-kpis-anneaux compact" },
            ok(cl.premier) ? anneau(cl.premier, pct0(cl.premier), "Premier client", "part du chiffre d'affaires") : null,
            ok(cl.cinq) && cl.cinq_complet ? anneau(cl.cinq, pct0(cl.cinq), "Cinq premiers clients", "part du chiffre d'affaires") : null,
            ok(cl.recurrent) ? anneau(cl.recurrent, pct0(cl.recurrent), "Chiffre d'affaires récurrent", "déclaré par le dirigeant") : null,
            q.zone ? chiffre(q.zone, "Zone commerciale") : null),
          carteFrance()),
        el("div", { class: "dp-split dp-split-carte" }, el("div", {}, tableauClients()), el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: 1, pictos: ["poignee", "equipe", "globe", "horloge", "valide"] }))),
      ], { sources: source(SOURCES.dirigeant, faitsSite("clients", "marche") ? SOURCES.site : null, "fond de carte IGN Admin Express (Licence ouverte)"), retenu })];
    case "finances": {
      const src = () => source(sourceChiffres(), "retraitements déclarés par le dirigeant", SOURCES.calculs);
      const texte = el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: 1, pictos: ["euro", "croissance", "valide", "cadenas", "horloge"] }));
      return [
        cadre(s, [rangee(...chiffresFinanciers()), el("div", { class: "dp-split dp-split-graph" }, graphiqueFinances(), graphiqueMarge())], { sources: src(), retenu }),
        cadre(s, [el("div", { class: "dp-split dp-split-tableau" }, texte, tableauCompteResultat())], { titre: `Compte de résultat ${cr().annees.length ? `${cr().annees[0]}-${cr().annees.at(-1)}` : ""}`.trim(), suite: true, sources: src() }),
        cadre(s, [el("div", { class: "dp-split dp-split-tableaux" }, tableauEbe(), tableauDette())], { titre: "De l'EBE comptable à l'EBE retraité ; endettement net", suite: true, sources: src() }),
      ];
    }
    case "perspectives":
      return [cadre(s, [rangee(ok(q.perspectives?.croissance) ? chiffre(`${pourcent(q.perspectives.croissance, { signe: true, decimales: 0 })} par an`, "Croissance anticipée", "estimation du dirigeant, non auditée") : null,
        ok(q.perspectives?.marge_ebe) ? chiffre(pourcent(q.perspectives.marge_ebe, { decimales: 0 }), "Marge d'EBE visée", "estimation du dirigeant") : null,
        ok(cr().tcam?.ca) ? chiffre(`${pourcent(cr().tcam.ca, { signe: true })} par an`, "Croissance historique", `${cr().tcam.de}-${cr().tcam.a}`) : null),
        vide, chapeau(paragraphes), cartes(puces, { colonnes: Math.min(4, Math.max(2, puces.length)), numeros: true })],
        { sources: source(SOURCES.dirigeant, ok(cr().tcam?.ca) ? sourceChiffres() : null, faitsMarche().length ? "étude de marché (sources citées au chapitre Marché)" : null, faitsSite("autre") ? SOURCES.site : null), retenu })];
    case "operation":
      return [cadre(s, [el("div", { class: "dp-split dp-split-operation" }, el("div", {}, el("p", { class: "dp-mini-titre", text: "Périmètre de l'opération" }), schemaPerimetre()), el("div", {}, vide, chapeau(paragraphes), cartes(puces, { colonnes: 1, pictos: ["poignee", "signature", "calendrier", "equipe", "cadenas"] }))), processus()],
        { sources: source(SOURCES.dirigeant), retenu })];
    default:
      return [cadre(s, [vide, chapeau(paragraphes), cartes(puces)], { retenu })];
  }
}

function dessinerMemo() {
  etat.versionPhotos ??= Date.now();
  const q = p();
  const parties = etat.parties || [];
  const enfants = [];
  // Couverture : le nom de code seul, jamais le nom de l'entreprise ni sa photo (le document peut traîner sur un bureau)
  enfants.push(el("div", { class: "diapo dp-couverture" },
    el("div", { class: "dp-couv-panneau" },
      el("div", { class: "dp-couv-haut" }, el("span", { class: "dp-ruban", text: "Strictement confidentiel" })),
      el("div", { class: "dp-couv-centre" }, el("p", { class: "dp-etiquette", text: "Mémorandum d'information" }), el("h2", { text: q.nom_de_code || "Projet" }),
        el("p", { class: "dp-sous-titre", text: [q.secteur, q.region].filter(Boolean).join(" · ") }), el("span", { class: "dp-filet" })),
      el("div", { class: "dp-couv-bas" }, el("span", { text: moisAnnee().replace(/^./, (c) => c.toUpperCase()) }), logoPassation(true))),
    el("div", { class: "dp-couv-photo dp-couv-texture" })));
  // Sommaire par partie, pages posées après le découpage
  enfants.push(el("div", { class: "diapo dp-sommaire" },
    el("div", { class: "dp-som-liste" }, el("p", { class: "dp-etiquette", text: "Sommaire" }),
      el("ol", { class: "dp-som-parties" }, ...parties.map((pt) => el("li", {},
        el("div", { class: "dp-som-partie" }, el("span", { class: "dp-li-num", text: String(pt.n).padStart(2, "0") }), el("strong", { text: pt.titre }), el("span", { class: "dp-som-page", "data-renvoi-partie": String(pt.n) })),
        el("ul", {}, ...etat.sections.filter((s) => s.partie === pt.n).map((s) => el("li", {}, el("a", { href: `#s-${s.cle}`, text: titreDe(s) }), el("span", { class: "dp-som-page", "data-renvoi": s.cle }))))))),
      logoPassation())));
  parties.forEach((pt, k) => {
    enfants.push(pageOuverture(pt, k));
    for (const s of etat.sections.filter((x) => x.partie === pt.n)) {
      enfants.push(...(s.cle === "synthese" ? pagesSynthese(s) : pageChapitre(s)));
      const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
        el("strong", { class: "petit", text: s.court }),
        s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
        s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: "À compléter : " }), s.a_completer.join(" ; ")) : null,
        el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
        s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, "Modifier") : null);
      enfants.push(outils);
    }
  });
  // Avertissement (dernière page)
  enfants.push(el("div", { class: "diapo dp-fin" },
    el("div", { class: "dp-fin-texte" }, el("p", { class: "dp-etiquette", text: "Avertissement" }),
      el("p", { text: "Ce mémorandum a été établi à partir d'informations fournies par le dirigeant, de données publiques et de sources de marché citées. Il n'a fait l'objet d'aucun audit. Il ne constitue ni une offre, ni un engagement, et ne remplace pas les vérifications d'usage (audit comptable, juridique, social et fiscal)." }),
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
  $("#memo").querySelectorAll("[data-renvoi-partie]").forEach((r) => { const n = diapos.findIndex((d) => d.dataset.partie === r.dataset.renvoiPartie) + 1; r.textContent = n > 0 ? String(n) : ""; });
}

/** Page trop pleine : les derniers éléments du dernier bloc découpable (texte, cartes) passent sur une page « (suite) ». */
function decouper() {
  for (const d of [...$("#memo").querySelectorAll(".dp-page")]) {
    let courante = d;
    for (let garde = 0; garde < 5; garde++) {
      const zone = courante.querySelector(".dp-zone");
      if (zone.scrollHeight <= zone.clientHeight + 2) break;
      const blocs = [...zone.querySelectorAll("[data-decoupable]")].filter((b) => b.children.length > 1);
      const cible = blocs.at(-1);
      if (!cible) break;
      const reports = [];
      while (zone.scrollHeight > zone.clientHeight + 2 && cible.children.length > 1) reports.unshift(cible.removeChild(cible.lastElementChild));
      const s = section(courante.dataset.section);
      const conteneur = el("div", { class: cible.className, "data-decoupable": "" }, ...reports);
      const suite = cadre(s, [conteneur], { suite: true, sources: courante.querySelector(".dp-source-ligne")?.cloneNode(true) });
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
function tout() { dessinerVerrou(); dessinerSite(); dessinerPhotos(); dessinerMarche(); dessinerMemo(); }

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
