// Annonces commerciales du BODACC (bodacc-datadila.opendatasoft.com).
// Liste blanche : seules les créations, immatriculations, transferts de siège, changements de dénomination
// et reprises de fonds (quand l'entreprise est l'ACHETEUSE) sont retenus. Tout le reste (procédures
// collectives, radiations, dépôts de comptes, dirigeants, ventes par l'entreprise…) est écarté sans le signaler.
// Les noms de personnes et les prix ne sont jamais conservés.

import { requeteJson } from "../lib/requete.js";

const URL_BODACC = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const CHAMPS = "dateparution,familleavis_lib,commercant,ville,modificationsgenerales,acte,listepersonnes,listeetablissements";

export async function annoncesBrutes(siren, { fetch: f = fetch, ...options } = {}) {
  const where = encodeURIComponent(`registre like "${siren}"`);
  const url = `${URL_BODACC}?select=${CHAMPS}&where=${where}&order_by=dateparution%20asc&limit=100`;
  return requeteJson(url, "BODACC", { ...options, fetch: f });
}

const json = (s) => { try { return typeof s === "string" ? JSON.parse(s) : s || {}; } catch { return {}; } };
const premier = (x) => (Array.isArray(x) ? x[0] : x) || {};
const chiffres = (s) => String(s || "").replace(/\D/g, "");
const premiereVille = (v) => String(v || "").split(",")[0].trim() || null;

/**
 * Retourne { ville_creation, evenements: [{date, type, detail|ancien|nouveau}] } dans l'ordre chronologique.
 * @param dateCreation date de création connue (AAAA-MM-JJ) : l'avis de création n'est retenu que s'il est
 *        publié dans l'année qui suit, sinon la ville de création reste inconnue.
 */
export function normaliserAnnonces(brut, siren, dateCreation = null) {
  const annonces = [...(brut?.results || [])].sort((a, b) => String(a.dateparution).localeCompare(String(b.dateparution)));
  const evenements = [];
  let villeCreation = null;
  let villeCourante = null;
  let nomCourant = null;
  const villes = new Set();

  for (const a of annonces) {
    const famille = a.familleavis_lib;
    const acte = json(a.acte);
    const modif = json(a.modificationsgenerales);
    const descriptif = String(modif.descriptif || acte.descriptif || "").toLowerCase();
    const ville = premiereVille(a.ville);
    const nom = premiereVille(a.commercant); // le premier nom est celui de l'entreprise visée

    if (famille === "Créations" || (famille === "Immatriculations" && !descriptif.includes("transfert"))) {
      const ecart = dateCreation ? Math.abs(new Date(a.dateparution) - new Date(dateCreation)) / 864e5 : 0;
      if (!villeCreation && ville && ecart <= 366) villeCreation = ville;
      villeCourante ??= ville;
    } else if (famille === "Modifications diverses" || famille === "Immatriculations") {
      if (descriptif.includes("transfert du siège") || descriptif.includes("transfert de son siège")) {
        if (ville && villeCourante && !memeVille(ville, villeCourante)) {
          evenements.push({ date: a.dateparution, type: "transfert_siege", detail: ville });
        }
        if (ville) villeCourante = ville;
      }
      if (descriptif.includes("dénomination") && nom && nomCourant && !memeNom(nom, nomCourant)) {
        evenements.push({ date: a.dateparution, type: "denomination", ancien: nomCourant, nouveau: nom });
      }
    } else if (famille === "Ventes et cessions") {
      const acheteur = chiffres(premier(json(a.listepersonnes).personne)?.numeroImmatriculation?.numeroIdentification);
      const etab = premier(json(a.listeetablissements).etablissement);
      const villeFonds = etab?.adresse?.ville || ville;
      const doublon = evenements.some((e) => e.type === "reprise_fonds" && memeVille(e.detail, villeFonds)
        && Math.abs(new Date(e.date) - new Date(a.dateparution)) < 366 * 864e5);
      if (acheteur === siren && villeFonds && !doublon) {
        evenements.push({ date: a.dateparution, type: "reprise_fonds", detail: villeFonds });
      }
    }
    // Toute autre famille (procédures collectives, radiations, dépôts des comptes…) est ignorée.
    if (ville && !villeCourante) villeCourante = ville;
    if (ville) villes.add(ville);
    if (nom && famille !== "Ventes et cessions") nomCourant = nom;
  }
  return { ville_creation: villeCreation, evenements, villes: [...villes] };
}

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function memeVille(a, b) { return sansAccents(a) === sansAccents(b); }
// Formes juridiques ignorées pour comparer deux dénominations (« SA X » et « X » sont le même nom).
const FORMES = /\b(sa|sas|sasu|sarl|eurl|sci|snc|scop|sca|selarl|selas)\b/g;
function memeNom(a, b) { return sansAccents(a).replace(FORMES, "").replace(/\s+/g, " ").trim() === sansAccents(b).replace(FORMES, "").replace(/\s+/g, " ").trim(); }
