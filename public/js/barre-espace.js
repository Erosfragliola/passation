// Barre du haut, commune à toutes les pages de l'espace : « Mon dossier » (et le fil d'Ariane des documents) ramène
// au dossier ouvert ; « Se déconnecter » ferme la session.
import { lien } from "/js/i18n.js";
const id = new URLSearchParams(location.search).get("dossier") || "";
if (/^[0-9a-f-]{36}$/.test(id)) {
  for (const a of document.querySelectorAll("#lien-dossier, #ariane-dossier")) a.href = lien(`/espace/?dossier=${id}`);
}
document.querySelector("#btn-deconnexion")?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace(lien("/"));
});
