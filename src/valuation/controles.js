// Contrôles automatiques d'un exercice (validation par exception) : le dirigeant confirme l'exercice d'un clic ;
// seules les lignes signalées demandent son attention. Aucun chiffre n'est corrigé automatiquement.
//   niveau « alerte »    : la ligne doit être vérifiée et validée à part
//   niveau « attention » : signal à lire, n'empêche pas la validation de l'exercice
import { CHAMPS, libelleEcran } from "../../public/js/champs-financiers.js";
import { t as tr, langue, locale } from "../../public/js/i18n.js";

const v = (l, k) => (Number.isFinite(l?.[k]?.valeur) ? l[k].valeur : null);
const ecart = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);
const ACTIF = ["immobilisations_nettes", "stocks", "creances_clients", "autres_creances", "placements", "tresorerie"];
const PASSIF = ["capitaux_propres", "provisions_risques", "emprunts", "dettes_fournisseurs", "dettes_fiscales_sociales", "autres_dettes"];
const NON_NEGATIFS = ["chiffre_affaires", "stocks", "creances_clients", "tresorerie", "placements", "emprunts", "dettes_fournisseurs", "dettes_fiscales_sociales", "charges_personnel", "achats_consommes", "charges_externes"];
const libelle = (k) => libelleEcran(CHAMPS.find((c) => c.cle === k)) || k;
const fmt = (x) => { const n = Math.round(x).toLocaleString(locale()); return langue() === "fr" ? `${n} €` : `€${n}`; };

/**
 * @param lignes { [cle]: { valeur, source, valide } } de l'exercice
 * @param o.caPublic chiffre d'affaires publié (INPI) pour la même année, s'il existe
 * @param o.precedent lignes de l'exercice précédent, s'il existe
 * @returns [{ code, niveau, lignes: [cles], message }]
 */
export function controlerExercice(lignes, { caPublic = null, precedent = null } = {}) {
  const res = [];
  const ajoute = (code, niveau, cles, message) => res.push({ code, niveau, lignes: cles, message });

  // Lignes obligatoires vides
  const vides = CHAMPS.filter((c) => c.obligatoire && v(lignes, c.cle) === null)
    .filter((c) => !(["achats_consommes", "charges_externes", "charges_personnel"].includes(c.cle) && v(lignes, "ebe") !== null));
  if (vides.length) ajoute("manquant", "alerte", vides.map((c) => c.cle), tr("serveur.controles.lignes_a_completer", { n: vides.length, liste: vides.map((c) => libelleEcran(c)).join(", ") }));

  // Valeurs impossibles
  for (const k of NON_NEGATIFS) if (v(lignes, k) !== null && v(lignes, k) < 0) ajoute("negatif", "alerte", [k], tr("serveur.controles.negatif", { libelle: libelle(k), montant: fmt(v(lignes, k)) }));

  // Chiffre d'affaires différent des comptes publics
  const ca = v(lignes, "chiffre_affaires");
  if (ca !== null && Number.isFinite(caPublic) && caPublic > 0 && ecart(ca, caPublic) > 0.01) {
    ajoute("ca_public", "alerte", ["chiffre_affaires"], tr("serveur.controles.ca_public", { saisi: fmt(ca), publie: fmt(caPublic) }));
  }

  // Bilan : actif ≈ passif (tolérance 3 % : comptes de régularisation non détaillés ici)
  const a = ACTIF.map((k) => v(lignes, k)), p = PASSIF.map((k) => v(lignes, k));
  const nA = a.filter((x) => x !== null).length, nP = p.filter((x) => x !== null).length;
  if (nA >= 4 && nP >= 4) {
    const tA = a.reduce((s, x) => s + (x ?? 0), 0), tP = p.reduce((s, x) => s + (x ?? 0), 0);
    if (ecart(tA, tP) > 0.03) ajoute("bilan", "attention", [...ACTIF, ...PASSIF].filter((k) => v(lignes, k) !== null), tr("serveur.controles.bilan", { actif: fmt(tA), passif: fmt(tP) }));
  }

  // EBE ≈ résultat d'exploitation + dotations (tolérance 20 % : provisions et autres charges non détaillées)
  const det = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"].map((k) => v(lignes, k));
  const rex = v(lignes, "resultat_exploitation"), dot = v(lignes, "dotations_amortissements");
  if (ca !== null && det.every((x) => x !== null) && rex !== null && dot !== null) {
    const ebe = ca + (v(lignes, "autres_produits") ?? 0) - det.reduce((s, x) => s + x, 0);
    if (Math.abs(ebe - (rex + dot)) > Math.max(0.2 * Math.abs(ebe), 0.02 * ca)) {
      ajoute("ebe", "attention", ["resultat_exploitation", "dotations_amortissements", "charges_externes", "charges_personnel"], tr("serveur.controles.ebe", { ebe: fmt(ebe), rex: fmt(rex + dot) }));
    }
  }

  // Variation suspecte du chiffre d'affaires d'une année sur l'autre (unité en milliers ?)
  const caPrec = v(precedent, "chiffre_affaires");
  if (ca !== null && caPrec !== null && caPrec > 0 && ca > 0 && (ca / caPrec > 3 || caPrec / ca > 3)) {
    ajoute("variation", "alerte", ["chiffre_affaires"], tr("serveur.controles.variation", { avant: fmt(caPrec), apres: fmt(ca) }));
  }
  return res;
}

/** Lignes que la validation en bloc ne couvre pas (signalées en « alerte »). */
export const lignesBloquees = (controles) => new Set(controles.filter((c) => c.niveau === "alerte").flatMap((c) => c.lignes));
