// Connexion par code à 6 chiffres, en deux temps, sans quitter la page :
//   1. l'adresse e-mail → un code est envoyé ;  2. le code → session ouverte, direction le dossier.
// Utilisé par la fenêtre de connexion (landing) et par la page /connexion.
// Les liens marqués data-connexion ouvrent la fenêtre ; sans JavaScript, ils mènent à /connexion.
import { lien, t } from "/js/i18n.js";

const ATTENTE_RENVOI = 30; // secondes avant de pouvoir redemander un code

const formatSiren = (s) => s.replace(/(\d{3})(\d{3})(\d{3})/, "$1\u00a0$2\u00a0$3"); // espaces insécables

async function poster(chemin, corps) {
  let r;
  try {
    r = await fetch(chemin, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
  } catch {
    throw new Error(t("connexion_code.reseau"));
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || t("connexion_code.erreur")), { code: d.erreur });
  return d;
}

/** Construit le formulaire en deux temps dans `racine`. */
export function monterConnexion(racine, { siren = "" } = {}) {
  const id = `cx${Math.random().toString(36).slice(2, 7)}`;
  racine.innerHTML = `
    ${siren.length === 9 ? `<p class="petit">${t("connexion_code.siren", { siren: formatSiren(siren) })}</p>` : ""}
    <form class="form-carte cx-email" novalidate>
      <label for="${id}-email">${t("connexion_code.email_libelle")}</label>
      <input id="${id}-email" name="email" type="email" autocomplete="email" required placeholder="${t("connexion_code.email_exemple")}">
      <button class="btn btn-noir" type="submit">${t("connexion_code.recevoir")} <span class="fleche" aria-hidden="true">→</span></button>
      <p class="petit">${t("connexion_code.sans_mot_de_passe")}</p>
    </form>
    <form class="form-carte cx-code" novalidate hidden>
      <p class="cx-envoye"></p>
      <label for="${id}-code">${t("connexion_code.code_libelle")}</label>
      <input id="${id}-code" class="champ-code chiffre" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
        pattern="[0-9]{6}" maxlength="6" required placeholder="000000" aria-describedby="${id}-aide">
      <p class="petit" id="${id}-aide">${t("connexion_code.code_aide")}</p>
      <button class="btn btn-noir" type="submit">${t("connexion_code.ouvrir")} <span class="fleche" aria-hidden="true">→</span></button>
      <p class="cx-liens petit">
        <button class="lien-simple cx-renvoyer" type="button">${t("connexion_code.renvoyer")}</button> ·
        <button class="lien-simple cx-changer" type="button">${t("connexion_code.changer")}</button>
      </p>
    </form>
    <div class="message-carte cx-message" role="status" aria-live="polite" hidden></div>`;

  const $ = (s) => racine.querySelector(s);
  const formEmail = $(".cx-email"), formCode = $(".cx-code"), champCode = formCode.code, renvoyer = $(".cx-renvoyer");
  let email = "", minuterie = null;

  const afficher = (texte, erreur = false) => {
    const m = $(".cx-message");
    m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
  };
  const occupe = (form, oui) => { form.querySelector('button[type="submit"]').disabled = oui; form.setAttribute("aria-busy", String(oui)); };

  function decompte() {
    let reste = ATTENTE_RENVOI;
    renvoyer.disabled = true;
    clearInterval(minuterie);
    const maj = () => {
      renvoyer.textContent = reste > 0 ? t("connexion_code.renvoyer_attente", { n: reste }) : t("connexion_code.renvoyer");
      if (reste-- <= 0) { clearInterval(minuterie); renvoyer.disabled = false; }
    };
    maj(); minuterie = setInterval(maj, 1000);
  }

  async function envoyer() {
    const d = await poster("/api/auth/request", { email });
    formEmail.hidden = true; formCode.hidden = false;
    $(".cx-envoye").textContent = t("connexion_code.envoye", { email });
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    afficher(local ? t("connexion_code.developpement") : "");
    champCode.value = ""; champCode.focus();
    decompte();
    return d;
  }

  formEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!formEmail.email.checkValidity()) return afficher(t("connexion_code.email_invalide"), true);
    email = formEmail.email.value.trim();
    occupe(formEmail, true);
    try { await envoyer(); } catch (err) { afficher(err.message, true); } finally { occupe(formEmail, false); }
  });

  formCode.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = champCode.value.replace(/\D/g, "");
    if (code.length !== 6) return afficher(t("connexion_code.code_six"), true);
    occupe(formCode, true);
    try {
      const d = await poster("/api/auth/code", { email, code, siren });
      afficher(t("connexion_code.accepte"));
      location.assign(d.destination);
    } catch (err) {
      afficher(err.message, true);
      champCode.select();
      if (err.code === "code_bloque" || err.code === "code_expire") renvoyer.disabled = false;
      occupe(formCode, false);
    }
  });

  // Saisie : chiffres seulement ; envoi automatique au 6e chiffre (copier-coller compris)
  champCode.addEventListener("input", () => {
    champCode.value = champCode.value.replace(/\D/g, "").slice(0, 6);
    if (champCode.value.length === 6) formCode.requestSubmit();
  });

  renvoyer.addEventListener("click", async () => {
    renvoyer.disabled = true;
    try { await envoyer(); afficher(t("connexion_code.nouveau")); }
    catch (err) { afficher(err.message, true); renvoyer.disabled = false; }
  });
  $(".cx-changer").addEventListener("click", () => {
    clearInterval(minuterie);
    formCode.hidden = true; formEmail.hidden = false; afficher("");
    formEmail.email.focus();
  });

  return { focus: () => (formEmail.hidden ? champCode : formEmail.email).focus() };
}

/** Déjà connecté ? Direction le dossier. Sinon, fenêtre de connexion par-dessus la page. */
export async function ouvrirConnexion({ siren = "" } = {}) {
  try {
    const r = await fetch("/api/me");
    await r.text();
    if (r.ok) { location.assign(lien(siren ? `/espace/?siren=${siren}` : "/espace/")); return; }
  } catch { /* réseau : on tente quand même la fenêtre */ }

  document.getElementById("dialog-connexion")?.remove();
  const d = document.createElement("dialog");
  d.id = "dialog-connexion";
  d.className = "dialog-connexion";
  d.setAttribute("aria-labelledby", "titre-dialog-connexion");
  d.innerHTML = `
    <button class="dialog-fermer" type="button" aria-label="${t("connexion_code.fermer")}">×</button>
    <p class="etiquette">${t("commun.nav.mon_dossier")}</p>
    <h2 class="affiche" id="titre-dialog-connexion">${t("connexion_code.ouvrir")}</h2>
    <div class="cx-zone"></div>`;
  document.body.append(d);
  const f = monterConnexion(d.querySelector(".cx-zone"), { siren });
  d.querySelector(".dialog-fermer").addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // clic sur le fond
  d.addEventListener("close", () => d.remove());
  d.showModal();
  f.focus();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-connexion]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement !== "function") return;
  e.preventDefault();
  ouvrirConnexion({ siren: (a.dataset.siren || "").replace(/\D/g, "") });
});
