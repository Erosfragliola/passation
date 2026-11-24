// Detailed valuation (PLAN.md § 5.2): deterministic, tested code. Claude never calculates; it comments.
// Inputs: fiscal years (simplified income statement + balance sheet, approved by the owner), adjustments, balance-sheet
// complements, forecasts, discounts/premiums; sourced assumptions (src/data/hypotheses.json).
import MULTIPLES from "../data/multiples.json";
import { t as tr, langue, locale } from "../../public/js/i18n.js";

const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

// ---------------------------------------------------------------- EBITDA and adjustments
/**
 * EBITDA = revenue + other operating income − purchases consumed − external expenses − taxes and duties − personnel.
 * Calculated only if revenue and the three required expenses are filled in (an entered 0 is a real zero);
 * "other income" and "taxes and duties" are optional items of the entry: if missing, they count as 0.
 * Otherwise, the published EBITDA (INPI accounts) is taken as is; failing that, EBITDA cannot be determined (null).
 */
const CHARGES_OBLIGATOIRES = ["achats_consommes", "charges_externes", "charges_personnel"];
const renseigne = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));
export function ebe(ex) {
  if (renseigne(ex.chiffre_affaires) && CHARGES_OBLIGATOIRES.every((k) => renseigne(ex[k]))) {
    return n(ex.chiffre_affaires) + n(ex.autres_produits) - n(ex.achats_consommes) - n(ex.charges_externes) - n(ex.impots_taxes) - n(ex.charges_personnel);
  }
  return renseigne(ex.ebe) ? Number(ex.ebe) : null;
}

/**
 * Bridge from reported EBITDA → adjusted EBITDA, per fiscal year.
 * Owner: actual − normalized pay (charges included); rent: paid − market; non-recurring items of the year.
 */
export function pontEbe(exercices, r = {}) {
  return exercices.map((ex) => {
    const lignes = [];
    if (Number.isFinite(r.remuneration_dirigeant_reelle) && Number.isFinite(r.remuneration_normative)) {
      lignes.push({ cle: "dirigeant", libelle: tr("serveur.valorisation_moteur.retraitements.dirigeant"), montant: r.remuneration_dirigeant_reelle - r.remuneration_normative });
    }
    if (Number.isFinite(r.loyer_paye) && Number.isFinite(r.loyer_marche)) {
      lignes.push({ cle: "loyer", libelle: tr("serveur.valorisation_moteur.retraitements.loyer"), montant: r.loyer_paye - r.loyer_marche });
    }
    for (const e of r.exceptionnels || []) {
      if (e.annee === ex.annee && Number.isFinite(e.montant)) lignes.push({ cle: "exceptionnel", libelle: e.libelle || tr("serveur.valorisation_moteur.retraitements.exceptionnel"), montant: e.montant, justification: e.justification || "" });
    }
    const comptable = ebe(ex);
    return { annee: ex.annee, ebe_comptable: comptable, lignes, ebe_retraite: comptable + lignes.reduce((a, l) => a + l.montant, 0) };
  });
}

/** Normalized EBITDA: average of the adjusted fiscal years (3 at most) or latest fiscal year, as the owner chooses. */
export function ebeNormatif(pont, mode = "moyenne") {
  const l = pont.slice(-3);
  if (!l.length) return { valeur: null, mode, annees: [] };
  if (mode === "dernier") return { valeur: l.at(-1).ebe_retraite, mode, annees: [l.at(-1).annee] };
  return { valeur: moyenne(l.map((x) => x.ebe_retraite)), mode: "moyenne", annees: l.map((x) => x.annee) };
}

// ---------------------------------------------------------------- Working capital and net debt
/** Operating working capital = inventory + trade receivables − trade payables − tax and social liabilities. */
export function bfr(ex) {
  return n(ex.stocks) + n(ex.creances_clients) - n(ex.dettes_fournisseurs) - n(ex.dettes_fiscales_sociales);
}
/** Normalized working capital: average of working capital in days of revenue, applied to the latest year's revenue. */
export function bfrNormatif(exercices) {
  const l = exercices.filter((e) => n(e.chiffre_affaires) > 0);
  const jours = moyenne(l.map((e) => (bfr(e) / n(e.chiffre_affaires)) * 365));
  const dernier = l.at(-1);
  return { jours, valeur: jours == null ? null : (jours / 365) * n(dernier.chiffre_affaires), par_exercice: l.map((e) => ({ annee: e.annee, bfr: bfr(e), jours: (bfr(e) / n(e.chiffre_affaires)) * 365 })) };
}
/**
 * Net debt = borrowings + remaining leasing + repayable shareholder current accounts + provisions for risks
 * + dividends declared but unpaid − cash − investments. Negative = net cash.
 */
