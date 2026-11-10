// Valorisation approfondie (PLAN.md § 5.2) : code déterministe, testé. Claude ne calcule jamais ; il commente.
// Entrées : exercices (compte de résultat + bilan simplifiés, validés par le dirigeant), retraitements, compléments
// de bilan, prévisions, décotes/primes ; hypothèses sourcées (src/data/hypotheses.json).
import MULTIPLES from "../data/multiples.json";

const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

// ---------------------------------------------------------------- EBE et retraitements
/** EBE = CA + autres produits d'exploitation − achats consommés − charges externes − impôts et taxes − personnel. */
const DETAIL_EBE = ["achats_consommes", "charges_externes", "impots_taxes", "charges_personnel"];
export function ebe(ex) {
  // Comptes publics (INPI) sans le détail des charges : EBE publié pris tel quel
  if (!DETAIL_EBE.some((k) => Number.isFinite(Number(ex[k])) && ex[k] !== null && ex[k] !== "") && Number.isFinite(ex.ebe)) return ex.ebe;
  return n(ex.chiffre_affaires) + n(ex.autres_produits) - n(ex.achats_consommes) - n(ex.charges_externes) - n(ex.impots_taxes) - n(ex.charges_personnel);
}

/**
 * Pont EBE comptable → EBE retraité, par exercice.
 * Dirigeant : rémunération réelle − normative (charges comprises) ; loyer : payé − marché ; exceptionnels de l'année.
 */
export function pontEbe(exercices, r = {}) {
  return exercices.map((ex) => {
    const lignes = [];
    if (Number.isFinite(r.remuneration_dirigeant_reelle) && Number.isFinite(r.remuneration_normative)) {
      lignes.push({ cle: "dirigeant", libelle: "Rémunération du dirigeant ramenée à la normale", montant: r.remuneration_dirigeant_reelle - r.remuneration_normative });
    }
    if (Number.isFinite(r.loyer_paye) && Number.isFinite(r.loyer_marche)) {
      lignes.push({ cle: "loyer", libelle: "Loyer ramené au prix de marché", montant: r.loyer_paye - r.loyer_marche });
    }
    for (const e of r.exceptionnels || []) {
      if (e.annee === ex.annee && Number.isFinite(e.montant)) lignes.push({ cle: "exceptionnel", libelle: e.libelle || "Élément exceptionnel", montant: e.montant, justification: e.justification || "" });
    }
    const comptable = ebe(ex);
    return { annee: ex.annee, ebe_comptable: comptable, lignes, ebe_retraite: comptable + lignes.reduce((a, l) => a + l.montant, 0) };
  });
}

/** EBE normatif : moyenne des exercices retraités (3 au plus) ou dernier exercice, au choix du dirigeant. */
export function ebeNormatif(pont, mode = "moyenne") {
  const l = pont.slice(-3);
  if (!l.length) return { valeur: null, mode, annees: [] };
  if (mode === "dernier") return { valeur: l.at(-1).ebe_retraite, mode, annees: [l.at(-1).annee] };
  return { valeur: moyenne(l.map((x) => x.ebe_retraite)), mode: "moyenne", annees: l.map((x) => x.annee) };
}

// ---------------------------------------------------------------- BFR et dette nette
/** BFR d'exploitation = stocks + créances clients − dettes fournisseurs − dettes fiscales et sociales. */
export function bfr(ex) {
  return n(ex.stocks) + n(ex.creances_clients) - n(ex.dettes_fournisseurs) - n(ex.dettes_fiscales_sociales);
}
/** BFR normatif : moyenne des BFR en jours de CA, appliquée au CA du dernier exercice. */
export function bfrNormatif(exercices) {
  const l = exercices.filter((e) => n(e.chiffre_affaires) > 0);
  const jours = moyenne(l.map((e) => (bfr(e) / n(e.chiffre_affaires)) * 365));
  const dernier = l.at(-1);
  return { jours, valeur: jours == null ? null : (jours / 365) * n(dernier.chiffre_affaires), par_exercice: l.map((e) => ({ annee: e.annee, bfr: bfr(e), jours: (bfr(e) / n(e.chiffre_affaires)) * 365 })) };
}
/**
 * Dette nette = emprunts + crédit-bail restant + comptes courants remboursables + provisions pour risques
 * + dividendes votés non versés − trésorerie − placements. Négative = trésorerie nette.
 */
