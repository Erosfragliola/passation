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

function rendu(d) {
  const zone = $("#teaser");
  if (!d.teaser) { zone.hidden = true; $("#btn-imprimer").hidden = true; $("#btn-generer").textContent = "Rédiger le teaser"; return; }
  $("#btn-generer").textContent = "Rédiger une nouvelle version";
  $("#btn-imprimer").hidden = false;
  zone.hidden = false;
  zone.replaceChildren(
    el("header", { class: "doc-tete" },
      el("span", { class: "doc-marque", text: "Passation" }),
      el("span", { class: "doc-confidentiel", text: "Strictement confidentiel" })),
    el("p", { class: "etiquette", text: "Opportunité de reprise" }),
    el("h2", { id: "teaser-titre", class: "doc-titre", text: d.nom_de_code || "Projet" }),
    ...d.teaser.sections.map((s) => section(s)),
    el("footer", { class: "doc-pied" },
      el("span", { text: `Teaser · version ${d.teaser.version} · ${new Date(d.teaser.cree_le * 1000).toLocaleDateString("fr-FR")}` }),
      el("span", { text: "Contact : par l'intermédiaire de Passation. Document non contractuel." })),
  );
}
function section(s) {
  const corps = s.cle === "atouts"
    ? el("ul", {}, ...s.contenu.split("\n").filter(Boolean).map((l) => el("li", { text: l.replace(/^-\s*/, "") })))
    : el(s.cle === "accroche" ? "p" : "p", { class: s.cle === "accroche" ? "doc-accroche" : null, text: s.contenu });
  const bloc = el("section", { class: "doc-section" },
    s.cle === "accroche" ? null : el("h3", { text: s.titre }),
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
