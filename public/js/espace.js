// Page d'un dossier : fil du parcours, action principale, « À faire maintenant », en-tête (valeur et sa base),
// documents, pièces (dépôt type Drive, replié sauf quand c'est l'étape en cours), gestion du dossier.
// Les règles (états, tâches, textes) sont dans le module pur dossier-parcours.js, testé.
import { CHECKLIST } from "/js/dossier-regles.js";
import { etatParcours } from "/js/dossier-parcours.js";
import { fourchette } from "/js/landing/estimation.js"; // même arrondi que l'écran de résultat de la landing
import { lien, t, nombre } from "/js/i18n.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let dossier = null, memo = null, teaser = null, etat = null, piecesOuvert = null;

function message(texte, erreur = false) {
  const m = $("#espace-message");
  m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
}
async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  if (r.status === 401) { location.replace(lien("/connexion")); throw new Error("non_connecte"); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || t("espace.js.erreur"));
  return d;
}
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
/** Remplace le contenu d'un nœud en ignorant null, undefined et false (sinon le navigateur écrit « null »). */
const remplacer = (noeud, ...enfants) => noeud.replaceChildren(...enfants.flat().filter((x) => x != null && x !== false));
const libelleEtat = (etat) => t(`espace.js.etats.${etat}`);

async function charger() {
  const moi = await api("/api/me");
  let id = params.get("dossier");
  const siren = (params.get("siren") || "").replace(/\D/g, "");
  if (!id && siren.length === 9) id = (moi.dossiers.find((x) => x.siren === siren) || (await api("/api/dossiers", { method: "POST", body: JSON.stringify({ siren }) })).dossier).id;
  if (!id && moi.dossiers.length) id = moi.dossiers[0].id;
  if (!id) { location.replace(lien("/#titre-hero")); return; }
  dossier = await api(`/api/dossiers/${id}`);
  [memo, teaser] = await Promise.all([
    dossier.documents?.memo ? api(`/api/dossiers/${id}/documents/memo`).catch(() => null) : null,
    dossier.documents?.teaser ? api(`/api/dossiers/${id}/documents/teaser`).catch(() => null) : null,
  ]);
  afficher();
  $("main").removeAttribute("aria-busy");
}