export function detteNette(ex, c = {}) {
  const lignes = [
    { cle: "emprunts", libelle: "Emprunts et dettes financières", montant: n(ex.emprunts) },
    { cle: "credit_bail", libelle: "Crédit-bail restant dû", montant: n(c.credit_bail_restant) },
    { cle: "comptes_courants", libelle: "Comptes courants d'associés remboursables", montant: n(c.comptes_courants_remboursables) },
    { cle: "provisions", libelle: "Provisions pour risques", montant: n(ex.provisions_risques) },
    { cle: "dividendes", libelle: "Dividendes votés non versés", montant: n(c.dividendes_a_verser) },
    { cle: "tresorerie", libelle: "Trésorerie", montant: -n(ex.tresorerie) },
    { cle: "placements", libelle: "Placements", montant: -n(ex.placements) },
  ];
  return { total: lignes.reduce((a, l) => a + l.montant, 0), lignes };
}

// ---------------------------------------------------------------- Impôt, CMPC, DCF
/** IS : 15 % jusqu'au plafond si le taux réduit s'applique, 25 % au-delà (service-public, vérifié le 17/02/2026). */
export function impotSocietes(resultat, { tauxReduit = false } = {}, H) {
  const is = H.impot_societes;
  if (!(resultat > 0)) return 0;
  if (!tauxReduit) return resultat * is.taux_normal;
  const tranche = Math.min(resultat, is.plafond_taux_reduit);
  return tranche * is.taux_reduit + (resultat - tranche) * is.taux_normal;
}

/**
 * CMPC = E/(D+E) × kₑ + D/(D+E) × k_d × (1 − t), avec kₑ = taux sans risque + bêta endetté × prime de risque + prime de taille
 * et bêta endetté = bêta désendetté × (1 + (1 − t) × D/E) (structure cible = ratio D/E du secteur, Damodaran).
 */
