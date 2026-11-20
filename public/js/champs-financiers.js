// Champs financiers d'un exercice : liste unique partagée par l'écran de saisie, le serveur, la lecture de liasse
// et le datapack. Libellés en langage de dirigeant ; « aide » dit où trouver le chiffre dans la liasse fiscale
// (formulaires 2033 du régime simplifié ou 2050 à 2059 du régime normal), sans numéro de ligne.
// Textes : src/contenu/<langue>/champs.json (marqueur T, lus dans la langue de la page ou de la requête).
import { t, T, avecTextes } from "./i18n.js";

export const CHAMPS = [
  // Compte de résultat
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
  // Bilan
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

/** Libellé et aide montrés au dirigeant. `libelle` et `aide` restent ceux du datapack Excel et de la lecture de liasse
 *  (documents destinés aux repreneurs et aux conseils) ; `ecran` et `aideEcran` les remplacent à l'écran, sans jargon. */
export const libelleEcran = (c) => c?.ecran ?? c?.libelle ?? "";
export const aideEcran = (c) => c?.aideEcran ?? c?.aide ?? "";
/** Explication de l'EBE, à la première occurrence de chaque écran (aide « ? » au survol, au clavier et au toucher). */
export const aideEbe = () => t("champs.aide_ebe");
export const EXERCICES_MAX = 3;

/** Exercice → objet {cle: valeur} avec les seules valeurs validées (utilisées par le calcul). */
export function exerciceValide(lignes) {
  const ex = {};
  for (const [cle, v] of Object.entries(lignes)) if (v.valide && Number.isFinite(v.valeur)) ex[cle] = v.valeur;
  return ex;
}

/** Champs obligatoires encore manquants ou non validés pour un exercice. */
const DETAIL_CHARGES = new Set(["achats_consommes", "charges_externes", "charges_personnel"]);
export function manquants(lignes) {
  const ok = (cle) => lignes[cle]?.valide && Number.isFinite(lignes[cle]?.valeur);
  // L'EBE publié validé remplace le détail des charges
  return CHAMPS.filter((c) => c.obligatoire && !ok(c.cle) && !(DETAIL_CHARGES.has(c.cle) && ok("ebe"))).map((c) => c.cle);
}

/**
 * Exercices demandés au dirigeant (règle unique, partagée par le parcours guidé, la page du dossier, la page
 * valorisation et le serveur) :
 *   - le dernier exercice connu est indispensable (c'est celui que demande le parcours guidé) ;
 *   - les deux exercices qui le précèdent immédiatement sont recommandés, jamais obligatoires ;
 *   - une année plus ancienne (par exemple publiée isolément à l'INPI) n'est jamais réclamée : simple information.
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

/** Comptes publics à reprendre : le dernier exercice publié et, s'ils sont publiés, les deux qui le précèdent
 *  immédiatement. Une année plus ancienne, isolée (l'INPI saute parfois des exercices), n'est pas reprise. */
export function anneesAReprendre(annees = []) {
  const l = [...new Set(annees.filter(Number.isInteger))].sort((a, b) => a - b);
  const dernier = l.at(-1);
  return dernier == null ? [] : l.filter((a) => a >= dernier - (EXERCICES_MAX - 1));
}
