// Tableau de bord du dossier : en-tête, avancement des 4 blocs, checklist, suppression, déconnexion.
import { CHECKLIST } from "/js/dossier-regles.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let dossier = null;

const euros = (v) => (Math.abs(v) >= 1e6
  ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`
  : `${Math.round(v / 1000).toLocaleString("fr-FR")} k€`);

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
    $("#estimation-valeur").textContent = `${euros(est.bas)} – ${euros(est.haut)}`;
  } else {
    $("#estimation-valeur").textContent = "À affiner";
  }
  document.querySelectorAll(".lien-parcours").forEach((l) => { l.href = `/espace/valorisation/?dossier=${dossier.id}#${l.dataset.ancre}`; });
  $("#lien-datapack").href = `/api/dossiers/${dossier.id}/documents/datapack`;
  $("#lien-teaser").href = `/espace/documents/teaser/?dossier=${dossier.id}`;
  $("#lien-memo").href = `/espace/documents/memo/?dossier=${dossier.id}`;
  if (dossier.documents?.datapack) $("#detail-documents").textContent = `Datapack : version ${dossier.documents.datapack.version}.`;
  const parcours = dossier.parcours;
  if (parcours) {
    $("#detail-chiffres").textContent = `${parcours.exercices_complets} exercice${parcours.exercices_complets > 1 ? "s" : ""} complet${parcours.exercices_complets > 1 ? "s" : ""} sur ${parcours.exercices_attendus}.`;
    $("#detail-valorisation").textContent = `Questionnaire : ${parcours.questionnaire.pct} %.`;
    if (parcours.valorisation?.central != null) {
      $("#estimation-legende").textContent = "Valorisation approfondie · valeur des titres";
      $("#estimation-valeur").textContent = `${euros(parcours.valorisation.bas)} – ${euros(parcours.valorisation.haut)}`;
    }
  }
  const a = dossier.avancement;
  $("#avancement-global").textContent = `${a.global} %`;
  jauge($("#jauge-globale"), a.global);
  for (const [bloc, cle] of [["chiffres", "chiffres"], ["valorisation", "valorisation"], ["documents", "documents"], ["preparation", "preparation"]]) {
    const j = $(`#bloc-${bloc} .jauge`);
    j.setAttribute("role", "progressbar"); j.setAttribute("aria-label", `Avancement : ${a[cle]} %`);
    jauge(j, a[cle]);
  }
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
