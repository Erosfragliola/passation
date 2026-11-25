// Financial fields of a fiscal year: single list shared by the entry screen, the server, the tax-return reading
// and the datapack. Labels in the owner's language; "aide" says where to find the figure in the tax return
// (forms 2033 of the simplified regime or 2050 to 2059 of the standard regime), without a line number.
// Texts: src/contenu/<language>/champs.json (marker T, read in the language of the page or of the request).
import { t, T, avecTextes } from "./i18n.js";

export const CHAMPS = [
  // Income statement
  { cle: "chiffre_affaires", groupe: "resultat", libelle: T, aide: T, obligatoire: true },
  { cle: "autres_produits", groupe: "resultat", libelle: T, aide: T },
  { cle: "achats_consommes", groupe: "resultat", libelle: T, aide: T, obligatoire: true },
  { cle: "charges_externes", groupe: "resultat", libelle: T, aide: T, obligatoire: true },
  { cle: "impots_taxes", groupe: "resultat", libelle: T, aide: T },
  { cle: "charges_personnel", groupe: "resultat", libelle: T, aide: T, obligatoire: true },
  { cle: "ebe", groupe: "resultat", libelle: T, aide: T,
    ecran: T, aideEcran: T },
  { cle: "dotations_amortissements", groupe: "resultat", libelle: T, aide: T },
  { cle: "resultat_exploitation", groupe: "resultat", libelle: T, aide: T },
  { cle: "resultat_net", groupe: "resultat", libelle: T, aide: T },
  // Balance sheet
  { cle: "immobilisations_nettes", groupe: "bilan", libelle: T, aide: T },
  { cle: "stocks", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "creances_clients", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "autres_creances", groupe: "bilan", libelle: T, aide: T },
  { cle: "placements", groupe: "bilan", libelle: T, aide: T },
  { cle: "tresorerie", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "capitaux_propres", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "provisions_risques", groupe: "bilan", libelle: T, aide: T },
  { cle: "emprunts", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "dettes_fournisseurs", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "dettes_fiscales_sociales", groupe: "bilan", libelle: T, aide: T, obligatoire: true },
  { cle: "autres_dettes", groupe: "bilan", libelle: T, aide: T },
];

for (const c of CHAMPS) avecTextes(c, `champs.champs.${c.cle}`);

export const CLES_CHAMPS = new Set(CHAMPS.map((c) => c.cle));

/** Label and help shown to the owner. `libelle` and `aide` remain those of the Excel datapack and of the tax-return
 *  reading (documents meant for buyers and advisors); `ecran` and `aideEcran` replace them on screen, without jargon. */
export const libelleEcran = (c) => c?.ecran ?? c?.libelle ?? "";
export const aideEcran = (c) => c?.aideEcran ?? c?.aide ?? "";
/** Explanation of EBITDA, at the first occurrence on each screen ("?" help on hover, keyboard and touch). */
export const aideEbe = () => t("champs.aide_ebe");
export const EXERCICES_MAX = 3;

/** Fiscal year → {cle: valeur} object with only the approved values (used by the calculation). */
export function exerciceValide(lignes) {
  const ex = {};
  for (const [cle, v] of Object.entries(lignes)) if (v.valide && Number.isFinite(v.valeur)) ex[cle] = v.valeur;
  return ex;
}

/** Required fields still missing or not approved for a fiscal year. */
const DETAIL_CHARGES = new Set(["achats_consommes", "charges_externes", "charges_personnel"]);
export function manquants(lignes) {
  const ok = (cle) => lignes[cle]?.valide && Number.isFinite(lignes[cle]?.valeur);
  // The approved published EBITDA replaces the detail of the expenses
  return CHAMPS.filter((c) => c.obligatoire && !ok(c.cle) && !(DETAIL_CHARGES.has(c.cle) && ok("ebe"))).map((c) => c.cle);
}

/**
 * Fiscal years requested from the owner (single rule, shared by the guided steps, the file page, the valuation
 * page and the server):
 *   - the latest known fiscal year is required (it is the one the guided steps ask for);
 *   - the two fiscal years immediately before it are recommended, never required;
 *   - an older year (for example published on its own at the INPI) is never requested: information only.
 * @param lignes { [annee]: { [cle]: { valeur, valide, source } } }
 * @returns { dernier, dernier_complet, recommandes: [n-1, n-2], recommandes_manquants, anciens }
 */
export function exercicesAttendus(lignes = {}) {
  const annees = Object.keys(lignes || {}).map(Number)
    .filter((a) => Number.isInteger(a) && Object.values(lignes[a] || {}).some((x) => x?.valeur != null))
    .sort((a, b) => b - a);
  const dernier = annees[0] ?? null;
  if (dernier == null) return { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] };
  const complet = (a) => Boolean(lignes[a]) && manquants(lignes[a]).length === 0;
  const recommandes = [dernier - 1, dernier - 2];
  return {
    dernier, dernier_complet: complet(dernier), recommandes,
    recommandes_manquants: recommandes.filter((a) => !complet(a)),
    anciens: annees.filter((a) => a < dernier - 2),
  };
}

/** Public accounts to reuse: the latest published fiscal year and, if they are published, the two immediately
 *  before it. An older, isolated year (the INPI sometimes skips fiscal years) is not reused. */
export function anneesAReprendre(annees = []) {
  const l = [...new Set(annees.filter(Number.isInteger))].sort((a, b) => a - b);
  const dernier = l.at(-1);
  return dernier == null ? [] : l.filter((a) => a >= dernier - (EXERCICES_MAX - 1));
}
