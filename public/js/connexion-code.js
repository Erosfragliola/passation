// Access to the file (24/11/2026): an account with a password, without leaving the page.
//   - "connexion": email + password;
//   - "creer" (after the SIREN) and "oubli" (forgotten password, or an account created with a code only):
//     1. the email address → a 6-digit code is sent;  2. the code → the address is verified;
//     3. the password (12 characters or more) → session opened, on to the file.
// Used by the sign-in window (landing) and by the /connexion page.
// Links marked data-connexion open the window (data-mode="creer" | "connexion"); without JavaScript, they lead to
// /connexion.
import { lien, t } from "/js/i18n.js";

const ATTENTE_RENVOI = 30; // seconds before a new code can be requested
const LONGUEUR_MIN = 12; // same rule as the server (src/config.js, MOT_DE_PASSE.longueurMin)
const MODES = new Set(["creer", "connexion", "oubli"]);

const formatSiren = (s) => s.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3"); // no-break spaces

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

/** Builds the form in `racine`. Returns { focus }. */
export function monterConnexion(racine, { siren = "", mode = "connexion" } = {}) {
  const id = `cx${Math.random().toString(36).slice(2, 7)}`;
  racine.innerHTML = `
    ${siren.length === 9 ? `<p class="petit">${t("connexion_code.siren", { siren: formatSiren(siren) })}</p>` : ""}
    <form class="form-carte cx-connexion" novalidate hidden>
      <label for="${id}-cemail">${t("connexion_code.email_libelle")}</label>
      <input id="${id}-cemail" name="email" type="email" autocomplete="username" required placeholder="${t("connexion_code.email_exemple")}">
      <label for="${id}-cmdp">${t("connexion_code.mdp_libelle")}</label>
      <input id="${id}-cmdp" name="mdp" type="password" autocomplete="current-password" required>
      <button class="btn btn-noir" type="submit">${t("connexion_code.se_connecter")} <span class="fleche" aria-hidden="true">→</span></button>
      <p class="cx-liens petit">
        <button class="lien-simple" type="button" data-aller="oubli">${t("connexion_code.oubli")}</button> ·
        <button class="lien-simple" type="button" data-aller="creer">${t("connexion_code.creer_lien")}</button>
      </p>
      <p class="petit">${t("connexion_code.ancien_compte")}</p>
    </form>
    <form class="form-carte cx-email" novalidate hidden>
      <p class="cx-intro"></p>
      <label for="${id}-email">${t("connexion_code.email_libelle")}</label>
      <input id="${id}-email" name="email" type="email" autocomplete="email" required placeholder="${t("connexion_code.email_exemple")}">
      <button class="btn btn-noir" type="submit">${t("connexion_code.recevoir")} <span class="fleche" aria-hidden="true">→</span></button>
      <p class="cx-liens petit"><button class="lien-simple" type="button" data-aller="connexion">${t("connexion_code.deja_acces")}</button></p>
    </form>
    <form class="form-carte cx-code" novalidate hidden>
      <p class="cx-envoye"></p>
      <label for="${id}-code">${t("connexion_code.code_libelle")}</label>
      <input id="${id}-code" class="champ-code chiffre" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
        pattern="[0-9]{6}" maxlength="6" required placeholder="000000" aria-describedby="${id}-aide">
      <p class="petit" id="${id}-aide">${t("connexion_code.code_aide")}</p>
      <button class="btn btn-noir" type="submit">${t("connexion_code.verifier")} <span class="fleche" aria-hidden="true">→</span></button>
      <p class="cx-liens petit">
        <button class="lien-simple cx-renvoyer" type="button">${t("connexion_code.renvoyer")}</button> ·
        <button class="lien-simple cx-changer" type="button">${t("connexion_code.changer")}</button>
      </p>
    </form>
    <form class="form-carte cx-mdp" novalidate hidden>
      <p class="cx-verifiee"></p>
      <input class="cx-identifiant" name="username" type="email" autocomplete="username" hidden tabindex="-1" aria-hidden="true">
      <label for="${id}-mdp">${t("connexion_code.nouveau_mdp_libelle")}</label>
      <input id="${id}-mdp" name="mdp" type="password" autocomplete="new-password" minlength="${LONGUEUR_MIN}" required aria-describedby="${id}-regle">
      <p class="petit" id="${id}-regle">${t("connexion_code.mdp_regle", { n: LONGUEUR_MIN })}</p>
      <label for="${id}-mdp2">${t("connexion_code.confirmation_libelle")}</label>
      <input id="${id}-mdp2" name="mdp2" type="password" autocomplete="new-password" required>
      <label class="cx-afficher petit"><input type="checkbox" class="cx-voir"> ${t("connexion_code.afficher")}</label>
      <button class="btn btn-noir" type="submit"><span class="cx-mdp-bouton"></span> <span class="fleche" aria-hidden="true">→</span></button>
    </form>
    <div class="message-carte cx-message" role="status" aria-live="polite" hidden></div>`;

  const $ = (s) => racine.querySelector(s);
  const formConnexion = $(".cx-connexion"), formEmail = $(".cx-email"), formCode = $(".cx-code"), formMdp = $(".cx-mdp");
  const champCode = formCode.code, renvoyer = $(".cx-renvoyer");
  let email = "", ticket = "", minuterie = null, modeCourant = MODES.has(mode) ? mode : "connexion";

  const afficher = (texte, erreur = false) => {
    const m = $(".cx-message");
    m.textContent = texte; m.hidden = !texte; m.classList.toggle("erreur", erreur);
  };
  const occupe = (form, oui) => { form.querySelector('button[type="submit"]').disabled = oui; form.setAttribute("aria-busy", String(oui)); };
  const montrer = (form) => {
    for (const f of [formConnexion, formEmail, formCode, formMdp]) f.hidden = f !== form;
    afficher("");
  };

  /** Mode: sign-in, or the code then the password (account creation, forgotten password). */
  function allerA(m) {
    modeCourant = MODES.has(m) ? m : "connexion";
    clearInterval(minuterie);
    if (modeCourant === "connexion") {
      if (email) formConnexion.email.value = email;
      montrer(formConnexion);
      return;
    }
    $(".cx-intro").textContent = t(modeCourant === "creer" ? "connexion_code.intro_creer" : "connexion_code.intro_oubli");
    if (email) formEmail.email.value = email;
    montrer(formEmail);
  }
  racine.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-aller]");
    if (!b) return;
    allerA(b.dataset.aller);
    (modeCourant === "connexion" ? formConnexion.email : formEmail.email).focus();
  });

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
    montrer(formCode);
    $(".cx-envoye").textContent = t("connexion_code.envoye", { email });
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    afficher(local ? t("connexion_code.developpement") : "");
    champCode.value = ""; champCode.focus();
    decompte();
    return d;
  }

  formConnexion.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!formConnexion.email.checkValidity()) return afficher(t("connexion_code.email_invalide"), true);
    if (!formConnexion.mdp.value) return afficher(t("connexion_code.mdp_vide"), true);
    email = formConnexion.email.value.trim();
    occupe(formConnexion, true);
    try {
      const d = await poster("/api/auth/login", { email, mot_de_passe: formConnexion.mdp.value, siren });
      afficher(t("connexion_code.accepte"));
      location.assign(d.destination);
    } catch (err) {
      afficher(err.message, true);
      formConnexion.mdp.select();
      occupe(formConnexion, false);
    }
  });

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
      const d = await poster("/api/auth/code", { email, code });
      ticket = d.ticket;
      clearInterval(minuterie);
      montrer(formMdp);
      $(".cx-verifiee").textContent = t("connexion_code.adresse_verifiee", { email });
      $(".cx-identifiant").value = email;
      $(".cx-mdp-bouton").textContent = t(modeCourant === "oubli" ? "connexion_code.enregistrer_mdp" : "connexion_code.creer_acces");
      formMdp.mdp.focus();
    } catch (err) {
      afficher(err.message, true);
      champCode.select();
      if (err.code === "code_bloque" || err.code === "code_expire") renvoyer.disabled = false;
    } finally {
      occupe(formCode, false);
    }
  });

  formMdp.querySelector(".cx-voir").addEventListener("change", (e) => {
    for (const c of [formMdp.mdp, formMdp.mdp2]) c.type = e.target.checked ? "text" : "password";
  });

  formMdp.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mdp = formMdp.mdp.value;
    if ([...mdp].length < LONGUEUR_MIN) return afficher(t("connexion_code.mdp_court", { n: LONGUEUR_MIN }), true);
    if (mdp !== formMdp.mdp2.value) return afficher(t("connexion_code.mdp_differents"), true);
    occupe(formMdp, true);
    try {
      const d = await poster("/api/auth/password", { ticket, mot_de_passe: mdp, siren });
      afficher(t("connexion_code.accepte"));
      location.assign(d.destination);
    } catch (err) {
      occupe(formMdp, false);
      if (err.code === "ticket_expire") { allerA(modeCourant); afficher(err.message, true); return; }
      afficher(err.message, true);
      formMdp.mdp.select();
    }
  });

  // Entry: digits only; automatic submission at the 6th digit (copy-paste included)
  champCode.addEventListener("input", () => {
    champCode.value = champCode.value.replace(/\D/g, "").slice(0, 6);
    if (champCode.value.length === 6) formCode.requestSubmit();
  });

  renvoyer.addEventListener("click", async () => {
    renvoyer.disabled = true;
    try { await envoyer(); afficher(t("connexion_code.nouveau")); }
    catch (err) { afficher(err.message, true); renvoyer.disabled = false; }
  });
  $(".cx-changer").addEventListener("click", () => allerA(modeCourant));

  allerA(modeCourant);
  return { focus: () => racine.querySelector("form:not([hidden]) input:not([hidden])")?.focus() };
}

