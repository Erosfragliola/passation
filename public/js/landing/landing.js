// Page d'accueil : champ SIREN partagé (hero, en-tête, relance) branché sur l'estimation express
// et l'écran de résultat ; vidéos. Textes : src/contenu/landing.json, posés par le Worker dans <script id="textes">
// (sous-arbre « js ») et <script id="textes-histoire"> (chapitres et dossier).
import { creerChampPartage } from "/js/landing/champ-siren.js";
import { surveillerChamps } from "/js/landing/barres.js";
import { lancerVideo, lancerVideoSection } from "/js/landing/video.js";
import { chargerEntreprise } from "/js/landing/estimation.js";
import { creerResultat } from "/js/landing/resultat.js";

const $ = (s) => document.querySelector(s);
const lire = (id) => { try { return JSON.parse(document.getElementById(id)?.textContent || "{}"); } catch { return {}; } };
const T = lire("textes");
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const resultat = creerResultat({ section: $("#resultat"), textes: T, histoire: lire("textes-histoire") });
const champ = creerChampPartage({ estimer, textes: T });
document.querySelectorAll("[data-champ-siren]").forEach((f) => champ.monter(f));
const barres = surveillerChamps({ hero: $('[data-champ-siren="accueil"]'), auChangement: () => champ.fermerListes() });
lancerVideo({ hero: $("#accueil"), textes: T.video });
lancerVideoSection({ zone: $(".parti-pris-media"), textes: T.video });

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

// « Essayer avec mon entreprise » : le curseur dans le champ partagé (barre du haut ou du bas)
document.querySelectorAll("[data-focus-champ]").forEach((b) => b.addEventListener("click", () => { barres.actualiser(); champ.focaliser(); }));

// Liens #comment-1, -2, -3 (tuiles du hero, cartes) : ouvrent « Comment ça marche » sur la bonne étape.
// L'événement « ouvrir-etape » est écouté par les onglets de la section.
function ouvrirEtape(ancre) {
  const m = /^#comment-([123])$/.exec(ancre || "");
  const section = document.getElementById("comment");
  if (!m || !section) return false;
  document.dispatchEvent(new CustomEvent("ouvrir-etape", { detail: Number(m[1]) }));
  section.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
  return true;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#comment-"]');
  if (a && ouvrirEtape(a.getAttribute("href"))) { e.preventDefault(); history.replaceState(null, "", a.getAttribute("href")); }
});
if (location.hash) requestAnimationFrame(() => ouvrirEtape(location.hash));
