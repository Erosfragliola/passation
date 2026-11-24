// Page du mémorandum : site et logo (faits validés un par un), sections rédigées à la demande, impression.
const $ = (s) => document.querySelector(s);
import { CARTE } from "/js/carte-france.js";
import { kEuros, montant, pourcent, ratioTableau, multiple, moisAnnee, periode, periodeExercices, placementPhotos } from "/js/memo-format.js";
import { surfaceCouverte, planFusion, numeroter, SEUIL_PAGE_VIDE } from "/js/memo-pages.js";
import { ameliorations, reponsePour } from "/js/ameliorations.js";
import { libelleRole, libelleApres, initiales, parcoursDeSecours, transitionEquipe } from "/js/equipe.js";
import { listePhotos } from "/js/photos-fiches.js";
import { lien, t as tr, langue } from "/js/i18n.js";
import { libelleOption } from "/js/questionnaire.js";
const id = new URLSearchParams(location.search).get("dossier") || "";
const base = `/api/dossiers/${id}/documents/memo`;
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
/** Remplace le contenu d'un nœud en ignorant null, undefined et false (sinon le navigateur écrit « null »). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
let etat = null;
let reponses = {}; // réponses du dossier (panneau d'amélioration : QCM, compléments, éléments ignorés)
let focusPhoto = null;
let redactionEnCours = false; // « Rédiger les chapitres manquants » : le bouton reste inactif jusqu'à la fin (relecture comprise)
function message(t, erreur = false) { const m = $("#message"); m.textContent = t; m.hidden = !t; m.classList.toggle("erreur", erreur); }
async function api(chemin, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(chemin, { ...options, headers: enJson ? { "content-type": "application/json" } : {} });
  if (r.status === 401) { location.replace(lien("/connexion")); throw new Error("non_connecte"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || tr("teaser.js.erreur"));
  return d;
}

function dessinerSite() {
  const s = etat.site;
  if (s?.url) $("#url-site").value = s.url;
  const faits = s?.faits || [];
  remplacer($("#faits"), faits.length ? el("fieldset", { class: "faits" },
    el("legend", { text: tr("memo.js.site.faits", { n: faits.filter((f) => f.valide).length, total: faits.length }) }),
    ...faits.map((f) => {
      const cb = el("input", { type: "checkbox", id: `fait-${f.id}`, checked: f.valide });
      cb.addEventListener("change", async () => {
        f.valide = cb.checked;
        try { await api(`/api/dossiers/${id}/answers/site`, { method: "PUT", body: JSON.stringify({ data: s }) }); dessinerSite(); $(`#fait-${f.id}`)?.focus(); }
        catch (e) { message(e.message, true); }
      });
      return el("label", { class: "fait", for: `fait-${f.id}` }, cb, el("span", {}, el("span", { text: f.fait }), el("a", { href: f.source, target: "_blank", rel: "noopener", class: "petit", text: tr("memo.js.site.source") })));
    })) : null);
  const logos = s?.logos || [];
  const fichier = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "fichier-logo", class: "visuellement-cache" });
  fichier.addEventListener("change", async () => {
    const f = fichier.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("fichier", f);
    try { etat = await api(`${base}/logo`, { method: "POST", body: fd }); etat.versionPhotos = Date.now(); tout(); message(tr("memo.js.site.logo_enregistre")); } catch (e) { message(e.message, true); }
  });
  remplacer($("#logos"), el("div", { class: "logos" },
    el("p", { class: "petit", text: etat.logo ? tr("memo.js.site.logo_retenu") : tr("memo.js.site.choisir_logo") }),
    el("div", { class: "logos-liste" }, ...logos.map((l) => el("button", { type: "button", class: "logo-choix", title: l.origine, onclick: async () => {
      try { etat = await api(`${base}/logo`, { method: "POST", body: JSON.stringify({ url: l.url }) }); tout(); message(tr("memo.js.site.logo_enregistre")); } catch (e) { message(e.message, true); }
    } }, el("img", { src: l.url, alt: tr("memo.js.site.candidat", { origine: l.origine }), loading: "lazy", referrerpolicy: "no-referrer" })))),
    el("label", { class: "btn btn-contour btn-mini", for: "fichier-logo" }, tr("memo.js.site.deposer_logo")), fichier));
}

function dessinerPhotos() {
  const s = etat.site || {};
  const max = etat.photos_max || 12;
  const atteste = el("input", { type: "checkbox", id: "attestation-photo" });
  const ajouter = async (corpsRequete) => {
    if (!atteste.checked) { message(tr("memo.js.photos.cochez"), true); atteste.focus(); return; }
    try { etat = await api(`${base}/photos`, { method: "POST", body: corpsRequete }); etat.versionPhotos = Date.now(); tout(); message(tr("memo.js.photos.ajoutee")); } catch (e) { message(e.message, true); }
  };
  const fichier = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "fichier-photo", class: "visuellement-cache" });
  fichier.addEventListener("change", () => { const f = fichier.files[0]; if (!f) return; const fd = new FormData(); fd.append("fichier", f); fd.append("attestation", atteste.checked ? "oui" : "non"); ajouter(fd); fichier.value = ""; });
  const n = (etat.photos || []).length;
  const candidates = (s.photos_candidates || []).filter((u) => !(etat.photos || []).some((ph) => ph.origine === u));
  const ecartees = s.photos_ecartees || [];
  remplacer($("#photos"), el("div", { class: "photos-panneau" },
    el("p", { class: "petit", text: tr("memo.js.photos.titre_max", { n, max }) }),
    listePhotos({ memo: etat, baseMemo: base, version: etat.versionPhotos, message, focus: focusPhoto,
      maj: (m, cible) => { if (m) { etat = { ...m, versionPhotos: etat.versionPhotos }; } focusPhoto = cible || null; tout(); } }),
    candidates.length && n < max ? el("p", { class: "guide-lib", text: tr("memo.js.photos.cliquez") }) : null,
    el("label", { class: "fait", for: "attestation-photo" }, atteste, el("span", { text: tr("memo.js.photos.attestation") })),
    n < max ? el("div", { class: "logos-liste" },
      ...candidates.slice(0, max - n).map((u) => el("button", { type: "button", class: "logo-choix photo-choix", title: tr("memo.js.photos.ajouter_site"), onclick: () => ajouter(JSON.stringify({ url: u, attestation: atteste.checked })) }, el("img", { src: u, alt: tr("memo.js.photos.candidate"), loading: "lazy", referrerpolicy: "no-referrer" })))) : null,
    ecartees.length ? el("p", { class: "petit", text: tr("memo.js.photos.ecartees", { n: ecartees.length, raisons: [...new Set(ecartees.map((x) => tr(`memo.js.photos.raisons.${x.raison}`)))].join(", ") }) }) : null,
    n < max ? el("label", { class: "btn btn-contour btn-mini", for: "fichier-photo" }, tr("memo.js.photos.deposer")) : el("p", { class: "petit", text: tr("memo.js.photos.limite", { max }) }), fichier));
  focusPhoto = null;
}

const themeFait = (theme) => (["taille", "tendance", "demande", "reglementation", "concurrence"].includes(theme) ? tr(`memo.js.themes.${theme}`) : theme);
function dessinerMarche() {
  const m = etat.marche || {};
  const faits = m.faits || [];
  const bouton = el("button", { type: "button", class: "btn btn-noir btn-mini", disabled: !m.essais_restants, onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    message(tr("memo.js.marche.en_cours"));
    try { etat = await api(`${base}/marche`, { method: "POST" }); tout(); message(tr("memo.js.marche.retenus", { n: (etat.marche.faits || []).length })); }
    catch (e) { message(e.message, true); b.disabled = false; }
  } }, m.date ? tr("memo.js.marche.relancer") : tr("memo.js.marche.lancer"));
  const sct = m.secteur;
  remplacer($("#marche"), 
    sct ? el("p", { class: "petit", text: tr("memo.js.marche.registres", { n: entier(sct.region_total), naf: sct.naf, region: sct.region, part: pct0(sct.part_moins_10) }) }) : null,
    faits.length ? el("fieldset", { class: "faits" }, el("legend", { text: tr("memo.js.marche.faits", { n: faits.filter((f) => f.valide).length, total: faits.length }) }),
      ...faits.map((f) => {
        const cb = el("input", { type: "checkbox", id: `marche-${f.id}`, checked: f.valide });
        cb.addEventListener("change", async () => {
          f.valide = cb.checked;
          const { essais_restants, ...donnees } = m;
          try { await api(`/api/dossiers/${id}/answers/marche`, { method: "PUT", body: JSON.stringify({ data: donnees }) }); dessinerMarche(); dessinerMemo(); $(`#marche-${f.id}`)?.focus(); }
          catch (e) { message(e.message, true); }
        });
        return el("label", { class: "fait", for: `marche-${f.id}` }, cb, el("span", {}, el("strong", { text: `${themeFait(f.theme)} · ` }), el("span", { text: f.fait }), el("a", { href: f.url, target: "_blank", rel: "noopener", class: "petit", text: ` ${f.source || tr("memo.js.site.source").trim()}${f.annee ? `, ${f.annee}` : ""}` })));
      })) : m.date ? el("p", { class: "petit", text: tr("memo.js.marche.aucun") }) : null,
    el("div", { class: "doc-edition" }, bouton, el("span", { class: "petit", text: tr("memo.js.marche.restantes", { n: m.essais_restants ?? 0 }) })));
}

function dessinerVerrou() {
  const v = etat.deverrouille;
  remplacer($("#verrou"), v.ok ? "" : el("div", { class: "message-carte" }, el("p", { text: tr("memo.js.verrou.avant") }),
    el("ul", {}, ...v.manque.map((m) => el("li", { text: m }))),
    el("a", { class: "btn btn-noir btn-mini", href: lien(`/espace/valorisation/?dossier=${id}#entreprise`) }, tr("memo.js.verrou.questionnaire"))));
  $("#btn-tout").disabled = !v.ok || redactionEnCours;
}

// ================================================================== Le mémorandum, à la manière des banques d'affaires
// Conventions des mémorandums d'information des banques d'affaires (reprises, rien de copié) : pages « partie.page »,
// titre en petites capitales et phrase-message en couleur d'accent, puces carrées, encadrés à bandeau plein, tableaux
// en k€ à repères numérotés, sources et notes en pied de page, page d'ouverture par partie, glossaire, avertissement.
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
  outil: "M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2zM5 21l2-2",
  bouclier: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  cible: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  usine: "M3 21V10l6 4V10l6 4V6l6 3v12zM3 21h18",
  camion: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  graphe: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  alerte: "M12 3l10 18H2zM12 10v5M12 18v.5",
};
const icone = (nom, classe = "dp-picto") => svg("svg", { viewBox: "0 0 24 24", class: classe, "aria-hidden": "true" }, svg("path", { d: ICONES[nom] }));

/** Logo Passation (symbole « Le Seuil » + nom). */
const logoPassation = (clair = false) => el("span", { class: `dp-logo-passation${clair ? " clair" : ""}` },
  svg("svg", { viewBox: "0 0 32 32", "aria-hidden": "true" }, svg("path", { d: "M9 27V15a7 7 0 0 1 14 0v12", fill: "none", stroke: "currentColor", "stroke-width": "2.4" }), svg("path", { d: "M5 27h22", stroke: "currentColor", "stroke-width": "2.4" }), svg("circle", { cx: "16", cy: "21", r: "2.8", fill: "#A8653A" })),
  "Passation");

/** Logo de l'entreprise choisi par le dirigeant (couverture et pied de page), ou rien. */
const logoEntreprise = (classe = "im-logo-entreprise") => (etat.logo ? el("img", { class: classe, src: `${base}/logo?v=${etat.versionPhotos || 0}`, alt: tr("memo.js.logo_entreprise", { nom: etat.entreprise || "" }).trim() }) : null);

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
const aRediger = (quoi) => el("p", { class: "a-rediger", text: quoi ? tr("memo.js.a_rediger", { quoi }) : tr("cgu.completer") });

// ------------------------------------------------------------------ Données
const ch = () => etat.chiffres || {};
const cr = () => ch().compte_resultat || { annees: [], lignes: [] };
const serie = (cle) => cr().lignes.find((l) => l.cle === cle)?.valeurs || [];
const derniere = (cle) => serie(cle).at(-1) ?? null;
const section = (cle) => etat.sections.find((s) => s.cle === cle);
const titreDe = (s) => s.titre_affirme || s.titre;
const p = () => etat.profil || {};
const faitsSite = (...cats) => (etat.site?.faits || []).some((f) => f.valide && cats.includes(f.categorie));
const sourceChiffres = () => ch().sources || tr("memo.js.sources.chiffres_valides");
const effectifCourt = () => (p().effectif || tr("dossier.formats.nd")).replace(/^de /, "").replace(/ (personnes|people)$/, "").replace(/^(plus de|more than) (.*) (personnes|people)$/, "> $2");
const SOURCES = { get publiques() { return tr("memo.js.sources.publiques"); }, get site() { return tr("memo.js.sources.site"); }, get dirigeant() { return tr("memo.js.sources.dirigeant"); }, get calculs() { return tr("memo.js.sources.calculs"); } };
const entier = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
const majuscule = (t) => String(t).replace(/^./, (c) => c.toUpperCase());

// ------------------------------------------------------------------ Éléments de mise en page
/** Repère numéroté (carré plein) : renvoi entre un tableau et son commentaire, numéro de point fort. */
const carre = (n, classe = "") => el("span", { class: `im-carre ${classe}`.trim(), text: String(n) });
const intertitre = (t) => el("h4", { class: "im-intertitre", text: t });
/** Encadré à bandeau de titre plein. */
const encadre = (titre, ...contenu) => el("section", { class: "im-encadre" }, el("h4", { class: "im-bandeau", text: titre }), el("div", { class: "im-encadre-corps" }, ...contenu.flat().filter(Boolean)));
/** Bandeau de conclusion, en bas de page. */
const messageCle = (t) => (t ? el("div", { class: "im-message-cle" }, el("p", { text: t })) : null);
/** Encart d'information (hypothèses, avertissements). */
const info = (t) => (t ? el("div", { class: "im-info" }, el("span", { class: "im-info-i", "aria-hidden": "true", text: "i" }), el("p", { text: t })) : null);

