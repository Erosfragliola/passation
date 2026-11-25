// Home page: shared SIREN field (hero, header, final call to action) connected to the quick estimate and the
// result screen; video. Texts: src/contenu/<language>/accueil.json, placed by the Worker in <script id="textes"> (subtree
// "js").
import { creerChampPartage } from "/js/landing/champ-siren.js";
import { surveillerChamps } from "/js/landing/barres.js";
import { lancerVideo } from "/js/landing/video.js";
import { chargerEntreprise } from "/js/landing/estimation.js";
import { creerResultat } from "/js/landing/resultat.js";
import { lancerApparitions } from "/js/landing/apparitions.js";
import { lancerScenes, lancerEtapes } from "/js/landing/scenes.js";

const $ = (s) => document.querySelector(s);
const lire = (id) => { try { return JSON.parse(document.getElementById(id)?.textContent || "{}"); } catch { return {}; } };
const T = lire("textes");
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const resultat = creerResultat({ section: $("#resultat"), textes: T });
const champ = creerChampPartage({ estimer, textes: T });
document.querySelectorAll("[data-champ-siren]").forEach((f) => champ.monter(f));
const barres = surveillerChamps({ hero: $('[data-champ-siren="accueil"]'), auChangement: () => champ.fermerListes() });
lancerVideo({ hero: $("#accueil"), textes: T.video });

async function estimer(siren, emplacement) {
  champ.dire("");
  document.activeElement?.blur?.();   // closes the phone's keyboard
  const r = await resultat.charger(chargerEntreprise(siren));
  if (r.ok) return resultat.afficher(r.donnees);
  // Error: message under the field used (aria-live region), brought back on screen if it is not fixed
  resultat.masquer();
  champ.dire(T.erreurs?.[r.code] || T.erreurs?.source_indisponible, emplacement);
  const m = champ.montures.find((x) => x.nom === emplacement);
  if (m && (emplacement === "accueil" || emplacement === "relance")) m.form.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "center" });
}

$("#btn-autre")?.addEventListener("click", () => {
  resultat.masquer();
  champ.vider();
  barres.actualiser();
  champ.focaliser();
});

// Links #comment-1, -2, -3 and #livrables (hero tiles): ordinary anchors, the steps are all visible.

lancerApparitions();
lancerEtapes();
lancerScenes();
