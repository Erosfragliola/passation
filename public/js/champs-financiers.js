// Champs financiers d'un exercice : liste unique partagée par l'écran de saisie, le serveur, la lecture de liasse
// et le datapack. Libellés en langage de dirigeant ; « aide » dit où trouver le chiffre dans la liasse fiscale
// (formulaires 2033 du régime simplifié ou 2050 à 2059 du régime normal), sans numéro de ligne.

export const CHAMPS = [
  // Compte de résultat
  { cle: "chiffre_affaires", groupe: "resultat", libelle: "Chiffre d'affaires", aide: "Ventes de marchandises + production vendue (biens et services), compte de résultat", obligatoire: true },
  { cle: "autres_produits", groupe: "resultat", libelle: "Autres produits d'exploitation", aide: "Production stockée et immobilisée, subventions d'exploitation" },
  { cle: "achats_consommes", groupe: "resultat", libelle: "Achats consommés", aide: "Achats de marchandises et de matières, variations de stocks comprises", obligatoire: true },
  { cle: "charges_externes", groupe: "resultat", libelle: "Autres achats et charges externes", aide: "Loyers, sous-traitance, honoraires, énergie, etc.", obligatoire: true },
  { cle: "impots_taxes", groupe: "resultat", libelle: "Impôts et taxes", aide: "Hors impôt sur les sociétés" },
  { cle: "charges_personnel", groupe: "resultat", libelle: "Salaires et charges sociales", aide: "Salaires et traitements + charges sociales", obligatoire: true },
  { cle: "ebe", groupe: "resultat", libelle: "EBE publié", aide: "Seulement si le détail des charges n'est pas disponible (comptes publics INPI)" },
  { cle: "dotations_amortissements", groupe: "resultat", libelle: "Dotations aux amortissements", aide: "Dotations aux amortissements sur immobilisations" },
  { cle: "resultat_exploitation", groupe: "resultat", libelle: "Résultat d'exploitation", aide: "Contrôle de cohérence" },
  { cle: "resultat_net", groupe: "resultat", libelle: "Résultat net", aide: "Bénéfice ou perte de l'exercice" },
  // Bilan
  { cle: "immobilisations_nettes", groupe: "bilan", libelle: "Immobilisations nettes", aide: "Actif immobilisé, valeurs nettes" },
  { cle: "stocks", groupe: "bilan", libelle: "Stocks", aide: "Stocks et en-cours, valeur nette", obligatoire: true },
  { cle: "creances_clients", groupe: "bilan", libelle: "Créances clients", aide: "Clients et comptes rattachés, valeur nette", obligatoire: true },
  { cle: "autres_creances", groupe: "bilan", libelle: "Autres créances", aide: "Hors clients" },
  { cle: "placements", groupe: "bilan", libelle: "Placements", aide: "Valeurs mobilières de placement" },
  { cle: "tresorerie", groupe: "bilan", libelle: "Disponibilités", aide: "Trésorerie à l'actif", obligatoire: true },
  { cle: "capitaux_propres", groupe: "bilan", libelle: "Capitaux propres", aide: "Total des capitaux propres", obligatoire: true },
  { cle: "provisions_risques", groupe: "bilan", libelle: "Provisions pour risques et charges", aide: "Passif" },
  { cle: "emprunts", groupe: "bilan", libelle: "Emprunts et dettes financières", aide: "Emprunts bancaires, découverts, dettes financières diverses", obligatoire: true },
  { cle: "dettes_fournisseurs", groupe: "bilan", libelle: "Dettes fournisseurs", aide: "Fournisseurs et comptes rattachés", obligatoire: true },
  { cle: "dettes_fiscales_sociales", groupe: "bilan", libelle: "Dettes fiscales et sociales", aide: "Hors impôt sur les sociétés si possible", obligatoire: true },
  { cle: "autres_dettes", groupe: "bilan", libelle: "Autres dettes", aide: "Hors fournisseurs, fiscales et sociales" },
];

export const CLES_CHAMPS = new Set(CHAMPS.map((c) => c.cle));
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