/** Puce rédigée « **Fait clé** : explication » → { titre, texte }. */
function eclaterPuce(t) {
  const m = /^\*\*(.+?)\*\*\s*[:–-]?\s*(.*)$/s.exec(String(t).trim());
  if (m) return { titre: m[1].replace(/[\s:]+$/, ""), texte: m[2] };
  const i = String(t).indexOf(" : ");
  return i > 0 && i < 70 ? { titre: t.slice(0, i), texte: t.slice(i + 3) } : { titre: null, texte: t };
}
/** Pictogramme d'un fait selon son thème (mots du fait clé en gras, puis du texte). */
const THEMES_PICTOS = [
  [/client|commerc|fid[eé]l|relation/i, "poignee"], [/[ée]quipe|salari|encadr|personnel|compagnon|apprenti|dirigeant/i, "equipe"],
  [/croissance|progress|hausse|d[ée]velopp|trajectoire|extension/i, "croissance"], [/marge|rentab|ebe|r[ée]sultat/i, "graphe"],
  [/dette|endett|tr[ée]sorerie|bilan|financ/i, "balance"], [/chiffre d'affaires|\bca\b|€/i, "euro"],
  [/march[ée]|secteur|concurren|demande/i, "globe"], [/r[ée]glement|norme|certif|qualif|label/i, "bouclier"],
  [/[ée]quipement|machine|usinage|atelier|production|capacit/i, "usine"], [/qualit|savoir|sur mesure|expertise/i, "qualite"],
  [/offre|produit|service|gamme/i, "metier"], [/r[ée]gion|zone|g[ée]ograph|implant|site|bretagne|loire/i, "lieu"],
  [/cr[ée]ation|histoire|ann[ée]e|depuis|aujourd/i, "calendrier"], [/r[ée]current|contrat|r[ée]gulier/i, "horloge"],
  [/risque|attention|d[ée]pend/i, "alerte"], [/murs|bail|locaux/i, "document"], [/accompagn|transition|calendrier|signature/i, "signature"],
  [/p[ée]rim[eè]tre|cession|capital|holding/i, "cadenas"], [/livr|pose|chantier/i, "camion"], [/compl[ée]ter/i, "loupe"],
];
const pictoDe = (texte) => { const { titre, texte: t } = eclaterPuce(texte); const cherche = `${titre || ""} ${titre ? "" : t}`; return (THEMES_PICTOS.find(([re]) => re.test(cherche)) || THEMES_PICTOS.find(([re]) => re.test(t)) || [null, "valide"])[1]; };
/** Liste de faits : pictogramme du thème, fait clé en gras ; découpable d'une page à l'autre. */
function puces(items, { numeros = false, pictos = true } = {}) {
  if (!items?.length) return null;
  return el("ul", { class: `im-puces${numeros ? " numerotees" : ""}${pictos && !numeros ? " pictos" : ""}`, "data-decoupable": "" },
    ...items.map((t, k) => el("li", {}, numeros ? carre(k + 1) : pictos ? el("span", { class: "im-puce-picto" }, icone(pictoDe(t), "im-picto")) : null, el("span", {}, ...enrichi(t)))));
}
/** Texte d'un chapitre → éléments de liste (les paragraphes deviennent des puces, comme dans les mémorandums). */
const textePuces = (s) => { const { paragraphes, puces: l } = decouperTexte(s.contenu); return [...paragraphes, ...l]; };
const corpsTexte = (s) => {
  if (!s.redigee) return aRediger(s.court);
  const { paragraphes, puces: l } = decouperTexte(s.contenu);
  if (!l.length) return puces(paragraphes, { pictos: false });
  return [paragraphes.length ? el("p", { class: "im-chapeau-texte" }, ...enrichi(paragraphes.join(" "))) : null, puces(l)];
};

/** Colonne de chiffres clés à pictogrammes cerclés. */
function colonneChiffres(items) {
  return el("aside", { class: "im-colonne-chiffres" }, ...items.filter(Boolean).map(([ic, valeur, libelle]) =>
    el("div", { class: "im-cc" }, el("span", { class: "im-cc-icone" }, icone(ic, "im-picto")), el("strong", { text: valeur }), el("span", { text: libelle }))));
}
/** Rangée de chiffres clés en cartouches. */
const bandeChiffres = (items) => el("div", { class: "im-bande-chiffres" }, ...items.filter(Boolean).map(([valeur, libelle]) => el("div", { class: "im-bc" }, el("strong", { text: valeur }), el("span", { text: libelle }))));
/** Tableau libellé / valeur. */
const tableCles = (lignes) => el("table", { class: "im-table-cles" }, el("tbody", {}, ...lignes.filter((l) => l && l[1] != null && l[1] !== "").map(([k, v]) => el("tr", {}, el("th", { scope: "row", text: k }), el("td", { text: v })))));
/** Barres horizontales (structure du secteur, concentration des clients). */
function barresH(lignes, { max = null } = {}) {
  const l = lignes.filter(Boolean);
  if (!l.length) return null;
  const m = max ?? Math.max(...l.map((x) => x.valeur || 0), 1e-9);
  return el("div", { class: "im-barres-h", role: "img", "aria-label": l.map((x) => tr("teaser.js.deux_points", { titre: x.libelle, valeur: x.texte })).join(" ; ") },
    ...l.map((x) => el("div", { class: `im-bh${x.accent ? " accent" : ""}`, "aria-hidden": "true" }, el("span", { class: "im-bh-lib", text: x.libelle }),
      el("span", { class: "im-bh-piste" }, el("span", { class: "im-bh-barre", style: `width:${Math.max(1.5, ((x.valeur || 0) / m) * 100).toFixed(1)}%` })), el("strong", { class: "im-bh-val", text: x.texte }))));
}
/** Texte dont un morceau (le chiffre) est mis en gras. */
function surligne(texte, morceau) {
  const i = morceau ? texte.indexOf(morceau) : -1;
  return i < 0 ? [texte] : [texte.slice(0, i), el("strong", { text: morceau }), texte.slice(i + morceau.length)];
}

/** Motif de fond original (arches du symbole Passation), couverture et pages d'ouverture. */
function motif() {
  const g = svg("svg", { class: "im-motif", viewBox: "0 0 1600 900", preserveAspectRatio: "xMidYMid slice", "aria-hidden": "true" });
  for (let k = 0; k < 9; k++) { const r = 120 + k * 72; g.append(svg("path", { d: `M ${1230 - r} 900 V 600 A ${r} ${r} 0 0 1 ${1230 + r} 600 V 900` })); }
  return g;
}

// ------------------------------------------------------------------ Page type
/**
 * Page de mémorandum : « 2.1 Titre » en petites capitales (numéro posé après assemblage), phrase-message en couleur
 * d'accent, contenu, bandeau de conclusion, pied avec sources, notes, date et numéro de page.
 */
function page({ s = null, titre, message = null, contenu = [], conclusion = null, sources = [], notes = [], suite = false, ancre = true, numerotee = true, classe = "" }) {
  const src = [...new Set(sources.filter(Boolean))];
  return el("div", { class: `diapo im-page ${classe}`.trim(), "data-section": s?.cle ?? null, "data-suite": suite ? "1" : null, id: s && ancre && !suite ? `s-${s.cle}` : null },
    el("header", { class: "im-entete" }, numerotee ? el("span", { class: "im-num" }) : null, el("h3", { text: titre + (suite ? tr("memo.js.suite") : "") })),
    message ? el("p", { class: "im-message", text: message }) : null,
    el("div", { class: "im-zone" }, ...contenu.flat().filter(Boolean)),
    messageCle(conclusion),
    el("footer", { class: "im-pied" },
      el("span", { class: "im-pied-logos" }, logoEntreprise(), logoPassation()),
      el("div", { class: "im-pied-sources" },
        src.length ? el("span", { class: "im-sources", text: tr("memo.js.pied.sources", { n: src.length, liste: majuscule(src.join(", ")) }) }) : null,
        notes.length ? el("span", { class: "im-notes", text: tr("memo.js.pied.notes", { n: notes.length, liste: notes.map((n, k) => `(${k + 1}) ${n}`).join(" ") }) }) : null),
      el("span", { class: "im-pied-date", text: majuscule(moisAnnee()) }),
      el("span", { class: "im-page-num" })));
}
/** Première page d'un chapitre : titre du chapitre, message = titre affirmatif rédigé, conclusion = accroche. */
const chapitre = (s, options = {}) => page({ s, titre: s.titre, message: s.titre_affirme || s.accroche || null, conclusion: s.titre_affirme && s.accroche ? s.accroche : null, ...options });

// ------------------------------------------------------------------ Graphiques et tableaux
/** Histogramme par exercice (valeurs en k€ écrites), avec en option la courbe de marge au-dessus. */
function histogramme({ annees, valeurs, marges = null, libelle, croissance = false }) {
  if (!annees?.length || !valeurs.some(ok)) return null;
  const L = 640, H = 200, bas = 172, pas = L / annees.length, w = Math.min(croissance ? 84 : 64, pas * 0.4);
  const avecMarge = marges && marges.filter(ok).length > 0, hautBarres = avecMarge ? 92 : 122, max = Math.max(...valeurs.filter(ok).map(Math.abs), 1);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "im-graph", role: "img",
    "aria-label": tr("teaser.js.deux_points", { titre: libelle, valeur: annees.map((a, i) => tr("memo.js.graph.point", { annee: a, valeur: kEuros(valeurs[i]) }) + (avecMarge && ok(marges[i]) ? tr("memo.js.graph.marge", { marge: pourcent(marges[i]) }) : "")).join(" ; ") }) });
  const texte = (x, y, t, classe) => { const e = svg("text", { x, y, class: classe, "text-anchor": "middle" }); e.textContent = t; return e; };
  const cx = (i) => i * pas + pas / 2;
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "im-axe" }));
  annees.forEach((a, i) => {
    const v = valeurs[i], h = ok(v) ? (Math.max(0, v) / max) * hautBarres : 0;
    g.append(svg("rect", { x: cx(i) - w / 2, y: bas - h, width: w, height: h, class: `im-barre${i === annees.length - 1 ? " derniere" : ""}` }));
    g.append(texte(cx(i), bas - h - 7, ok(v) ? kEuros(v) : tr("dossier.formats.nd"), "im-graph-val"));
    g.append(texte(cx(i), bas + 21, String(a), "im-graph-an"));
  });
  // Croissance d'un exercice à l'autre : petite flèche courbe au-dessus de l'intervalle
  if (croissance && !avecMarge) annees.forEach((a, i) => {
    if (!i || !ok(valeurs[i]) || !ok(valeurs[i - 1]) || valeurs[i - 1] <= 0) return;
    const v = valeurs[i] / valeurs[i - 1] - 1, x0 = cx(i - 1) + w / 2 + 4, x1 = cx(i) - w / 2 - 4;
    const yh = bas - (Math.max(valeurs[i], valeurs[i - 1]) / max) * hautBarres - 30;
    g.append(svg("path", { d: `M ${x0} ${yh + 12} Q ${(x0 + x1) / 2} ${yh - 6} ${x1} ${yh + 6}`, class: "im-fleche-croissance" }));
    g.append(svg("path", { d: `M ${x1 - 7} ${yh + 1} L ${x1} ${yh + 6} L ${x1 - 6} ${yh + 12}`, class: "im-fleche-croissance" }));
    g.append(texte((x0 + x1) / 2, yh - 6, pourcent(v, { signe: true, decimales: 1 }), "im-graph-croissance"));
  });
  if (avecMarge) {
    const mv = marges.filter(ok), mn = Math.min(...mv), mx = Math.max(...mv);
    const y = (m) => (mx - mn < 1e-9 ? 38 : 50 - ((m - mn) / (mx - mn)) * 24);
    const pts = marges.map((m, i) => (ok(m) ? [cx(i), y(m)] : null)).filter(Boolean);
    if (pts.length > 1) g.append(svg("polyline", { points: pts.map((q) => q.join(",")).join(" "), class: "im-courbe" }));
    marges.forEach((m, i) => { if (!ok(m)) return; g.append(svg("rect", { x: cx(i) - 4, y: y(m) - 4, width: 8, height: 8, transform: `rotate(45 ${cx(i)} ${y(m)})`, class: "im-courbe-point" })); g.append(texte(cx(i), y(m) - 11, pourcent(m), "im-graph-marge")); });
  }
  return g;
}
/** Répartition du chiffre d'affaires du dernier exercice : charges et EBE (anneau, parts écrites). */
function structureCharges() {
  const c = cr(), i = c.annees.length - 1, ca = serie("chiffre_affaires")[i];
  if (i < 0 || !ok(ca) || ca <= 0) return null;
  const v = (cle) => Math.abs(serie(cle)[i] ?? 0);
  const parts = [[tr("memo.js.charges.achats"), v("achats_consommes"), "#C9A37E"], [tr("memo.js.charges.externes"), v("charges_externes"), "#9DB8A8"],
    [tr("memo.js.charges.personnel"), v("charges_personnel"), "#2B5040"], [tr("memo.js.charges.impots"), v("impots_taxes"), "#D9CDB8"], [tr("demarrer.js.chiffres.ebe"), serie("ebe")[i], "#A8653A"]]
    .filter(([, x]) => ok(x) && x > 0);
  const total = parts.reduce((a, [, x]) => a + x, 0);
  if (Math.abs(total - ca) / ca > 0.08) return null; // autres produits ou postes non détaillés : on ne dessine pas un anneau faux
  const R = 60, ep = 22, C = 2 * Math.PI * R;
  const g = svg("svg", { viewBox: "0 0 160 160", class: "im-anneau-charges", role: "img", "aria-label": tr("memo.js.charges.aria", { annee: c.annees[i], liste: parts.map(([l, x]) => `${l} ${pourcent(x / ca, { decimales: 0 })}`).join(", ") }) });
  let cumul = 0;
  for (const [, x, coul] of parts) { const l = (x / total) * C; g.append(svg("circle", { cx: 80, cy: 80, r: R, fill: "none", stroke: coul, "stroke-width": ep, "stroke-dasharray": `${l} ${C}`, "stroke-dashoffset": String(-cumul), transform: "rotate(-90 80 80)" })); cumul += l; }
  const t = svg("text", { x: 80, y: 78, "text-anchor": "middle", class: "im-anneau-val" }); t.textContent = montant(ca); g.append(t);
  const t2 = svg("text", { x: 80, y: 95, "text-anchor": "middle", class: "im-anneau-lib" }); t2.textContent = tr("memo.js.charges.ca", { annee: c.annees[i] }); g.append(t2);
  return el("div", { class: "im-charges" }, g, el("ul", { class: "im-charges-legende" }, ...parts.map(([l, x, coul]) => el("li", {}, el("i", { style: `background:${coul}` }), el("span", { text: l }), el("strong", { text: pourcent(x / ca, { decimales: 0 }) })))));
}
/** Besoin en fonds de roulement en jours de chiffre d'affaires, par exercice (barres horizontales). */
function graphiqueBfr() {
  const bfr = (ch().endettement?.bfr || []).filter((b) => ok(b.jours));
  if (bfr.length < 2) return null;
  return barresH(bfr.map((b, k) => ({ libelle: String(b.annee), valeur: Math.max(0, b.jours), texte: tr("memo.js.jours", { n: Math.round(b.jours) }), accent: k === bfr.length - 1 })));
}
/** Ligne de graphique : libellé à gauche dans un cartouche, graphique, pastille de croissance. */
const ligneGraphique = (libelle, graphique, pastille) => (graphique ? el("div", { class: "im-ligne-graph" },
  el("div", { class: "im-ligne-lib" }, el("span", { text: libelle })),
  el("div", { class: "im-ligne-corps" }, pastille ? el("span", { class: "im-pastille-tcam", text: pastille }) : null, graphique)) : null);

