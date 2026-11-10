// Page du mémorandum : site et logo (faits validés un par un), sections rédigées à la demande, impression.
const $ = (s) => document.querySelector(s);
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
    try { etat = await api(`${base}/logo`, { method: "POST", body: fd }); tout(); message("Logo enregistré."); } catch (e) { message(e.message, true); }
  });
  $("#logos").replaceChildren(el("div", { class: "logos" },
    el("p", { class: "petit", text: etat.logo ? "Logo retenu : voir la couverture ci-dessous. Vous pouvez en choisir un autre." : "Choisissez le logo de l'entreprise (ou déposez-le)." }),
    el("div", { class: "logos-liste" }, ...logos.map((l) => el("button", { type: "button", class: "logo-choix", title: l.origine, onclick: async () => {
      try { etat = await api(`${base}/logo`, { method: "POST", body: JSON.stringify({ url: l.url }) }); tout(); message("Logo enregistré."); } catch (e) { message(e.message, true); }
    } }, el("img", { src: l.url, alt: `Candidat : ${l.origine}`, loading: "lazy", referrerpolicy: "no-referrer" })))),
    el("label", { class: "btn btn-contour btn-mini", for: "fichier-logo" }, "Déposer un logo (PNG, JPEG, WebP)"), fichier));
}

function dessinerVerrou() {
  const v = etat.deverrouille;
  $("#verrou").replaceChildren(v.ok ? "" : el("div", { class: "message-carte" }, el("p", { text: "Avant de rédiger le mémorandum :" }),
    el("ul", {}, ...v.manque.map((m) => el("li", { text: m }))),
    el("a", { class: "btn btn-noir btn-mini", href: `/espace/valorisation/?dossier=${id}#entreprise` }, "Ouvrir le questionnaire")));
  $("#btn-tout").disabled = !v.ok;
}

const court = (v) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(v / 1e3).toLocaleString("fr-FR")} k€`);

function tableauFinancier() {
  const t = etat.tableau;
  if (!t.annees.length) return el("p", { class: "a-rediger", text: "Tableau financier : À compléter (aucun exercice validé)." });
  return el("table", { class: "dp-tableau" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "En euros" }), ...t.annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })))),
    el("tbody", {}, ...t.lignes.map((l) => el("tr", {}, el("th", { scope: "row", text: l.libelle }), ...l.valeurs.map((v) => el("td", { class: "num", text: v == null ? "–" : fmt.format(v) }))))));
}
function chiffresCles() {
  const t = etat.tableau;
  if (!t.annees.length) return null;
  const v = (cle) => t.lignes.find((l) => l.cle === cle)?.valeurs.at(-1) ?? null;
  const ca = v("chiffre_affaires"), ebe = v("ebe");
  const tuiles = [[`Chiffre d'affaires ${t.annees.at(-1)}`, court(ca)], ["EBE", court(ebe)], ["Marge d'EBE", ca > 0 && ebe != null ? `${((ebe / ca) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "–"], ["Résultat net", court(v("resultat_net"))]];
  return el("div", { class: "dp-tuiles" }, ...tuiles.map(([l, x]) => el("div", { class: "dp-tuile" }, el("span", { class: "dp-tuile-val", text: x }), el("span", { class: "dp-tuile-lib", text: l }))));
}

const tete = () => el("header", { class: "dp-tete" }, el("span", { class: "dp-marque", text: "Mémorandum d'information" }), el("span", { text: etat.entreprise || "" }));
const pied = () => el("footer", { class: "dp-pied" }, el("span", { text: "Passation" }), el("span", { text: "Strictement confidentiel" }), el("span", { class: "dp-num" }));

function diapoSection(s, i, contenu, suite = false) {
  return el("div", { class: "diapo dp-section", "data-section": s.cle, "data-index": String(i), id: suite ? null : `s-${s.cle}` },
    tete(),
    el("div", { class: "dp-grille" },
      el("div", { class: "dp-titre" }, el("span", { class: "dp-numero", text: String(i + 1).padStart(2, "0") }), el("h3", { text: s.titre }), suite ? el("p", { class: "dp-suite", text: "(suite)" }) : null),
      el("div", { class: "dp-contenu" }, ...contenu)),
    pied());
}