/** Already signed in? On to the file. Otherwise, sign-in window over the page. */
export async function ouvrirConnexion({ siren = "", mode = "connexion" } = {}) {
  try {
    const r = await fetch("/api/me");
    await r.text();
    if (r.ok) { location.assign(lien(siren ? `/espace/?siren=${siren}` : "/espace/")); return; }
  } catch { /* network: we try the window anyway */ }

  document.getElementById("dialog-connexion")?.remove();
  const d = document.createElement("dialog");
  d.id = "dialog-connexion";
  d.className = "dialog-connexion";
  d.setAttribute("aria-labelledby", "titre-dialog-connexion");
  d.innerHTML = `
    <button class="dialog-fermer" type="button" aria-label="${t("connexion_code.fermer")}">×</button>
    <p class="etiquette">${t("commun.nav.mon_dossier")}</p>
    <h2 class="affiche" id="titre-dialog-connexion">${t(mode === "creer" ? "connexion_code.titre_creer" : "connexion_code.ouvrir")}</h2>
    <div class="cx-zone"></div>`;
  document.body.append(d);
  const f = monterConnexion(d.querySelector(".cx-zone"), { siren, mode });
  d.querySelector(".dialog-fermer").addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // click on the backdrop
  d.addEventListener("close", () => d.remove());
  d.showModal();
  f.focus();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-connexion]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement !== "function") return;
  e.preventDefault();
  ouvrirConnexion({ siren: (a.dataset.siren || "").replace(/\D/g, ""), mode: a.dataset.mode || "connexion" });
});