export function detteNette(ex, c = {}) {
  const lignes = [
    { cle: "emprunts", libelle: tr("champs.champs.emprunts.libelle"), montant: n(ex.emprunts) },
    { cle: "credit_bail", libelle: tr("serveur.valorisation_moteur.dette.credit_bail"), montant: n(c.credit_bail_restant) },
    { cle: "comptes_courants", libelle: tr("serveur.valorisation_moteur.dette.comptes_courants"), montant: n(c.comptes_courants_remboursables) },
    { cle: "provisions", libelle: tr("serveur.valorisation_moteur.dette.provisions"), montant: n(ex.provisions_risques) },
    { cle: "dividendes", libelle: tr("serveur.valorisation_moteur.dette.dividendes"), montant: n(c.dividendes_a_verser) },
    { cle: "tresorerie", libelle: tr("serveur.valorisation_moteur.dette.tresorerie"), montant: -n(ex.tresorerie) },
    { cle: "placements", libelle: tr("champs.champs.placements.libelle"), montant: -n(ex.placements) },
  ];
  return { total: lignes.reduce((a, l) => a + l.montant, 0), lignes };
}

// ---------------------------------------------------------------- Tax, WACC, DCF
/** Corporate tax: 15% up to the ceiling if the reduced rate applies, 25% above (service-public, checked on 17/02/2026). */
export function impotSocietes(resultat, { tauxReduit = false } = {}, H) {
  const is = H.impot_societes;
  if (!(resultat > 0)) return 0;
  if (!tauxReduit) return resultat * is.taux_normal;
  const tranche = Math.min(resultat, is.plafond_taux_reduit);
  return tranche * is.taux_reduit + (resultat - tranche) * is.taux_normal;
}

/**
 * WACC = E/(D+E) × kₑ + D/(D+E) × k_d × (1 − t), with kₑ = risk-free rate + levered beta × risk premium + size premium
 * and levered beta = unlevered beta × (1 + (1 − t) × D/E) (target structure = the industry's D/E ratio, Damodaran).
 */
export function cmpc({ primeTaille, secteur, detteSurCapitaux = null }, H) {
  const b = H.betas.secteurs[secteur];
  const manquant = [];
  if (!b) manquant.push(tr("serveur.valorisation_moteur.manquant.beta"));
  if (!Number.isFinite(primeTaille)) manquant.push(tr("serveur.valorisation_moteur.manquant.prime_taille"));
  if (!Number.isFinite(H.taux_sans_risque.valeur)) manquant.push(tr("serveur.valorisation_moteur.manquant.taux"));
  if (manquant.length) return { statut: "a_completer", valeur: null, manquant };
  const t = H.impot_societes.taux_normal;
  const de = Number.isFinite(detteSurCapitaux) ? detteSurCapitaux : b.dette_sur_capitaux;
  const beta_endette = b.beta_desendette * (1 + (1 - t) * de);
  const cout_fonds_propres = H.taux_sans_risque.valeur + beta_endette * H.prime_risque_marche.valeur + primeTaille;
  const poids_dette = de / (1 + de);
  const cout_dette_apres_impot = H.cout_dette_avant_impot.valeur * (1 - t);
  return {
    statut: "ok", beta_desendette: b.beta_desendette, dette_sur_capitaux: de, beta_endette, cout_fonds_propres,
    cout_dette_apres_impot, poids_dette, valeur: (1 - poids_dette) * cout_fonds_propres + poids_dette * cout_dette_apres_impot,
  };
}

/**
 * Simplified 5-year DCF (end-of-year convention).
 * Flow = EBIT − tax(EBIT) + depreciation − capital expenditure − change in working capital; EBIT = EBITDA − depreciation.
 * Terminal value (Gordon-Shapiro) = year-5 flow × (1 + g) / (WACC − g). Error if WACC ≤ g.
 */
