// Automatic checks of a fiscal year (approval by exception): the owner confirms the fiscal year in one click;
// only the flagged lines need their attention. No figure is corrected automatically.
//   level "alerte"    : the line must be checked and approved separately
//   level "attention" : a signal to read, does not prevent approval of the fiscal year
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
 * @param lignes { [cle]: { valeur, source, valide } } of the fiscal year
 * @param o.caPublic published revenue (INPI) for the same year, if it exists
 * @param o.precedent lines of the previous fiscal year, if it exists
 * @returns [{ code, niveau, lignes: [cles], message }]
 */
export function controlerExercice(lignes, { caPublic = null, precedent = null } = {}) {
  const res = [];
  const ajoute = (code, niveau, cles, message) => res.push({ code, niveau, lignes: cles, message });

  // Empty required lines
  const vides = CHAMPS.filter((c) => c.obligatoire && v(lignes, c.cle) === null)
    .filter((c) => !(["achats_consommes", "charges_externes", "charges_personnel"].includes(c.cle) && v(lignes, "ebe") !== null));
  if (vides.length) ajoute("manquant", "alerte", vides.map((c) => c.cle), tr("serveur.controles.lignes_a_completer", { n: vides.length, liste: vides.map((c) => libelleEcran(c)).join(", ") }));

  // Impossible values
  for (const k of NON_NEGATIFS) if (v(lignes, k) !== null && v(lignes, k) < 0) ajoute("negatif", "alerte", [k], tr("serveur.controles.negatif", { libelle: libelle(k), montant: fmt(v(lignes, k)) }));

  // Revenue different from the public accounts
  const ca = v(lignes, "chiffre_affaires");
  if (ca !== null && Number.isFinite(caPublic) && caPublic > 0 && ecart(ca, caPublic) > 0.01) {
    ajoute("ca_public", "alerte", ["chiffre_affaires"], tr("serveur.controles.ca_public", { saisi: fmt(ca), publie: fmt(caPublic) }));
  }

  // Balance sheet: assets ≈ liabilities (3% tolerance: accruals not detailed here). Only when the net fixed assets are
  // entered: they are optional, and without them the assets are always short (false alert, audit of 25/11/2026)
  const a = ACTIF.map((k) => v(lignes, k)), p = PASSIF.map((k) => v(lignes, k));
  const nA = a.filter((x) => x !== null).length, nP = p.filter((x) => x !== null).length;
  if (v(lignes, "immobilisations_nettes") !== null && nA >= 4 && nP >= 4) {
    const tA = a.reduce((s, x) => s + (x ?? 0), 0), tP = p.reduce((s, x) => s + (x ?? 0), 0);
    if (ecart(tA, tP) > 0.03) ajoute("bilan", "attention", [...ACTIF, ...PASSIF].filter((k) => v(lignes, k) !== null), tr("serveur.controles.bilan", { actif: fmt(tA), passif: fmt(tP) }));
  }

  // EBITDA ≈ operating income + depreciation and provisions (20% tolerance: provisions and other expenses not detailed)
  const det = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"].map((k) => v(lignes, k));
  const rex = v(lignes, "resultat_exploitation"), dot = v(lignes, "dotations_amortissements");
  if (ca !== null && det.every((x) => x !== null) && rex !== null && dot !== null) {
    const ebe = ca + (v(lignes, "autres_produits") ?? 0) - det.reduce((s, x) => s + x, 0);
    if (Math.abs(ebe - (rex + dot)) > Math.max(0.2 * Math.abs(ebe), 0.02 * ca)) {
      ajoute("ebe", "attention", ["resultat_exploitation", "dotations_amortissements", "charges_externes", "charges_personnel"], tr("serveur.controles.ebe", { ebe: fmt(ebe), rex: fmt(rex + dot) }));
    }
  }

  // Suspicious change in revenue from one year to the next (unit in thousands?)
  const caPrec = v(precedent, "chiffre_affaires");
  if (ca !== null && caPrec !== null && caPrec > 0 && ca > 0 && (ca / caPrec > 3 || caPrec / ca > 3)) {
    ajoute("variation", "alerte", ["chiffre_affaires"], tr("serveur.controles.variation", { avant: fmt(caPrec), apres: fmt(ca) }));
  } else if (ca !== null && caPrec !== null && caPrec > 0 && ca > 0 && Math.abs(ca - caPrec) > 0.3 * caPrec) {
    // More than 30% up or down (threshold set by the owner on 24/11/2026): to explain, never blocking
    ajoute("variation_30", "attention", ["chiffre_affaires"], tr("serveur.controles.variation_30", { avant: fmt(caPrec), apres: fmt(ca), pct: Math.round(Math.abs(ca / caPrec - 1) * 100) }));
  }

  // Net income above EBITDA: possible (exceptional or financial income, capital gain) but to check, often a unit error.
  // EBITDA = the one calculated from the detail of the expenses, otherwise the published or entered one.
  const ebeCalc = ca !== null && det.slice(0, 2).every((x) => x !== null) && det[3] !== null
    ? ca + (v(lignes, "autres_produits") ?? 0) - det.reduce((s, x) => s + (x ?? 0), 0) : v(lignes, "ebe");
  const rn = v(lignes, "resultat_net");
  if (rn !== null && ebeCalc !== null && rn > ebeCalc) {
    ajoute("resultat_net_ebe", "attention", ["resultat_net"], tr("serveur.controles.resultat_net_ebe", { rn: fmt(rn), ebe: fmt(ebeCalc) }));
  }
  // Negative shareholders' equity: the adjusted net assets cannot support the value
  const cp = v(lignes, "capitaux_propres");
  if (cp !== null && cp < 0) ajoute("capitaux_propres_negatifs", "attention", ["capitaux_propres"], tr("serveur.controles.capitaux_propres_negatifs", { montant: fmt(cp) }));
  return res;
}

/** Lines that block approval does not cover (flagged as "alerte"). */
export const lignesBloquees = (controles) => new Set(controles.filter((c) => c.niveau === "alerte").flatMap((c) => c.lignes));
