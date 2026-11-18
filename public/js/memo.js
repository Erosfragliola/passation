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
    sct ? el("p", { class: "petit", text: `Registres : ${entier(sct.region_total)} entreprises actives du code NAF ${sct.naf} en ${sct.region}, dont ${pct0(sct.part_moins_10)} de moins de 10 salariés.` }) : null,
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
const aRediger = (quoi) => el("p", { class: "a-rediger", text: quoi ? `${quoi} : à rédiger.` : "À compléter." });

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
const effectifCourt = () => (p().effectif || "n.d.").replace(/^de /, "").replace(/ personnes$/, "").replace(/^plus de (.*) personnes$/, "> $1");
const SOURCES = { publiques: "registres publics (INSEE, INPI)", site: "site internet de l'entreprise", dirigeant: "dirigeant", calculs: "calculs Passation" };
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
  return el("div", { class: "im-barres-h", role: "img", "aria-label": l.map((x) => `${x.libelle} : ${x.texte}`).join(" ; ") },
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
    el("header", { class: "im-entete" }, numerotee ? el("span", { class: "im-num" }) : null, el("h3", { text: titre + (suite ? " (suite)" : "") })),
    message ? el("p", { class: "im-message", text: message }) : null,
    el("div", { class: "im-zone" }, ...contenu.flat().filter(Boolean)),
    messageCle(conclusion),
    el("footer", { class: "im-pied" },
      logoPassation(),
      el("div", { class: "im-pied-sources" },
        src.length ? el("span", { class: "im-sources", text: `Source${src.length > 1 ? "s" : ""} : ${majuscule(src.join(", "))}` }) : null,
        notes.length ? el("span", { class: "im-notes", text: `Note${notes.length > 1 ? "s" : ""} : ${notes.map((n, k) => `(${k + 1}) ${n}`).join(" ")}` }) : null),
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
    "aria-label": `${libelle} : ${annees.map((a, i) => `${a} : ${kEuros(valeurs[i])} k€${avecMarge && ok(marges[i]) ? `, marge ${pourcent(marges[i])}` : ""}`).join(" ; ")}` });
  const texte = (x, y, t, classe) => { const e = svg("text", { x, y, class: classe, "text-anchor": "middle" }); e.textContent = t; return e; };
  const cx = (i) => i * pas + pas / 2;
  g.append(svg("line", { x1: 0, x2: L, y1: bas, y2: bas, class: "im-axe" }));
  annees.forEach((a, i) => {
    const v = valeurs[i], h = ok(v) ? (Math.max(0, v) / max) * hautBarres : 0;
    g.append(svg("rect", { x: cx(i) - w / 2, y: bas - h, width: w, height: h, class: `im-barre${i === annees.length - 1 ? " derniere" : ""}` }));
    g.append(texte(cx(i), bas - h - 7, ok(v) ? kEuros(v) : "n.d.", "im-graph-val"));
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
  const parts = [["Achats consommés", v("achats_consommes"), "#C9A37E"], ["Charges externes", v("charges_externes"), "#9DB8A8"],
    ["Personnel", v("charges_personnel"), "#2B5040"], ["Impôts et taxes", v("impots_taxes"), "#D9CDB8"], ["EBE", serie("ebe")[i], "#A8653A"]]
    .filter(([, x]) => ok(x) && x > 0);
  const total = parts.reduce((a, [, x]) => a + x, 0);
  if (Math.abs(total - ca) / ca > 0.08) return null; // autres produits ou postes non détaillés : on ne dessine pas un anneau faux
  const R = 60, ep = 22, C = 2 * Math.PI * R;
  const g = svg("svg", { viewBox: "0 0 160 160", class: "im-anneau-charges", role: "img", "aria-label": `Répartition du chiffre d'affaires ${c.annees[i]} : ${parts.map(([l, x]) => `${l} ${pourcent(x / ca, { decimales: 0 })}`).join(", ")}` });
  let cumul = 0;
  for (const [, x, coul] of parts) { const l = (x / total) * C; g.append(svg("circle", { cx: 80, cy: 80, r: R, fill: "none", stroke: coul, "stroke-width": ep, "stroke-dasharray": `${l} ${C}`, "stroke-dashoffset": String(-cumul), transform: "rotate(-90 80 80)" })); cumul += l; }
  const t = svg("text", { x: 80, y: 78, "text-anchor": "middle", class: "im-anneau-val" }); t.textContent = montant(ca); g.append(t);
  const t2 = svg("text", { x: 80, y: 95, "text-anchor": "middle", class: "im-anneau-lib" }); t2.textContent = `CA ${c.annees[i]}`; g.append(t2);
  return el("div", { class: "im-charges" }, g, el("ul", { class: "im-charges-legende" }, ...parts.map(([l, x, coul]) => el("li", {}, el("i", { style: `background:${coul}` }), el("span", { text: l }), el("strong", { text: pourcent(x / ca, { decimales: 0 }) })))));
}
/** Besoin en fonds de roulement en jours de chiffre d'affaires, par exercice (barres horizontales). */
function graphiqueBfr() {
  const bfr = (ch().endettement?.bfr || []).filter((b) => ok(b.jours));
  if (bfr.length < 2) return null;
  return barresH(bfr.map((b, k) => ({ libelle: String(b.annee), valeur: Math.max(0, b.jours), texte: `${Math.round(b.jours)} jours`, accent: k === bfr.length - 1 })));
}
/** Ligne de graphique : libellé à gauche dans un cartouche, graphique, pastille de croissance. */
const ligneGraphique = (libelle, graphique, pastille) => (graphique ? el("div", { class: "im-ligne-graph" },
  el("div", { class: "im-ligne-lib" }, el("span", { text: libelle })),
  el("div", { class: "im-ligne-corps" }, pastille ? el("span", { class: "im-pastille-tcam", text: pastille }) : null, graphique)) : null);

/** Tableau financier : en-tête plein, totaux sur fond, ratios en italique, négatifs entre parenthèses, repères numérotés. */
function tableau({ annees, lignes, enTete = "En k€", colonneSup = null }) {
  return el("table", { class: "im-tableau" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: enTete }), ...annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })), colonneSup ? el("th", { scope: "col", class: "num sup", text: colonneSup.titre }) : null)),
    el("tbody", {}, ...lignes.map((l) => el("tr", { class: `t-${l.type || "montant"}` },
      el("th", { scope: "row" }, l.renvoi ? carre(l.renvoi, "petit") : null, l.libelle),
      ...l.valeurs.map((v, k) => el("td", { class: "num", text: !ok(v) && (l.vide === "tiret" || (l.cle === "croissance" && k === 0)) ? "–" : l.type === "ratio" ? ratioTableau(v) : l.type === "texte" ? (ok(v) ? `${Math.round(v)} j` : "n.d.") : kEuros(v) })),
      colonneSup ? el("td", { class: "num sup", text: colonneSup.valeurs[l.cle] ?? "" }) : null))));
}
function tableauCompteResultat() {
  const c = cr();
  if (!c.annees.length) return aRediger("Compte de résultat (aucun exercice validé)");
  const t = c.tcam, sup = t && c.annees.length >= 2 ? { titre: `TCAM ${String(t.de).slice(2)}-${String(t.a).slice(2)}`, valeurs: { chiffre_affaires: ok(t.ca) ? pourcent(t.ca, { signe: true }) : "n.d.", ebe: ok(t.ebe) ? pourcent(t.ebe, { signe: true }) : "n.d." } } : null;
  return tableau({ annees: c.annees, lignes: c.lignes, colonneSup: sup });
}
/** Passage de l'EBE comptable à l'EBE retraité, chaque retraitement justifié renvoyant à son commentaire. */
function ebeRetraite() {
  const t = ch().ebe_retraite;
  if (!t?.annees?.length) return null;
  const justifs = [], lignes = [{ cle: "ebe_comptable", libelle: "EBE comptable", type: "total", valeurs: t.ebe_comptable }];
  for (const r of t.retraitements) {
    let renvoi = null;
    if (r.justification) { justifs.push([r.libelle, r.justification]); renvoi = justifs.length; }
    lignes.push({ cle: r.cle, libelle: r.libelle, type: "montant", valeurs: r.valeurs, renvoi, vide: "tiret" });
  }
  lignes.push({ cle: "ebe_retraite", libelle: "EBE retraité", type: "total", valeurs: t.ebe_retraite }, { cle: "ca", libelle: "Chiffre d'affaires", type: "montant", valeurs: t.annees.map((a) => serie("chiffre_affaires")[cr().annees.indexOf(a)] ?? null) }, { cle: "marge", libelle: "Marge d'EBE retraitée", type: "ratio", valeurs: t.marge_retraitee });
  const normatif = t.normatif && ok(t.normatif.valeur) ? `EBE normatif retenu : ${montant(t.normatif.valeur)} (${t.normatif.mode === "dernier" ? `exercice ${t.normatif.annees.at(-1)}` : `moyenne ${t.normatif.annees.join(", ")}`}).` : null;
  return { table: tableau({ annees: t.annees, lignes }), justifs, normatif, vide: !t.retraitements.length, pont: pontEbe(t) };
}
/** Pont (cascade) de l'EBE comptable à l'EBE retraité, dernier exercice ; chaque retraitement est une marche. */
function pontEbe(t) {
  const i = t.annees.length - 1, depart = t.ebe_comptable[i], arrivee = t.ebe_retraite[i];
  const marches = t.retraitements.map((r) => ({ libelle: r.libelle, v: r.valeurs[i] })).filter((m) => ok(m.v) && Math.round(m.v / 1000) !== 0);
  if (!ok(depart) || !ok(arrivee) || !marches.length) return null;
  const barres = [{ libelle: "EBE comptable", v: depart, total: true }, ...marches, { libelle: "EBE retraité", v: arrivee, total: true }];
  let cumul = 0; const pos = barres.map((b) => { if (b.total) { cumul = b.v; return [0, b.v]; } const a = cumul; cumul += b.v; return [a, cumul]; });
  const hauts = pos.flat(), mx = Math.max(...hauts, 1), mn = Math.min(0, ...hauts);
  const L = 640, H = 210, bas = 150, haut = 30, pas = L / barres.length, w = Math.min(70, pas * 0.5);
  const y = (v) => bas - ((v - mn) / (mx - mn)) * (bas - haut);
  const g = svg("svg", { viewBox: `0 0 ${L} ${H}`, class: "im-graph im-pont", role: "img", "aria-label": `Pont de l'EBE ${t.annees[i]} : ${barres.map((b) => `${b.libelle} ${kEuros(b.v)} k€`).join(" ; ")}` });
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
  lignes.push({ cle: "total", libelle: e.total <= 0 ? "Trésorerie nette" : "Dette financière nette", type: "total", valeurs: [e.total <= 0 ? -e.total : e.total] });
  return tableau({ annees: [`31/12/${e.annee ?? ""}`], lignes });
}
function tableauBfr() {
  const bfr = (ch().endettement?.bfr || []).filter((b) => ok(b.jours));
  if (!bfr.length) return null;
  return tableau({ annees: bfr.map((b) => b.annee), enTete: "BFR d'exploitation", lignes: [{ cle: "bfr", libelle: "En k€", type: "total", valeurs: bfr.map((b) => b.montant) }, { cle: "jours", libelle: "En jours de chiffre d'affaires", type: "texte", valeurs: bfr.map((b) => b.jours) }] });
}
/** Cinq premiers clients, anonymes : part du chiffre d'affaires, ancienneté de la relation. */
function tableauClients() {
  const c = ch().clients;
  if (!c?.lignes?.length) return null;
  const an = new Date().getFullYear(), mx = Math.max(...c.lignes.map((y) => y.part));
  return el("table", { class: "im-tableau im-tableau-clients" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Client" }), el("th", { scope: "col", text: "Activité" }), el("th", { scope: "col", text: "Part du CA" }), el("th", { scope: "col", class: "num", text: "Client depuis" }))),
    el("tbody", {}, ...c.lignes.map((x) => el("tr", {},
      el("th", { scope: "row", text: `Client ${x.rang}` }), el("td", { text: x.secteur || "n.d." }),
      el("td", {}, el("span", { class: "im-part" }, el("span", { class: "im-part-barre", style: `width:${Math.min(100, (x.part * 100) / mx).toFixed(0)}%` }), el("strong", { text: pct0(x.part) }))),
      el("td", { class: "num", text: ok(x.anciennete) ? String(an - x.anciennete) : "n.d." })))));
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
  if (q.region && CARTE.regions[q.region]) { const [cx, cy] = CARTE.regions[q.region].centre; g.append(svg("circle", { cx, cy, r: 16, class: "dp-carte-siege" })); }
  return el("figure", { class: "im-carte" }, g,
    el("figcaption", { class: "im-legende" }, el("span", { class: "im-pastille siege" }), "Siège",
      clients.size ? [el("span", { class: "im-pastille clients" }), "Régions clientes"] : null,
      nationale ? [el("span", { class: "im-pastille national" }), "Présence nationale"] : null));
}

/** Organigramme juridique : cédant, holding éventuelle, société, murs ; périmètre de cession en pointillés. */
function organigramme() {
  const pe = ch().perimetre || {};
  const boite = (t, classe, detail) => el("div", { class: `im-org-boite ${classe}` }, el("strong", { text: t }), detail ? el("span", { text: detail }) : null);
  const lien = (t) => el("div", { class: "im-org-lien" }, t ? el("span", { text: t }) : null);
  const mursDedans = pe.murs === "À l'entreprise elle-même" || (pe.murs_cession || "").startsWith("Oui");
  const murs = pe.murs && pe.murs !== "Pas de locaux en propre"
    ? boite("Murs de l'exploitation", "murs", pe.murs === "À l'entreprise elle-même" ? "Détenus par la société" : pe.murs === "À un propriétaire extérieur" ? "Propriétaire extérieur, bail en cours" : `Détenus par le dirigeant · ${pe.murs_cession ? pe.murs_cession.replace(/^(Oui|Non), /, "") : "cession à préciser"}`)
    : null;
  return el("div", { class: "im-org" },
    el("div", { class: "im-org-col" },
      boite(pe.associes ? "Dirigeant et associés" : "Dirigeant cédant", "personne", pe.detention ? null : "Détention des titres : à compléter"),
      lien(pe.part_cedee || ""),
      pe.holding ? [boite("Holding du cédant", "holding", "Société de détention"), lien("100 %")] : null,
      el("div", { class: "im-org-perimetre" }, boite(etat.entreprise || "Société", "societe", "Société d'exploitation"), mursDedans && murs ? murs : null, el("span", { class: "im-org-perimetre-lib", text: "Périmètre de cession" }))),
    !mursDedans && murs ? el("div", { class: "im-org-hors" }, murs, el("span", { class: "im-org-perimetre-lib", text: "Hors périmètre" })) : null,
    el("ul", { class: "im-org-legende" }, el("li", { class: "personne", text: "Personne physique" }), pe.holding ? el("li", { class: "holding", text: "Holding" }) : null, el("li", { class: "societe", text: "Société" })));
}

const photoUrl = (n) => (etat.photos?.[n] ? `${base}/photos/${n}?v=${etat.versionPhotos}` : null);
function photo(n, attendu = "Photo") {
  const u = photoUrl(n);
  return u ? el("figure", { class: "im-photo" }, el("img", { src: u, alt: etat.photos[n].legende || "Photo de l'entreprise" }), etat.photos[n].legende ? el("figcaption", { text: etat.photos[n].legende }) : null)
    : el("div", { class: "im-photo-vide" }, el("span", { text: `${attendu} : à ajouter` }), el("span", { class: "petit", text: "Page Mémorandum, étape 1 (photos de l'entreprise)" }));
}

/** Frise historique : axe épais, années cerclées, faits au-dessus et au-dessous en alternance (6 au plus). */
function pointsFrise(texte) {
  const phrases = String(texte).replace(/\*\*/g, "").replace(/\n/g, " ").replace(/\s+-\s+/g, " ").split(/(?<=\.)\s+/);
  const points = new Map();
  if (p().creation) points.set(p().creation, "Création de l'entreprise");
  for (const ph of phrases) for (const m of ph.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (!points.has(Number(m[1]))) points.set(Number(m[1]), majuscule(ph.replace(/^[-•▪\s]*\d{4}\s*[:–-]\s*/, "")).slice(0, 90));
  return [...points.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
}
function frise(points) {
  if (points.length < 2) return null;
  return el("div", { class: "im-bloc-frise" }, el("div", { class: "im-etiquette-v" }, el("span", { text: "Historique" })),
    el("ol", { class: "im-frise", style: `--n:${points.length}` }, ...points.map(([a, t], k) => el("li", { class: k % 2 ? "bas" : "haut" }, el("span", { class: "im-frise-txt", text: t }), el("span", { class: "im-frise-an", text: String(a) })))));
}

/** Structure du secteur (registres publics). */
const faitsMarche = () => (etat.marche?.faits || []).filter((f) => f.valide);
const LIBELLES_THEMES = { taille: "Taille du marché", tendance: "Tendance", demande: "Demande", reglementation: "Réglementation", concurrence: "Concurrence" };
const srcFait = (f) => `${f.source || new URL(f.url).hostname}${f.annee ? `, ${f.annee}` : ""}`;

/** Structure du secteur en cercles emboîtés, aires proportionnelles aux effectifs (registres publics). */
function cerclesSecteur(sct) {
  const n = (cles) => cles.reduce((a, k) => a + (sct.repartition.find((x) => x.cle === k)?.n || 0), 0);
  const niveaux = [
    { n: sct.region_total, lib: `entreprises actives en ${sct.region}`, classe: "c1", pref: sct.region_plafonne ? "> " : "" },
    { n: n(["1_9", "10_49", "50_plus"]), lib: "ont au moins un salarié", classe: "c2" },
    { n: n(["10_49", "50_plus"]), lib: "ont 10 salariés et plus", classe: "c3" },
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
  return el("figure", { class: "im-cercles-zone" }, el("p", { class: "im-encoche-titre", text: `Code NAF ${sct.naf}` }), g, legende,
    sct.part_meme_taille_ou_plus != null ? el("p", { class: "im-cercles-note" }, el("strong", { text: pct0(sct.part_meme_taille_ou_plus) }), " des entreprises de la région sont de sa taille ou plus grandes") : null);
}

// ------------------------------------------------------------------ Pages fixes
function couverture() {
  const q = p();
  return el("div", { class: "diapo im-couverture" },
    el("div", { class: "im-couv-cadre" }, motif(),
      el("div", { class: "im-couv-titre" }, el("p", { class: "im-couv-etiquette", text: "Mémorandum d'information" }), el("h2", { text: q.nom_de_code || "Projet" }),
        q.secteur || q.region ? el("p", { class: "im-couv-sous", text: [q.secteur, q.region].filter(Boolean).join(" · ") }) : null)),
    el("div", { class: "im-encoche-carte im-couv-encoche" },
      el("span", { class: "im-pilule", text: "Strictement confidentiel" }), el("strong", { text: majuscule(moisAnnee()) }), logoPassation()));
}
function pageOuverture(partie, k) {
  const u = photoUrl(k % Math.max(1, etat.photos?.length || 1));
  const num = String(partie.n).padStart(2, "0");
  const chapitres = etat.sections.filter((s) => s.partie === partie.n);
  return el("div", { class: "diapo im-ouverture", "data-partie": String(partie.n) },
    el("div", { class: "im-ouv-cadre" }, u ? el("div", { class: "im-ouv-photo", style: `background-image:url('${u}')` }) : motif(),
      el("div", { class: "im-ouv-titre" },
        el("p", { class: "im-ouv-num", "aria-hidden": "true" }, el("span", { class: "zero", text: num[0] }), num[1]),
        el("h2", { text: partie.titre }), partie.detail ? el("p", { class: "im-ouv-detail", text: partie.detail }) : null)),
    el("div", { class: "im-encoche-carte im-ouv-encoche" }, el("p", { class: "im-encoche-titre", text: "Dans cette partie" }),
      el("ol", {}, ...chapitres.map((s) => el("li", {}, el("span", { class: "im-som-sous", "data-num-section": s.cle }), el("span", { text: s.titre }))))));
}
function pageSommaire() {
  return page({ titre: "Sommaire", numerotee: false, classe: "im-sommaire", contenu: [el("ol", { class: "im-som" }, ...(etat.parties || []).map((pt) => el("li", {},
    el("div", { class: "im-som-partie" }, el("span", { class: "im-som-num", text: String(pt.n).padStart(2, "0") }), el("strong", { text: pt.titre }), el("span", { class: "im-som-page", "data-renvoi-partie": String(pt.n) })),
    el("ul", {}, ...etat.sections.filter((s) => s.partie === pt.n).map((s) => el("li", {}, el("span", { class: "im-som-sous", "data-num-section": s.cle }), el("a", { href: `#s-${s.cle}`, text: s.titre }), el("span", { class: "im-som-page", "data-renvoi": s.cle }))))))) ] });
}
function pageGlossaire() {
  const table = (lignes) => el("table", { class: "im-gloss" }, el("tbody", {}, ...lignes.map(([k, v]) => el("tr", {}, el("th", { scope: "row", text: k }), el("td", { text: v })))));
  return page({ titre: "Glossaire", numerotee: false, contenu: [el("div", { class: "im-glossaire" },
    encadre("Termes financiers", table([
      ["CA", "Chiffre d'affaires"],
      ["EBE", "Excédent brut d'exploitation : résultat de l'activité avant amortissements, frais financiers et impôt"],
      ["EBE retraité", "EBE corrigé des éléments non récurrents ou propres à la direction actuelle"],
      ["BFR", "Besoin en fonds de roulement : stocks et créances clients, moins dettes fournisseurs, fiscales et sociales"],
      ["Dette nette", "Emprunts et dettes financières, moins trésorerie et placements"],
      ["TCAM", "Taux de croissance annuel moyen"],
      ["k€ / M€", "Milliers d'euros / millions d'euros"],
      ["(x)", "Montant négatif"],
      ["n.d.", "Non disponible"],
    ])),
    encadre("Termes du document", table([
      ["Nom de code", "Nom donné au projet pour préserver la confidentialité de l'entreprise"],
      ["Cédant", "Actionnaire ou associé qui vend ses titres"],
      ["Périmètre", "Ce qui est cédé : titres de la société, et le cas échéant les murs"],
      ["NAF", "Nomenclature d'activités française, attribuée par l'INSEE"],
      ["Registres publics", "Annuaire des entreprises (INSEE Sirene), comptes déposés (INPI)"],
      ["Estimation du dirigeant", "Donnée déclarée par le dirigeant, non auditée"],
    ])))] });
}
function pageAvertissement() {
  return page({ titre: "Avertissement", numerotee: false, contenu: [el("div", { class: "im-avert" },
    el("p", { text: "Le présent mémorandum a été établi à partir des informations communiquées par le dirigeant de l'entreprise, de données publiques et de sources de marché citées en pied de page. Ces informations n'ont fait l'objet d'aucun audit : leur exactitude et leur exhaustivité ne sont pas garanties." }),
    el("p", { text: "Le document ne constitue ni une offre, ni un engagement. Il ne remplace pas les vérifications que tout repreneur conduit avec ses propres conseils (audit comptable, juridique, social et fiscal)." }),
    el("p", { text: "Il est remis sous engagement de confidentialité, dans le seul but de permettre à son destinataire de décider s'il souhaite étudier l'opération. Toute reproduction ou diffusion, totale ou partielle, est interdite." }),
    el("p", { class: "im-avert-fort", text: "Toutes les questions relatives à ce document ou à l'opération passent par le dirigeant, par l'intermédiaire de Passation. Les salariés, clients et fournisseurs de l'entreprise ne doivent en aucun cas être contactés directement." }),
    logoPassation())] });
}

// ------------------------------------------------------------------ Chapitres
function pagesSynthese(s) {
  const q = p(), cl = ch().clients || {}, er = ch().ebe_retraite || {};
  const an = cr().annees.at(-1), ca = derniere("chiffre_affaires"), t = cr().tcam, retraite = er.ebe_retraite?.at(-1), marge = er.marge_retraitee?.at(-1), endet = ch().endettement;
  const age = q.creation ? new Date().getFullYear() - q.creation : null;
  const op = q.operation || {};
  const tuile = (valeur, libelle, classe = "") => el("div", { class: `im-tuile-kpi ${classe}`.trim() }, el("strong", { text: valeur }), el("span", { text: libelle }));
  const p1 = chapitre(s, { titre: `${q.nom_de_code || "Le projet"}, en bref`, contenu: [el("div", { class: "im-grille im-g-synthese" },
    el("div", { class: "im-col-texte" }, corpsTexte(s)),
    el("div", { class: "im-synthese-droite" },
      el("div", { class: "im-kpis" },
        ok(ca) ? tuile(montant(ca), `Chiffre d'affaires ${an}`, "vert") : null,
        ok(retraite) ? tuile(montant(retraite), `EBE retraité ${an}${ok(marge) ? ` · ${pourcent(marge)}` : ""}`) : null,
        endet && ok(endet.total) ? tuile(montant(Math.abs(endet.total)), endet.total <= 0 ? `Trésorerie nette ${endet.annee}` : `Dette nette ${endet.annee}`) : null,
        ok(cl.recurrent) ? tuile(pct0(cl.recurrent), "Chiffre d'affaires récurrent", "sable") : tuile(effectifCourt(), "Salariés", "sable"),
        age ? tuile(`${age} ans`, `D'existence (${q.creation})`) : null,
        t && ok(t.ca) ? tuile(pourcent(t.ca, { signe: true }), `Croissance annuelle ${t.de}-${t.a}`, "cuivre") : null),
      cr().annees.length ? el("div", { class: "im-carte-graph" }, el("p", { class: "im-carte-graph-titre", text: "Chiffre d'affaires (en k€)" }),
        histogramme({ annees: cr().annees, valeurs: serie("chiffre_affaires"), libelle: "Chiffre d'affaires", croissance: true })) : null,
      el("div", { class: "im-operation-mini" }, el("p", { class: "im-encoche-titre", text: "Opération envisagée" }),
        tableCles([["Part cédée", op.part_cedee || "À compléter"], ["Motif", op.motif || "À compléter"], ["Calendrier", op.calendrier || "À compléter"]]))))],
    sources: [sourceChiffres(), SOURCES.publiques, SOURCES.dirigeant, SOURCES.calculs] });
  const pf = [1, 2, 3, 4, 5, 6].map((n) => etat.sections.find((x) => x.point_fort === n)).filter(Boolean);
  const p2 = page({ s, ancre: false, titre: "Considérations clés d'investissement", message: "Six points forts, développés dans les chapitres du mémorandum", contenu: [
    el("div", { class: "im-considerations" }, ...pf.map((x, k) => el("article", { class: `im-cons${k === 0 ? " vert" : k === 4 ? " sable" : ""}` },
      el("div", { class: "im-cons-tete" }, el("span", { class: "im-cons-num", text: String(x.point_fort).padStart(2, "0") }), el("span", { class: "im-cons-fleche", "aria-hidden": "true", text: "↗" })),
      el("p", { class: "im-cons-theme", text: x.titre }),
      x.redigee ? el("strong", { class: "im-cons-titre", text: titreDe(x) }) : aRediger(x.court),
      x.redigee && x.accroche ? el("p", { class: "im-cons-texte", text: x.accroche }) : null,
      el("a", { class: "im-voir", href: `#s-${x.cle}`, "data-renvoi": x.cle, text: "" }))))],
    sources: [SOURCES.dirigeant, SOURCES.calculs] });
  return [p1, p2];
}

function pagesChapitre(s) {
  const q = p(), cl = ch().clients || {};
  const an = cr().annees.at(-1), ca = derniere("chiffre_affaires");
  switch (s.cle) {
    case "histoire": {
      const pts = s.redigee ? pointsFrise(s.contenu) : [];
      const items = s.redigee ? textePuces(s).filter((t) => !(pts.length >= 2 && /^\d{4}$/.test(eclaterPuce(t).titre || ""))) : [];
      return [chapitre(s, { contenu: [
        bandeChiffres([q.creation ? [String(q.creation), "Année de création"] : null, q.creation ? [`${new Date().getFullYear() - q.creation} ans`, "D'existence"] : null, [q.region || "n.d.", `Région du siège${q.ville ? ` (${q.ville})` : ""}`], [effectifCourt(), "Salariés (tranche INSEE)"]]),
        frise(pts), s.redigee ? puces(items) : aRediger(s.court)],
        sources: [SOURCES.publiques, faitsSite("histoire", "implantation") ? SOURCES.site : null, SOURCES.dirigeant] })];
    }
    case "activite":
      return [chapitre(s, { contenu: [el("div", { class: "im-grille im-g-texte-encadre" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-pile" }, encadre("Données clés", tableCles([["Secteur", q.secteur], ["Zone commerciale", q.zone], ["Salariés", effectifCourt()], [`Chiffre d'affaires ${an ?? ""}`.trim(), ok(ca) ? montant(ca) : null], ["Région du siège", q.region]])), encadre("L'entreprise en images", photo(0, "Photo de l'atelier ou des réalisations"))))],
        sources: [SOURCES.publiques, SOURCES.dirigeant, faitsSite("activite", "produits", "qualite") ? SOURCES.site : null] })];
    case "organisation":
      return [chapitre(s, { contenu: [el("div", { class: "im-grille im-g-texte-encadre" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-pile" }, encadre("Effectifs et site", bandeChiffres([[effectifCourt(), "Salariés"], [q.ville || "n.d.", "Site principal"]]), tableCles([["Création", q.creation ? String(q.creation) : null], ["Région", q.region]])), encadre("L'équipe", photo(1, "Photo de l'équipe ou du site"))))],
        sources: [SOURCES.publiques, SOURCES.dirigeant, faitsSite("equipe") ? SOURCES.site : null] })];
    case "marche": {
      const sct = etat.marche?.secteur, faits = faitsMarche();
      const pages = [chapitre(s, { contenu: [el("div", { class: `im-grille ${sct ? "im-g-marche" : "im-g-texte-encadre"}` }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        sct ? cerclesSecteur(sct) : null,
        sct ? encadre(`Structure du secteur · ${sct.region}`, el("p", { class: "im-legende-graph", text: `Entreprises actives du code NAF ${sct.naf}, par tranche d'effectif` }),
          barresH(sct.repartition.map((x) => ({ libelle: x.libelle, valeur: x.n || 0, texte: `${x.n == null ? "n.d." : entier(x.n)} · ${pct0(x.part)}`, accent: x.cle === sct.bande_entreprise }))),
          sct.part_meme_taille_ou_plus != null ? info(`En couleur, la tranche de l'entreprise : ${entier(sct.nombre_meme_taille_ou_plus_region)} entreprises de la région sont de sa taille ou plus grandes.`) : null)
          : encadre("Structure du secteur", aRediger("Lancez l'étude de marché (registres publics)")))],
        sources: [sct?.source || "Annuaire des entreprises (INSEE Sirene)", SOURCES.dirigeant] })];
      if (faits.length) {
        const themes = Object.keys(LIBELLES_THEMES).map((t) => [t, faits.filter((f) => f.theme === t)]).filter(([, l]) => l.length);
        const tuiles = themes.map(([, l]) => l.find((f) => f.chiffre)).filter(Boolean).slice(0, 3);
        pages.push(page({ s, ancre: false, titre: "Les moteurs du marché", message: "Les chiffres de marché publiés, chacun avec sa source", contenu: [el("div", { class: `im-grille ${tuiles.length ? "im-g-moteurs" : ""}` },
          el("ol", { class: "im-moteurs", "data-decoupable": "" }, ...themes.map(([t, l], k) => el("li", {}, el("span", { class: "im-rond", text: String(k + 1) }),
            el("div", {}, el("h5", { text: LIBELLES_THEMES[t] }), el("ul", { class: "im-puces" }, ...l.map((f) => el("li", {}, el("span", {}, ...surligne(f.fait, f.chiffre), el("em", { class: "im-src", text: ` (${srcFait(f)})` }))))))))),
          tuiles.length ? el("aside", { class: "im-tuiles" }, ...tuiles.map((f) => el("div", { class: "im-tuile" }, el("strong", { text: f.chiffre }), el("span", { text: LIBELLES_THEMES[f.theme] }), el("em", { text: srcFait(f) })))) : null)],
          sources: [...new Set(faits.map(srcFait))].slice(0, 6) }));
      }
      return pages;
    }
    case "clients": {
      const conc = barresH([ok(cl.premier) ? { libelle: "Premier client", valeur: cl.premier, texte: pct0(cl.premier) } : null,
        ok(cl.cinq) && cl.cinq_complet ? { libelle: "Cinq premiers", valeur: cl.cinq, texte: pct0(cl.cinq) } : null,
        ok(cl.recurrent) ? { libelle: "CA récurrent", valeur: cl.recurrent, texte: pct0(cl.recurrent), accent: true } : null], { max: 1 });
      const tc = tableauClients();
      return [chapitre(s, { contenu: [el("div", { class: "im-grille im-g-clients" }, el("div", { class: "im-col-texte" }, corpsTexte(s)),
        el("div", { class: "im-g-clients-droite" },
          encadre("Concentration du chiffre d'affaires", conc ? [el("p", { class: "im-legende-graph", text: "En % du chiffre d'affaires" }), conc] : aRediger("Part des premiers clients")),
          encadre("Implantation commerciale", carteFrance(), q.zone ? el("p", { class: "im-legende-graph", text: `Zone : ${q.zone}` }) : null),
          tc ? el("div", { class: "im-pleine" }, encadre(`${ch().clients.lignes.length === 5 ? "Les cinq" : "Les"} premiers clients (anonymisés)`, tc)) : null))],
        sources: [SOURCES.dirigeant, faitsSite("clients", "marche") ? SOURCES.site : null, "fond de carte IGN Admin Express (Licence ouverte)"] })];
    }
    case "finances": {
      const src = [sourceChiffres(), "retraitements déclarés par le dirigeant", SOURCES.calculs];
      const c = cr(), t = c.tcam, er = ch().ebe_retraite, endet = ch().endettement;
      const avecRetraite = er?.ebe_retraite?.some(ok);
      const ebeAnnees = avecRetraite ? er.annees : c.annees, ebeVals = avecRetraite ? er.ebe_retraite : serie("ebe"), marges = avecRetraite ? er.marge_retraitee : serie("ebe_pct");
      const retraite = er?.ebe_retraite?.at(-1), marge = er?.marge_retraitee?.at(-1);
      const tcamTxt = (x) => (t && ok(x) && c.annees.length >= 2 ? `TCAM ${t.de}-${t.a} : ${pourcent(x, { signe: true })}` : null);
      const charges = structureCharges();
      const ratios = [ok(marge) ? [pourcent(marge), "Marge d'EBE retraitée", "graphe"] : null,
        ok(serie("marge_brute_pct").at(-1)) ? [pourcent(serie("marge_brute_pct").at(-1)), "Marge brute", "euro"] : null,
        ok(serie("resultat_net_pct").at(-1)) ? [pourcent(serie("resultat_net_pct").at(-1)), "Marge nette", "valide"] : null,
        endet && ok(endet.total) ? [montant(Math.abs(endet.total)), endet.total <= 0 ? "Trésorerie nette" : "Dette nette", "balance"] : null].filter(Boolean);
      const pages = [chapitre(s, { titre: "Chiffres clés financiers", contenu: [
        c.annees.length ? el("div", { class: "im-chevron-titre" }, `Performances historiques · exercices ${c.annees[0]} à ${c.annees.at(-1)}`) : aRediger("Les chiffres (aucun exercice validé)"),
        el("div", { class: "im-grille im-g-finances" },
          el("div", { class: "im-pile" },
            ligneGraphique("Chiffre d'affaires (en k€)", histogramme({ annees: c.annees, valeurs: serie("chiffre_affaires"), libelle: "Chiffre d'affaires", croissance: true }), tcamTxt(t?.ca)),
            ligneGraphique(`${avecRetraite ? "EBE retraité" : "EBE"} (en k€) et marge`, histogramme({ annees: ebeAnnees, valeurs: ebeVals, marges, libelle: avecRetraite ? "EBE retraité" : "EBE" }), avecRetraite ? null : tcamTxt(t?.ebe))),
          el("div", { class: "im-pile" },
            charges ? encadre(`Où va un euro de chiffre d'affaires (${c.annees.at(-1)})`, charges) : null,
            ratios.length ? el("div", { class: "im-ratios" }, ...ratios.map(([v, l, ic]) => el("div", { class: "im-ratio" }, el("span", { class: "im-puce-picto" }, icone(ic, "im-picto")), el("strong", { text: v }), el("span", { text: `${l} ${c.annees.at(-1)}` })))) : null))],
        sources: src })];
      pages.push(page({ s, ancre: false, titre: `Compte de résultat ${c.annees.length ? `${c.annees[0]}-${c.annees.at(-1)}` : ""}`.trim(),
        message: ok(ca) ? `Un chiffre d'affaires de ${montant(ca)} en ${an}${t && ok(t.ca) && c.annees.length >= 2 ? `, ${t.ca >= 0 ? "en hausse" : "en baisse"} de ${pourcent(Math.abs(t.ca))} par an depuis ${t.de}` : ""}` : null,
        contenu: [el("div", { class: "im-grille im-g-tableau" }, tableauCompteResultat(), el("div", { class: "im-col-texte" }, intertitre("Commentaires"), corpsTexte(s)))],
        notes: c.consecutifs === false ? ["Exercices non consécutifs : croissance annualisée entre deux exercices présentés."] : [], sources: src }));
      const eb = ebeRetraite();
      if (eb) pages.push(page({ s, ancre: false, titre: "EBE retraité",
        message: ok(retraite) ? `Un EBE retraité de ${montant(retraite)} en ${er.annees.at(-1)}${ok(marge) ? `, soit ${pourcent(marge)} du chiffre d'affaires` : ""}` : null,
        contenu: [el("div", { class: "im-grille im-g-tableau im-g-auto" }, eb.table, el("div", { class: "im-col-texte" }, intertitre("Retraitements"),
          eb.justifs.length ? el("ol", { class: "im-renvois", "data-decoupable": "" }, ...eb.justifs.map(([lib, j], k) => el("li", {}, carre(k + 1), el("p", {}, el("strong", { text: `${lib} : ` }), j))))
            : el("p", { text: eb.vide ? "Aucun retraitement déclaré : l'EBE retraité est égal à l'EBE comptable." : "Retraitements déclarés sans justification détaillée." }),
          info(eb.normatif))),
          eb.pont ? encadre(`De l'EBE comptable à l'EBE retraité ${er.annees.at(-1)} (en k€)`, eb.pont) : null],
        sources: src }));
      if (endet) {
        const bfr = (endet.bfr || []).filter((b) => ok(b.jours));
        pages.push(page({ s, ancre: false, titre: "Endettement net et besoin en fonds de roulement",
          message: ok(endet.total) ? (endet.total <= 0 ? `Une trésorerie nette de ${montant(-endet.total)} au 31 décembre ${endet.annee}` : `Une dette financière nette de ${montant(endet.total)} au 31 décembre ${endet.annee}${ok(endet.sur_ebe) ? `, soit ${multiple(endet.sur_ebe)} l'EBE retraité` : ""}`) : null,
          contenu: [el("div", { class: "im-grille im-g-tableau" }, el("div", { class: "im-pile" }, tableauDette(), tableauBfr()),
            el("div", { class: "im-col-texte" }, intertitre("Commentaires"), el("ul", { class: "im-puces" },
              el("li", { text: "Dette positive ; trésorerie et placements en déduction, entre parenthèses." }),
              ok(endet.sur_ebe) && endet.total > 0 ? el("li", {}, el("span", {}, "Dette nette rapportée à l'EBE normatif : ", el("strong", { text: multiple(endet.sur_ebe) }), ".")) : null,
              bfr.length ? el("li", {}, el("span", {}, `Besoin en fonds de roulement de ${kEuros(bfr.at(-1).montant)} k€ en ${bfr.at(-1).annee}, soit `, el("strong", { text: `${Math.round(bfr.at(-1).jours)} jours` }), " de chiffre d'affaires.")) : null),
              graphiqueBfr() ? encadre("BFR en jours de chiffre d'affaires", graphiqueBfr()) : null,
              encadre("Indicateurs de structure financière", el("div", { class: "im-bande-chiffres grille-2" }, ...[
                ok(endet.total) ? [montant(Math.abs(endet.total)), endet.total <= 0 ? `Trésorerie nette au 31/12/${endet.annee}` : `Dette nette au 31/12/${endet.annee}`] : null,
                ok(endet.sur_ebe) && endet.total > 0 ? [multiple(endet.sur_ebe), "Dette nette / EBE normatif"] : null,
                bfr.length ? [`${Math.round(bfr.at(-1).jours)} j`, `BFR en jours de CA (${bfr.at(-1).annee})`] : null,
                bfr.length >= 2 ? [`${Math.round(bfr[0].jours)} j`, `BFR en jours de CA (${bfr[0].annee})`] : null,
              ].filter(Boolean).map(([v, l]) => el("div", { class: "im-bc" }, el("strong", { text: v }), el("span", { text: l })))))))],
          sources: src }));
      }
      return pages;
    }
    case "perspectives": {
      const pe = q.perspectives || {}, t = cr().tcam;
      const tuiles = [ok(pe.croissance) ? [`${pourcent(pe.croissance, { signe: true, decimales: 0 })}`, "Croissance annuelle anticipée", "estimation du dirigeant"] : null,
        ok(pe.marge_ebe) ? [pourcent(pe.marge_ebe, { decimales: 0 }), "Marge d'EBE visée", "estimation du dirigeant"] : null,
        t && ok(t.ca) ? [pourcent(t.ca, { signe: true }), "Croissance historique du CA", `TCAM ${t.de}-${t.a}`] : null].filter(Boolean);
      const { paragraphes, puces: axes } = decouperTexte(s.redigee ? s.contenu : "");
      const items = axes.length ? axes : paragraphes;
      return [chapitre(s, { contenu: [
        tuiles.length ? el("div", { class: "im-kpis rangee" }, ...tuiles.map(([v, l, d], k) => el("div", { class: `im-tuile-kpi${k === 0 ? " vert" : ""}` }, el("strong", { text: v }), el("span", { text: `${l} · ${d}` })))) : null,
        s.redigee && axes.length && paragraphes.length ? el("p", { class: "im-chapeau" }, ...enrichi(paragraphes.join(" "))) : null,
        s.redigee ? el("ol", { class: `im-piliers n${Math.min(4, items.length)}`, "data-decoupable": "" }, ...items.map((it, k) => { const { titre, texte } = eclaterPuce(it); return el("li", {}, el("span", { class: "im-pilier-num", text: String(k + 1).padStart(2, "0") }), titre ? el("h5", {}, ...enrichi(titre)) : null, el("p", {}, ...enrichi(majuscule(texte)))); })) : aRediger(s.court),
        info("Les perspectives présentées sont celles du dirigeant. Elles n'ont fait l'objet d'aucun audit.")],
        sources: [SOURCES.dirigeant, t && ok(t.ca) ? sourceChiffres() : null, faitsMarche().length ? "étude de marché (sources citées au chapitre Marché)" : null] })];
    }
    case "operation": {
      const op = q.operation || {};
      const etapes = [["Confidentialité", "Chaque repreneur intéressé signe un engagement de confidentialité avant de recevoir le mémorandum.", "Mémorandum d'information"],
        ["Étude du dossier", "Lecture du mémorandum, questions écrites, puis rencontre avec le dirigeant.", "Réponses écrites, visite de l'entreprise"],
        ["Offres indicatives", "Lettres d'intention : prix envisagé, financement, conditions et calendrier.", "Lettre d'intention du repreneur"],
        ["Audits", "Le repreneur retenu vérifie les comptes, les contrats et les aspects juridiques, sociaux et fiscaux.", "Accès aux documents de l'entreprise"],
        ["Signature", "Négociation du protocole de cession, signature, puis transfert de propriété.", "Protocole et acte de cession"]];
      return [chapitre(s, { titre: "Contexte et opération envisagée", contenu: [el("div", { class: "im-grille im-g-operation" },
        el("div", { class: "im-col-texte" }, intertitre("Contexte"), corpsTexte(s), intertitre("Opération envisagée"),
          el("ul", { class: "im-puces" }, ...[["Part du capital cédée", op.part_cedee], ["Motif du cédant", op.motif], ["Calendrier souhaité", op.calendrier], ["Accompagnement du repreneur", op.accompagnement]]
            .map(([k, v]) => el("li", {}, el("span", {}, el("strong", { text: `${k} : ` }), v || "à compléter"))))),
        encadre("Organigramme juridique", organigramme()))],
        sources: [SOURCES.dirigeant, SOURCES.publiques] }),
      page({ s, ancre: false, titre: "Déroulement du processus", message: "Un processus en cinq étapes, conduit sous engagement de confidentialité", contenu: [
        el("ol", { class: "im-chevrons" }, ...etapes.map(([t, d, doc], k) => el("li", {}, el("span", { class: "im-chev" }, el("b", { text: String(k + 1) }), t),
          el("div", { class: "im-couloir" }, el("p", { class: "im-couloir-lib", text: "Objet" }), el("p", { text: d }), el("p", { class: "im-couloir-lib", text: "Documents" }), el("p", { text: doc }))))),
        el("div", { class: "im-interlocuteur" }, el("strong", { text: "Interlocuteur unique" }), el("span", { text: "le dirigeant, par l'intermédiaire de Passation. Les salariés, clients et fournisseurs ne doivent pas être contactés directement." })),
        info("Calendrier indicatif : il dépend du nombre de repreneurs intéressés et de la durée des audits.")],
        sources: [SOURCES.dirigeant] })];
    }
    default:
      return [chapitre(s, { contenu: [corpsTexte(s)] })];
  }
}

function dessinerMemo() {
  etat.versionPhotos ??= Date.now();
  const enfants = [couverture(), pageSommaire(), pageGlossaire()];
  (etat.parties || []).forEach((pt, k) => {
    enfants.push(pageOuverture(pt, k));
    for (const s of etat.sections.filter((x) => x.partie === pt.n)) {
      enfants.push(...(s.cle === "synthese" ? pagesSynthese(s) : pagesChapitre(s)));
      const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
        el("strong", { class: "petit", text: s.court }),
        s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
        s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: "À compléter : " }), s.a_completer.join(" ; ")) : null,
        el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
        s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, "Modifier") : null);
      enfants.push(outils);
    }
  });
  enfants.push(pageAvertissement());
  $("#memo").replaceChildren(...enfants);
  decouper();
  // Numéros « partie.page » (une suite garde le numéro de sa page), pages, renvois du sommaire et des points forts
  const diapos = [...$("#memo").querySelectorAll(".diapo")];
  const numSection = {};
  let partie = 0, n = 0;
  diapos.forEach((d, k) => {
    const np = d.querySelector(".im-page-num"); if (np) np.textContent = String(k + 1);
    if (d.classList.contains("im-ouverture")) { partie = Number(d.dataset.partie); n = 0; return; }
    const num = d.querySelector(".im-num"); if (!num) return;
    if (!d.dataset.suite) n++;
    num.textContent = `${partie}.${Math.max(1, n)}`;
    if (d.id?.startsWith("s-")) numSection[d.dataset.section] = num.textContent;
  });
  const premiere = (cle) => diapos.findIndex((d) => d.dataset.section === cle) + 1;
  $("#memo").querySelectorAll("[data-renvoi]").forEach((r) => { const k = premiere(r.dataset.renvoi); r.textContent = k > 0 ? (r.classList.contains("im-voir") ? `Voir p. ${k}` : String(k)) : ""; });
  $("#memo").querySelectorAll("[data-renvoi-partie]").forEach((r) => { const k = diapos.findIndex((d) => d.dataset.partie === r.dataset.renvoiPartie && d.classList.contains("im-ouverture")) + 1; r.textContent = k > 0 ? String(k) : ""; });
  $("#memo").querySelectorAll(".im-som a").forEach((a) => { const h = $("#memo").querySelector(`${a.getAttribute("href")} .im-entete h3`); if (h) a.textContent = h.textContent; });
  $("#memo").querySelectorAll("[data-num-section]").forEach((r) => { r.textContent = numSection[r.dataset.numSection] || ""; });
}

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
      const suite = page({ s, titre: courante.querySelector(".im-entete h3").textContent.replace(/ \(suite\)$/, ""), suite: true, contenu: [conteneur] });
      suite.querySelector(".im-pied-sources").replaceWith(courante.querySelector(".im-pied-sources").cloneNode(true));
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
