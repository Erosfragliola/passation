// Page d'un dossier : fil du parcours, action principale, « À faire maintenant », en-tête (valeur et sa base),
// documents, pièces (dépôt type Drive, replié sauf quand c'est l'étape en cours), gestion du dossier.
// Les règles (états, tâches, textes) sont dans le module pur dossier-parcours.js, testé.
import { CHECKLIST } from "/js/dossier-regles.js";
import { etatParcours } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js"; // même arrondi que l'écran de résultat de la landing

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let dossier = null, memo = null, etat = null, piecesOuvert = null;

function message(texte, erreur = false) {
  const m = $("#espace-message");
  m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
}
async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Erreur");
  return d;
}
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
const ICONES = {
  chiffres: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  exercices: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  questions: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4"/>',
  redaction: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  chapitres: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  photo: '<path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>',
  "a-completer": '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M9 13h6M12 10v6"/>',
  pieces: '<path d="M3 6h7l2 2h9v11H3z"/>',
  valorisation: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  datapack: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/>',
  teaser: '<path d="M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 12.5h7M9 16.5h5"/>',
  memo: '<path d="M4 5h16v12H4zM8 21h8M12 17v4"/>',
};
const icone = (k) => el("span", { class: "ico", "aria-hidden": "true", html: `<svg viewBox="0 0 24 24">${ICONES[k] || ""}</svg>` });
const LIBELLE_ETAT = { pret: "Prêt", "a-relire": "À relire", "a-venir": "À venir" };

async function charger() {
  const moi = await api("/api/me");
  let id = params.get("dossier");
  const siren = (params.get("siren") || "").replace(/\D/g, "");
  if (!id && siren.length === 9) id = (moi.dossiers.find((x) => x.siren === siren) || (await api("/api/dossiers", { method: "POST", body: JSON.stringify({ siren }) })).dossier).id;
  if (!id && moi.dossiers.length) id = moi.dossiers[0].id;
  if (!id) { location.replace("/#titre-hero"); return; }
  dossier = await api(`/api/dossiers/${id}`);
  if (dossier.documents?.memo) memo = await api(`/api/dossiers/${id}/documents/memo`).catch(() => null);
  afficher();
  $("main").removeAttribute("aria-busy");
}

