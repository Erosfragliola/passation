// Page d'accueil : champ SIREN partagé (hero, en-tête, relance) branché sur l'estimation express et l'écran de
// résultat ; vidéo. Textes : src/contenu/landing.json, posés par le Worker dans <script id="textes"> (sous-arbre
// « js »).
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
  document.activeElement?.blur?.();   // referme le clavier du téléphone
  const r = await resultat.charger(chargerEntreprise(siren));
  if (r.ok) return resultat.afficher(r.donnees);
  // Erreur : message sous le champ utilisé (région aria-live), qu'on ramène à l'écran s'il n'est pas fixe
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

// Liens #comment-1, -2, -3 et #livrables (tuiles du hero) : ancres ordinaires, les étapes sont toutes visibles.

lancerApparitions();
lancerEtapes();
lancerScenes();
