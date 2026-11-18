// Tableau de bord du dossier : en-tête, prochaine étape, état des 4 documents, checklist repliée, gestion du dossier.
import { CHECKLIST } from "/js/dossier-regles.js";
import { fourchette } from "/js/landing/estimation.js"; // même arrondi que l'écran de résultat de la landing

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let dossier = null;

function message(texte, erreur = false) {
  const m = $("#espace-message");
  m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
}
function jauge(el, valeur) {
  el.querySelector("span").style.width = `${valeur}%`;
  el.setAttribute("aria-valuenow", String(valeur));
}

async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  if (r.status === 401) { location.replace("/connexion"); throw new Error("non connecté"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Erreur");
  return d;
}

async function charger() {
  const moi = await api("/api/me");
  let id = params.get("dossier");
  const siren = (params.get("siren") || "").replace(/\D/g, "");
  if (!id && siren.length === 9) id = (moi.dossiers.find((x) => x.siren === siren) || (await api("/api/dossiers", { method: "POST", body: JSON.stringify({ siren }) })).dossier).id;
  if (!id && moi.dossiers.length) id = moi.dossiers[0].id;
  if (!id) { location.replace("/#titre-hero"); return; }
  dossier = await api(`/api/dossiers/${id}`);
  afficher();
  $("main").removeAttribute("aria-busy");
}

function afficher({ checklist = true } = {}) {
  const e = dossier.entreprise;
  document.title = `${e.nom} · Passation`;
  $("#dossier-nom").textContent = e.nom;
  $("#nom-code").textContent = dossier.nom_de_code || "";
  $("#dossier-meta").textContent = [e.ville, `SIREN ${dossier.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`, e.date_creation ? `depuis ${e.date_creation.slice(0, 4)}` : null].filter(Boolean).join(" · ");
  const est = dossier.estimation;
  if (est?.statut === "ok") {
    $("#estimation-legende").textContent = `Valorisation express · comptes ${est.exercice}`;
    $("#estimation-valeur").textContent = fourchette(est.bas, est.haut);
  } else {
    $("#estimation-valeur").textContent = "À affiner";
  }
  const id = dossier.id, parcours = dossier.parcours, docs = dossier.documents || {};
  const complet = docs.memo && docs.teaser && docs.datapack && parcours?.valorisation;
  $("#prochaine-etape").href = `/espace/demarrer/?dossier=${id}`;
  const [texte, detail] = !parcours?.exercices_complets ? ["Confirmer vos chiffres", "Votre liasse fiscale, ou une dizaine de montants saisis à la main."]
    : parcours.questionnaire.pct < 40 ? ["Répondre à quelques questions", "Des écrans courts, la plupart en un clic."]
    : !complet ? ["Lancer la rédaction de votre dossier", "Valorisation, datapack, teaser et mémorandum, d'un coup."]
    : ["Relire votre dossier", "Tout est rédigé : relisez avant de diffuser."];
  $("#prochaine-texte").textContent = texte; $("#prochaine-detail").textContent = detail;
  if (parcours?.valorisation?.central != null) {
    $("#estimation-legende").textContent = "Valorisation approfondie · valeur des titres";
    $("#estimation-valeur").textContent = fourchette(parcours.valorisation.bas, parcours.valorisation.haut);
  }
  // Les 4 documents : un état clair, prêt ou à venir (un document à venir n'est pas un lien)
  const chiffresOk = (parcours?.exercices_complets || 0) > 0;
  const version = (d) => (d?.version > 1 ? ` · version ${d.version}` : "");
  const docsEtat = [
    ["valorisation", `/espace/valorisation/?dossier=${id}#valorisation`, parcours?.valorisation?.central != null, parcours?.valorisation?.ponderation?.dcf > 0 ? "Prête : multiples, DCF et actif net, avec leurs sources" : "Prête : multiples et actif net ; DCF après réglage de la prime de taille", "Après vos chiffres et quelques questions"],
    ["datapack", `/api/dossiers/${id}/documents/datapack`, chiffresOk, `Prêt : Excel, 9 onglets${version(docs.datapack)}`, "Dès qu'un exercice est confirmé"],
    ["teaser", `/espace/documents/teaser/?dossier=${id}`, Boolean(docs.teaser), `Prêt${version(docs.teaser)}`, "Rédigé avec votre dossier"],
    ["memo", `/espace/documents/memo/?dossier=${id}`, Boolean(docs.memo), `Prêt${version(docs.memo)}`, "Rédigé avec votre dossier"],
  ];
  for (const [k, href, pret, oui, non] of docsEtat) {
    const a = $(`#doc-${k}`);
    a.querySelector(".doc-etat").textContent = pret ? oui : non;
    a.dataset.etat = pret ? "pret" : "attente";
    a.classList.toggle("a-venir", !pret);
    if (pret) { a.href = href; a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); }
    else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); }
  }
  $("#lien-detaille").href = `/espace/valorisation/?dossier=${id}#chiffres`;
  const a = dossier.avancement;
  $("#avancement-global").textContent = `${a.global} %`;
  jauge($("#jauge-globale"), a.global);
  $("#anneau-val")?.setAttribute("stroke-dasharray", `${(2 * Math.PI * 32 * a.global) / 100} 201`);
  const total = CHECKLIST.reduce((n, g) => n + g.items.length, 0), faites = dossier.checklist.filter((k) => CHECKLIST.some((g) => g.items.some(([c]) => c === k))).length;
  $("#checklist-compte").textContent = `${faites} pièce${faites > 1 ? "s" : ""} sur ${total}`;
  $("#jauge-pieces").style.width = `${Math.round((100 * faites) / total)}%`;
  if (checklist) chargerPieces();
}

