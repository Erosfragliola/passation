// Connexion par code à 6 chiffres, en deux temps, sans quitter la page :
//   1. l'adresse e-mail → un code est envoyé ;  2. le code → session ouverte, direction le dossier.
// Utilisé par la fenêtre de connexion (landing) et par la page /connexion.
// Les liens marqués data-connexion ouvrent la fenêtre ; sans JavaScript, ils mènent à /connexion.

const ATTENTE_RENVOI = 30; // secondes avant de pouvoir redemander un code

const formatSiren = (s) => s.replace(/(\d{3})(\d{3})(\d{3})/, "$1\u00a0$2\u00a0$3"); // espaces insécables

async function poster(chemin, corps) {
  let r;
  try {
    r = await fetch(chemin, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
  } catch {
    throw new Error("Connexion impossible. Vérifiez votre réseau.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || "Une erreur est survenue. Réessayez."), { code: d.erreur });
  return d;
}

/** Construit le formulaire en deux temps dans `racine`. */
export function monterConnexion(racine, { siren = "" } = {}) {
  const id = `cx${Math.random().toString(36).slice(2, 7)}`;
  racine.innerHTML = `
    ${siren.length === 9 ? `<p class="petit">Votre dossier sera créé pour le SIREN&nbsp;${formatSiren(siren)}.</p>` : ""}
    <form class="form-carte cx-email" novalidate>
      <label for="${id}-email">Adresse e-mail professionnelle</label>
      <input id="${id}-email" name="email" type="email" autocomplete="email" required placeholder="prenom@entreprise.fr">
      <button class="btn btn-noir" type="submit">Recevoir mon code <span class="fleche" aria-hidden="true">→</span></button>
      <p class="petit">Pas de mot de passe : un code à 6 chiffres vous est envoyé par e-mail.</p>
    </form>
    <form class="form-carte cx-code" novalidate hidden>
      <p class="cx-envoye"></p>
      <label for="${id}-code">Code reçu par e-mail</label>
      <input id="${id}-code" class="champ-code chiffre" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
        pattern="[0-9]{6}" maxlength="6" required placeholder="000000" aria-describedby="${id}-aide">
      <p class="petit" id="${id}-aide">Valable 10 minutes. Pensez à regarder dans vos courriers indésirables.</p>
      <button class="btn btn-noir" type="submit">Ouvrir mon dossier <span class="fleche" aria-hidden="true">→</span></button>
      <p class="cx-liens petit">
        <button class="lien-simple cx-renvoyer" type="button">Renvoyer un code</button> ·
        <button class="lien-simple cx-changer" type="button">Changer d'adresse</button>
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
      renvoyer.textContent = reste > 0 ? `Renvoyer un code (${reste} s)` : "Renvoyer un code";
      if (reste-- <= 0) { clearInterval(minuterie); renvoyer.disabled = false; }
    };
    maj(); minuterie = setInterval(maj, 1000);
  }

  async function envoyer() {
    const d = await poster("/api/auth/request", { email });
    formEmail.hidden = true; formCode.hidden = false;
    $(".cx-envoye").textContent = `Code envoyé à ${email}.`;
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    afficher(local ? "Mode développement : le code s'affiche dans le terminal de wrangler dev." : "");
    champCode.value = ""; champCode.focus();
    decompte();
    return d;
  }

  formEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!formEmail.email.checkValidity()) return afficher("Indiquez une adresse e-mail valide.", true);
    email = formEmail.email.value.trim();
    occupe(formEmail, true);
    try { await envoyer(); } catch (err) { afficher(err.message, true); } finally { occupe(formEmail, false); }
  });

  formCode.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = champCode.value.replace(/\D/g, "");
    if (code.length !== 6) return afficher("Le code compte 6 chiffres.", true);
    occupe(formCode, true);
    try {
      const d = await poster("/api/auth/code", { email, code, siren });
      afficher("Code accepté. Ouverture de votre dossier…");
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
    try { await envoyer(); afficher("Un nouveau code vient d'être envoyé. L'ancien ne fonctionne plus."); }
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
    if (r.ok) { location.assign(siren ? `/espace/?siren=${siren}` : "/espace/"); return; }
  } catch { /* réseau : on tente quand même la fenêtre */ }

  document.getElementById("dialog-connexion")?.remove();
  const d = document.createElement("dialog");
  d.id = "dialog-connexion";
  d.className = "dialog-connexion";
  d.setAttribute("aria-labelledby", "titre-dialog-connexion");
  d.innerHTML = `
    <button class="dialog-fermer" type="button" aria-label="Fermer">×</button>
    <p class="etiquette">Espace dirigeant</p>
    <h2 id="titre-dialog-connexion">Ouvrez votre <em>dossier</em>.</h2>
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