function dessinerMemo() {
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const enfants = [];
  // Couverture
  enfants.push(el("div", { class: "diapo dp-couverture" },
    el("div", { class: "dp-couv-haut" }, etat.logo ? el("span", { class: "dp-logo" }, el("img", { src: `${base}/logo?v=${Date.now()}`, alt: `Logo de ${etat.entreprise || "l'entreprise"}` })) : el("span"), el("span", { class: "dp-conf", text: "Strictement confidentiel" })),
    el("div", { class: "dp-couv-centre" }, el("p", { class: "dp-etiquette", text: "Mémorandum d'information" }), el("h2", { text: etat.entreprise || "Entreprise" }), el("p", { class: "dp-date", text: date })),
    el("div", { class: "dp-couv-bas" }, el("span", { text: "Remis sous engagement de confidentialité. Toute diffusion est interdite." }), el("span", { class: "dp-passation", text: "Passation" }))));
  // Sommaire
  enfants.push(el("div", { class: "diapo dp-sommaire" }, tete(),
    el("div", { class: "dp-grille" }, el("div", { class: "dp-titre" }, el("h3", { text: "Sommaire" })),
      el("ol", { class: "dp-liste" }, ...etat.sections.map((s, i) => el("li", {}, el("span", { class: "dp-li-num", text: String(i + 1).padStart(2, "0") }), el("a", { href: `#s-${s.cle}`, text: s.titre }))))),
    pied()));
  // Sections
  etat.sections.forEach((s, i) => {
    const contenu = [];
    if (s.cle === "finances") { const t = chiffresCles(); if (t) contenu.push(t); contenu.push(tableauFinancier()); }
    contenu.push(...(s.redigee ? corps(s.contenu) : [el("p", { class: "a-rediger", text: "À compléter." })]));
    enfants.push(diapoSection(s, i, contenu));
    const outils = el("div", { class: "dp-outils pas-imprime", "data-outils": s.cle },
      s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
      s.a_completer?.length ? el("span", { class: "notes-completer" }, el("strong", { text: "À compléter : " }), s.a_completer.join(" ; ")) : null,
      el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
      s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(outils, s) }, "Modifier") : null);
    enfants.push(outils);
  });
  // Avertissement
  enfants.push(el("div", { class: "diapo dp-sommaire" }, tete(),
    el("div", { class: "dp-grille" }, el("div", { class: "dp-titre" }, el("h3", { text: "Avertissement" })),
      el("div", { class: "dp-contenu" },
        el("p", { text: "Ce mémorandum a été établi à partir d'informations fournies par le dirigeant et de données publiques. Il n'a fait l'objet d'aucun audit. Il ne constitue ni une offre, ni un engagement, et ne remplace pas les vérifications d'usage (audit comptable, juridique, social, fiscal)." }),
        el("p", { text: "Il est remis sous engagement de confidentialité : toute reproduction ou diffusion, totale ou partielle, est interdite." }),
        el("p", { text: "Contact : par l'intermédiaire de Passation." }))),
    pied()));
  $("#memo").replaceChildren(...enfants);
  decouper();
  $("#memo").querySelectorAll(".diapo .dp-num").forEach((n, k) => { n.textContent = String(k + 2); });
}

/** Découpe les sections trop longues en diapositives « (suite) ». */
function decouper() {
  for (const d of [...$("#memo").querySelectorAll(".dp-section")]) {
    let courante = d;
    for (let garde = 0; garde < 6; garde++) {
      const c = courante.querySelector(".dp-contenu");
      if (c.scrollHeight <= c.clientHeight + 2 || c.children.length < 2) break;
      const reports = [];
      while (c.scrollHeight > c.clientHeight + 2 && c.children.length > 1) reports.unshift(c.removeChild(c.lastElementChild));
      const s = etat.sections.find((x) => x.cle === courante.dataset.section);
      const suite = diapoSection(s, Number(courante.dataset.index), reports, true);
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
function tout() { dessinerVerrou(); dessinerSite(); dessinerMemo(); }

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
