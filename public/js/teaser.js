// Page du teaser : rédaction (Claude, contrôlée par le serveur), relecture, modification par section, impression.
const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("dossier") || "";
const base = `/api/dossiers/${id}/documents/teaser`;
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
function message(t, erreur = false) { const m = $("#message"); m.textContent = t; m.hidden = !t; m.classList.toggle("erreur", erreur); }
async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { "content-type": "application/json" } });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || "Une erreur est survenue."); e.problemes = d.problemes; throw e; }
  return d;
}
const detailProblemes = (p) => (p?.length ? ` Éléments en cause : ${[...new Set(p.map((x) => x.terme))].join(", ")}.` : "");

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...enfants) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  e.append(...enfants.filter(Boolean));
  return e;
};
const titreSvg = (t) => { const e = svg("title"); e.textContent = t; return e; };
const PALIERS_CA = ["< 1", "1-2", "2-5", "5-10", "10-20", "20-50", "> 50"];
const PALIERS_MARGE = ["négative", "< 5 %", "5-10 %", "10-15 %", "15-20 %", "> 20 %"];

// Pictogrammes originaux, trait simple
const PICTOS = {
  secteur: "M4 20V9l5 3V9l5 3V5h6v15H4z",
  region: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anciennete: "M12 3v2M12 19v2M5 12H3M21 12h-2M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  effectif: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a2.5 2.5 0 1 0 0-5M17 14c2.4.4 4 2.7 4 6",
};
function tuiles(t) {
  const liste = [["secteur", "Secteur"], ["region", "Implantation"], ["anciennete", "Ancienneté"], ["effectif", "Effectif"]];
  return el("ul", { class: "tsr-tuiles", "aria-label": "Profil de l'entreprise" },
    ...liste.map(([cle, lib]) => el("li", { class: "tsr-tuile" },
      svg("svg", { viewBox: "0 0 24 24", class: "tsr-picto", "aria-hidden": "true" }, svg("path", { d: PICTOS[cle] })),
      el("span", { class: "tsr-tuile-lib", text: lib }),
      el("strong", { text: t?.[cle] || "À compléter" }))));
}
function jauge(titre, paliers, v) {
  return el("figure", { class: "tsr-graph" },
    el("figcaption", {}, el("span", { text: titre }), el("strong", { text: v ? v.libelle : "À compléter" })),
    el("div", { class: "tsr-jauge", role: "img", "aria-label": `${titre} : ${v ? v.libelle : "à compléter"}` },
      ...paliers.map((p, i) => el("span", { class: v && i === v.palier ? "actif" : v && i < v.palier ? "rempli" : null, title: p },
        el("i"), el("small", { text: p })))));
}
function courbe(points) {
  const titre = "Évolution du CA";
  if (!points) return el("figure", { class: "tsr-graph" }, el("figcaption", {}, el("span", { text: titre }), el("strong", { text: "À compléter" })));
  const W = 300, H = 120, g = 28, d = 14, h = 18, b = 22;
  const vals = points.map((p) => p.indice);
  let min = Math.min(100, ...vals), max = Math.max(100, ...vals);
  const marge = Math.max(10, (max - min) * 0.15); min -= marge; max += marge;
  const x = (i) => g + (i * (W - g - d)) / (points.length - 1);
  const y = (v) => h + ((max - v) * (H - h - b)) / (max - min);
  const ligne = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.indice).toFixed(1)}`).join("");
  const aire = `${ligne}L${x(points.length - 1).toFixed(1)},${H - b}L${g},${H - b}Z`;
  const fin = vals.at(-1);
  return el("figure", { class: "tsr-graph tsr-graph-courbe" },
    el("figcaption", {}, el("span", { text: titre }), el("strong", { text: `indice ${fin} · base 100 en ${points[0].annee}` })),
    svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "tsr-courbe", role: "img", "aria-label": `${titre}, base 100 : ${points.map((p) => `${p.annee} ${p.indice}`).join(", ")}` },
      svg("line", { x1: g, x2: W - d, y1: y(100), y2: y(100), class: "tsr-base" }),
      svg("text", { x: g - 6, y: y(100) + 3, class: "tsr-axe", "text-anchor": "end" }, "100"),
      svg("path", { d: aire, class: "tsr-aire" }),
      svg("path", { d: ligne, class: "tsr-ligne" }),
      ...points.map((p, i) => svg("g", {},
        svg("circle", { cx: x(i), cy: y(p.indice), r: 12, class: "tsr-cible" }, titreSvg(`${p.annee} : indice ${p.indice}`)),
        svg("circle", { cx: x(i), cy: y(p.indice), r: i === points.length - 1 ? 4.5 : 3.5, class: i === points.length - 1 ? "tsr-point fin" : "tsr-point" }),
        svg("text", { x: x(i), y: H - 6, class: "tsr-axe", "text-anchor": "middle" }, p.annee),
        i === points.length - 1 ? svg("text", { x: x(i), y: y(p.indice) - 10, class: "tsr-valeur", "text-anchor": "end" }, String(p.indice)) : null))));
}
function anneau(pct) {
  const titre = "Chiffre d'affaires récurrent";
  const R = 26, C = 2 * Math.PI * R;
  return el("figure", { class: "tsr-graph tsr-graph-anneau" },
    svg("svg", { viewBox: "0 0 64 64", class: "tsr-anneau", role: "img", "aria-label": `${titre} : ${pct == null ? "à compléter" : `environ ${pct} %`}` },
      svg("circle", { cx: 32, cy: 32, r: R, class: "tsr-anneau-fond" }),
      pct ? svg("circle", { cx: 32, cy: 32, r: R, class: "tsr-anneau-part", "stroke-dasharray": `${(C * pct) / 100} ${C}`, transform: "rotate(-90 32 32)" }, titreSvg(`environ ${pct} % récurrent`)) : null,
      svg("text", { x: 32, y: 36, "text-anchor": "middle", class: "tsr-anneau-val" }, pct == null ? "—" : `${pct} %`)),
    el("figcaption", {}, el("span", { text: titre }), el("strong", { text: pct == null ? "À compléter" : "contrats, abonnements, clients fidèles" })));
}

function rendu(d) {
  const zone = $("#teaser");
  if (!d.teaser) { zone.hidden = true; $("#btn-imprimer").hidden = true; $("#btn-generer").textContent = "Rédiger le teaser"; return; }
  $("#btn-generer").textContent = "Rédiger une nouvelle version";
  $("#btn-imprimer").hidden = false;
  zone.hidden = false;
  const s = Object.fromEntries(d.teaser.sections.map((x) => [x.cle, x]));
  const v = d.visuels || {};
  zone.replaceChildren(
    el("header", { class: "doc-tete" },
      el("span", { class: "doc-marque", text: "Passation" }),
      el("span", { class: "doc-confidentiel", text: "Strictement confidentiel" })),
    el("div", { class: "tsr-titre" },
      el("p", { class: "etiquette", text: "Opportunité de reprise" }),
      el("h2", { id: "teaser-titre", class: "doc-titre", text: d.nom_de_code || "Projet" })),
    s.accroche && section(s.accroche),
    tuiles(v.tuiles),
    el("div", { class: "tsr-grille" },
      el("div", { class: "tsr-col" }, s.activite && section(s.activite), s.atouts && section(s.atouts)),
      el("div", { class: "tsr-chiffres" },
        el("h3", { class: "tsr-chiffres-titre", text: "Chiffres clés" }),
        jauge("Chiffre d'affaires (M€)", PALIERS_CA, v.ca),
        jauge("Marge d'EBE", PALIERS_MARGE, v.marge),
        courbe(v.evolution),
        anneau(v.recurrence),
        s.chiffres && section({ ...s.chiffres, sansTitre: true }, "tsr-note"))),
    s.operation && section(s.operation, "tsr-operation"),
    el("footer", { class: "doc-pied" },
      el("span", { text: `Teaser · version ${d.teaser.version} · ${new Date(d.teaser.cree_le * 1000).toLocaleDateString("fr-FR")}` }),
      el("span", { text: "Fourchettes et indices calculés à partir des comptes. Contact : par l'intermédiaire de Passation. Document non contractuel." })),
  );
}
function section(s, classe = null) {
  const corps = s.cle === "atouts"
    ? el("ul", {}, ...s.contenu.split("\n").filter(Boolean).map((l) => el("li", { text: l.replace(/^-\s*/, "") })))
    : el(s.cle === "accroche" ? "p" : "p", { class: s.cle === "accroche" ? "doc-accroche" : null, text: s.contenu });
  const bloc = el("section", { class: classe ? `doc-section ${classe}` : "doc-section" },
    s.cle === "accroche" || s.sansTitre ? null : el("h3", { text: s.titre }),
    corps,
    el("div", { class: "doc-edition pas-imprime" },
      s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
      el("button", { type: "button", class: "lien-simple", onclick: () => editer(bloc, s) }, `Modifier « ${s.titre} »`)));
  return bloc;
}
function editer(bloc, s) {
  const ta = el("textarea", { rows: String(Math.max(3, s.contenu.split("\n").length + 1)), "aria-label": `Texte : ${s.titre}` });
  ta.value = s.contenu;
  const enregistrer = el("button", { type: "button", class: "btn btn-noir btn-mini" }, "Enregistrer");
  enregistrer.addEventListener("click", async () => {
    enregistrer.disabled = true;
    try { rendu(await api(`${base}/sections/${s.cle}`, { method: "PUT", body: JSON.stringify({ contenu: ta.value }) })); message("Modification enregistrée."); }
    catch (e) { message(e.message + detailProblemes(e.problemes), true); enregistrer.disabled = false; }
  });
  bloc.replaceChildren(el("h3", { text: s.titre }), ta, el("div", { class: "doc-edition" }, enregistrer, el("button", { type: "button", class: "lien-simple", onclick: charger }, "Annuler")));
  ta.focus();
}
$("#btn-generer").addEventListener("click", async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true;
  message("Rédaction en cours… (30 secondes environ)");
  try { rendu(await api(base, { method: "POST" })); message("Teaser rédigé et contrôlé. Relisez-le : vous pouvez modifier chaque partie."); }
  catch (e) { message(e.message + detailProblemes(e.problemes), true); }
  finally { b.disabled = false; }
});
$("#btn-imprimer").addEventListener("click", () => window.print());
async function charger() {
  if (!/^[0-9a-f-]{36}$/.test(id)) { location.replace("/espace/"); return; }
  $("#lien-dossier").href = `/espace/?dossier=${id}`;
  try {
    const d = await api(base); rendu(d);
    // Arrivée depuis le bouton « PDF » de la page du dossier : on propose l'enregistrement une fois le teaser affiché
    if (d.teaser && new URLSearchParams(location.search).get("imprimer") === "1") { await document.fonts?.ready; window.print(); }
  } catch (e) { if (e.message !== "non connecté") message(e.message, true); }
  $("main").removeAttribute("aria-busy");
}
charger();