// ------------------------------------------------------------------ Pièces : dépôt type Drive
// Un dossier par thème ; dans chaque thème, une ligne par pièce attendue, où l'on glisse ses fichiers (ou on clique).
// Une pièce sans fichier peut aussi être cochée « je l'ai » (elle sera transmise autrement).
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
let pieces = [], theme = 0;
const taille = (o) => (o >= 1048576 ? `${(o / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const EXT = (n) => (/\.([a-z0-9]{2,5})$/i.exec(n)?.[1] || "").toUpperCase().slice(0, 4);

async function chargerPieces() {
  try { pieces = (await api(`/api/dossiers/${dossier.id}/pieces`)).pieces || []; } catch { pieces = []; }
  dessinerChecklist();
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
  dossier = await api(`/api/dossiers/${dossier.id}`);
  afficher({ checklist: false }); dessinerChecklist();
}
/** Zone de dépôt : glisser-déposer et clic (champ fichier caché). */
function zoneDepot(item, contenu, classe) {
  const input = el("input", { type: "file", multiple: true, class: "visuellement-cache", tabindex: "-1", "aria-hidden": "true" });
  input.addEventListener("change", () => { if (input.files.length) envoyer([...input.files], item); });
  const zone = el("div", { class: classe, tabindex: "0", role: "button", "aria-label": "Déposer des fichiers" }, contenu, input);
  zone.addEventListener("click", (ev) => { if (!ev.target.closest("a, button")) input.click(); });
  zone.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); } });
  ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.add("survol"); }));
  ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.remove("survol"); }));
  zone.addEventListener("drop", (ev) => { if (ev.dataTransfer.files.length) envoyer([...ev.dataTransfer.files], item); });
  return zone;
}
function dessinerChecklist() {
  const coches = new Set(dossier.checklist);
  const parItem = (k) => pieces.filter((x) => x.item === k);
  $("#drive-dossiers").replaceChildren(...CHECKLIST.map((g, k) => {
    const n = g.items.filter(([c]) => coches.has(c)).length;
    return el("li", {}, el("button", { type: "button", role: "tab", "aria-selected": String(k === theme), onclick: () => { theme = k; dessinerChecklist(); $("#drive-dossiers").querySelectorAll("button")[k].focus(); } },
      el("svg", {}), el("span", { text: g.groupe }), el("small", { text: `${n}/${g.items.length}` })));
  }));
  $("#drive-dossiers").querySelectorAll("svg").forEach((s) => { s.outerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>'; });
  const g = CHECKLIST[theme];
  $("#checklist-groupes").replaceChildren(
    zoneDepot(g.items.find(([c]) => !coches.has(c))?.[0] || g.items[0][0], [
      el("span", { class: "depot-ico", "aria-hidden": "true", text: "↑" }), el("strong", { text: `Glissez vos fichiers « ${g.groupe} » ici` }),
      el("span", { class: "petit", text: `Rangés sous « ${(g.items.find(([c]) => !coches.has(c)) || g.items[0])[1]} » ; ou déposez-les sur la bonne ligne ci-dessous. PDF, images, Word, Excel · 20 Mo par fichier.` })], "depot-zone"),
    el("ul", { class: "drive-pieces" }, ...g.items.map(([cle, libelle]) => {
      const fichiers = parItem(cle), fait = coches.has(cle);
      return el("li", { class: `piece${fait ? " fournie" : ""}` },
        zoneDepot(cle, [
          el("span", { class: "piece-ico", text: fichiers.length ? EXT(fichiers[0].filename) || "FIC" : fait ? "✓" : "+" }),
          el("div", { class: "piece-texte" }, el("strong", { text: libelle }),
            fichiers.length ? el("ul", { class: "piece-fichiers" }, ...fichiers.map((f) => el("li", {},
              el("a", { href: `/api/dossiers/${dossier.id}/pieces/${f.id}`, text: f.filename }), el("span", { class: "petit", text: ` · ${taille(f.size)}` }),
              el("button", { type: "button", class: "lien-simple", "aria-label": `Retirer ${f.filename}`, onclick: async (ev) => { ev.stopPropagation(); try { pieces = (await api(`/api/dossiers/${dossier.id}/pieces/${f.id}`, { method: "DELETE" })).pieces; dossier = await api(`/api/dossiers/${dossier.id}`); afficher({ checklist: false }); dessinerChecklist(); } catch (err) { message(err.message, true); } } }, "Retirer"))))
              : el("span", { class: "petit", text: fait ? "Indiquée comme réunie" : "Glissez le fichier ici ou cliquez" })),
          fichiers.length ? el("span", { class: "piece-etat", text: "Fournie" })
            : el("button", { type: "button", class: "piece-etat bouton", "aria-pressed": String(fait), onclick: async (ev) => {
              ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true;
              try { dossier = await api(`/api/dossiers/${dossier.id}/checklist/${cle}`, { method: "PUT", body: JSON.stringify({ done: !fait }) }); afficher({ checklist: false }); dessinerChecklist(); }
              catch (err) { message(err.message, true); b.disabled = false; }
            } }, fait ? "Je l'ai ✓" : "Je l'ai")], "piece-zone"));
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
$("#btn-deconnexion").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/");
});

charger().catch((err) => { if (err.message !== "non connecté") message(err.message, true); });