/** Tableau financier : en-tête plein, totaux sur fond, ratios en italique, négatifs entre parenthèses, repères numérotés. */
function tableau({ annees, lignes, enTete = tr("memo.js.tableau.en_keur"), colonneSup = null }) {
  return el("table", { class: "im-tableau" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: enTete }), ...annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })), colonneSup ? el("th", { scope: "col", class: "num sup", text: colonneSup.titre }) : null)),
    el("tbody", {}, ...lignes.map((l) => el("tr", { class: `t-${l.type || "montant"}` },
      el("th", { scope: "row" }, l.renvoi ? carre(l.renvoi, "petit") : null, l.libelle),
      ...l.valeurs.map((v, k) => el("td", { class: "num", text: !ok(v) && (l.vide === "tiret" || (l.cle === "croissance" && k === 0)) ? "–" : l.type === "ratio" ? ratioTableau(v) : l.type === "texte" ? (ok(v) ? tr("memo.js.j", { n: Math.round(v) }) : tr("dossier.formats.nd")) : kEuros(v) })),
      colonneSup ? el("td", { class: "num sup", text: colonneSup.valeurs[l.cle] ?? "" }) : null))));
}
function tableauCompteResultat() {
  const c = cr();
  if (!c.annees.length) return aRediger(tr("memo.js.tableau.cr_vide"));
  const t = c.tcam, sup = t && c.annees.length >= 2 ? { titre: tr("memo.js.tcam", { de: String(t.de).slice(2), a: String(t.a).slice(2) }), valeurs: { chiffre_affaires: ok(t.ca) ? pourcent(t.ca, { signe: true }) : tr("dossier.formats.nd"), ebe: ok(t.ebe) ? pourcent(t.ebe, { signe: true }) : tr("dossier.formats.nd") } } : null;
  return tableau({ annees: c.annees, lignes: c.lignes, colonneSup: sup });
}
/** Passage de l'EBE comptable à l'EBE retraité, chaque retraitement justifié renvoyant à son commentaire. */
function ebeRetraite() {
  const t = ch().ebe_retraite;
  if (!t?.annees?.length) return null;
  const justifs = [], lignes = [{ cle: "ebe_comptable", libelle: tr("memo.js.ebe.comptable"), type: "total", valeurs: t.ebe_comptable }];
  for (const r of t.retraitements) {
    let renvoi = null;
    if (r.justification) { justifs.push([r.libelle, r.justification]); renvoi = justifs.length; }
    lignes.push({ cle: r.cle, libelle: r.libelle, type: "montant", valeurs: r.valeurs, renvoi, vide: "tiret" });
  }
  lignes.push({ cle: "ebe_retraite", libelle: tr("memo.js.ebe.retraite"), type: "total", valeurs: t.ebe_retraite }, { cle: "ca", libelle: tr("demarrer.js.chiffres.ca"), type: "montant", valeurs: t.annees.map((a) => serie("chiffre_affaires")[cr().annees.indexOf(a)] ?? null) }, { cle: "marge", libelle: tr("memo.js.ebe.marge_retraitee"), type: "ratio", valeurs: t.marge_retraitee });
  const normatif = t.normatif && ok(t.normatif.valeur) ? tr("memo.js.ebe.normatif", { montant: montant(t.normatif.valeur), base: t.normatif.mode === "dernier" ? tr("dossier.formats.exercice", { annee: t.normatif.annees.at(-1) }) : tr("valorisation.js.moyenne", { annees: t.normatif.annees.join(", ") }) }) : null;
  return { table: tableau({ annees: t.annees, lignes }), justifs, normatif, vide: !t.retraitements.length, pont: pontEbe(t) };
}
/** Pont (cascade) de l'EBE comptable à l'EBE retraité, dernier exercice ; chaque retraitement est une marche. */
function pontEbe(t) {
  const i = t.annees.length - 1, depart = t.ebe_comptable[i], arrivee = t.ebe_retraite[i];
  const marches = t.retraitements.map((r) => ({ libelle: r.libelle, v: r.valeurs[i] })).filter((m) => ok(m.v) && Math.round(m.v / 1000) !== 0);
  if (!ok(depart) || !ok(arrivee) || !marches.length) return null;
  const barres = [{ libelle: tr("memo.js.ebe.comptable"), v: depart, total: true }, ...marches, { libelle: tr("memo.js.ebe.retraite"), v: arrivee, total: true }];
  let cumul = 0; const pos = barres.map((b) => { if (b.total) { cumul = b.v; return [0, b.v]; } const a = cumul; cumul += b.v; return [a, cumul]; });
  const hauts = pos.flat(), mx = Math.max(...hauts, 1), mn = Math.min(0, ...hauts);
  const L = 640, H = 210, bas = 150, haut = 30, pas = L / barres.length, w = Math.min(70, pas * 0.5);
  const y = (v) => bas - ((v - mn) / (mx - mn)) * (bas - haut);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "im-graph im-pont", role: "img", "aria-label": tr("memo.js.ebe.pont_aria", { annee: t.annees[i], liste: barres.map((b) => tr("memo.js.ebe.pont_point", { libelle: b.libelle, valeur: kEuros(b.v) })).join(" ; ") }) });
  const texte = (x, yy, s, classe) => { const e = svg("text", { x, y: yy, class: classe, "text-anchor": "middle" }); e.textContent = s; return e; };
  g.append(svg("line", { x1: 0, x2: L, y1: y(0), y2: y(0), class: "im-axe" }));
  barres.forEach((b, k) => {
    const cx = k * pas + pas / 2, [a, z] = pos[k], h = Math.abs(y(a) - y(z));
    g.append(svg("rect", { x: cx - w / 2, y: Math.min(y(a), y(z)), width: w, height: Math.max(1.5, h), class: b.total ? "im-barre" : b.v >= 0 ? "im-barre-plus" : "im-barre-moins" }));
    if (k < barres.length - 1) g.append(svg("line", { x1: cx + w / 2, x2: cx + pas - w / 2, y1: y(z), y2: y(z), class: "im-pont-lien" }));
    g.append(texte(cx, Math.min(y(a), y(z)) - 7, b.total ? kEuros(b.v) : `${b.v > 0 ? "+" : ""}${kEuros(b.v)}`, b.total || b.v >= 0 ? "im-graph-val" : "im-graph-val moins"));
    const mots = b.libelle.split(" "), lignesLib = []; let cour = "";
    for (const m of mots) { if ((cour + " " + m).trim().length > 19 && cour) { lignesLib.push(cour); cour = m; } else cour = (cour + " " + m).trim(); }
    lignesLib.push(cour);
    lignesLib.slice(0, 4).forEach((l, j) => g.append(texte(cx, bas + 20 + j * 14, l, "im-graph-an")));
  });
  return g;
}
function tableauDette() {
  const e = ch().endettement;
  if (!e) return null;
  const lignes = e.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, type: "montant", valeurs: [l.montant] }));
  lignes.push({ cle: "total", libelle: e.total <= 0 ? tr("memo.js.dette.tresorerie_nette") : tr("memo.js.dette.dette_nette"), type: "total", valeurs: [e.total <= 0 ? -e.total : e.total] });
  return tableau({ annees: [tr("memo.js.dette.au", { annee: e.annee ?? "" })], lignes });
}
function tableauBfr() {
  const bfr = (ch().endettement?.bfr || []).filter((b) => ok(b.jours));
  if (!bfr.length) return null;
  return tableau({ annees: bfr.map((b) => b.annee), enTete: tr("memo.js.bfr.titre"), lignes: [{ cle: "bfr", libelle: tr("memo.js.tableau.en_keur"), type: "total", valeurs: bfr.map((b) => b.montant) }, { cle: "jours", libelle: tr("memo.js.bfr.jours"), type: "texte", valeurs: bfr.map((b) => b.jours) }] });
}
/** Cinq premiers clients, anonymes : part du chiffre d'affaires, ancienneté de la relation. */
function tableauClients() {
  const c = ch().clients;
  if (!c?.lignes?.length) return null;
  const an = new Date().getFullYear(), mx = Math.max(...c.lignes.map((y) => y.part));
  return el("table", { class: "im-tableau im-tableau-clients" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: tr("memo.js.clients.client") }), el("th", { scope: "col", text: tr("memo.js.clients.activite") }), el("th", { scope: "col", text: tr("demarrer.js.clients.part") }), el("th", { scope: "col", class: "num", text: tr("demarrer.js.clients.depuis") }))),
    el("tbody", {}, ...c.lignes.map((x) => el("tr", {},
      el("th", { scope: "row", text: tr("demarrer.js.clients.client", { n: x.rang }) }), el("td", { text: x.secteur || tr("dossier.formats.nd") }),
      el("td", {}, el("span", { class: "im-part" }, el("span", { class: "im-part-barre", style: `width:${Math.min(100, (x.part * 100) / mx).toFixed(0)}%` }), el("strong", { text: pct0(x.part) }))),
      el("td", { class: "num", text: ok(x.anciennete) ? String(an - x.anciennete) : tr("dossier.formats.nd") })))));
}

/** Carte des régions : siège, régions des clients, reste du territoire. */
function carteFrance() {
  const q = p();
  const clients = new Set(q.clients?.regions || []);
  const zone = (q.zone || "").toLowerCase();
  const nationale = zone.startsWith("nationale") || zone.startsWith("internationale");
  const g = svg("svg", { viewBox: `-10 -10 ${CARTE.largeur + 20} ${CARTE.hauteur + 20}`, class: "dp-carte-svg", role: "img",
    "aria-label": tr("memo.js.carte.aria", { region: q.region || tr("memo.js.carte.region_inconnue") }) + (clients.size ? tr("memo.js.carte.clients", { liste: [...clients].join(", ") }) : "") + (nationale ? tr("memo.js.carte.nationale") : "") });
  for (const [nom, r] of Object.entries(CARTE.regions)) g.append(svg("path", { d: r.d, class: `dp-region ${nom === q.region ? "siege" : clients.has(nom) ? "clients" : nationale ? "national" : "autre"}` }));
  if (q.region && CARTE.regions[q.region]) { const [cx, cy] = CARTE.regions[q.region].centre; g.append(svg("circle", { cx, cy, r: 16, class: "dp-carte-siege" })); }
  return el("figure", { class: "im-carte" }, g,
    el("figcaption", { class: "im-legende" }, el("span", { class: "im-pastille siege" }), tr("memo.js.carte.siege"),
      clients.size ? [el("span", { class: "im-pastille clients" }), tr("memo.js.carte.regions_clientes")] : null,
      nationale ? [el("span", { class: "im-pastille national" }), tr("memo.js.carte.presence_nationale")] : null));
}