export function dcf({ ca0, croissance, marge_ebe, amortissements_pct, investissements_pct, bfr_jours, cmpc: k, g, tauxReduit = false }, H) {
  if (!(k > g)) throw new Error(`CMPC (${(k * 100).toFixed(2)} %) inférieur ou égal à la croissance à l'infini (${(g * 100).toFixed(2)} %) : valeur terminale impossible.`);
  const taux = Array.isArray(croissance) ? croissance : Array(5).fill(croissance);
  let caPrec = ca0, bfrPrec = (bfr_jours / 365) * ca0;
  const flux = [];
  for (let i = 0; i < 5; i++) {
    const ca = caPrec * (1 + taux[i]);
    const e = ca * marge_ebe, da = ca * amortissements_pct, ebit = e - da;
    const impot = impotSocietes(ebit, { tauxReduit: tauxReduit && ca <= 10_000_000 }, H);
    const b = (bfr_jours / 365) * ca;
    const f = ebit - impot + da - ca * investissements_pct - (b - bfrPrec);
    flux.push({ annee: i + 1, ca, ebe: e, amortissements: da, ebit, impot, investissements: ca * investissements_pct, variation_bfr: b - bfrPrec, flux: f, actualise: f / Math.pow(1 + k, i + 1) });
    caPrec = ca; bfrPrec = b;
  }
  const valeur_terminale = (flux[4].flux * (1 + g)) / (k - g);
  const vt_actualisee = valeur_terminale / Math.pow(1 + k, 5);
  const somme = flux.reduce((a, f) => a + f.actualise, 0);
  return { flux, valeur_terminale, vt_actualisee, somme_flux_actualises: somme, ve: somme + vt_actualisee, part_vt: vt_actualisee / (somme + vt_actualisee) };
}

// ---------------------------------------------------------------- ANCC, discounts
/** ANCC = equity + unrealized gains − start-up costs − doubtful receivables (value of the shares). */
export function ancc(ex, c = {}) {
  const lignes = [
    { cle: "capitaux_propres", libelle: tr("demarrer.js.chiffres.cp"), montant: n(ex.capitaux_propres) },
    { cle: "plus_values", libelle: tr("serveur.valorisation_moteur.ancc.plus_values"), montant: n(c.plus_values_latentes) },
    { cle: "frais_etablissement", libelle: tr("serveur.valorisation_moteur.ancc.frais_etablissement"), montant: -n(c.frais_etablissement) },
    { cle: "creances_douteuses", libelle: tr("serveur.valorisation_moteur.ancc.creances_douteuses"), montant: -n(c.creances_douteuses) },
  ];
  return { valeur: lignes.reduce((a, l) => a + l.montant, 0), lignes };
}
/** Discounts and premiums: percentages added up → multiplying factor applied to the enterprise values. */
export function facteurDecotes(facteurs = []) {
  return 1 + facteurs.reduce((a, f) => a + (Number.isFinite(f.pct) ? f.pct : 0), 0);
}

// ---------------------------------------------------------------- Orchestration
function croissanceHistorique(exs) {
  const l = exs.filter((e) => n(e.chiffre_affaires) > 0);
  if (l.length < 2) return null;
  const a = l[0], b = l.at(-1);
  return Math.pow(n(b.chiffre_affaires) / n(a.chiffre_affaires), 1 / (b.annee - a.annee)) - 1;
}

/**
 * @param e { secteur, exercices[], retraitements, complements, previsions, decotes[], primeTaille, tauxReduit, modeEbe, ponderation }
 * @param H assumptions (hypotheses.json, possibly changed by the owner)
 */
