// Page /connexion : même formulaire en deux temps que la fenêtre de la landing.
import { monterConnexion } from "/js/connexion-code.js";
import { lien } from "/js/i18n.js";

const siren = (new URLSearchParams(location.search).get("siren") || "").replace(/\D/g, "");

// Déjà connecté : direction le dossier
fetch("/api/me").then(async (r) => { await r.text(); if (r.ok) location.replace(lien(siren.length === 9 ? `/espace/?siren=${siren}` : "/espace/")); }).catch(() => {});

monterConnexion(document.getElementById("zone-connexion"), { siren: siren.length === 9 ? siren : "" });