/** Organigramme juridique : cédant, holding éventuelle, société, murs ; périmètre de cession en pointillés. */
function organigramme() {
  const pe = ch().perimetre || {};
  const boite = (t, classe, detail) => el("div", { class: `im-org-boite ${classe}` }, el("strong", { text: t }), detail ? el("span", { text: detail }) : null);
  const lien = (t) => el("div", { class: "im-org-lien" }, t ? el("span", { text: t }) : null);
  const mursDedans = pe.murs === "À l'entreprise elle-même" || (pe.murs_cession || "").startsWith("Oui");
  const murs = pe.murs && pe.murs !== "Pas de locaux en propre"
    ? boite(tr("memo.js.org.murs"), "murs", pe.murs === "À l'entreprise elle-même" ? tr("memo.js.org.murs_societe") : pe.murs === "À un propriétaire extérieur" ? tr("memo.js.org.murs_tiers") : tr("memo.js.org.murs_dirigeant", { cession: pe.murs_cession ? libelleOption("murs_cession", pe.murs_cession).replace(/^(Oui|Non|Yes|No), /, "") : tr("memo.js.org.cession_a_preciser") }))
    : null;
  return el("div", { class: "im-org" },
    el("div", { class: "im-org-col" },
      boite(pe.associes ? tr("memo.js.org.dirigeant_associes") : tr("memo.js.org.dirigeant_cedant"), "personne", pe.detention ? null : tr("memo.js.org.detention_a_completer")),
      lien(pe.part_cedee ? libelleOption("part_cedee", pe.part_cedee) : ""),
      pe.holding ? [boite(tr("memo.js.org.holding"), "holding", tr("memo.js.org.holding_detail")), lien(tr("espace.js.pct", { n: 100 }))] : null,
      el("div", { class: "im-org-perimetre" }, boite(etat.entreprise || tr("memo.js.org.societe"), "societe", tr("memo.js.org.exploitation")), mursDedans && murs ? murs : null, el("span", { class: "im-org-perimetre-lib", text: tr("memo.js.org.perimetre") }))),
    !mursDedans && murs ? el("div", { class: "im-org-hors" }, murs, el("span", { class: "im-org-perimetre-lib", text: tr("memo.js.org.hors_perimetre") })) : null,
    el("ul", { class: "im-org-legende" }, el("li", { class: "personne", text: tr("memo.js.org.personne_physique") }), pe.holding ? el("li", { class: "holding", text: tr("memo.js.org.holding_court") }) : null, el("li", { class: "societe", text: tr("memo.js.org.societe") })));
}

const photoUrl = (n) => (n != null && etat.photos?.[n] ? `${base}/photos/${n}?v=${etat.versionPhotos}` : null);
/** Placement des photos par catégorie (une seule fois chacune), recalculé à chaque dessin du mémorandum. */
let placement = { couverture: null, activite: [], realisations: [], equipe: null, ouvertures: [] };
const photoPour = (usage) => photoUrl(usage === "activite" ? placement.activite[0] : placement[usage]);
function photo(n, attendu = tr("memo.js.photos.photo_n", { n: "" }).trim()) {
  const u = photoUrl(n);
  if (n == null) return el("div", { class: "im-photo-vide" }, el("span", { text: tr("memo.js.photos.a_ajouter", { quoi: attendu }) }), el("span", { class: "petit", text: tr("memo.js.photos.ou") }));
  return u ? el("figure", { class: "im-photo" }, el("img", { src: u, alt: etat.photos[n].legende || tr("memo.js.photos.entreprise") }), etat.photos[n].legende ? el("figcaption", { text: etat.photos[n].legende }) : null)
    : el("div", { class: "im-photo-vide" }, el("span", { text: tr("memo.js.photos.a_ajouter", { quoi: attendu }) }), el("span", { class: "petit", text: tr("memo.js.photos.ou") }));
}