function afficher({ checklist = true } = {}) {
  etat = etatParcours(dossier, memo, teaser);
  const e = dossier.entreprise, id = dossier.id;
  document.title = t("espace.js.titre_page", { nom: e.nom || t("espace.js.votre_dossier") });
  $("#lien-dossier").href = lien(`/espace/?dossier=${id}`);

  // Fil du parcours en deux temps (24/11/2026) : « 1. Votre valorisation », puis « 2. Votre mémorandum » ; léger,
  // libellés jamais tronqués, étapes faites cliquables
  let n = 0;
  const etape = (x) => {
    n += 1;
    const contenu = [el("span", { class: "num", "aria-hidden": "true", text: x.etat === "fait" ? "✓" : String(n) }), el("span", { class: "lib", text: x.libelle })];
    if (x.etat === "fait" && x.href) return el("li", { class: "fait" }, el("a", { href: x.href, "aria-label": t("espace.js.etape_faite", { etape: x.libelle }) }, contenu));
    if (x.etat === "actuelle") return el("li", { class: "actuelle" }, el("span", { class: "etape", "aria-current": "step" }, contenu, el("span", { class: "visuellement-cache", text: t("espace.js.etape_en_cours") })));
    return el("li", { class: x.etat === "fait" ? "fait" : null }, el("span", { class: "etape" }, contenu, el("span", { class: "visuellement-cache", text: x.etat === "fait" ? t("demarrer.js.faite") : t("espace.js.etape_a_venir") })));
  };
  remplacer($("#fil"), ...etat.temps.map((tp, i) => el("li", { class: `fil-temps${tp.fait ? " fait" : ""}` },
    el("span", { class: "fil-temps-titre", text: `${i + 1}. ${tp.titre}` }),
    el("ol", { class: "fil-etapes" }, ...tp.etapes.map(etape)))));

  // Banner (24/11/2026): new step for a file drafted before the two stages, or figures modified since their approval
  const b = etat.nouvelleEtape;
  $("#bandeau-etape").hidden = !b;
  if (b) { $("#bandeau-texte").textContent = b.texte; $("#bandeau-lien").textContent = `${b.bouton} →`; $("#bandeau-lien").href = b.href; $("#bandeau-etape").dataset.genre = b.genre; }

  // En-tête vert : nom de code, nom, fourchette, une seule ligne d'explication (le détail derrière « Voir le détail »)
  $("#nom-code").textContent = dossier.nom_de_code || "";
  $("#dossier-nom").textContent = e.nom || t("espace.js.votre_entreprise");
  const v = etat.valeur;
  $("#valeur-etiquette").textContent = v.etiquette;
  $("#valeur-montant").textContent = v.bas != null && v.haut != null ? fourchette(v.bas, v.haut) : t("espace.js.a_affiner");
  $("#valeur-base").textContent = v.base;
  // From the quick estimate (enterprise value) to the value of the shares: explained here too (defect 6 of 24/11/2026)
  $("#valeur-ecart").textContent = v.ecart || ""; $("#valeur-ecart").hidden = !v.ecart;
  $("#valeur-lien").textContent = `${v.lien.texte} →`; $("#valeur-lien").href = v.lien.href;

  // Action principale : jamais facultative (première tâche indispensable, sinon « Relire et envoyer »)
  const a = etat.action;
  $("#action-titre").textContent = a.texte;
  $("#action-detail").textContent = a.detail || ""; $("#action-detail").hidden = !a.detail;
  $("#action-etat").hidden = !etat.pret; $("#action-etat").textContent = etat.pret ? t("espace.js.dossier_complet") : "";
  $("#action-etat").className = "etat etat-pret";
  for (const [lienAction, texte] of [[$("#cta"), `${a.bouton} →`], [$("#cta-tel"), a.texte]]) {
    if (!lienAction) continue;
    lienAction.textContent = texte; lienAction.href = a.href;
    lienAction.onclick = a.pieces ? (ev) => { ev.preventDefault(); ouvrirPieces(true); } : null;
  }

  // Deux tâches au plus sous l'action : titre seul, marquées « facultatif » le cas échéant
  const sec = etat.secondaires;
  $("#secondaires").hidden = !sec.length;
  $("#titre-secondaires").textContent = sec.every((x) => x.facultatif) ? t("espace.js.pour_ameliorer") : t("espace.js.ensuite");
  remplacer($("#afaire"), ...sec.map((x) => el("li", {},
    el("span", { class: "tache-titre" }, x.titre, x.facultatif && !sec.every((y) => y.facultatif) ? el("span", { class: "tache-facultatif", text: ` · ${t("espace.js.facultatif")}` }) : null),
    x.pieces ? el("button", { type: "button", class: "lien-simple", onclick: () => ouvrirPieces(true) }, x.action)
      : el("a", { href: x.href, "aria-label": t("espace.js.action_de", { action: x.action, objet: x.titre }) }, x.action))));

  // Documents : une rangée légère, la nature de chaque document et son état
  remplacer($("#docs"), ...etat.documents.map((x) => {
    const principal = x.actions.find((y) => y.principal);
    const autres = x.actions.filter((y) => !y.principal);
    return el("article", { class: `doc-cellule doc-${x.etat}`, "aria-labelledby": `doc-titre-${x.cle}` },
      el("h3", { id: `doc-titre-${x.cle}` }, principal ? el("a", { href: principal.href, download: principal.telecharger ? "" : null, text: x.titre }) : x.titre),
      el("p", { class: "doc-nature", text: t(`espace.js.natures.${x.cle}`) }),
      el("span", { class: `etat etat-${x.etat}`, text: x.badge || libelleEtat(x.etat) }),
      // Toutes les actions sous chaque carte, la principale en premier (« Ouvrir », « Rédiger »…) : même schéma pour les quatre documents
      [principal, ...autres].filter(Boolean).length ? el("p", { class: "doc-liens" }, ...[principal, ...autres].filter(Boolean).map((y, k) => [k ? " · " : null, el("a", { href: y.href, download: y.telecharger ? "" : null, "aria-label": t("espace.js.action_de", { action: y.libelle, objet: x.titre }) }, y.libelle)])) : null);
  }));

  // Pièces : résumé, et dépôt replié sauf quand c'est l'étape en cours (ou ouvert par le dirigeant)
  const { fournies, total } = etat.pieces;
  $("#checklist-compte").textContent = t("dossier.taches.pieces.detail", { n: fournies, total });
  $("#jauge-pieces").style.width = `${Math.round((100 * fournies) / total)}%`;
  if (piecesOuvert == null) piecesOuvert = etat.pieces.ouvert || location.hash === "#checklist";
  ouvrirPieces(piecesOuvert, false);
  if (checklist) chargerPieces();
}
function ouvrirPieces(ouvert, defiler = true) {
  piecesOuvert = ouvert;
  $("#pieces-depot").hidden = !ouvert;
  $("#pieces-bouton").setAttribute("aria-expanded", String(ouvert));
  $("#pieces-bouton").textContent = ouvert ? t("espace.js.replier") : t("espace.ouvrir_depot");
  if (ouvert && defiler) { $("#checklist").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); $("#drive-dossiers [aria-selected=true]")?.focus({ preventScroll: true }); }
}
$("#pieces-bouton").addEventListener("click", () => ouvrirPieces(!piecesOuvert, false));