function afficher({ checklist = true } = {}) {
  etat = etatParcours(dossier, memo);
  const e = dossier.entreprise, id = dossier.id;
  document.title = `${e.nom || "Votre dossier"} · Passation`;
  $("#lien-dossier").href = `/espace/?dossier=${id}`;

  // Fil du parcours : étapes faites cliquables, l'actuelle mise en avant
  $("#fil").replaceChildren(...etat.etapes.map((x, i) => {
    const contenu = [el("span", { class: "num", "aria-hidden": "true", text: x.etat === "fait" ? "✓" : String(i + 1) }), el("span", { class: "lib", text: x.libelle })];
    if (x.etat === "fait") return el("li", { class: "fait" }, el("a", { href: x.href, "aria-label": `${x.libelle} : étape terminée, revoir` }, contenu));
    if (x.etat === "actuelle") return el("li", { class: "actuelle" }, el("span", { class: "etape", "aria-current": "step" }, contenu, el("span", { class: "visuellement-cache", text: " : étape en cours" })));
    return el("li", {}, el("span", { class: "etape" }, contenu, el("span", { class: "visuellement-cache", text: " : à venir" })));
  }));
  // Action principale = première tâche de « À faire maintenant » (même libellé, même lien ; les pièces ouvrent le dépôt)
  for (const a of [$("#cta"), $("#cta-tel")]) {
    a.textContent = etat.action.texte; a.href = etat.action.href;
    a.onclick = etat.action.pieces ? (ev) => { ev.preventDefault(); ouvrirPieces(true); } : null;
  }

  // En-tête : nom de code, raison sociale, avancement, valeur et sa base
  $("#nom-code").textContent = dossier.nom_de_code || "";
  $("#dossier-nom").textContent = e.nom || "Votre entreprise";
  $("#dossier-meta").textContent = [e.ville, `SIREN ${dossier.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`, e.date_creation ? `depuis ${e.date_creation.slice(0, 4)}` : null].filter(Boolean).join(" · ");
  const g = etat.avancement; // même calcul que l'écran final du parcours guidé (etatParcours)
  $("#avancement-global").textContent = `${g} %`;
  $("#anneau").setAttribute("aria-label", `${g} % du parcours fait`);
  $("#anneau-val").setAttribute("stroke-dasharray", `${((2 * Math.PI * 32 * g) / 100).toFixed(1)} 201`);
  const v = etat.valeur;
  $("#valeur-etiquette").textContent = v.etiquette;
  $("#valeur-montant").textContent = v.bas != null && v.haut != null ? fourchette(v.bas, v.haut) : "À affiner";
  $("#valeur-base").textContent = v.base;
  $("#valeur-ecart").textContent = v.ecart || ""; $("#valeur-ecart").hidden = !v.ecart;
  $("#valeur-lien").textContent = `${v.lien.texte} →`; $("#valeur-lien").href = v.lien.href;

  // À faire maintenant
  $("#afaire").replaceChildren(etat.taches.length
    ? el("ul", { class: "taches" }, ...etat.taches.map((t) => el("li", { class: "tache" },
      icone(t.cle),
      el("span", { class: "tache-txt" }, el("strong", { text: t.titre }), el("span", { class: "petit", text: t.detail })),
      t.pieces ? el("button", { type: "button", class: "btn btn-contour btn-petit", onclick: () => ouvrirPieces(true) }, t.action)
        : el("a", { class: "btn btn-contour btn-petit", href: t.href, "aria-label": `${t.action} : ${t.titre}` }, t.action))))
    : el("div", { class: "bravo" }, el("p", { class: "affiche", text: "Tout est fait" }),
      el("p", { text: "Vos documents sont rédigés et complets, et toutes vos pièces sont réunies. Relisez une dernière fois, puis envoyez votre dossier." })));

  // Documents
  const prets = etat.documents.filter((x) => x.etat !== "a-venir").length;
  $("#docs-resume").textContent = `${prets} sur ${etat.documents.length} disponibles`;
  $("#docs").replaceChildren(...etat.documents.map((x) => el("article", { class: `tuile doc doc-${x.etat}`, "aria-labelledby": `doc-titre-${x.cle}` },
    el("div", { class: "doc-haut" }, icone(x.cle), el("span", { class: `etat etat-${x.etat}`, text: LIBELLE_ETAT[x.etat] })),
    el("h3", { id: `doc-titre-${x.cle}`, text: x.titre }),
    el("p", { class: "petit", text: x.detail }),
    x.actions.length ? el("div", { class: "doc-actions" }, ...x.actions.map((a) => el("a", {
      class: `btn btn-petit ${a.principal ? "btn-principal" : "btn-contour"}`, href: a.href, download: a.telecharger ? "" : null,
      "aria-label": a.principal ? null : `${a.libelle} : ${x.titre}`,
    }, a.libelle))) : null)));

  // Pièces : résumé, et dépôt replié sauf quand c'est l'étape en cours (ou ouvert par le dirigeant)
  const { fournies, total } = etat.pieces;
  $("#checklist-compte").textContent = `${fournies} ${fournies > 1 ? "pièces" : "pièce"} sur ${total}`;
  $("#jauge-pieces").style.width = `${Math.round((100 * fournies) / total)}%`;
  if (piecesOuvert == null) piecesOuvert = etat.pieces.ouvert || location.hash === "#checklist";
  ouvrirPieces(piecesOuvert, false);
  if (checklist) chargerPieces();
}
function ouvrirPieces(ouvert, defiler = true) {
  piecesOuvert = ouvert;
  $("#pieces-depot").hidden = !ouvert;
  $("#pieces-bouton").setAttribute("aria-expanded", String(ouvert));
  $("#pieces-bouton").textContent = ouvert ? "Replier" : "Ouvrir le dépôt";
  if (ouvert && defiler) { $("#checklist").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); $("#drive-dossiers [aria-selected=true]")?.focus({ preventScroll: true }); }
}
$("#pieces-bouton").addEventListener("click", () => ouvrirPieces(!piecesOuvert, false));