/** Frise historique : axe épais, années cerclées, faits au-dessus et au-dessous en alternance (6 au plus). */
function pointsFrise(texte) {
  const phrases = String(texte).replace(/\*\*/g, "").replace(/\n/g, " ").replace(/\s+-\s+/g, " ").split(/(?<=\.)\s+/);
  const points = new Map();
  if (p().creation) points.set(p().creation, tr("memo.js.frise.creation"));
  for (const ph of phrases) for (const m of ph.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (!points.has(Number(m[1]))) points.set(Number(m[1]), majuscule(ph.replace(/^[-•▪\s]*\d{4}\s*[:–-]\s*/, "")).slice(0, 90));
  return [...points.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
}
function frise(points) {
  if (points.length < 2) return null;
  return el("div", { class: "im-bloc-frise" }, el("div", { class: "im-etiquette-v" }, el("span", { text: tr("memo.js.frise.historique") })),
    el("ol", { class: "im-frise", style: `--n:${points.length}` }, ...points.map(([a, t], k) => el("li", { class: k % 2 ? "bas" : "haut" }, el("span", { class: "im-frise-txt", text: t }), el("span", { class: "im-frise-an", text: String(a) })))));
}

/** Structure du secteur (registres publics). */
const faitsMarche = () => (etat.marche?.faits || []).filter((f) => f.valide);
const THEMES = ["taille", "tendance", "demande", "reglementation", "concurrence"];
const srcFait = (f) => `${f.source || new URL(f.url).hostname}${f.annee ? `, ${f.annee}` : ""}`;

/** Structure du secteur en cercles emboîtés, aires proportionnelles aux effectifs (registres publics). */
function cerclesSecteur(sct) {
  const n = (cles) => cles.reduce((a, k) => a + (sct.repartition.find((x) => x.cle === k)?.n || 0), 0);
  const niveaux = [
    { n: sct.region_total, lib: tr("memo.js.cercles.actives", { region: sct.region }), classe: "c1", pref: sct.region_plafonne ? "> " : "" },
    { n: n(["1_9", "10_49", "50_plus"]), lib: tr("memo.js.cercles.un_salarie"), classe: "c2" },
    { n: n(["10_49", "50_plus"]), lib: tr("memo.js.cercles.dix_salaries"), classe: "c3" },
  ].filter((x) => x.n > 0);
  if (niveaux.length < 2) return null;
  const R = 150, cx = 160, bas = 312;
  const g = svg("svg", { viewBox: "0 0 320 330", class: "im-cercles", role: "img", "aria-label": niveaux.map((x) => `${entier(x.n)} ${x.lib}`).join(" ; ") });
  niveaux.forEach((x, k) => {
    const r = R * Math.sqrt(x.n / niveaux[0].n);
    g.append(svg("circle", { cx, cy: bas - r, r, class: `im-cercle ${x.classe}` }));
    const rSuivant = niveaux[k + 1] ? R * Math.sqrt(niveaux[k + 1].n / niveaux[0].n) : 0;
    const ty = k === niveaux.length - 1 ? bas - r + 8 : bas - 2 * r + Math.max(26, (2 * r - 2 * rSuivant) / 2 + 8);
    const t1 = svg("text", { x: cx, y: ty, class: `im-cercle-val ${x.classe}`, "text-anchor": "middle" }); t1.textContent = `${x.pref || ""}${entier(x.n)}`; g.append(t1);
  });
  const legende = el("ul", { class: "im-cercles-legende" }, ...niveaux.map((x) => el("li", { class: x.classe }, el("i"), el("strong", { text: `${x.pref || ""}${entier(x.n)}` }), el("span", { text: x.lib }))));
  return el("figure", { class: "im-cercles-zone" }, el("p", { class: "im-encoche-titre", text: tr("memo.js.cercles.naf", { naf: sct.naf }) }), g, legende,
    sct.part_meme_taille_ou_plus != null ? el("p", { class: "im-cercles-note" }, el("strong", { text: pct0(sct.part_meme_taille_ou_plus) }), tr("memo.js.cercles.note")) : null);
}

// ------------------------------------------------------------------ Pages fixes
function couverture() {
  const q = p();
  const u = photoPour("couverture");
  return el("div", { class: "diapo im-couverture" },
    el("div", { class: "im-couv-cadre" }, u ? el("div", { class: "im-couv-photo", style: `background-image:url('${u}')` }) : motif(),
      el("div", { class: "im-couv-titre" }, el("p", { class: "im-couv-etiquette", text: tr("memo.memorandum_information") }), el("h2", { text: q.nom_de_code || tr("teaser.js.projet") }),
        q.secteur || q.region ? el("p", { class: "im-couv-sous", text: [q.secteur, q.region].filter(Boolean).join(" · ") }) : null)),
    el("div", { class: "im-encoche-carte im-couv-encoche" },
      logoEntreprise("im-couv-logo"),
      el("span", { class: "im-pilule", text: tr("teaser.js.confidentiel") }), el("strong", { text: majuscule(moisAnnee()) }), logoPassation()));
}
function pageOuverture(partie, k) {
  const u = photoUrl(placement.ouvertures[k] ?? null);
  const num = String(partie.n).padStart(2, "0");
  const chapitres = etat.sections.filter((s) => s.partie === partie.n);
  return el("div", { class: "diapo im-ouverture", "data-partie": String(partie.n) },
    el("div", { class: "im-ouv-cadre" }, u ? el("div", { class: "im-ouv-photo", style: `background-image:url('${u}')` }) : motif(),
      el("div", { class: "im-ouv-titre" },
        el("p", { class: "im-ouv-num", "aria-hidden": "true" }, el("span", { class: "zero", text: num[0] }), num[1]),
        el("h2", { text: partie.titre }), partie.detail ? el("p", { class: "im-ouv-detail", text: partie.detail }) : null)),
    el("div", { class: "im-encoche-carte im-ouv-encoche" }, el("p", { class: "im-encoche-titre", text: tr("memo.js.dans_partie") }),
      el("ol", {}, ...chapitres.map((s) => el("li", {}, el("span", { class: "im-som-sous", "data-num-section": s.cle }), el("span", { text: s.titre }))))));
}
function pageSommaire() {
  return page({ titre: tr("memo.js.sommaire"), numerotee: false, classe: "im-sommaire", contenu: [el("ol", { class: "im-som" }, ...(etat.parties || []).map((pt) => el("li", {},
    el("div", { class: "im-som-partie" }, el("span", { class: "im-som-num", text: String(pt.n).padStart(2, "0") }), el("strong", { text: pt.titre }), el("span", { class: "im-som-page", "data-renvoi-partie": String(pt.n) })),
    el("ul", {}, ...etat.sections.filter((s) => s.partie === pt.n).map((s) => el("li", {}, el("span", { class: "im-som-sous", "data-num-section": s.cle }), el("a", { href: `#s-${s.cle}`, text: s.titre }), el("span", { class: "im-som-page", "data-renvoi": s.cle }))))))) ] });
}
function pageGlossaire() {
  const table = (lignes) => el("table", { class: "im-gloss" }, el("tbody", {}, ...lignes.map(([k, v]) => el("tr", {}, el("th", { scope: "row", text: k }), el("td", { text: v })))));
  return page({ titre: tr("memo.js.glossaire.titre"), numerotee: false, contenu: [el("div", { class: "im-glossaire" },
    encadre(tr("memo.js.glossaire.financiers"), table(tr("memo.js.glossaire.termes_financiers"))),
    encadre(tr("memo.js.glossaire.document"), table(tr("memo.js.glossaire.termes_document"))))] });
}
function pageAvertissement() {
  return page({ titre: tr("memo.js.avertissement.titre"), numerotee: false, contenu: [el("div", { class: "im-avert" },
    ...tr("memo.js.avertissement.paragraphes").map((x) => el("p", { text: x })),
    el("p", { class: "im-avert-fort", text: tr("memo.js.avertissement.fort") }),
    logoPassation())] });
}

// ------------------------------------------------------------------ Chapitres
function pagesSynthese(s) {
  const q = p(), cl = ch().clients || {}, er = ch().ebe_retraite || {};
  const an = cr().annees.at(-1), ca = derniere("chiffre_affaires"), t = cr().tcam, retraite = er.ebe_retraite?.at(-1), marge = er.marge_retraitee?.at(-1), endet = ch().endettement;
  const age = q.creation ? new Date().getFullYear() - q.creation : null;
  const op = q.operation || {};
  const tuile = (valeur, libelle, classe = "") => el("div", { class: `im-tuile-kpi ${classe}`.trim() }, el("strong", { text: valeur }), el("span", { text: libelle }));
  const p1 = chapitre(s, { titre: tr("memo.js.synthese.en_bref", { nom: q.nom_de_code || tr("memo.js.synthese.le_projet") }), contenu: [el("div", { class: "im-grille im-g-synthese" },
    el("div", { class: "im-col-texte" }, corpsTexte(s)),
    el("div", { class: "im-synthese-droite" },
      el("div", { class: "im-kpis" },
        ok(ca) ? tuile(montant(ca), tr("memo.js.kpi.ca", { annee: an }), "vert") : null,
        ok(retraite) ? tuile(montant(retraite), tr("memo.js.kpi.ebe_retraite", { annee: an }) + (ok(marge) ? ` · ${pourcent(marge)}` : "")) : null,
        endet && ok(endet.total) ? tuile(montant(Math.abs(endet.total)), endet.total <= 0 ? tr("memo.js.kpi.tresorerie_nette", { annee: endet.annee }) : tr("memo.js.kpi.dette_nette", { annee: endet.annee })) : null,
        ok(cl.recurrent) ? tuile(pct0(cl.recurrent), tr("teaser.js.ca_recurrent"), "sable") : tuile(effectifCourt(), tr("memo.js.kpi.salaries"), "sable"),
        age ? tuile(tr("memo.js.kpi.ans", { n: age }), tr("memo.js.kpi.existence", { annee: q.creation })) : null,
        t && ok(t.ca) ? tuile(pourcent(t.ca, { signe: true }), tr("memo.js.kpi.croissance", { de: t.de, a: t.a }), "cuivre") : null),
      cr().annees.length ? el("div", { class: "im-carte-graph" }, el("p", { class: "im-carte-graph-titre", text: tr("memo.js.graph.ca_keur") }),
        histogramme({ annees: cr().annees, valeurs: serie("chiffre_affaires"), libelle: tr("demarrer.js.chiffres.ca"), croissance: true })) : null,
      el("div", { class: "im-operation-mini" }, el("p", { class: "im-encoche-titre", text: tr("memo.js.operation.envisagee") }),
        tableCles([[tr("memo.js.operation.part_cedee"), op.part_cedee ? libelleOption("part_cedee", op.part_cedee) : tr("teaser.js.a_completer")], [tr("memo.js.operation.motif"), op.motif ? libelleOption("motif", op.motif) : tr("teaser.js.a_completer")], [tr("memo.js.operation.calendrier"), op.calendrier ? libelleOption("calendrier", op.calendrier) : tr("teaser.js.a_completer")]]))))],
    sources: [sourceChiffres(), SOURCES.publiques, SOURCES.dirigeant, SOURCES.calculs] });
  const pf = [1, 2, 3, 4, 5, 6].map((n) => etat.sections.find((x) => x.point_fort === n)).filter(Boolean);
  const p2 = page({ s, ancre: false, titre: tr("memo.js.synthese.considerations"), message: tr("memo.js.synthese.six_points"), contenu: [
    el("div", { class: "im-considerations" }, ...pf.map((x, k) => el("article", { class: `im-cons${k === 0 ? " vert" : k === 4 ? " sable" : ""}` },
      el("div", { class: "im-cons-tete" }, el("span", { class: "im-cons-num", text: String(x.point_fort).padStart(2, "0") }), el("span", { class: "im-cons-fleche", "aria-hidden": "true", text: "↗" })),
      el("p", { class: "im-cons-theme", text: x.titre }),
      x.redigee ? el("strong", { class: "im-cons-titre", text: titreDe(x) }) : aRediger(x.court),
      x.redigee && x.accroche ? el("p", { class: "im-cons-texte", text: x.accroche }) : null,
      el("a", { class: "im-voir", href: `#s-${x.cle}`, "data-renvoi": x.cle, text: "" }))))],
    sources: [SOURCES.dirigeant, SOURCES.calculs] });
  return [p1, p2];
}

/**
 * Page « L'équipe dirigeante » (chapitre Organisation) : une carte par personne, photo (avec consentement enregistré)
 * ou initiales, nom, rôle, parcours rédigé par Claude à partir de ses seules réponses (à défaut, formation et
 * expériences telles que saisies), ancienneté, place après la cession. Bandeau de transition écrit par le code.
 */
function pageEquipe(s) {
  const l = etat.equipe?.personnes || [];
  if (!l.length) return null;
  const carte = (x) => el("article", { class: "im-eq-carte" },
    x.a_photo ? el("div", { class: "im-eq-photo" }, el("img", { src: `${base}/equipe/${x.id}/photo?v=${etat.versionPhotos}`, alt: tr("memo.js.equipe.photo_de", { nom: x.nom }) }))
      : el("div", { class: "im-eq-initiales", role: "img", "aria-label": tr("memo.js.equipe.sans_photo", { nom: x.nom }), text: initiales(x.nom) }),
    el("div", { class: "im-eq-corps" },
      el("h4", { class: "im-eq-nom", text: x.nom }),
      el("p", { class: "im-eq-role", text: libelleRole(x) }),
      el("p", { class: "im-eq-parcours", text: s.parcours?.[x.id] || parcoursDeSecours(x) || tr("teaser.js.a_completer") }),
      el("p", { class: "im-eq-chiffres" },
        x.anciennete != null ? el("span", {}, el("b", { text: tr("memo.js.kpi.ans", { n: x.anciennete }) }), ` ${tr("memo.js.equipe.dans_entreprise")}`) : null,
        x.experience != null ? el("span", {}, el("b", { text: tr("memo.js.kpi.ans", { n: x.experience }) }), ` ${tr("memo.js.equipe.de_metier")}`) : null),
      x.apres ? el("p", { class: `im-eq-apres ${x.apres}`, text: libelleApres(x) }) : null));
  return page({ s, ancre: false, titre: tr("memo.js.equipe.titre"), classe: "im-page-equipe",
    contenu: [el("div", { class: "im-eq-cartes", style: `--n:${l.length}` }, ...l.map(carte))],
    conclusion: transitionEquipe(etat.equipe), sources: [SOURCES.dirigeant], notes: l.some((x) => x.a_photo) ? [tr("memo.js.equipe.photos_accord")] : [] });
}
/** Page « Réalisations » (chapitre Activité) : à partir de trois photos de réalisations validées. */
function pageRealisations(s) {
  const l = placement.realisations || [];
  if (l.length < 3) return null;
  return page({ s, ancre: false, titre: tr("memo.js.realisations.titre"), classe: "im-page-realisations",
    contenu: [el("div", { class: "im-realisations", style: `--n:${Math.min(3, l.length)}` }, ...l.map((n) => photo(n)))],
    sources: [SOURCES.dirigeant] });
}

function pagesChapitre(s) {
  const q = p(), cl = ch().clients || {};
  const an = cr().annees.at(-1), ca = derniere("chiffre_affaires");
  switch (s.cle) {
    case "histoire": {
      const pts = s.redigee ? pointsFrise(s.contenu) : [];
      const items = s.redigee ? textePuces(s).filter((t) => !(pts.length >= 2 && /^\d{4}$/.test(eclaterPuce(t).titre || ""))) : [];
      return [chapitre(s, { contenu: [
        bandeChiffres([q.creation ? [String(q.creation), tr("memo.js.histoire.creation")] : null, q.creation ? [tr("memo.js.kpi.ans", { n: new Date().getFullYear() - q.creation }), tr("memo.js.histoire.existence")] : null, [q.region || tr("dossier.formats.nd"), tr("memo.js.histoire.region_siege") + (q.ville ? ` (${q.ville})` : "")], [effectifCourt(), tr("memo.js.histoire.salaries_insee")]]),
        frise(pts), s.redigee ? puces(items) : aRediger(s.court)],
        sources: [SOURCES.publiques, faitsSite("histoire", "implantation") ? SOURCES.site : null, SOURCES.dirigeant] })];
    }
    case "activite":
      return [...[chapitre(s, { contenu: [el("div", { class: "im-grille im-g-texte-encadre" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-pile" }, encadre(tr("memo.js.activite.donnees_cles"), tableCles([[tr("teaser.js.tuiles.secteur"), q.secteur], [tr("memo.js.activite.zone"), q.zone ? libelleOption("zone", q.zone) : q.zone], [tr("memo.js.kpi.salaries"), effectifCourt()], [tr("memo.js.kpi.ca", { annee: an ?? "" }).trim(), ok(ca) ? montant(ca) : null], [tr("memo.js.histoire.region_siege"), q.region]])), encadre(tr("memo.js.activite.en_images"), photo(placement.activite[0] ?? null, tr("memo.js.activite.photo_atelier")))))],
        sources: [SOURCES.publiques, SOURCES.dirigeant, faitsSite("activite", "produits", "qualite") ? SOURCES.site : null] })], pageRealisations(s)].filter(Boolean);
    case "organisation":
      return [chapitre(s, { contenu: [el("div", { class: "im-grille im-g-texte-encadre" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-pile" }, encadre(tr("memo.js.organisation.effectifs"), bandeChiffres([[effectifCourt(), tr("memo.js.kpi.salaries")], [q.ville || tr("dossier.formats.nd"), tr("memo.js.organisation.site_principal")]]), tableCles([[tr("memo.js.organisation.creation"), q.creation ? String(q.creation) : null], [tr("memo.js.organisation.region"), q.region]])), encadre(tr("memo.js.organisation.equipe"), photo(placement.equipe, tr("memo.js.organisation.photo_equipe")))))],
        sources: [SOURCES.publiques, SOURCES.dirigeant, faitsSite("equipe") ? SOURCES.site : null] }), pageEquipe(s)].filter(Boolean);
    case "marche": {
      const sct = etat.marche?.secteur, faits = faitsMarche();
      const pages = [chapitre(s, { contenu: [el("div", { class: `im-grille ${sct ? "im-g-marche" : "im-g-texte-encadre"}` }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        sct ? cerclesSecteur(sct) : null,
        sct ? encadre(tr("memo.js.marche.structure_region", { region: sct.region }), el("p", { class: "im-legende-graph", text: tr("memo.js.marche.par_tranche", { naf: sct.naf }) }),
          barresH(sct.repartition.map((x) => ({ libelle: x.libelle, valeur: x.n || 0, texte: `${x.n == null ? tr("dossier.formats.nd") : entier(x.n)} · ${pct0(x.part)}`, accent: x.cle === sct.bande_entreprise }))),
          sct.part_meme_taille_ou_plus != null ? info(tr("memo.js.marche.en_couleur", { n: entier(sct.nombre_meme_taille_ou_plus_region) })) : null)
          : encadre(tr("memo.js.marche.structure"), aRediger(tr("memo.js.marche.lancez"))))],
        sources: [sct?.source || tr("memo.js.marche.annuaire"), SOURCES.dirigeant] })];
      if (faits.length) {
        const themes = THEMES.map((t) => [t, faits.filter((f) => f.theme === t)]).filter(([, l]) => l.length);
        const tuiles = themes.map(([, l]) => l.find((f) => f.chiffre)).filter(Boolean).slice(0, 3);
        pages.push(page({ s, ancre: false, titre: tr("memo.js.marche.moteurs"), message: tr("memo.js.marche.moteurs_message"), contenu: [el("div", { class: `im-grille ${tuiles.length ? "im-g-moteurs" : ""}` },
          el("ol", { class: "im-moteurs", "data-decoupable": "" }, ...themes.map(([t, l], k) => el("li", {}, el("span", { class: "im-rond", text: String(k + 1) }),
            el("div", {}, el("h5", { text: themeFait(t) }), el("ul", { class: "im-puces" }, ...l.map((f) => el("li", {}, el("span", {}, ...surligne(f.fait, f.chiffre), el("em", { class: "im-src", text: ` (${srcFait(f)})` }))))))))),
          tuiles.length ? el("aside", { class: "im-tuiles" }, ...tuiles.map((f) => el("div", { class: "im-tuile" }, el("strong", { text: f.chiffre }), el("span", { text: themeFait(f.theme) }), el("em", { text: srcFait(f) })))) : null)],
          sources: [...new Set(faits.map(srcFait))].slice(0, 6) }));
      }
      return pages;
    }
    case "clients": {
      const conc = barresH([ok(cl.premier) ? { libelle: tr("memo.js.clients.premier"), valeur: cl.premier, texte: pct0(cl.premier) } : null,
        ok(cl.cinq) && cl.cinq_complet ? { libelle: tr("memo.js.clients.cinq"), valeur: cl.cinq, texte: pct0(cl.cinq) } : null,
        ok(cl.recurrent) ? { libelle: tr("memo.js.clients.recurrent"), valeur: cl.recurrent, texte: pct0(cl.recurrent), accent: true } : null], { max: 1 });
      const tc = tableauClients();
      return [chapitre(s, { contenu: [el("div", { class: "im-grille im-g-clients" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-g-clients-droite" },
          encadre(tr("memo.js.clients.concentration"), conc ? [el("p", { class: "im-legende-graph", text: tr("memo.js.clients.en_pct") }), conc] : aRediger(tr("memo.js.clients.part_premiers"))),
          encadre(tr("memo.js.clients.implantation"), carteFrance(), q.zone ? el("p", { class: "im-legende-graph", text: tr("memo.js.clients.zone", { zone: libelleOption("zone", q.zone) }) }) : null),
          tc ? el("div", { class: "im-pleine" }, encadre(ch().clients.lignes.length === 5 ? tr("memo.js.clients.cinq_premiers") : tr("memo.js.clients.premiers"), tc)) : null))],
        sources: [SOURCES.dirigeant, faitsSite("clients", "marche") ? SOURCES.site : null, tr("memo.js.clients.fond_carte")] })];
    }
    case "finances": {
      const src = [sourceChiffres(), tr("memo.js.finances.retraitements_declares"), SOURCES.calculs];
      const c = cr(), t = c.tcam, er = ch().ebe_retraite, endet = ch().endettement;
      const avecRetraite = er?.ebe_retraite?.some(ok);
      const ebeAnnees = avecRetraite ? er.annees : c.annees, ebeVals = avecRetraite ? er.ebe_retraite : serie("ebe"), marges = avecRetraite ? er.marge_retraitee : serie("ebe_pct");
      const retraite = er?.ebe_retraite?.at(-1), marge = er?.marge_retraitee?.at(-1);
      const tcamTxt = (x) => (t && ok(x) && c.annees.length >= 2 ? tr("teaser.js.deux_points", { titre: tr("memo.js.tcam", { de: t.de, a: t.a }), valeur: pourcent(x, { signe: true }) }) : null);
      const charges = structureCharges();
      const ratios = [ok(marge) ? [pourcent(marge), tr("memo.js.ebe.marge_retraitee"), "graphe"] : null,
        ok(serie("marge_brute_pct").at(-1)) ? [pourcent(serie("marge_brute_pct").at(-1)), tr("memo.js.finances.marge_brute"), "euro"] : null,
        ok(serie("resultat_net_pct").at(-1)) ? [pourcent(serie("resultat_net_pct").at(-1)), tr("memo.js.finances.marge_nette"), "valide"] : null,
        endet && ok(endet.total) ? [montant(Math.abs(endet.total)), endet.total <= 0 ? tr("memo.js.dette.tresorerie_nette") : tr("memo.js.finances.dette_nette"), "balance"] : null].filter(Boolean);
      const pages = [chapitre(s, { titre: tr("memo.js.finances.chiffres_cles"), contenu: [
        c.annees.length ? el("div", { class: "im-chevron-titre" }, tr("memo.js.finances.performances", { periode: periodeExercices(c.annees) })) : aRediger(tr("memo.js.finances.aucun_exercice")),
        el("div", { class: "im-grille im-g-finances" },
          el("div", { class: "im-pile" },
            ligneGraphique(tr("memo.js.graph.ca_keur"), histogramme({ annees: c.annees, valeurs: serie("chiffre_affaires"), libelle: tr("demarrer.js.chiffres.ca"), croissance: true }), tcamTxt(t?.ca)),
            ligneGraphique(tr("memo.js.graph.ebe_marge", { ebe: avecRetraite ? tr("memo.js.ebe.retraite") : tr("demarrer.js.chiffres.ebe") }), histogramme({ annees: ebeAnnees, valeurs: ebeVals, marges, libelle: avecRetraite ? tr("memo.js.ebe.retraite") : tr("demarrer.js.chiffres.ebe") }), avecRetraite ? null : tcamTxt(t?.ebe))),
          el("div", { class: "im-pile" },
            charges ? encadre(tr("memo.js.finances.un_euro", { annee: c.annees.at(-1) }), charges) : null,
            ratios.length ? el("div", { class: "im-ratios" }, ...ratios.map(([v, l, ic]) => el("div", { class: "im-ratio" }, el("span", { class: "im-puce-picto" }, icone(ic, "im-picto")), el("strong", { text: v }), el("span", { text: `${l} ${c.annees.at(-1)}` })))) : null))],
        sources: src })];
      pages.push(page({ s, ancre: false, titre: tr("memo.js.finances.compte_resultat", { periode: periode(c.annees) }).trim(),
        message: ok(ca) ? tr("memo.js.finances.message_ca", { montant: montant(ca), annee: an }) + (t && ok(t.ca) && c.annees.length >= 2 ? tr(t.ca >= 0 ? "memo.js.finances.en_hausse" : "memo.js.finances.en_baisse", { pct: pourcent(Math.abs(t.ca)), de: t.de }) : "") : null,
        contenu: [el("div", { class: "im-grille im-g-tableau" }, tableauCompteResultat(), el("div", { class: "im-col-texte" }, intertitre(tr("memo.js.commentaires")), corpsTexte(s)))],
        notes: c.consecutifs === false ? [tr("memo.js.finances.non_consecutifs")] : [], sources: src }));
      const eb = ebeRetraite();
      if (eb) pages.push(page({ s, ancre: false, titre: tr("memo.js.ebe.retraite"),
        message: ok(retraite) ? tr("memo.js.finances.message_ebe", { montant: montant(retraite), annee: er.annees.at(-1) }) + (ok(marge) ? tr("memo.js.finances.soit_ca", { pct: pourcent(marge) }) : "") : null,
        contenu: [el("div", { class: "im-grille im-g-tableau im-g-auto" }, eb.table, el("div", { class: "im-col-texte" }, intertitre(tr("memo.js.finances.retraitements")),
          eb.justifs.length ? el("ol", { class: "im-renvois", "data-decoupable": "" }, ...eb.justifs.map(([lib, j], k) => el("li", {}, carre(k + 1), el("p", {}, el("strong", { text: tr("demarrer.js.redaction.cause", { liste: lib }) }), j))))
            : el("p", { text: eb.vide ? tr("memo.js.finances.aucun_retraitement") : tr("memo.js.finances.sans_justification") }),
          info(eb.normatif))),
          eb.pont ? encadre(tr("memo.js.finances.pont_titre", { annee: er.annees.at(-1) }), eb.pont) : null],
        sources: src }));
      if (endet) {
        const bfr = (endet.bfr || []).filter((b) => ok(b.jours));
        pages.push(page({ s, ancre: false, titre: tr("memo.js.dette.titre"),
          message: ok(endet.total) ? (endet.total <= 0 ? tr("memo.js.dette.message_tresorerie", { montant: montant(-endet.total), annee: endet.annee }) : tr("memo.js.dette.message_dette", { montant: montant(endet.total), annee: endet.annee }) + (ok(endet.sur_ebe) ? tr("memo.js.dette.soit_ebe", { multiple: multiple(endet.sur_ebe) }) : "")) : null,
          contenu: [el("div", { class: "im-grille im-g-tableau" }, el("div", { class: "im-pile" }, tableauDette(), tableauBfr(), encadre(tr("memo.js.dette.indicateurs"), el("div", { class: "im-bande-chiffres grille-2" }, ...[
                ok(endet.total) ? [montant(Math.abs(endet.total)), endet.total <= 0 ? tr("memo.js.dette.tresorerie_au", { date: tr("memo.js.dette.au", { annee: endet.annee }) }) : tr("memo.js.dette.dette_au", { date: tr("memo.js.dette.au", { annee: endet.annee }) })] : null,
                ok(endet.sur_ebe) && endet.total > 0 ? [multiple(endet.sur_ebe), tr("memo.js.dette.sur_ebe")] : null,
                bfr.length ? [tr("memo.js.j", { n: Math.round(bfr.at(-1).jours) }), tr("memo.js.dette.bfr_jours", { annee: bfr.at(-1).annee })] : null,
                bfr.length >= 2 ? [tr("memo.js.j", { n: Math.round(bfr[0].jours) }), tr("memo.js.dette.bfr_jours", { annee: bfr[0].annee })] : null,
              ].filter(Boolean).map(([v, l]) => el("div", { class: "im-bc" }, el("strong", { text: v }), el("span", { text: l })))))),
            el("div", { class: "im-col-texte" }, intertitre(tr("memo.js.commentaires")), el("ul", { class: "im-puces" },
              el("li", { text: tr("memo.js.dette.convention") }),
              ok(endet.sur_ebe) && endet.total > 0 ? el("li", {}, el("span", {}, tr("memo.js.dette.rapportee"), el("strong", { text: multiple(endet.sur_ebe) }), ".")) : null,
              bfr.length ? el("li", {}, el("span", {}, tr("memo.js.dette.bfr_phrase", { montant: kEuros(bfr.at(-1).montant), annee: bfr.at(-1).annee }), el("strong", { text: tr("memo.js.jours", { n: Math.round(bfr.at(-1).jours) }) }), tr("memo.js.dette.de_ca"))) : null),
              graphiqueBfr() ? encadre(tr("memo.js.dette.bfr_graph"), graphiqueBfr()) : null,
              null))],
          sources: src }));
      }
      return pages;
    }
    case "perspectives": {
      const pe = q.perspectives || {}, t = cr().tcam;
      const tuiles = [ok(pe.croissance) ? [`${pourcent(pe.croissance, { signe: true, decimales: 0 })}`, tr("memo.js.perspectives.croissance"), tr("memo.js.perspectives.estimation")] : null,
        ok(pe.marge_ebe) ? [pourcent(pe.marge_ebe, { decimales: 0 }), tr("memo.js.perspectives.marge"), tr("memo.js.perspectives.estimation")] : null,
        t && ok(t.ca) ? [pourcent(t.ca, { signe: true }), tr("memo.js.perspectives.historique"), tr("memo.js.tcam", { de: t.de, a: t.a })] : null].filter(Boolean);
      const { paragraphes, puces: axes } = decouperTexte(s.redigee ? s.contenu : "");
      const items = axes.length ? axes : paragraphes;
      return [chapitre(s, { contenu: [
        tuiles.length ? el("div", { class: "im-kpis rangee" }, ...tuiles.map(([v, l, d], k) => el("div", { class: `im-tuile-kpi${k === 0 ? " vert" : ""}` }, el("strong", { text: v }), el("span", { text: `${l} · ${d}` })))) : null,
        s.redigee && axes.length && paragraphes.length ? el("p", { class: "im-chapeau" }, ...enrichi(paragraphes.join(" "))) : null,
        s.redigee ? el("ol", { class: `im-piliers n${Math.min(5, items.length)}`, style: `--n:${items.length <= 5 ? Math.max(1, items.length) : 3}`, "data-decoupable": "" }, ...items.map((it, k) => { const { titre, texte } = eclaterPuce(it); return el("li", {}, el("span", { class: "im-pilier-num", text: String(k + 1).padStart(2, "0") }), titre ? el("h5", {}, ...enrichi(titre)) : null, el("p", {}, ...enrichi(majuscule(texte)))); })) : aRediger(s.court),
        info(tr("memo.js.perspectives.avertissement"))],
        sources: [SOURCES.dirigeant, t && ok(t.ca) ? sourceChiffres() : null, faitsMarche().length ? tr("memo.js.perspectives.source_marche") : null] })];
    }
    case "operation": {
      const op = q.operation || {};
      const etapes = tr("memo.js.operation.etapes");
      return [chapitre(s, { titre: tr("memo.js.operation.titre"), contenu: [el("div", { class: "im-grille im-g-operation" },
        el("div", { class: "im-col-texte" }, intertitre(tr("memo.js.operation.contexte")), corpsTexte(s), intertitre(tr("memo.js.operation.envisagee")),
          el("ul", { class: "im-puces" }, ...[[tr("memo.js.operation.part_capital"), "part_cedee"], [tr("memo.js.operation.motif_cedant"), "motif"], [tr("memo.js.operation.calendrier_souhaite"), "calendrier"], [tr("memo.js.operation.accompagnement"), "accompagnement"]]
            .map(([k, cle]) => el("li", {}, el("span", {}, el("strong", { text: tr("demarrer.js.redaction.cause", { liste: k }) }), op[cle] ? libelleOption(cle, op[cle]) : tr("teaser.js.a_completer_minuscule")))))),
        encadre(tr("memo.js.operation.organigramme"), organigramme()))],
        sources: [SOURCES.dirigeant, SOURCES.publiques] }),
      page({ s, ancre: false, titre: tr("memo.js.operation.processus"), message: tr("memo.js.operation.processus_message"), contenu: [
        el("ol", { class: "im-chevrons" }, ...etapes.map(([t, d, doc], k) => el("li", {}, el("span", { class: "im-chev" }, el("b", { text: String(k + 1) }), t),
          el("div", { class: "im-couloir" }, el("p", { class: "im-couloir-lib", text: tr("memo.js.operation.objet") }), el("p", { text: d }), el("p", { class: "im-couloir-lib", text: tr("memo.js.operation.documents") }), el("p", { text: doc }))))),
        el("div", { class: "im-interlocuteur" }, el("strong", { text: tr("memo.js.operation.interlocuteur") }), el("span", { text: tr("memo.js.operation.interlocuteur_texte") })),
        info(tr("memo.js.operation.calendrier_indicatif"))],
        sources: [SOURCES.dirigeant] })];
    }
    default:
      return [chapitre(s, { contenu: [corpsTexte(s)] })];
  }
}

function dessinerMemo() {
  etat.versionPhotos ??= Date.now();
  placement = placementPhotos(etat.photos || [], { largeurPleinePage: 1200 });
  $("#studio").classList.remove("actif"); // toutes les pages visibles le temps de les mesurer (découpage, remplissage)
  const enfants = [couverture(), pageSommaire(), pageGlossaire()];
  (etat.parties || []).forEach((pt, k) => {
    enfants.push(pageOuverture(pt, k));
    for (const s of etat.sections.filter((x) => x.partie === pt.n)) {
      enfants.push(...(s.cle === "synthese" ? pagesSynthese(s) : pagesChapitre(s)));
      const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
        el("strong", { class: "petit", text: s.court }),
        s.modifie ? el("span", { class: "petit", text: tr("teaser.js.modifie") }) : null,
        s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: tr("memo.js.outils.a_completer") }), s.a_completer.join(" ; ")) : null,
        el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? tr("memo.js.outils.rediger_nouveau") : tr("dossier.actions.rediger")),
        s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, tr("memo.js.outils.modifier")) : null);
      enfants.push(outils);
    }
  });
  enfants.push(pageAvertissement());
  remplacer($("#memo"), ...enfants);
  decouper();
  regrouperPages();
  remplirPages();
  numeroterPages();
  presentation();
}

// ------------------------------------------------------------------ Présentation : une page à la fois
// Comme un logiciel de présentation : la page au centre, la liste des pages en dessous, et à droite ce qu'il faut
// faire sur la page affichée (recommandations, rédiger à nouveau, modifier le texte, ajouter des photos).
const cleSession = `passation-memo-page-${id}`;
const pres = { idx: (() => { try { return Number(sessionStorage.getItem(cleSession)) || 0; } catch { return 0; } })(), tout: false };
const diapos = () => [...$("#memo").querySelectorAll(".diapo")];
const titrePage = (d) => d.querySelector(".im-entete h3")?.textContent || (d.classList.contains("im-couverture") ? tr("memo.js.presentation.couverture") : d.classList.contains("im-ouverture") ? tr("memo.js.presentation.partie", { n: d.dataset.partie, titre: d.querySelector("h2")?.textContent || "" }) : tr("memo.js.presentation.page"));

function allerPage(k, focus = false) {
  const l = diapos();
  pres.idx = Math.max(0, Math.min(l.length - 1, k));
  try { sessionStorage.setItem(cleSession, String(pres.idx)); } catch { /* sans stockage */ }
  appliquerPresentation();
  if (focus) $("#vignettes").querySelectorAll("button")[pres.idx]?.focus();
}
function presentation() {
  const l = diapos();
  if (!l.length) return;
  pres.idx = Math.min(pres.idx, l.length - 1);
  remplacer($("#vignettes"), ...l.map((d, k) => el("li", {}, el("button", { type: "button", class: d.classList.contains("im-ouverture") ? "partie" : null, onclick: () => allerPage(k, true) },
    el("b", { text: String(k + 1) }), el("span", { text: titrePage(d) })))));
  appliquerPresentation();
}
function appliquerPresentation() {
  const l = diapos(), d = l[pres.idx];
  $("#studio").classList.add("actif");
  $("#studio").classList.toggle("tout", pres.tout);
  $("#tout-afficher").setAttribute("aria-pressed", String(pres.tout));
  $("#tout-afficher").textContent = pres.tout ? tr("memo.js.presentation.une_page") : tr("memo.voir_toutes_pages");
  l.forEach((x, k) => x.classList.toggle("courante", k === pres.idx));
  $("#vignettes").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", k === pres.idx ? "page" : "false"));
  // Centre la vignette courante dans la bande, sans faire défiler la page elle-même : scrollIntoView faisait descendre
  // la page à l'ouverture, et la barre flottante recouvrait alors « ← Mon dossier » et le titre
  const bande = $("#vignettes"), vignette = bande.querySelectorAll("button")[pres.idx];
  if (vignette) bande.scrollLeft = Math.max(0, vignette.offsetLeft - (bande.clientWidth - vignette.offsetWidth) / 2);
  $("#page-compteur").textContent = tr("memo.js.presentation.compteur", { n: pres.idx + 1, total: l.length });
  $("#page-prec").disabled = pres.idx === 0; $("#page-suiv").disabled = pres.idx === l.length - 1;
  if (d) panneau(d);
}

// ------------------------------------------------------------------ Panneau d'amélioration (titres courts, réponse sur place)
let amelOuverte = null; // amélioration dépliée
let focusAmel = null; // rang du titre à refocaliser après une action
const faitesSession = []; // titres validés pendant la visite (« Fait ✓ »)
const pageDe = (cle) => (cle ? diapos().findIndex((d) => d.dataset.section === cle || (d.dataset.sections || "").split(" ").includes(cle)) : 0);
const listeAmeliorations = () => ameliorations({ etat, reponses, placement, ignores: reponses.panneau?.ignores || [] });
const vers = (ancre) => { $("#donnees").open = true; $(ancre)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
const ACTIONS = {
  photos: () => vers("#photos"), marche: () => vers("#marche"),
  equipe: () => { location.href = lien(`/espace/demarrer/?dossier=${id}&etape=equipe`); },
  comptes: () => { location.href = lien(`/espace/valorisation/?dossier=${id}#chiffres`); },
};
/** Page en cours de mise à jour : voile « Mise à jour… » sur les pages du chapitre, le temps de la rédaction. */
function enMiseAJour(cle, oui) {
  for (const d of diapos().filter((x) => x.dataset.section === cle || (x.dataset.sections || "").split(" ").includes(cle))) {
    d.querySelector(".im-maj")?.remove();
    if (oui) d.append(el("div", { class: "im-maj pas-imprime", role: "status", text: tr("memo.js.ameliorations.mise_a_jour") }));
  }
}
async function apresAction(rang, titre, cle) {
  if (titre) faitesSession.push(titre);
  amelOuverte = null; focusAmel = rang;
  tout();
  // La page concernée est affichée (le panneau est redessiné) ; le focus va au titre suivant
  const k = pageDe(cle); if (cle && k >= 0) { focusAmel = rang; allerPage(k); }
}
/** « Valider » : la réponse est enregistrée (mêmes routes que le parcours guidé), puis le chapitre est rédigé à nouveau. */
async function valider(item, valeur, rang) {
  const rep = reponsePour(item, valeur, reponses);
  if (!rep) { message(item.genre === "qcm" ? tr("memo.js.ameliorations.choisissez") : tr("memo.js.ameliorations.ecrivez"), true); return; }
  try {
    await api(`/api/dossiers/${id}/answers/${rep.etape}`, { method: "PUT", body: JSON.stringify({ data: rep.data }) });
    reponses[rep.etape] = rep.data;
    if (item.section && section(item.section)?.redigee && etat.deverrouille.ok) {
      const k = pageDe(item.section); if (k >= 0) allerPage(k);
      enMiseAJour(item.section, true); message(tr("memo.js.ameliorations.mise_a_jour"));
      try { etat = { ...(await api(`${base}/sections/${item.section}`, { method: "POST" })), versionPhotos: etat.versionPhotos }; message(tr("memo.js.ameliorations.chapitre_mis_a_jour")); }
      catch (e) { enMiseAJour(item.section, false); message(tr("memo.js.ameliorations.reponse_gardee", { erreur: e.message }), true); }
    } else message(tr("memo.js.ameliorations.enregistre"));
    await apresAction(rang, item.titre, item.section);
  } catch (e) { message(e.message, true); }
}
async function ignorer(item, rang) {
  const ignores = [...new Set([...(reponses.panneau?.ignores || []), item.id])];
  try {
    if (item.genre === "remarque") etat = { ...(await api(`${base}/relecture/${item.remarque.id}`, { method: "POST", body: JSON.stringify({ decision: "non" }) })), versionPhotos: etat.versionPhotos };
    else { await api(`/api/dossiers/${id}/answers/panneau`, { method: "PUT", body: JSON.stringify({ data: { ...(reponses.panneau || {}), ignores } }) }); reponses.panneau = { ...(reponses.panneau || {}), ignores }; }
    message(tr("memo.js.ameliorations.ignoree"));
    await apresAction(rang, null, null);
  } catch (e) { message(e.message, true); }
}
/** « Oui, corriger » : le passage est remplacé dans le chapitre par le serveur (aucun chiffre touché, concision contrôlée). */
async function corriger(item, rang) {
  enMiseAJour(item.section, true);
  try { etat = { ...(await api(`${base}/relecture/${item.remarque.id}`, { method: "POST", body: JSON.stringify({ decision: "oui" }) })), versionPhotos: etat.versionPhotos }; message(tr("memo.js.ameliorations.corrige")); await apresAction(rang, item.titre, item.section); }
  catch (e) { enMiseAJour(item.section, false); message(e.message, true); }
}
async function relire(bouton) {
  if (bouton) bouton.disabled = true;
  message(tr("memo.js.relecture.en_cours"));
  try { etat = { ...(await api(`${base}/relecture`, { method: "POST" })), versionPhotos: etat.versionPhotos }; amelOuverte = null; focusAmel = 0; tout(); message(tr("memo.js.relecture.fait", { n: (etat.relecture?.remarques || []).length })); }
  catch (e) { message(e.message, true); if (bouton) bouton.disabled = false; }
}

function corpsAmelioration(item, rang) {
  const boutons = (...b) => el("div", { class: "amel-actions" }, ...b);
  const btnIgnorer = el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => ignorer(item, rang) }, item.genre === "remarque" ? tr("memo.js.ameliorations.non") : tr("memo.js.ameliorations.ignorer"));
  if (item.genre === "qcm") {
    const nom = `qcm-${item.id}`;
    return [el("fieldset", { class: "amel-qcm" }, el("legend", { text: tr(`memo.js.ameliorations.questions.${item.id}`) }),
      ...item.options.map((o, k) => el("label", { class: "amel-choix", for: `${nom}-${k}` }, el("input", { type: "radio", name: nom, id: `${nom}-${k}`, value: o }), el("span", { text: libelleOption(item.cle, o) })))),
    boutons(el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: (ev) => valider(item, ev.currentTarget.closest(".amel-corps").querySelector(`input[name="${nom}"]:checked`)?.value, rang) }, tr("memo.js.ameliorations.valider")), btnIgnorer)];
  }
  if (item.genre === "proposition") {
    const ta = el("textarea", { rows: "3", id: `prop-${item.id}`, "aria-describedby": `dem-${item.id}`, placeholder: tr("memo.js.ameliorations.votre_reponse") }); ta.value = item.proposition || "";
    return [el("p", { class: "amel-pourquoi", id: `dem-${item.id}`, text: item.demande }), el("label", { class: "visuellement-cache", for: `prop-${item.id}`, text: tr("memo.js.ameliorations.votre_reponse") }), ta,
      el("p", { class: "petit", text: tr("memo.js.ameliorations.pas_de_chiffre") }),
      boutons(el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => valider(item, ta.value, rang) }, tr("memo.js.ameliorations.valider")), btnIgnorer)];
  }
  if (item.genre === "action") {
    return [el("p", { class: "amel-pourquoi", text: tr(`memo.js.ameliorations.explications.${item.id}`) }),
      boutons(el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => ACTIONS[item.action]?.() }, tr(`memo.js.ameliorations.actions.${item.action}`)), btnIgnorer)];
  }
  const r = item.remarque;
  return [el("p", { class: "amel-pourquoi" }, el("span", { class: "pastille-etat alerte", text: tr(`memo.js.relecture.types.${r.type}`) }), " ", r.constat),
    r.correction ? el("p", { class: "amel-avant", text: r.correction.texte_actuel }) : null,
    r.correction ? el("p", { class: "amel-apres", text: r.correction.texte_propose }) : null,
    r.type === "chiffre" ? el("p", { class: "petit", text: tr("memo.js.relecture.chiffre") }) : null,
    boutons(r.correction ? el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => corriger(item, rang) }, tr("memo.js.ameliorations.oui_corriger"))
      : item.action ? el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => ACTIONS[item.action]?.() }, tr(`memo.js.ameliorations.actions.${item.action}`)) : null, btnIgnorer)];
}