export function valorisationApprofondie(e, H, table = MULTIPLES) {
  if (e.erreurs?.length) return { statut: "hypotheses_invalides", annees: [], erreurs: e.erreurs, alertes: e.erreurs.map((x) => x.message) };
  const alertes = [];
  for (const x of e.exercices_exclus || []) {
    alertes.push(tr("serveur.valorisation_moteur.alertes.exercice_incomplet", { annee: x.annee, n: x.manquants.length }));
  }
  const tous = [...(e.exercices || [])].sort((a, b) => a.annee - b.annee);
  for (const x of tous) if (ebe(x) === null) alertes.push(tr("serveur.valorisation_moteur.alertes.ebe_indeterminable", { annee: x.annee }));
  const exs = tous.filter((x) => ebe(x) !== null).slice(-3);
  const annees = exs.map((x) => x.annee);
  if (annees.some((a, i) => i > 0 && a - annees[i - 1] !== 1)) alertes.push(tr("serveur.valorisation_moteur.alertes.non_consecutifs"));
  if (!exs.length) return { statut: "chiffres_absents", annees, alertes: [...alertes, tr("serveur.valorisation_moteur.alertes.aucun_exercice")] };
  const dernier = exs.at(-1);

  const pont = pontEbe(exs, e.retraitements || {});
  const ebeN = ebeNormatif(pont, e.modeEbe);
  const bfrN = bfrNormatif(exs);
  const ecartBfr = bfrN.valeur == null ? 0 : bfr(dernier) - bfrN.valeur;
  const dn = detteNette(dernier, e.complements || {});
  const facteur = facteurDecotes(e.decotes || []);
  const hors = n(e.complements?.actifs_hors_exploitation);
  const versTitres = (ve) => ve * facteur - dn.total + ecartBfr + hors;
  const pont_titres = { facteur_decotes: facteur, dette_nette: dn.total, ecart_bfr: ecartBfr, hors_exploitation: hors };

  // Method 1: multiples
  const secteurM = table.secteurs.find((s) => s.cle === e.secteur);
  let multiples;
  if (!(ebeN.valeur > 0)) {
    multiples = { statut: "non_applicable" };
    alertes.push(tr("serveur.valorisation_moteur.alertes.ebe_negatif"));
  } else if (![secteurM?.ebe?.bas, secteurM?.ebe?.central, secteurM?.ebe?.haut].every(Number.isFinite)) {
    multiples = { statut: "a_completer" };
    alertes.push(tr("serveur.valorisation_moteur.alertes.multiples_a_completer"));
  } else {
    const m = secteurM.ebe;
    const ve = { bas: ebeN.valeur * m.bas, central: ebeN.valeur * m.central, haut: ebeN.valeur * m.haut };
    multiples = { statut: "ok", multiples: m, source: secteurM.source, ve, titres: { bas: versTitres(ve.bas), central: versTitres(ve.central), haut: versTitres(ve.haut) } };
  }

  // Method 2: DCF
  const p = e.previsions || {};
  const caD = n(dernier.chiffre_affaires);
  const hist = croissanceHistorique(exs);
  const amortHist = moyenne(exs.filter((x) => n(x.chiffre_affaires) > 0 && Number.isFinite(x.dotations_amortissements)).map((x) => x.dotations_amortissements / x.chiffre_affaires));
  const hyp = {
    croissance: Number.isFinite(p.croissance) ? { valeur: p.croissance, origine: "dirigeant" } : { valeur: hist == null ? 0 : Math.min(0.1, Math.max(-0.05, hist)), origine: hist == null ? tr("serveur.valorisation_moteur.origines.defaut") : tr("serveur.valorisation_moteur.origines.historique_ca") },
    marge_ebe: Number.isFinite(p.marge_ebe) ? { valeur: p.marge_ebe, origine: "dirigeant" } : { valeur: caD > 0 ? ebeN.valeur / caD : 0, origine: tr("serveur.valorisation_moteur.origines.ebe_sur_ca") },
    amortissements_pct: Number.isFinite(p.amortissements_pct) ? { valeur: p.amortissements_pct, origine: "dirigeant" } : { valeur: amortHist ?? 0, origine: amortHist == null ? tr("serveur.valorisation_moteur.origines.a_completer") : tr("serveur.valorisation_moteur.origines.dotations") },
    investissements_pct: Number.isFinite(p.investissements_pct) ? { valeur: p.investissements_pct, origine: "dirigeant" } : { valeur: amortHist ?? 0, origine: tr("serveur.valorisation_moteur.origines.maintien") },
    bfr_jours: Number.isFinite(p.bfr_jours) ? { valeur: p.bfr_jours, origine: "dirigeant" } : { valeur: bfrN.jours ?? 0, origine: tr("serveur.valorisation_moteur.origines.bfr") },
    croissance_terminale: { valeur: Number.isFinite(p.croissance_terminale) ? p.croissance_terminale : H.croissance_terminale.valeur, origine: Number.isFinite(p.croissance_terminale) ? "dirigeant" : tr("serveur.valorisation_moteur.origines.inflation") },
  };
  const c = cmpc({ primeTaille: e.primeTaille, secteur: e.secteur, detteSurCapitaux: e.detteSurCapitaux }, H);
  let dcfR;
  if (c.statut !== "ok") {
    dcfR = { statut: "a_completer", manquant: c.manquant, hypotheses: hyp };
    if (!(c.manquant.length === 1 && c.manquant[0] === tr("serveur.valorisation_moteur.manquant.prime_taille"))) alertes.push(tr("serveur.valorisation_moteur.alertes.dcf_a_completer", { liste: c.manquant.join(", ") }));
  } else if (!(caD > 0)) {
    dcfR = { statut: "non_applicable", hypotheses: hyp };
  } else {
    const calc = (k, g = hyp.croissance_terminale.valeur) => dcf({
      ca0: caD, croissance: hyp.croissance.valeur, marge_ebe: hyp.marge_ebe.valeur, amortissements_pct: hyp.amortissements_pct.valeur,
      investissements_pct: hyp.investissements_pct.valeur, bfr_jours: hyp.bfr_jours.valeur, cmpc: k, g, tauxReduit: Boolean(e.tauxReduit),
    }, H);
    try {
      const central = calc(c.valeur);
      const bas = calc(c.valeur + 0.01);
      let haut = null;
      try { haut = calc(c.valeur - 0.01); } catch { /* WACC − 1 pt ≤ g */ }
      dcfR = {
        statut: "ok", cmpc: c, hypotheses: hyp, detail: central, ve: { bas: bas.ve, central: central.ve, haut: haut?.ve ?? null },
        titres: { bas: versTitres(bas.ve), central: versTitres(central.ve), haut: haut ? versTitres(haut.ve) : null },
      };
      if (central.part_vt > 0.8) alertes.push(tr("serveur.valorisation_moteur.alertes.valeur_terminale"));
    } catch (err) {
      dcfR = { statut: "erreur", message: err.message, hypotheses: hyp, cmpc: c };
      alertes.push(err.message);
    }
  }

  // Method 3: ANCC (floor, presented separately)
  const anc = ancc(dernier, e.complements || {});
  if (anc.valeur < 0) alertes.push(tr("serveur.valorisation_moteur.alertes.cp_negatifs"));

  // Summary: multiples only by default (decision of 18/11/2026), DCF as an option through the weighting; DCF only if
  // the multiples do not apply
  let poids = { ...(e.ponderation || { multiples: H.ponderation.multiples, dcf: H.ponderation.dcf }) };
  const okM = multiples.statut === "ok", okD = dcfR.statut === "ok";
  if (okM && !okD) { poids = { multiples: 1, dcf: 0 }; if (e.ponderation && e.ponderation.dcf > 0) alertes.push(tr("serveur.valorisation_moteur.alertes.dcf_option")); }
  if (!okM && okD) poids = { multiples: 0, dcf: 1 };
  const comb = (cle) => {
    if (!okM && !okD) return null;
    const m = okM ? multiples.titres[cle] : 0;
    const d = okD ? (dcfR.titres[cle] ?? dcfR.titres.central) : 0;
    return poids.multiples * m + poids.dcf * d;
  };
  const synthese = { bas: comb("bas"), central: comb("central"), haut: comb("haut"), ponderation: poids, plancher_ancc: anc.valeur, alertes };
  // Information, without an acronym: the whole range (its top included) is below the adjusted net assets calculated above
  if (synthese.haut != null && Number.isFinite(anc.valeur) && synthese.haut < anc.valeur) {
    const n = new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.round(anc.valeur));
    const euros = langue() === "fr" ? `${n} €` : `€${n}`;
    alertes.push(tr("serveur.valorisation_moteur.alertes.sous_ancc", { montant: euros }));
  }

  // Sensitivities: multiple ± 1x, WACC ± 1 pt, terminal growth ± 0.5 pt (value of the shares)
  const sensibilites = {};
  if (okM) {
    sensibilites.multiple = { moins: versTitres(ebeN.valeur * (multiples.multiples.central - 1)), central: multiples.titres.central, plus: versTitres(ebeN.valeur * (multiples.multiples.central + 1)) };
  }
  if (okD) {
    sensibilites.cmpc = { plus_1pt: dcfR.titres.bas, central: dcfR.titres.central, moins_1pt: dcfR.titres.haut };
    const g = hyp.croissance_terminale.valeur;
    const essai = (gg) => { try { return versTitres(dcf({ ca0: caD, croissance: hyp.croissance.valeur, marge_ebe: hyp.marge_ebe.valeur, amortissements_pct: hyp.amortissements_pct.valeur, investissements_pct: hyp.investissements_pct.valeur, bfr_jours: hyp.bfr_jours.valeur, cmpc: c.valeur, g: gg, tauxReduit: Boolean(e.tauxReduit) }, H).ve); } catch { return null; } };
    sensibilites.croissance_terminale = { moins_05pt: essai(g - 0.005), central: dcfR.titres.central, plus_05pt: essai(g + 0.005) };
  }

  return {
    statut: "ok", annees, pont_ebe: pont, ebe_normatif: ebeN, bfr: { reel: bfr(dernier), normatif: bfrN, ecart: ecartBfr },
    dette_nette: dn, pont_titres, multiples, dcf: dcfR, ancc: anc, synthese, sensibilites,
  };
}