// ------------------------------------------------------------------ Pièces : dépôt type Drive
// Un dossier par thème ; dans chaque thème, une ligne par pièce attendue, où l'on glisse ses fichiers (ou on clique).
// Une pièce sans fichier peut aussi être cochée « je l'ai » (elle sera transmise autrement).
let pieces = [], theme = 0;
const taille = (o) => (o >= 1048576 ? t("espace.js.mo", { n: nombre(o / 1048576, { maximumFractionDigits: 1 }) }) : t("espace.js.ko", { n: Math.max(1, Math.round(o / 1024)) }));
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
    message(t("espace.js.envoi", { fichier: f.name }));
    try {
      const r = await fetch(`/api/dossiers/${dossier.id}/pieces`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || t("espace.js.envoi_impossible"));
      pieces = d.pieces; message(t("espace.js.depose", { fichier: f.name }));
    } catch (err) { message(t("espace.js.fichier_erreur", { fichier: f.name, erreur: err.message }), true); }
  }
  await rafraichir();
}
/** Zone de dépôt : glisser-déposer, clic sur la zone, ou bouton « Ajouter » (accessible au clavier, sans
 *  imbriquer de contrôles dans un faux bouton). */
function zoneDepot(item, contenu, classe, libelle) {
  const input = el("input", { type: "file", multiple: true, class: "visuellement-cache", tabindex: "-1", "aria-hidden": "true" });
  input.addEventListener("change", () => { if (input.files.length) envoyer([...input.files], item); });
  const bouton = el("button", { type: "button", class: "lien-simple depot-choisir", "aria-label": t("espace.js.ajouter_fichier_de", { piece: libelle }), onclick: (ev) => { ev.stopPropagation(); input.click(); } }, t("espace.js.ajouter_fichier"));
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
  remplacer($("#drive-dossiers"), ...CHECKLIST.map((g, k) => {
    const n = g.items.filter(([c]) => coches.has(c)).length;
    return el("button", {
      type: "button", role: "tab", id: `theme-${k}`, "aria-selected": String(k === theme), "aria-controls": "checklist-groupes", tabindex: k === theme ? "0" : "-1",
      onclick: () => choisirTheme(k, true),
      onkeydown: (ev) => { const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key]; if (pas) { ev.preventDefault(); choisirTheme(theme + pas, true); } },
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
    }, el("span", { text: g.groupe }), el("small", { text: `${n}/${g.items.length}`, "aria-label": t("espace.js.n_sur", { n, total: g.items.length }) }));
  }));
  $("#checklist-groupes").setAttribute("aria-labelledby", `theme-${theme}`);
  const g = CHECKLIST[theme];
  const prochaine = g.items.find(([c]) => !coches.has(c)) || g.items[0];
  remplacer($("#checklist-groupes"), 
    zoneDepot(prochaine[0], [
      el("span", { class: "depot-ico", "aria-hidden": "true", text: "↑" }), el("strong", { text: t("espace.js.glissez_groupe", { groupe: g.groupe }) }),
      el("span", { class: "petit", text: t("espace.js.ranges_sous", { piece: prochaine[1] }) })], "depot-zone", t("dossier.guillemets", { texte: g.groupe })),
    el("ul", { class: "drive-pieces" }, ...g.items.map(([cle, libelle]) => {
      const fichiers = parItem(cle), fait = coches.has(cle);
      return el("li", { class: `piece${fait ? " fournie" : ""}` },
        zoneDepot(cle, [
          el("span", { class: "piece-ico", "aria-hidden": "true", text: fichiers.length ? EXT(fichiers[0].filename) || "FIC" : fait ? "✓" : "+" }),
          el("div", { class: "piece-texte" }, el("strong", { text: libelle }),
            fichiers.length ? el("ul", { class: "piece-fichiers" }, ...fichiers.map((f) => el("li", {},
              el("a", { href: `/api/dossiers/${dossier.id}/pieces/${f.id}`, text: f.filename }), el("span", { class: "petit", text: ` · ${taille(f.size)}` }),
              el("button", { type: "button", class: "lien-simple", "aria-label": t("espace.js.retirer_fichier", { fichier: f.filename }), onclick: async (ev) => { ev.stopPropagation(); try { pieces = (await api(`/api/dossiers/${dossier.id}/pieces/${f.id}`, { method: "DELETE" })).pieces; await rafraichir(); } catch (err) { message(err.message, true); } } }, t("espace.js.retirer")))))
              : el("span", { class: "petit", text: fait ? t("espace.js.indiquee_reunie") : t("espace.js.glissez_ou_cliquez") })),
          fichiers.length ? el("span", { class: "piece-etat", text: t("espace.js.fournie") })
            : el("button", { type: "button", class: "piece-etat bouton", "aria-pressed": String(fait), "aria-label": t("espace.js.je_l_ai_de", { piece: libelle }), onclick: async (ev) => {
              ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true;
              try { dossier = await api(`/api/dossiers/${dossier.id}/checklist/${cle}`, { method: "PUT", body: JSON.stringify({ done: !fait }) }); afficher({ checklist: false }); dessinerChecklist(); }
              catch (err) { message(err.message, true); b.disabled = false; }
            } }, fait ? t("espace.js.je_l_ai_coche") : t("espace.js.je_l_ai"))], "piece-zone", libelle));
    })));
}

const dialogue = $("#dialog-supprimer");
$("#btn-supprimer").addEventListener("click", () => dialogue.showModal());
$("#annuler-supprimer").addEventListener("click", () => dialogue.close());
$("#confirmer-supprimer").addEventListener("click", async () => {
  try {
    await api(`/api/dossiers/${dossier.id}`, { method: "DELETE" });
    dialogue.close();
    location.replace(lien("/?dossier-supprime=1"));
  } catch (err) { dialogue.close(); message(err.message, true); }
});

charger().catch((err) => { if (err.message !== "non_connecte") message(err.message, true); });
