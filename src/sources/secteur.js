// Structure of a company's industry, drawn from the public directory (recherche-entreprises, INSEE Sirene data):
// number of active companies with the same NAF code in the region, broken down by headcount band, and in France for
// the bands of 10 employees or more (the API caps its counts at 10,000: beyond that, "more than 10,000").
// Everything displayed is calculated here (percentages, the company's rank); Claude only comments.

import { requeteJson } from "../lib/requete.js";
import { URL_RECHERCHE } from "./entreprise.js";
import { t as tr, T, avecTextes } from "../../public/js/i18n.js";

/** INSEE codes of the regions ("region" parameter of the API). */
export const CODES_REGIONS = {
  "Guadeloupe": "01", "Martinique": "02", "Guyane": "03", "La Réunion": "04", "Mayotte": "06",
  "Île-de-France": "11", "Centre-Val de Loire": "24", "Bourgogne-Franche-Comté": "27", "Normandie": "28",
  "Hauts-de-France": "32", "Grand Est": "44", "Pays de la Loire": "52", "Bretagne": "53", "Nouvelle-Aquitaine": "75",
  "Occitanie": "76", "Auvergne-Rhône-Alpes": "84", "Provence-Alpes-Côte d'Azur": "93", "Corse": "94",
};

/** Grouped headcount bands (INSEE codes). */
const BANDES = [
  { cle: "sans", libelle: T, codes: ["NN", "00"] },
  { cle: "1_9", libelle: T, codes: ["01", "02", "03"] },
  { cle: "10_49", libelle: T, codes: ["11", "12"] },
  { cle: "50_plus", libelle: T, codes: ["21", "22", "31", "32", "41", "42", "51", "52", "53"] },
];
for (const b of BANDES) avecTextes(b, `serveur.secteur.bandes.${b.cle}`);
const PLAFOND_API = 10000;

export const bandeDe = (codeTranche) => BANDES.find((b) => b.codes.includes(String(codeTranche || "NN")))?.cle ?? "sans";

async function compter(params, f) {
  const url = `${URL_RECHERCHE}?${new URLSearchParams({ ...params, etat_administratif: "A", per_page: "1" })}`;
  const r = await requeteJson(url, "recherche-entreprises", { fetch: f });
  const n = Number(r?.total_results);
  return Number.isFinite(n) ? n : null;
}

/**
 * Raw counts (6 requests). @returns { region: {sans, 1_9, 10_49, 50_plus}, france: {10_49, 50_plus} } or null if
 * the NAF or the region is missing.
 */
export async function compterSecteur({ naf, region }, { fetch: f = fetch } = {}) {
  const code = CODES_REGIONS[region];
  if (!naf || !code) return null;
  const regionComptes = {};
  for (const b of BANDES) regionComptes[b.cle] = await compter({ activite_principale: naf, region: code, tranche_effectif_salarie: b.codes.join(",") }, f);
  const france = {};
  for (const b of BANDES.slice(2)) france[b.cle] = await compter({ activite_principale: naf, tranche_effectif_salarie: b.codes.join(",") }, f);
  return { region: regionComptes, france };
}

/** Indicators calculated from the counts (pure module, tested). */
export function structureSecteur(comptes, { naf, region, trancheEntreprise, date }) {
  if (!comptes) return null;
  const r = comptes.region, ok = (v) => Number.isFinite(v);
  const plafonne = (v) => ok(v) && v >= PLAFOND_API;
  const totalRegion = BANDES.reduce((s, b) => s + (ok(r[b.cle]) ? r[b.cle] : 0), 0);
  if (!(totalRegion > 0)) return null;
  const bande = bandeDe(trancheEntreprise);
  const iBande = BANDES.findIndex((b) => b.cle === bande);
  // Size rank: share of the region's companies in the same band or above
  const auDessus = BANDES.slice(iBande).reduce((s, b) => s + (ok(r[b.cle]) ? r[b.cle] : 0), 0);
  const moins10 = (ok(r.sans) ? r.sans : 0) + (ok(r["1_9"]) ? r["1_9"] : 0);
  const france10 = ["10_49", "50_plus"].map((k) => comptes.france[k]);
  return {
    naf, region, date,
    region_total: totalRegion,
    region_plafonne: BANDES.some((b) => plafonne(r[b.cle])),
    repartition: BANDES.map((b) => ({ cle: b.cle, libelle: b.libelle, n: ok(r[b.cle]) ? r[b.cle] : null, part: ok(r[b.cle]) ? r[b.cle] / totalRegion : null })),
    part_moins_10: moins10 / totalRegion,
    bande_entreprise: bande,
    // "The company is among the X% of companies in the region of its size or larger" (null if no employees)
    part_meme_taille_ou_plus: iBande > 0 ? auDessus / totalRegion : null,
    nombre_meme_taille_ou_plus_region: iBande > 0 ? auDessus : null,
    france_10_plus: france10.every(ok) ? france10[0] + france10[1] : null,
    france_10_plus_plafonne: france10.some(plafonne),
    source: tr("serveur.secteur.source", { naf, date }),
  };
}
