// Page de connexion : demande du lien magique. Le SIREN recherché sur la landing est transmis.
const params = new URLSearchParams(location.search);
const siren = (params.get("siren") || "").replace(/\D/g, "");
const form = document.getElementById("form-connexion");
const message = document.getElementById("connexion-message");
const ERREURS = {
  lien_expire: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.",
  lien_invalide: "Ce lien n'est pas valide. Demandez-en un nouveau.",
};

function afficher(texte, erreur = false) {
  message.textContent = texte;
  message.hidden = !texte;
  message.classList.toggle("erreur", erreur);
}

// Déjà connecté : direction le dossier
fetch("/api/me").then((r) => { if (r.ok) location.replace(siren ? `/espace/?siren=${siren}` : "/espace/"); }).catch(() => {});

if (siren.length === 9) {
  const r = document.getElementById("rappel-siren");
  r.textContent = `Votre dossier sera créé pour le SIREN ${siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}.`;
  r.hidden = false;
}
if (ERREURS[params.get("erreur")]) afficher(ERREURS[params.get("erreur")], true);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  if (!form.email.checkValidity()) return afficher("Indiquez une adresse e-mail valide.", true);
  const bouton = form.querySelector("button");
  bouton.disabled = true;
  try {
    const r = await fetch("/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, siren }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || "Erreur");
    form.hidden = true;
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    afficher(local ? `${d.message} (Mode développement : le lien s'affiche dans le terminal de wrangler dev.)` : d.message);
  } catch (err) {
    afficher(err.message === "Failed to fetch" ? "Connexion impossible. Vérifiez votre réseau." : err.message, true);
  } finally {
    bouton.disabled = false;
  }
});
