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
    ["valorisation", `/espace/valorisation/?dossier=${id}#valorisation`, parcours?.valorisation?.central != null, "Prête : trois méthodes, hypothèses et sources", "Après vos chiffres et quelques questions"],
    ["datapack", `/api/dossiers/${id}/documents/datapack`, chiffresOk, `Prêt : Excel, 9 onglets${version(docs.datapack)}`, "Dès qu'un exercice est confirmé"],
    ["teaser", `/espace/documents/teaser/?dossier=${id}`, Boolean(docs.teaser), `Prêt${version(docs.teaser)}`, "Rédigé avec votre dossier"],
    ["memo", `/espace/documents/memo/?dossier=${id}`, Boolean(docs.memo), `Prêt${version(docs.memo)}`, "Rédigé avec votre dossier"],
  ];
  for (const [k, href, pret, oui, non] of docsEtat) {
    const a = $(`#doc-${k}`);
    a.querySelector(".doc-etat").textContent = pret ? oui : non;
    a.classList.toggle("a-venir", !pret);
    if (pret) { a.href = href; a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); }
    else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); }
  }
  $("#lien-detaille").href = `/espace/valorisation/?dossier=${id}#chiffres`;
  const a = dossier.avancement;
  $("#avancement-global").textContent = `${a.global} %`;
  jauge($("#jauge-globale"), a.global);
  $("#checklist-compte").textContent = `${dossier.checklist.length} sur ${CHECKLIST.reduce((n, g) => n + g.items.length, 0)}`;
  if (checklist) dessinerChecklist();
}

function dessinerChecklist() {
  const coches = new Set(dossier.checklist);
  const zone = $("#checklist-groupes");
  zone.replaceChildren(...CHECKLIST.map((g) => {
    const fs = document.createElement("fieldset");
    fs.className = "checklist-groupe";
    const lg = document.createElement("legend"); lg.textContent = g.groupe; fs.append(lg);
    for (const [cle, libelle] of g.items) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = coches.has(cle);
      cb.addEventListener("change", async () => {
        cb.disabled = true;
        try {
          dossier = await api(`/api/dossiers/${dossier.id}/checklist/${cle}`, { method: "PUT", body: JSON.stringify({ done: cb.checked }) });
          afficher({ checklist: false }); // on ne redessine pas la liste : le focus clavier reste sur la case
        } catch (err) { cb.checked = !cb.checked; message(err.message, true); }
        finally { cb.disabled = false; }
      });
      const span = document.createElement("span"); span.textContent = libelle;
      label.append(cb, span);
      fs.append(label);
    }
    return fs;
  }));
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