// ------------------------------------------------------------------ Pièces : dépôt type Drive
// Un dossier par thème ; dans chaque thème, une ligne par pièce attendue, où l'on glisse ses fichiers (ou on clique).
// Une pièce sans fichier peut aussi être cochée « je l'ai » (elle sera transmise autrement).
let pieces = [], theme = 0;
const taille = (o) => (o >= 1048576 ? `${(o / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const EXT = (n) => (/\.([a-z0-9]{2,5})$/i.exec(n)?.[1] || "").toUpperCase().slice(0, 4);

async function chargerPieces() {
  try { pieces = (await api(`/api/dossiers/${dossier.id}/pieces`)).pieces || []; } catch { pieces = []; }
  dessinerChecklist();
}
async function rafraichir() {
  dossier = await api(`/api/dossiers/${dossier.id}`);
  afficher({ checklist: false }); dessinerChecklist();
}
async function envoyer(fichiers, item) {
  for (const f of fichiers) {
    const fd = new FormData(); fd.append("fichier", f); fd.append("item", item);
    message(`Envoi de ${f.name}…`);
    try {
      const r = await fetch(`/api/dossiers/${dossier.id}/pieces`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Envoi impossible.");
      pieces = d.pieces; message(`${f.name} : déposé.`);
    } catch (err) { message(`${f.name} : ${err.message}`, true); }
  }
  await rafraichir();
}
/** Zone de dépôt : glisser-déposer, clic sur la zone, ou bouton « Ajouter » (accessible au clavier, sans
 *  imbriquer de contrôles dans un faux bouton). */
function zoneDepot(item, contenu, classe, libelle) {
  const input = el("input", { type: "file", multiple: true, class: "visuellement-cache", tabindex: "-1", "aria-hidden": "true" });
  input.addEventListener("change", () => { if (input.files.length) envoyer([...input.files], item); });
  const bouton = el("button", { type: "button", class: "lien-simple depot-choisir", "aria-label": `Ajouter un fichier : ${libelle}`, onclick: (ev) => { ev.stopPropagation(); input.click(); } }, "Ajouter un fichier");
  const zone = el("div", { class: classe }, contenu, bouton, input);
  zone.addEventListener("click", (ev) => { if (!ev.target.closest("a, button")) input.click(); });
  ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.add("survol"); }));
  ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.remove("survol"); }));
  zone.addEventListener("drop", (ev) => { if (ev.dataTransfer.files.length) envoyer([...ev.dataTransfer.files], item); });
  return zone;
}
function choisirTheme(k, focus = false) {
  theme = (k + CHECKLIST.length) % CHECKLIST.length; dessinerChecklist();
  if (focus) $("#drive-dossiers").querySelectorAll("[role=tab]")[theme].focus();
}
function dessinerChecklist() {
  const coches = new Set(dossier.checklist);
  const parItem = (k) => pieces.filter((x) => x.item === k);
  $("#drive-dossiers").replaceChildren(...CHECKLIST.map((g, k) => {
    const n = g.items.filter(([c]) => coches.has(c)).length;
    return el("button", {
      type: "button", role: "tab", id: `theme-${k}`, "aria-selected": String(k === theme), "aria-controls": "checklist-groupes", tabindex: k === theme ? "0" : "-1",
      onclick: () => choisirTheme(k, true),
      onkeydown: (ev) => { const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key]; if (pas) { ev.preventDefault(); choisirTheme(theme + pas, true); } },
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
    }, el("span", { text: g.groupe }), el("small", { text: `${n}/${g.items.length}`, "aria-label": `${n} sur ${g.items.length}` }));
  }));
  $("#checklist-groupes").setAttribute("aria-labelledby", `theme-${theme}`);
  const g = CHECKLIST[theme];
  const prochaine = g.items.find(([c]) => !coches.has(c)) || g.items[0];
  $("#checklist-groupes").replaceChildren(
    zoneDepot(prochaine[0], [
      el("span", { class: "depot-ico", "aria-hidden": "true", text: "↑" }), el("strong", { text: `Glissez vos fichiers « ${g.groupe} » ici` }),
      el("span", { class: "petit", text: `Rangés sous « ${prochaine[1]} » ; ou déposez-les sur la bonne ligne ci-dessous. PDF, images, Word, Excel · 20 Mo par fichier.` })], "depot-zone", `« ${g.groupe} »`),
    el("ul", { class: "drive-pieces" }, ...g.items.map(([cle, libelle]) => {
      const fichiers = parItem(cle), fait = coches.has(cle);
      return el("li", { class: `piece${fait ? " fournie" : ""}` },
        zoneDepot(cle, [
          el("span", { class: "piece-ico", "aria-hidden": "true", text: fichiers.length ? EXT(fichiers[0].filename) || "FIC" : fait ? "✓" : "+" }),
          el("div", { class: "piece-texte" }, el("strong", { text: libelle }),
            fichiers.length ? el("ul", { class: "piece-fichiers" }, ...fichiers.map((f) => el("li", {},
              el("a", { href: `/api/dossiers/${dossier.id}/pieces/${f.id}`, text: f.filename }), el("span", { class: "petit", text: ` · ${taille(f.size)}` }),
              el("button", { type: "button", class: "lien-simple", "aria-label": `Retirer ${f.filename}`, onclick: async (ev) => { ev.stopPropagation(); try { pieces = (await api(`/api/dossiers/${dossier.id}/pieces/${f.id}`, { method: "DELETE" })).pieces; await rafraichir(); } catch (err) { message(err.message, true); } } }, "Retirer"))))
              : el("span", { class: "petit", text: fait ? "Indiquée comme réunie" : "Glissez le fichier ici ou cliquez" })),
          fichiers.length ? el("span", { class: "piece-etat", text: "Fournie" })
            : el("button", { type: "button", class: "piece-etat bouton", "aria-pressed": String(fait), "aria-label": `Je l'ai : ${libelle}`, onclick: async (ev) => {
              ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true;
              try { dossier = await api(`/api/dossiers/${dossier.id}/checklist/${cle}`, { method: "PUT", body: JSON.stringify({ done: !fait }) }); afficher({ checklist: false }); dessinerChecklist(); }
              catch (err) { message(err.message, true); b.disabled = false; }
            } }, fait ? "Je l'ai ✓" : "Je l'ai")], "piece-zone", libelle));
    })));
}

const dialogue = $("#dialog-supprimer");
$("#btn-supprimer").addEventListener("click", () => dialogue.showModal());
$("#annuler-supprimer").addEventListener("click", () => dialogue.close());
$("#confirmer-supprimer").addEventListener("click", async () => {
  try {
    await api(`/api/dossiers/${dossier.id}`, { method: "DELETE" });
    dialogue.close();
    location.replace("/?dossier-supprime=1");
  } catch (err) { dialogue.close(); message(err.message, true); }
});

charger().catch((err) => { if (err.message !== "non connecté") message(err.message, true); });