/** Panneau de droite : améliorations (titres courts), puis les actions de la page affichée. */
function panneau(d) {
  const s = d.dataset.section ? section(d.dataset.section) : null;
  const l = listeAmeliorations();
  const indisp = l.filter((x) => x.importance === "indispensable").length;
  const ul = el("ul", { class: "ameliorations" }, ...l.map((item, k) => {
    const ouvert = amelOuverte === item.id, k1 = pageDe(item.section);
    return el("li", { class: `amel${item.importance === "indispensable" ? " indispensable" : ""}` },
      el("h4", {}, el("button", { type: "button", class: "amel-titre", "aria-expanded": String(ouvert), "aria-controls": `amel-${item.id}`, "data-rang": String(k), onclick: () => { amelOuverte = ouvert ? null : item.id; focusAmel = k; panneau(diapos()[pres.idx]); } },
        el("span", { class: "amel-point", "aria-hidden": "true" }), el("span", { text: item.titre }), item.importance === "indispensable" ? el("span", { class: "visuellement-cache", text: tr("memo.js.ameliorations.indispensable") }) : null,
        el("span", { class: "amel-page", text: item.section && k1 >= 0 ? tr("memo.js.ameliorations.page", { n: k1 + 1 }) : "" }))),
      el("div", { class: "amel-corps", id: `amel-${item.id}`, hidden: !ouvert }, ...(ouvert ? corpsAmelioration(item, k) : [])));
  }), ...faitesSession.map((t) => el("li", { class: "amel amel-faite" }, el("p", {}, el("span", { class: "amel-point", "aria-hidden": "true" }), el("span", { text: t }), el("span", { class: "amel-page", text: tr("memo.js.ameliorations.fait") })))));
  const etatChap = !s ? null : !s.redigee ? tr("memo.js.etat.a_rediger") : s.modifie ? tr("teaser.js.modifie") : tr("memo.js.etat.redige");
  const zoneEdition = el("div", { class: "panneau-edition" });
  const relu = etat.relecture?.date ? tr("memo.js.relecture.date", { date: new Date(etat.relecture.date * 1000).toLocaleDateString(langue() === "fr" ? "fr-FR" : "en-US") }) : null;
  remplacer($("#panneau"),
    el("p", { class: "etiquette", text: tr("memo.js.presentation.page_n", { n: pres.idx + 1 }) }),
    el("h2", { class: "panneau-titre", text: titrePage(d) }),
    s ? el("p", { class: "panneau-etat" }, el("span", { class: `pastille-etat ${!s.redigee ? "a-faire" : "ok"}`, text: etatChap }), tr("memo.js.panneau.chapitre", { court: s.court })) : null,
    el("section", { class: "panneau-bloc", "aria-labelledby": "titre-ameliorer" }, el("h3", { id: "titre-ameliorer", text: tr("memo.js.ameliorations.titre") }),
      el("p", { class: "petit amel-resume" }, l.length ? tr("memo.js.ameliorations.resume", { n: l.length, i: indisp }) : tr("memo.js.panneau.rien"), relu ? ` · ${relu}` : ""),
      etat.sections.some((x) => x.redigee) ? el("button", { type: "button", class: "btn btn-contour btn-mini amel-relire", disabled: !etat.analyse_photos, onclick: (ev) => relire(ev.currentTarget) }, tr("memo.js.relecture.bouton")) : null,
      ul,
      l.some((x) => x.importance === "indispensable") ? el("p", { class: "amel-legende petit" }, el("span", { class: "amel-point indisp", "aria-hidden": "true" }), tr("memo.js.ameliorations.indispensable")) : null),
    s ? el("section", { class: "panneau-bloc" }, el("h3", { text: tr("memo.js.panneau.actions") }),
      el("div", { class: "panneau-actions" },
        el("button", { type: "button", class: "btn btn-noir btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? tr("memo.js.outils.rediger_nouveau") : tr("memo.js.panneau.rediger_chapitre")),
        s.redigee ? el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => editer(zoneEdition, s) }, tr("memo.js.panneau.modifier_texte")) : null),
      zoneEdition) : null);
  if (focusAmel != null) {
    const titres = [...$("#panneau").querySelectorAll(".amel-titre")];
    const cible = titres.find((b) => b.getAttribute("aria-expanded") === "true") || titres[Math.min(focusAmel, titres.length - 1)];
    focusAmel = null;
    (cible || $("#titre-ameliorer"))?.focus?.();
  }
}
$("#page-prec").addEventListener("click", () => allerPage(pres.idx - 1));
$("#page-suiv").addEventListener("click", () => allerPage(pres.idx + 1));
$("#tout-afficher").addEventListener("click", () => { pres.tout = !pres.tout; appliquerPresentation(); });
document.addEventListener("keydown", (ev) => {
  if (pres.tout || ev.target.closest("input, textarea, select, [contenteditable]")) return;
  if (ev.key === "ArrowRight" || ev.key === "PageDown") { ev.preventDefault(); allerPage(pres.idx + 1); }
  if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); allerPage(pres.idx - 1); }
});

