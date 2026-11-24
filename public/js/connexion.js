// /connexion page: same form as the landing's window (sign-in, or code then password).
import { monterConnexion } from "/js/connexion-code.js";
import { lien } from "/js/i18n.js";

const siren = (new URLSearchParams(location.search).get("siren") || "").replace(/\D/g, "");

// Already signed in: on to the file
fetch("/api/me").then(async (r) => { await r.text(); if (r.ok) location.replace(lien(siren.length === 9 ? `/espace/?siren=${siren}` : "/espace/")); }).catch(() => {});

// Coming from a SIREN: account creation first (sign-in is one click away); otherwise sign-in.
const parametre = new URLSearchParams(location.search).get("mode");
const mode = ["creer", "connexion", "oubli"].includes(parametre) ? parametre : siren.length === 9 ? "creer" : "connexion";
monterConnexion(document.getElementById("zone-connexion"), { siren: siren.length === 9 ? siren : "", mode });
