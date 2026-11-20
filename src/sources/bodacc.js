// Commercial notices of the BODACC (bodacc-datadila.opendatasoft.com).
// Allowlist: only creations, registrations, head-office transfers, name changes
// and acquisitions of a business (when the company is the BUYER) are kept. Everything else (insolvency
// proceedings, deregistrations, filings of accounts, officers, sales by the company…) is discarded without notice.
// Names of people and prices are never kept.

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
 * Returns { ville_creation, evenements: [{date, type, detail|ancien|nouveau}] } in chronological order.
 * @param dateCreation known creation date (YYYY-MM-DD): the creation notice is kept only if it is
 *        published within the following year, otherwise the city of creation stays unknown.
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
    const nom = premiereVille(a.commercant); // the first name is that of the company concerned

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
    // Any other family (insolvency proceedings, deregistrations, filings of accounts…) is ignored.
    if (ville && !villeCourante) villeCourante = ville;
    if (ville) villes.add(ville);
    if (nom && famille !== "Ventes et cessions") nomCourant = nom;
  }
  return { ville_creation: villeCreation, evenements, villes: [...villes] };
}

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function memeVille(a, b) { return sansAccents(a) === sansAccents(b); }
// Legal forms ignored when comparing two names ("SA X" and "X" are the same name).
const FORMES = /\b(sa|sas|sasu|sarl|eurl|sci|snc|scop|sca|selarl|selas)\b/g;
function memeNom(a, b) { return sansAccents(a).replace(FORMES, "").replace(/\s+/g, " ").trim() === sansAccents(b).replace(FORMES, "").replace(/\s+/g, " ").trim(); }