/** Page trop pleine : les derniers éléments du dernier bloc découpable passent sur une page « (suite) ». */
function decouper() {
  for (const d of [...$("#memo").querySelectorAll(".im-page")]) {
    let courante = d;
    for (let garde = 0; garde < 5; garde++) {
      const zone = courante.querySelector(".im-zone");
      if (zone.scrollHeight <= zone.clientHeight + 2) break;
      // D'abord resserrer légèrement le texte : une page (suite) pour deux puces serait plus vide que pleine
      if (!courante.classList.contains("serre")) { courante.classList.add("serre"); if (zone.scrollHeight <= zone.clientHeight + 2) break; }
      const cible = [...zone.querySelectorAll("[data-decoupable]")].filter((b) => b.children.length > 1).at(-1);
      if (!cible) break;
      const reports = [];
      while (zone.scrollHeight > zone.clientHeight + 2 && cible.children.length > 1) reports.unshift(cible.removeChild(cible.lastElementChild));
      const s = section(courante.dataset.section);
      const conteneur = el(cible.tagName.toLowerCase(), { class: cible.className, "data-decoupable": "" }, ...reports);
      const suite = page({ s, titre: courante.querySelector(".im-entete h3").textContent.replace(/ \((suite|continued)\)$/, ""), suite: true, contenu: [conteneur] });
      suite.querySelector(".im-pied-sources").replaceWith(courante.querySelector(".im-pied-sources").cloneNode(true));
      courante.after(suite);
      courante = suite;
    }
  }
}

