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

function tableauFinancier() {
  const t = etat.tableau;
  if (!t.annees.length) return el("p", { class: "petit", text: "Tableau financier : À compléter (aucun exercice validé)." });
  return el("table", { class: "tableau-resultat doc-tableau" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "En euros" }), ...t.annees.map((a) => el("th", { scope: "col", class: "num", text: String(a) })))),
    el("tbody", {}, ...t.lignes.map((l) => el("tr", {}, el("th", { scope: "row", text: l.libelle }), ...l.valeurs.map((v) => el("td", { class: "num", text: v == null ? "–" : fmt.format(v) }))))));
}

function dessinerMemo() {
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const sections = etat.sections.map((s, i) => {
    const bloc = el("section", { class: "doc-section", id: `s-${s.cle}` },
      el("h3", { text: `${i + 1}. ${s.titre}` }),
      s.cle === "finances" ? tableauFinancier() : null,
      s.redigee ? corps(s.contenu) : el("p", { class: "a-rediger", text: "À compléter." }),
      s.a_completer?.length ? el("div", { class: "notes-completer pas-imprime" }, el("strong", { text: "Pour compléter cette section : " }), s.a_completer.join(" ; ")) : null,
      el("div", { class: "doc-edition pas-imprime" },
        s.modifie ? el("span", { class: "petit", text: "Modifié par vous" }) : null,
        el("button", { type: "button", class: "btn btn-mini", disabled: !etat.deverrouille.ok, onclick: (ev) => rediger(s.cle, ev.currentTarget) }, s.redigee ? "Rédiger à nouveau" : "Rédiger"),
        s.redigee ? el("button", { type: "button", class: "lien-simple", onclick: () => editer(bloc, s) }, "Modifier") : null));
    return bloc;
  });
  $("#memo").replaceChildren(
    el("header", { class: "doc-tete" }, el("span", { class: "doc-marque", text: "Passation" }), el("span", { class: "doc-confidentiel", text: "Strictement confidentiel" })),
    el("div", { class: "memo-couverture" },
      etat.logo ? el("img", { class: "memo-logo", src: `${base}/logo?v=${Date.now()}`, alt: `Logo de ${etat.entreprise || "l'entreprise"}` }) : null,
      el("p", { class: "etiquette", text: "Mémorandum d'information" }),
      el("h2", { class: "doc-titre", text: etat.entreprise || "Entreprise" }),
      el("p", { class: "petit", text: `Document établi le ${date}. Remis sous engagement de confidentialité ; toute diffusion est interdite.` })),
    el("nav", { class: "memo-sommaire", "aria-label": "Sommaire" }, el("p", { class: "etiquette", text: "Sommaire" }), el("ol", {}, ...etat.sections.map((s) => el("li", {}, el("a", { href: `#s-${s.cle}`, text: s.titre }))))),
    ...sections,
    el("footer", { class: "doc-pied" }, el("span", { text: "Informations fournies par le dirigeant et non auditées. Document non contractuel." }), el("span", { text: "Mise en forme : Passation" })));
}
function editer(bloc, s) {
  const ta = el("textarea", { rows: "10", "aria-label": `Texte : ${s.titre}` }); ta.value = s.contenu;
  const ok = el("button", { type: "button", class: "btn btn-noir btn-mini" }, "Enregistrer");
  ok.addEventListener("click", async () => {
    try { etat = await api(`${base}/sections/${s.cle}`, { method: "PUT", body: JSON.stringify({ contenu: ta.value }) }); tout(); message("Section enregistrée."); } catch (e) { message(e.message, true); }
  });
  bloc.replaceChildren(el("h3", { text: s.titre }), ta, el("div", { class: "doc-edition" }, ok, el("button", { type: "button", class: "lien-simple", onclick: tout }, "Annuler")));
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