export function cmpc({ primeTaille, secteur, detteSurCapitaux = null }, H) {
  const b = H.betas.secteurs[secteur];
  const manquant = [];
  if (!b) manquant.push("bêta du secteur");
  if (!Number.isFinite(primeTaille)) manquant.push("prime de taille");
  if (!Number.isFinite(H.taux_sans_risque.valeur)) manquant.push("taux sans risque");
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
 * DCF simplifié sur 5 ans (convention de fin d'année).
 * Flux = EBIT − IS(EBIT) + amortissements − investissements − variation du BFR ; EBIT = EBE − amortissements.
 * Valeur terminale (Gordon-Shapiro) = flux an 5 × (1 + g) / (CMPC − g). Erreur si CMPC ≤ g.
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

// ---------------------------------------------------------------- ANCC, décotes
/** ANCC = capitaux propres + plus-values latentes − frais d'établissement − créances douteuses (valeur des titres). */
export function ancc(ex, c = {}) {
  const lignes = [
    { cle: "capitaux_propres", libelle: "Capitaux propres", montant: n(ex.capitaux_propres) },
    { cle: "plus_values", libelle: "Plus-values latentes déclarées (immobilier, fonds)", montant: n(c.plus_values_latentes) },
    { cle: "frais_etablissement", libelle: "Frais d'établissement (sans valeur)", montant: -n(c.frais_etablissement) },
    { cle: "creances_douteuses", libelle: "Créances douteuses", montant: -n(c.creances_douteuses) },
  ];
  return { valeur: lignes.reduce((a, l) => a + l.montant, 0), lignes };
}
/** Décotes et primes : pourcentages additionnés → facteur multiplicatif appliqué aux valeurs d'entreprise. */
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
 * @param H hypothèses (hypotheses.json, éventuellement modifiées par le dirigeant)
 */
export function valorisationApprofondie(e, H, table = MULTIPLES) {
  const alertes = [];
  const exs = [...(e.exercices || [])].sort((a, b) => a.annee - b.annee).slice(-3);
  const annees = exs.map((x) => x.annee);
  if (annees.some((a, i) => i > 0 && a - annees[i - 1] !== 1)) alertes.push("Exercices non consécutifs : les moyennes portent sur les exercices disponibles.");
  if (!exs.length) return { statut: "chiffres_absents", annees, alertes: ["Aucun exercice validé."] };
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

  // Méthode 1 : multiples
  const secteurM = table.secteurs.find((s) => s.cle === e.secteur);
  let multiples;
  if (!(ebeN.valeur > 0)) {
    multiples = { statut: "non_applicable" };
    alertes.push("EBE normatif négatif ou nul : la méthode des multiples d'EBE ne s'applique pas.");
  } else if (![secteurM?.ebe?.bas, secteurM?.ebe?.central, secteurM?.ebe?.haut].every(Number.isFinite)) {
    multiples = { statut: "a_completer" };
    alertes.push("Multiples du secteur à compléter.");
  } else {
    const m = secteurM.ebe;
    const ve = { bas: ebeN.valeur * m.bas, central: ebeN.valeur * m.central, haut: ebeN.valeur * m.haut };
    multiples = { statut: "ok", multiples: m, source: secteurM.source, ve, titres: { bas: versTitres(ve.bas), central: versTitres(ve.central), haut: versTitres(ve.haut) } };
  }

  // Méthode 2 : DCF
  const p = e.previsions || {};
  const caD = n(dernier.chiffre_affaires);
  const hist = croissanceHistorique(exs);
  const amortHist = moyenne(exs.filter((x) => n(x.chiffre_affaires) > 0 && Number.isFinite(x.dotations_amortissements)).map((x) => x.dotations_amortissements / x.chiffre_affaires));
  const hyp = {
    croissance: Number.isFinite(p.croissance) ? { valeur: p.croissance, origine: "dirigeant" } : { valeur: hist == null ? 0 : Math.min(0.1, Math.max(-0.05, hist)), origine: hist == null ? "par défaut (0 %, un seul exercice)" : "historique du CA (borné entre −5 % et +10 %)" },
    marge_ebe: Number.isFinite(p.marge_ebe) ? { valeur: p.marge_ebe, origine: "dirigeant" } : { valeur: caD > 0 ? ebeN.valeur / caD : 0, origine: "EBE normatif / dernier CA" },
    amortissements_pct: Number.isFinite(p.amortissements_pct) ? { valeur: p.amortissements_pct, origine: "dirigeant" } : { valeur: amortHist ?? 0, origine: amortHist == null ? "à compléter (0 %)" : "moyenne historique des dotations / CA" },
    investissements_pct: Number.isFinite(p.investissements_pct) ? { valeur: p.investissements_pct, origine: "dirigeant" } : { valeur: amortHist ?? 0, origine: "égal aux amortissements (investissement de maintien)" },
    bfr_jours: Number.isFinite(p.bfr_jours) ? { valeur: p.bfr_jours, origine: "dirigeant" } : { valeur: bfrN.jours ?? 0, origine: "BFR normatif historique" },
    croissance_terminale: { valeur: Number.isFinite(p.croissance_terminale) ? p.croissance_terminale : H.croissance_terminale.valeur, origine: Number.isFinite(p.croissance_terminale) ? "dirigeant" : "objectif d'inflation BCE" },
  };
  const c = cmpc({ primeTaille: e.primeTaille, secteur: e.secteur, detteSurCapitaux: e.detteSurCapitaux }, H);
  let dcfR;
  if (c.statut !== "ok") {
    dcfR = { statut: "a_completer", manquant: c.manquant, hypotheses: hyp };
    if (!(c.manquant.length === 1 && c.manquant[0] === "prime de taille")) alertes.push(`DCF à compléter : ${c.manquant.join(", ")}.`);
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
      try { haut = calc(c.valeur - 0.01); } catch { /* CMPC − 1 pt ≤ g */ }
      dcfR = {
        statut: "ok", cmpc: c, hypotheses: hyp, detail: central, ve: { bas: bas.ve, central: central.ve, haut: haut?.ve ?? null },
        titres: { bas: versTitres(bas.ve), central: versTitres(central.ve), haut: haut ? versTitres(haut.ve) : null },
      };
      if (central.part_vt > 0.8) alertes.push("La valeur terminale représente plus de 80 % du DCF : résultat très sensible aux hypothèses de long terme.");
    } catch (err) {
      dcfR = { statut: "erreur", message: err.message, hypotheses: hyp, cmpc: c };
      alertes.push(err.message);
    }
  }

  // Méthode 3 : ANCC (plancher, présenté à part)
  const anc = ancc(dernier, e.complements || {});
  if (anc.valeur < 0) alertes.push("Capitaux propres corrigés négatifs.");

  // Synthèse : 60 / 40 par défaut, multiples seuls si le DCF manque, DCF seul si les multiples ne s'appliquent pas
  let poids = { ...(e.ponderation || { multiples: H.ponderation.multiples, dcf: H.ponderation.dcf }) };
  const okM = multiples.statut === "ok", okD = dcfR.statut === "ok";
  if (okM && !okD) { poids = { multiples: 1, dcf: 0 }; alertes.push("Synthèse sur les multiples. Le DCF est proposé en option : renseignez la prime de taille dans « Affiner » si votre conseil le souhaite."); }
  if (!okM && okD) poids = { multiples: 0, dcf: 1 };
  const comb = (cle) => {
    if (!okM && !okD) return null;
    const m = okM ? multiples.titres[cle] : 0;
    const d = okD ? (dcfR.titres[cle] ?? dcfR.titres.central) : 0;
    return poids.multiples * m + poids.dcf * d;
  };
  const synthese = { bas: comb("bas"), central: comb("central"), haut: comb("haut"), ponderation: poids, plancher_ancc: anc.valeur, alertes };
  if (synthese.central != null && synthese.central < anc.valeur) alertes.push("La valeur centrale est inférieure à l'actif net corrigé : l'ANCC sert de plancher de négociation.");

  // Sensibilités : multiple ± 1x, CMPC ± 1 pt, croissance terminale ± 0,5 pt (valeur des titres)
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