// ------------------------------------------------------------------ Pages presque vides (mesure à la surface)
const estFusionnable = (d) => d.classList.contains("im-page") && Boolean(d.querySelector(".im-num"));
const titreDe3 = (d) => (d.querySelector(".im-entete h3")?.textContent || "").replace(/ \((suite|continued)\)$/, "");
/** Part de la zone de contenu couverte (lignes de texte, graphiques, photos, tuiles), le texte à sa taille normale. */
function couvertureDe(d) {
  const z = d.querySelector(".im-zone");
  if (!z) return 1;
  const k = d.style.getPropertyValue("--k");
  d.style.setProperty("--k", "1");
  const rects = [];
  const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(...r.getClientRects()); }
  for (const e of z.querySelectorAll("svg, img, .im-tuile-kpi, .im-photo, .im-photo-vide, .im-eq-initiales")) rects.push(e.getBoundingClientRect());
  const c = surfaceCouverte(z.getBoundingClientRect(), rects);
  if (k) d.style.setProperty("--k", k); else d.style.removeProperty("--k");
  return c;
}
/** Parties des pages, dans l'ordre : une page d'ouverture fixe la partie des pages qui la suivent. */
function partiesDes(l) { let partie = 0; return l.map((d) => { if (d.classList.contains("im-ouverture")) partie = Number(d.dataset.partie); return partie; }); }

/**
 * Chapitres sans donnée (non rédigés et sous le seuil sur toutes leurs pages) : retirés et regroupés, avec les demandes
 * « à compléter » des chapitres de la partie, sur une page « Éléments à compléter » en fin de partie. Puis chaque page
 * sous le seuil (16 % de surface couverte) est fusionnée avec sa voisine de la même partie, si tout tient.
 */
function regrouperPages() {
  let l = diapos(), parties = partiesDes(l);
  const couv = new Map(l.filter(estFusionnable).map((d) => [d, couvertureDe(d)]));
  for (const pt of etat.parties || []) {
    const pages = l.filter((d, k) => parties[k] === pt.n && d.classList.contains("im-page") && d.querySelector(".im-num"));
    if (!pages.length) continue;
    const secs = etat.sections.filter((x) => x.partie === pt.n);
    const vides = secs.filter((x) => !x.redigee && pages.some((d) => d.dataset.section === x.cle) && pages.filter((d) => d.dataset.section === x.cle).every((d) => (couv.get(d) ?? 1) < SEUIL_PAGE_VIDE));
    const vus = new Set();
    const items = [...vides.map((x) => [x.court, tr("memo.js.elements.a_rediger")]), ...secs.filter((x) => x.redigee).flatMap((x) => (x.a_completer || []).map((d) => [x.court, d]))]
      .filter(([, d]) => { const k = String(d).trim().toLowerCase(); if (vus.has(k) && d !== tr("memo.js.elements.a_rediger")) return false; vus.add(k); return true; });
    for (const x of vides) for (const d of pages.filter((d) => d.dataset.section === x.cle)) d.remove();
    if (!items.length) continue;
    const derniere = pages.filter((d) => d.isConnected).at(-1) || l.find((d) => d.classList.contains("im-ouverture") && d.dataset.partie === String(pt.n));
    const pe = page({ titre: tr("memo.js.elements.titre"), message: tr("memo.js.elements.message", { partie: pt.titre }), classe: "im-elements",
      contenu: [el("ul", { class: "im-elements-liste", "data-decoupable": "" }, ...items.map(([sec, txt]) => el("li", {}, el("small", { text: sec }), el("span", { text: txt }))))],
      sources: [SOURCES.dirigeant] });
    if (vides.length) { pe.dataset.sections = vides.map((x) => x.cle).join(" "); for (const x of vides) pe.querySelector(".im-zone").append(el("span", { id: `s-${x.cle}`, class: "im-ancre" })); }
    derniere?.after(pe);
  }
  l = diapos(); parties = partiesDes(l);
  const infos = l.map((d, k) => ({ partie: parties[k], fusionnable: estFusionnable(d), couverture: estFusionnable(d) ? (couv.get(d) ?? couvertureDe(d)) : 1 }));
  for (const [a, b] of planFusion(infos)) fusionner(l[a], l[b]);
}

/** Fusion de la page B dans la page A (B la suit) ; annulée si le contenu déborde, même resserré. */
function fusionner(A, B) {
  const zA = A.querySelector(".im-zone"), zB = B.querySelector(".im-zone");
  const memeTitre = titreDe3(A) === titreDe3(B);
  const message = B.querySelector(".im-message")?.textContent;
  const enfantsB = [...zB.childNodes];
  const bloc = el("div", { class: "im-fusion" }, memeTitre ? null : el("h4", { class: "im-intertitre im-fusion-titre", text: titreDe3(B) }), !memeTitre && message ? el("p", { class: "im-fusion-message", text: message }) : null, ...enfantsB);
  // Hauteurs de tous les éléments des deux pages avant la fusion : une fusion qui compresserait un graphique, une carte
  // ou un texte (flex, hauteur minimale nulle) est refusée, pas seulement celle qui fait déborder la zone
  const hauteurs = new Map([...zA.querySelectorAll("*"), ...zB.querySelectorAll("*")].map((e) => [e, e.getBoundingClientRect().height]));
  zA.append(bloc);
  const deborde = () => {
    if (zA.scrollHeight > zA.clientHeight + 2) return true;
    const bas = zA.getBoundingClientRect().bottom + 2;
    for (const [e, h] of hauteurs) { const r = e.getBoundingClientRect(); if (r.height < h - 1.5 || (r.height && r.bottom > bas)) return true; }
    return false;
  };
  const serreAvant = A.classList.contains("serre");
  if (deborde()) { zB.append(...enfantsB); bloc.remove(); A.classList.toggle("serre", serreAvant); return false; }
  const sections = new Set([A.dataset.section, ...(A.dataset.sections || "").split(" "), B.dataset.section, ...(B.dataset.sections || "").split(" ")].filter(Boolean));
  A.dataset.sections = [...sections].join(" ");
  if (B.id) { const ancre = B.id; B.removeAttribute("id"); bloc.prepend(el("span", { id: ancre, class: "im-ancre" })); }
  const srcA = A.querySelector(".im-sources"), srcB = B.querySelector(".im-sources");
  if (srcB && srcA && !srcA.textContent.includes(srcB.textContent.replace(/^[^:]*:\s*/, ""))) srcA.textContent = `${srcA.textContent} ; ${srcB.textContent.replace(/^[^:]*:\s*/, "")}`;
  else if (srcB && !srcA) A.querySelector(".im-pied-sources").prepend(srcB);
  B.remove();
  return true;
}

/** Numéros « partie.page », numéros de page, renvois du sommaire et des points forts (memo-pages.js, numeroter). */
function numeroterPages() {
  const l = diapos();
  const r = numeroter(l.map((d) => ({ type: d.classList.contains("im-ouverture") ? "ouverture" : d.querySelector(".im-num") ? "page" : "hors", partie: Number(d.dataset.partie) || 0,
    sections: [d.dataset.section, ...(d.dataset.sections || "").split(" ")].filter(Boolean), suite: Boolean(d.dataset.suite) })));
  l.forEach((d, k) => {
    const np = d.querySelector(".im-page-num"); if (np) np.textContent = String(k + 1);
    const num = d.querySelector(".im-num"); if (num) num.textContent = r.numeros[k] || "";
  });
  $("#memo").querySelectorAll("[data-renvoi]").forEach((x) => { const k = r.pageDe[x.dataset.renvoi]; x.textContent = k ? (x.classList.contains("im-voir") ? tr("memo.js.voir_page", { n: k }) : String(k)) : ""; });
  $("#memo").querySelectorAll("[data-renvoi-partie]").forEach((x) => { const k = r.ouvertures[x.dataset.renvoiPartie]; x.textContent = k ? String(k) : ""; });
  $("#memo").querySelectorAll(".im-som a").forEach((a) => { const h = $("#memo").querySelector(`${a.getAttribute("href")} .im-entete h3`); if (h) a.textContent = h.textContent; });
  $("#memo").querySelectorAll("[data-num-section]").forEach((x) => { x.textContent = r.numeroDe[x.dataset.numSection] || ""; });
}

/**
 * Page trop vide : le texte grandit (variable --k, de 1 à 1,3) tant que la zone n'est pas remplie et que rien ne
 * déborde. Le remplissage est mesuré au bas du contenu le plus bas (textes, tableaux, graphiques).
 */
function remplirPages() {
  const debord = (z) => z.scrollHeight > z.clientHeight + 2;
  const remplissage = (z) => {
    const haut = z.getBoundingClientRect().top, h = z.clientHeight || 1;
    let bas = haut;
    for (const e of z.querySelectorAll("p, li, tr, h4, h5, strong, svg, img, .im-tuile-kpi")) { const r = e.getBoundingClientRect(); if (r.height) bas = Math.max(bas, r.bottom); }
    return (bas - haut) / h;
  };
  for (const d of $("#memo").querySelectorAll(".im-page")) {
    const z = d.querySelector(".im-zone");
    if (!z || d.classList.contains("serre") || debord(z)) continue;
    let k = 1;
    while (k < 1.3 && remplissage(z) < 0.9) {
      d.style.setProperty("--k", (k + 0.04).toFixed(2));
      if (debord(z) || remplissage(z) > 0.98) { d.style.setProperty("--k", k.toFixed(2)); break; }
      k += 0.04;
    }
  }
}

function editer(outils, s) {
  const titre = el("input", { type: "text", maxlength: "110", value: s.titre_affirme || "", "aria-label": tr("memo.js.edition.titre_aria", { court: s.court }), placeholder: s.titre });
  const ta = el("textarea", { rows: "12", "aria-label": tr("teaser.js.texte_de", { titre: s.court }) }); ta.value = s.contenu;
  ta.rows = 14;
  const ok = el("button", { type: "button", class: "btn btn-noir btn-mini" }, tr("teaser.js.enregistrer"));
  ok.addEventListener("click", async () => {
    try { etat = await api(`${base}/sections/${s.cle}`, { method: "PUT", body: JSON.stringify({ titre: titre.value, contenu: ta.value }) }); tout(); message(tr("memo.js.edition.enregistre")); } catch (e) { message(e.message, true); }
  });
  remplacer(outils, el("label", { class: "petit", text: tr("memo.js.edition.titre") }), titre,
    el("label", { class: "petit", text: tr("memo.js.edition.texte") }), ta,
    el("div", { class: "doc-edition" }, ok, el("button", { type: "button", class: "lien-simple", onclick: tout }, tr("teaser.js.annuler"))));
  titre.focus();
}
async function rediger(cle, bouton) {
  if (bouton) bouton.disabled = true;
  message(tr("memo.js.redaction.en_cours"));
  try { etat = await api(`${base}/sections/${cle}`, { method: "POST" }); tout(); message(tr("memo.js.redaction.fait")); const k = diapos().findIndex((d) => d.dataset.section === cle); if (k >= 0) allerPage(k); }
  catch (e) { message(e.message, true); if (bouton) bouton.disabled = false; }
}
function tout() { dessinerVerrou(); dessinerSite(); dessinerPhotos(); dessinerMarche(); dessinerMemo(); }

$("#form-site").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const b = ev.target.querySelector("button"); b.disabled = true;
  message(tr("memo.js.site.lecture"));
  try { etat = await api(`${base}/site`, { method: "POST", body: JSON.stringify({ url: $("#url-site").value }) }); tout(); message(tr("memo.js.site.releves", { n: etat.site.faits.length, pages: etat.site.pages.length })); }
  catch (e) { message(e.message, true); }
  finally { b.disabled = false; }
});
$("#btn-tout").addEventListener("click", async (ev) => {
  const b = ev.currentTarget; b.disabled = true; redactionEnCours = true;
  try {
    for (const s of etat.sections.filter((x) => !x.redigee)) await rediger(s.cle);
    // Passage automatique de la relecture critique à la fin de la rédaction
    if (etat.analyse_photos && etat.sections.every((x) => x.redigee) && !etat.relecture) await relire();
  } finally { redactionEnCours = false; b.disabled = !etat.deverrouille.ok; }
});
$("#btn-imprimer").addEventListener("click", () => window.print());
/** Arrivée depuis la page du dossier : #section-<clé> ouvre la page du chapitre, #donnees ouvre les photos et le
 *  site, ?imprimer=1 propose l'enregistrement en PDF une fois le mémorandum affiché. */
async function suivreLien() {
  const m = /^#section-([a-z-]+)$/.exec(location.hash);
  if (m) { const k = diapos().findIndex((d) => d.dataset.section === m[1]); if (k >= 0) allerPage(k); }
  if (location.hash === "#donnees") { $("#donnees").open = true; $("#donnees").scrollIntoView({ block: "start" }); }
  if (new URLSearchParams(location.search).get("imprimer") === "1") { await document.fonts?.ready; window.print(); }
}
(async () => {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace(lien("/espace/")); return; }
  $("#lien-dossier").href = lien(`/espace/?dossier=${id}`);
  try {
    const [m, a] = await Promise.all([api(base), api(`/api/dossiers/${id}/answers`).catch(() => ({ reponses: {} }))]);
    etat = m; reponses = a.reponses || {};
    tout(); suivreLien();
  } catch (e) { if (e.message !== "non_connecte") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
})();
