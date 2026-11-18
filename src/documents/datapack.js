// Datapack Excel de la valorisation : 9 onglets, formules vivantes qui reproduisent le moteur (approfondie.js).
// Cellules jaunes = hypothèses modifiables ; tout le reste se recalcule dans Excel. Les tests vérifient que les
// formules redonnent exactement les chiffres du moteur (test/datapack.test.js).
import { creerClasseur, S } from "./xlsx.js";
import { CHAMPS } from "../../public/js/champs-financiers.js";

const ONGLETS = [
  ["Couverture", "Identité, sommaire, avertissements"],
  ["Comptes", "Comptes de résultat et bilans validés, EBE et BFR calculés"],
  ["Retraitements", "Pont de l'EBE comptable à l'EBE normatif"],
  ["Hypothèses", "Paramètres sourcés et datés, modifiables (cellules jaunes)"],
  ["Passage aux titres", "Dette nette, BFR normatif, actifs hors exploitation"],
  ["Multiples", "Méthode 1 : multiples d'EBE"],
  ["DCF", "Méthode 2 : flux de trésorerie actualisés sur 5 ans"],
  ["ANCC", "Méthode 3 : actif net comptable corrigé (plancher)"],
  ["Synthèse", "Fourchettes, pondération, sensibilités"],
];

export function construireDatapack({ entreprise, entree, H, resultat, genereLe = new Date() }) {
  const wb = creerClasseur();
  const annees = resultat.annees;
  const nA = annees.length;
  const ex = Object.fromEntries(entree.exercices.map((e) => [e.annee, e]));
  const dateTxt = genereLe.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // ------------------------------------------------------------ 1. Couverture
  const cv = wb.feuille("Couverture", { largeurs: [30, 70] });
  cv.ecrire(0, 0, "Passation", S.sousTitre);
  cv.ecrire(2, 0, entreprise.nom || "Entreprise", S.titre);
  cv.ecrire(3, 0, `SIREN ${String(entreprise.siren || "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}${entreprise.ville ? ` · ${entreprise.ville}` : ""}`);
  cv.ecrire(4, 0, `Datapack de valorisation · généré le ${dateTxt}`);
  cv.ecrire(6, 0, "STRICTEMENT CONFIDENTIEL", S.confidentiel);
  cv.ecrire(8, 0, "Sommaire", S.gras);
  ONGLETS.forEach(([nom, desc], i) => { cv.ecrire(9 + i, 0, nom); cv.ecrire(9 + i, 1, desc, S.petit); });
  cv.ecrire(19, 0, "Lecture", S.gras);
  cv.ecrire(20, 0, "Cellules jaunes", S.saisieTexte); cv.ecrire(20, 1, "Hypothèses et saisies modifiables : toute modification se répercute dans les onglets suivants.");
  cv.ecrire(21, 0, "Montants", S.normal); cv.ecrire(21, 1, "En euros. Chiffres validés par le dirigeant dans Passation.");
  cv.ecrire(23, 0, "Avertissement", S.gras);
  cv.ecrire(24, 0, "Estimation indicative, non contractuelle. Elle ne remplace pas l'avis d'un expert-comptable, d'un avocat ou d'un conseil en cession. Les hypothèses Passation sont sourcées et datées dans l'onglet « Hypothèses ».", S.petit);

  // ------------------------------------------------------------ 2. Comptes
  const cp = wb.feuille("Comptes", { largeurs: [40, ...annees.map(() => 16), 60] });
  const colA = (i) => 1 + i;                      // colonne de l'année i
  const dernier = colA(nA - 1);
  cp.ecrire(0, 0, "Comptes validés", S.titre);
  cp.ecrire(2, 0, "Poste", S.entete); annees.forEach((a, i) => cp.ecrire(2, colA(i), a, S.entete)); cp.ecrire(2, nA + 1, "Où le trouver", S.entete);
  const ligne = {};
  let r = 3;
  for (const [groupe, titre] of [["resultat", "Compte de résultat"], ["bilan", "Bilan"]]) {
    cp.ecrire(r++, 0, titre, S.gras);
    for (const c of CHAMPS.filter((x) => x.groupe === groupe)) {
      ligne[c.cle] = r;
      cp.ecrire(r, 0, c.libelle);
      annees.forEach((a, i) => { const v = ex[a]?.[c.cle]; cp.ecrire(r, colA(i), Number.isFinite(v) ? v : null, S.euros); });
      cp.ecrire(r, nA + 1, c.aide, S.petit);
      r++;
    }
    r++;
  }
  cp.ecrire(r++, 0, "Agrégats calculés", S.gras);
  const L = (cle, i) => cp.ref(ligne[cle], colA(i));
  const rEbe = r++, rBfr = r++, rJours = r++;
  cp.ecrire(rEbe, 0, "EBE (calculé)", S.gras);
  cp.ecrire(rBfr, 0, "BFR d'exploitation (stocks + clients − fournisseurs − dettes fiscales et sociales)");
  cp.ecrire(rJours, 0, "BFR en jours de chiffre d'affaires");
  annees.forEach((_, i) => {
    // Même règle que le moteur (approfondie.js, ebe) : détail complet des trois charges obligatoires, sinon EBE publié,
    // sinon « Non déterminable » (jamais de charge manquante comptée à zéro).
    const det = ["achats_consommes", "charges_externes", "charges_personnel"].map((k) => L(k, i)).join(",");
    cp.ecrire(rEbe, colA(i), { f: `IF(AND(ISNUMBER(${L("chiffre_affaires", i)}),COUNT(${det})=3),${L("chiffre_affaires", i)}+${L("autres_produits", i)}-${L("achats_consommes", i)}-${L("charges_externes", i)}-${L("impots_taxes", i)}-${L("charges_personnel", i)},IF(ISNUMBER(${L("ebe", i)}),${L("ebe", i)},"Non déterminable"))`, s: S.eurosGras });
    cp.ecrire(rBfr, colA(i), { f: `${L("stocks", i)}+${L("creances_clients", i)}-${L("dettes_fournisseurs", i)}-${L("dettes_fiscales_sociales", i)}`, s: S.euros });
    cp.ecrire(rJours, colA(i), { f: `IF(${L("chiffre_affaires", i)}>0,${cp.ref(rBfr, colA(i))}/${L("chiffre_affaires", i)}*365,"")`, s: S.nombre });
  });
  const CPx = (rr, i) => `'Comptes'!${cp.ref(rr, colA(i))}`;

  // ------------------------------------------------------------ 4. Hypothèses (avant les onglets qui les lisent)
  const hy = wb.feuille("Hypothèses", { largeurs: [46, 14, 70, 14] });
  hy.ecrire(0, 0, "Hypothèses", S.titre);
  hy.ecrire(1, 0, "Cellules jaunes modifiables. Sources Passation datées ; « À compléter » = aucune source publique vérifiée.", S.petit);
  hy.ecrire(3, 0, "Paramètre", S.entete); hy.ecrire(3, 1, "Valeur", S.entete); hy.ecrire(3, 2, "Source", S.entete); hy.ecrire(3, 3, "Date", S.entete);
  const hyp = {};
  let h = 4;
  const param = (cle, libelle, valeur, style, source = "", date = "") => {
    hyp[cle] = `'Hypothèses'!${hy.ref(h, 1, true)}`;
    hy.ecrire(h, 0, libelle); hy.ecrire(h, 1, valeur ?? null, style); hy.ecrire(h, 2, source, S.petit); hy.ecrire(h, 3, date, S.petit);
    h++;
  };
  const d = resultat.dcf, hd = d.hypotheses || {};
  const betaS = H.betas.secteurs[entree.secteur];
  hy.ecrire(h++, 0, "Coût du capital", S.gras);
  param("rf", H.taux_sans_risque.libelle, H.taux_sans_risque.valeur, S.saisiePct, H.taux_sans_risque.source, H.taux_sans_risque.date);
  param("erp", H.prime_risque_marche.libelle, H.prime_risque_marche.valeur, S.saisiePct, H.prime_risque_marche.source, H.prime_risque_marche.date);
  param("prime", H.prime_taille.libelle, entree.primeTaille, S.saisiePct, Number.isFinite(entree.primeTaille) ? "Réglage du dirigeant" : "À compléter : aucune source publique gratuite vérifiée", "");
  param("bu", `Bêta désendetté du secteur (${betaS?.industrie_damodaran ?? "à compléter"})`, betaS?.beta_desendette ?? null, S.saisieNombre, H.betas.source, H.betas.date);
  param("de", "Ratio dette / capitaux propres cible (secteur)", Number.isFinite(entree.detteSurCapitaux) ? entree.detteSurCapitaux : betaS?.dette_sur_capitaux ?? null, S.saisieNombre, H.betas.source, H.betas.date);
  param("kd", H.cout_dette_avant_impot.libelle, H.cout_dette_avant_impot.valeur, S.saisiePct, H.cout_dette_avant_impot.source, H.cout_dette_avant_impot.date);
  h++; hy.ecrire(h++, 0, "Impôt sur les sociétés", S.gras);
  param("tn", "Taux normal", H.impot_societes.taux_normal, S.saisiePct, H.impot_societes.source, H.impot_societes.date);
  param("tr", "Taux réduit PME", H.impot_societes.taux_reduit, S.saisiePct, H.impot_societes.source, H.impot_societes.date);
  param("plaf", "Plafond du taux réduit (€)", H.impot_societes.plafond_taux_reduit, S.saisieEuros, H.impot_societes.conditions_taux_reduit, "");
  param("elig", "Taux réduit applicable (1 = oui, 0 = non)", entree.tauxReduit ? 1 : 0, S.saisieNombre, "Réponse du dirigeant (capital détenu à 75 % par des personnes physiques)", "");
  h++; hy.ecrire(h++, 0, "Prévisions (DCF)", S.gras);
  param("g", "Croissance à l'infini", hd.croissance_terminale?.valeur ?? H.croissance_terminale.valeur, S.saisiePct, hd.croissance_terminale?.origine === "dirigeant" ? "Réglage du dirigeant" : H.croissance_terminale.source, H.croissance_terminale.date);
  param("gca", "Croissance annuelle du chiffre d'affaires", hd.croissance?.valeur ?? 0, S.saisiePct, hd.croissance?.origine ?? "", "");
  param("marge", "Marge d'EBE", hd.marge_ebe?.valeur ?? 0, S.saisiePct, hd.marge_ebe?.origine ?? "", "");
  param("amort", "Amortissements / CA", hd.amortissements_pct?.valeur ?? 0, S.saisiePct, hd.amortissements_pct?.origine ?? "", "");
  param("invest", "Investissements / CA", hd.investissements_pct?.valeur ?? 0, S.saisiePct, hd.investissements_pct?.origine ?? "", "");
  param("jours", "BFR en jours de CA", hd.bfr_jours?.valeur ?? 0, S.saisieNombre, hd.bfr_jours?.origine ?? "", "");
  h++; hy.ecrire(h++, 0, "Multiples et synthèse", S.gras);
  const mult = resultat.multiples.multiples || {};
  param("mb", "Multiple d'EBE bas", mult.bas ?? null, S.saisieNombre, "Croisement de trois sources (src/data/multiples-sources.json)", "");
  param("mc", "Multiple d'EBE central", mult.central ?? null, S.saisieNombre, "", "");
  param("mh", "Multiple d'EBE haut", mult.haut ?? null, S.saisieNombre, "", "");
  param("poids", "Poids des multiples dans la synthèse (le DCF a le complément)", entree.ponderation?.multiples ?? H.ponderation.multiples, S.saisiePct, H.ponderation.note, "");
  param("mode", "EBE normatif : « moyenne » ou « dernier »", entree.modeEbe === "dernier" ? "dernier" : "moyenne", S.saisieTexte, "Réglage du dirigeant", "");
  h++; hy.ecrire(h++, 0, "Décotes et primes", S.gras);
  hy.ecrire(h, 0, "Facteur", S.entete); hy.ecrire(h, 1, "%", S.entete); hy.ecrire(h, 2, "Justification", S.entete); h++;
  const debutDec = h;
  for (const f of H.decotes_primes.facteurs) {
    const x = (entree.decotes || []).find((y) => y.cle === f.cle);
    hy.ecrire(h, 0, f.libelle); hy.ecrire(h, 1, x?.pct ?? 0, S.saisiePct); hy.ecrire(h, 2, x?.justification || "", S.saisieTexte); h++;
  }
  hyp.facteur = `'Hypothèses'!${hy.ref(h, 1, true)}`;
  hy.ecrire(h, 0, "Facteur appliqué aux valeurs d'entreprise (1 + somme)", S.gras);
  hy.ecrire(h, 1, { f: `1+SUM(${hy.ref(debutDec, 1)}:${hy.ref(h - 1, 1)})`, s: S.nombre });
  h += 2;
  hy.ecrire(h++, 0, "Sources", S.gras);
  for (const k of ["taux_sans_risque", "prime_risque_marche", "cout_dette_avant_impot", "impot_societes", "croissance_terminale", "betas"]) { hy.ecrire(h, 0, H[k].source, S.petit); hy.ecrire(h, 2, H[k].url || "", S.petit); h++; }

  // ------------------------------------------------------------ 3. Retraitements
  const rt = wb.feuille("Retraitements", { largeurs: [46, ...annees.map(() => 16), 40] });
  const rr = entree.retraitements || {};
  rt.ecrire(0, 0, "Pont de l'EBE comptable à l'EBE normatif", S.titre);
  rt.ecrire(2, 0, "Rémunération réelle du dirigeant (charges comprises)"); rt.ecrire(2, 1, rr.remuneration_dirigeant_reelle ?? null, S.saisieEuros);
  rt.ecrire(3, 0, "Rémunération normative d'un directeur salarié"); rt.ecrire(3, 1, rr.remuneration_normative ?? null, S.saisieEuros);
  rt.ecrire(4, 0, "Loyer payé (locaux du dirigeant ou d'une SCI)"); rt.ecrire(4, 1, rr.loyer_paye ?? null, S.saisieEuros);
  rt.ecrire(5, 0, "Loyer de marché"); rt.ecrire(5, 1, rr.loyer_marche ?? null, S.saisieEuros);
  rt.ecrire(7, 0, "Éléments exceptionnels", S.gras);
  rt.ecrire(8, 0, "Libellé", S.entete); rt.ecrire(8, 1, "Exercice", S.entete); rt.ecrire(8, 2, "Montant", S.entete); rt.ecrire(8, 3, "Justification", S.entete);
  const exc = rr.exceptionnels || [];
  const lignesExc = Math.max(exc.length, 3);
  for (let i = 0; i < lignesExc; i++) {
    const e = exc[i];
    rt.ecrire(9 + i, 0, e?.libelle ?? "", S.saisieTexte); rt.ecrire(9 + i, 1, e?.annee ?? null, S.saisieNombre); rt.ecrire(9 + i, 2, e?.montant ?? null, S.saisieEuros); rt.ecrire(9 + i, 3, e?.justification ?? "", S.saisieTexte);
  }
  const p0 = 9 + lignesExc + 1;
  rt.ecrire(p0, 0, "Pont", S.entete); annees.forEach((a, i) => rt.ecrire(p0, colA(i), a, S.entete));
  const [pE, pD, pL, pX, pR] = [p0 + 1, p0 + 2, p0 + 3, p0 + 4, p0 + 5];
  rt.ecrire(pE, 0, "EBE comptable"); rt.ecrire(pD, 0, "Rémunération du dirigeant ramenée à la normale"); rt.ecrire(pL, 0, "Loyer ramené au prix de marché"); rt.ecrire(pX, 0, "Éléments exceptionnels"); rt.ecrire(pR, 0, "EBE retraité", S.gras);
  annees.forEach((a, i) => {
    const c = colA(i);
    rt.ecrire(pE, c, { f: CPx(rEbe, i), s: S.euros });
    rt.ecrire(pD, c, { f: "IF(AND(ISNUMBER($B$3),ISNUMBER($B$4)),$B$3-$B$4,0)", s: S.euros });
    rt.ecrire(pL, c, { f: "IF(AND(ISNUMBER($B$5),ISNUMBER($B$6)),$B$5-$B$6,0)", s: S.euros });
    const somme = Array.from({ length: lignesExc }, (_, k) => `IF(AND(ISNUMBER($B$${10 + k}),ISNUMBER($C$${10 + k})),IF($B$${10 + k}=${rt.ref(p0, c)},$C$${10 + k},0),0)`).join("+");
    rt.ecrire(pX, c, { f: somme, s: S.euros });
    rt.ecrire(pR, c, { f: `SUM(${rt.ref(pE, c)}:${rt.ref(pX, c)})`, s: S.eurosGras });
  });
  const pN = pR + 2;
  rt.ecrire(pN, 0, "EBE normatif", S.gras);
  rt.ecrire(pN, 1, { f: `IF(${hyp.mode}="dernier",${rt.ref(pR, dernier)},AVERAGE(${rt.ref(pR, colA(0))}:${rt.ref(pR, dernier)}))`, s: S.eurosTotal });
  const ebeN = `'Retraitements'!${rt.ref(pN, 1, true)}`;

  // ------------------------------------------------------------ 5. Passage aux titres
  const pt = wb.feuille("Passage aux titres", { largeurs: [52, 16, 50] });
  const co = entree.complements || {};
  pt.ecrire(0, 0, "Dette nette, BFR et actifs hors exploitation", S.titre);
  pt.ecrire(1, 0, `Dernier exercice : ${annees.at(-1)}`, S.petit);
  pt.ecrire(3, 0, "Dette nette", S.entete); pt.ecrire(3, 1, "Montant", S.entete);
  const dn = [
    ["Emprunts et dettes financières", { f: CPx(ligne.emprunts, nA - 1), s: S.euros }],
    ["Crédit-bail restant dû", co.credit_bail_restant ?? 0, S.saisieEuros],
    ["Comptes courants d'associés remboursables", co.comptes_courants_remboursables ?? 0, S.saisieEuros],
    ["Provisions pour risques", { f: CPx(ligne.provisions_risques, nA - 1), s: S.euros }],
    ["Dividendes votés non versés", co.dividendes_a_verser ?? 0, S.saisieEuros],
    ["Trésorerie (en moins)", { f: `-${CPx(ligne.tresorerie, nA - 1)}`, s: S.euros }],
    ["Placements (en moins)", { f: `-${CPx(ligne.placements, nA - 1)}`, s: S.euros }],
  ];
  dn.forEach(([lib, v, s], i) => { pt.ecrire(4 + i, 0, lib); pt.ecrire(4 + i, 1, v, s ?? S.euros); });
  pt.ecrire(11, 0, "Dette nette (négative = trésorerie nette)", S.gras); pt.ecrire(11, 1, { f: "SUM(B5:B11)", s: S.eurosTotal });
  pt.ecrire(13, 0, "BFR", S.entete); pt.ecrire(13, 1, "Montant", S.entete);
  pt.ecrire(14, 0, "BFR réel du dernier exercice"); pt.ecrire(14, 1, { f: CPx(rBfr, nA - 1), s: S.euros });
  pt.ecrire(15, 0, "BFR normatif en jours (moyenne des exercices)"); pt.ecrire(15, 1, { f: `AVERAGE('Comptes'!${cp.ref(rJours, colA(0))}:${cp.ref(rJours, dernier)})`, s: S.nombre });
  pt.ecrire(16, 0, "BFR normatif (jours × dernier CA / 365)"); pt.ecrire(16, 1, { f: `B16/365*${CPx(ligne.chiffre_affaires, nA - 1)}`, s: S.euros });
  pt.ecrire(17, 0, "Écart de BFR (réel − normatif)", S.gras); pt.ecrire(17, 1, { f: "B15-B17", s: S.eurosGras });
  pt.ecrire(19, 0, "Actifs hors exploitation"); pt.ecrire(19, 1, co.actifs_hors_exploitation ?? 0, S.saisieEuros);
  pt.ecrire(21, 0, "Passage VE → titres = VE × facteur de décotes − dette nette + écart de BFR + actifs hors exploitation", S.petit);
  const DN = "'Passage aux titres'!$B$12", ECART = "'Passage aux titres'!$B$18", HORS = "'Passage aux titres'!$B$20";
  const versTitres = (ve) => `${ve}*${hyp.facteur}-${DN}+${ECART}+${HORS}`;

  // ------------------------------------------------------------ 6. Multiples
  const mu = wb.feuille("Multiples", { largeurs: [40, 16, 16, 16] });
  mu.ecrire(0, 0, "Méthode 1 : multiples d'EBE", S.titre);
  mu.ecrire(2, 0, "EBE normatif"); mu.ecrire(2, 1, { f: ebeN, s: S.eurosGras });
  mu.ecrire(4, 0, "", S.entete); mu.ecrire(4, 1, "Basse", S.entete); mu.ecrire(4, 2, "Centrale", S.entete); mu.ecrire(4, 3, "Haute", S.entete);
  mu.ecrire(5, 0, "Multiple d'EBE");
  mu.ecrire(6, 0, "Valeur d'entreprise");
  mu.ecrire(7, 0, "Valeur des titres", S.gras);
  [["mb", 1], ["mc", 2], ["mh", 3]].forEach(([k, c]) => {
    mu.ecrire(5, c, { f: hyp[k], s: S.nombre });
    mu.ecrire(6, c, { f: `IF($B$3>0,$B$3*${mu.ref(5, c)},"Non applicable")`, s: S.euros });
    mu.ecrire(7, c, { f: `IF(ISNUMBER(${mu.ref(6, c)}),${versTitres(mu.ref(6, c))},"Non applicable")`, s: S.eurosTotal });
  });

  // ------------------------------------------------------------ 7. DCF
  const dc = wb.feuille("DCF", { largeurs: [40, 15, 15, 15, 15, 15, 15] });
  dc.ecrire(0, 0, "Méthode 2 : DCF sur 5 ans (convention de fin d'année)", S.titre);
  dc.ecrire(2, 0, "Coût du capital", S.entete); dc.ecrire(2, 1, "Valeur", S.entete);
  const cmpcL = [
    ["Bêta endetté = bêta désendetté × (1 + (1 − IS) × D/E)", `${hyp.bu}*(1+(1-${hyp.tn})*${hyp.de})`, S.nombre],
    ["Coût des fonds propres = taux sans risque + bêta × prime + prime de taille", `${hyp.rf}+B4*${hyp.erp}+${hyp.prime}`, S.pct2],
    ["Part de la dette = D/E / (1 + D/E)", `${hyp.de}/(1+${hyp.de})`, S.pct2],
    ["Coût de la dette après impôt", `${hyp.kd}*(1-${hyp.tn})`, S.pct2],
    ["CMPC", `IF(AND(ISNUMBER(${hyp.prime}),ISNUMBER(${hyp.bu})),(1-B6)*B5+B6*B7,"À compléter")`, S.pct2],
  ];
  cmpcL.forEach(([lib, f, s], i) => { dc.ecrire(3 + i, 0, lib, i === 4 ? S.gras : S.normal); dc.ecrire(3 + i, 1, { f, s }); });
  const K = "$B$8", G = hyp.g;
  dc.ecrire(9, 0, "Projection", S.entete); dc.ecrire(9, 1, "An 0", S.entete);
  for (let t = 1; t <= 5; t++) dc.ecrire(9, 1 + t, `An ${t}`, S.entete);
  const R = { t: 10, ca: 11, ebe: 12, da: 13, ebit: 14, is: 15, inv: 16, bfr: 17, dbfr: 18, flux: 19, fa: 20, act: 21 };
  const libs = { t: "Année", ca: "Chiffre d'affaires", ebe: "EBE", da: "Amortissements", ebit: "Résultat d'exploitation (EBIT)", is: "Impôt sur l'EBIT", inv: "Investissements", bfr: "BFR", dbfr: "Variation du BFR", flux: "Flux disponible", fa: "Facteur d'actualisation", act: "Flux actualisé" };
  for (const [k, row] of Object.entries(R)) dc.ecrire(row, 0, libs[k], k === "flux" ? S.gras : S.normal);
  dc.ecrire(R.ca, 1, { f: CPx(ligne.chiffre_affaires, nA - 1), s: S.euros });
  dc.ecrire(R.bfr, 1, { f: `${hyp.jours}/365*B12`, s: S.euros });
  for (let t = 1; t <= 5; t++) {
    const c = 1 + t, p = dc.ref(0, c).replace(/\d+/, ""), q = dc.ref(0, c - 1).replace(/\d+/, "");
    const at = (row) => `${p}${row + 1}`, av = (row) => `${q}${row + 1}`;
    dc.ecrire(R.t, c, t);
    dc.ecrire(R.ca, c, { f: `${av(R.ca)}*(1+${hyp.gca})`, s: S.euros });
    dc.ecrire(R.ebe, c, { f: `${at(R.ca)}*${hyp.marge}`, s: S.euros });
    dc.ecrire(R.da, c, { f: `${at(R.ca)}*${hyp.amort}`, s: S.euros });
    dc.ecrire(R.ebit, c, { f: `${at(R.ebe)}-${at(R.da)}`, s: S.euros });
    dc.ecrire(R.is, c, { f: `IF(${at(R.ebit)}<=0,0,IF(AND(${hyp.elig}=1,${at(R.ca)}<=10000000),MIN(${at(R.ebit)},${hyp.plaf})*${hyp.tr}+MAX(${at(R.ebit)}-${hyp.plaf},0)*${hyp.tn},${at(R.ebit)}*${hyp.tn}))`, s: S.euros });
    dc.ecrire(R.inv, c, { f: `${at(R.ca)}*${hyp.invest}`, s: S.euros });
    dc.ecrire(R.bfr, c, { f: `${hyp.jours}/365*${at(R.ca)}`, s: S.euros });
    dc.ecrire(R.dbfr, c, { f: `${at(R.bfr)}-${av(R.bfr)}`, s: S.euros });
    dc.ecrire(R.flux, c, { f: `${at(R.ebit)}-${at(R.is)}+${at(R.da)}-${at(R.inv)}-${at(R.dbfr)}`, s: S.eurosGras });
    dc.ecrire(R.fa, c, { f: `IF(ISNUMBER(${K}),1/(1+${K})^${at(R.t)},"")`, s: S.nombre });
    dc.ecrire(R.act, c, { f: `IF(ISNUMBER(${K}),${at(R.flux)}*${at(R.fa)},"")`, s: S.euros });
  }
  const F = (t) => `${dc.ref(R.flux, 1 + t)}`;
  const veA = (k, g) => `${[1, 2, 3, 4, 5].map((t) => `${F(t)}/(1+${k})^${t}`).join("+")}+${F(5)}*(1+${g})/(${k}-${g})/(1+${k})^5`;
  dc.ecrire(23, 0, "Valeur terminale (Gordon-Shapiro) = flux an 5 × (1 + g) / (CMPC − g)"); dc.ecrire(23, 1, { f: `IF(ISNUMBER(${K}),IF(${K}>${G},${F(5)}*(1+${G})/(${K}-${G}),"CMPC ≤ g"),"À compléter")`, s: S.euros });
  dc.ecrire(24, 0, "Valeur terminale actualisée"); dc.ecrire(24, 1, { f: `IF(ISNUMBER(B24),B24/(1+${K})^5,"")`, s: S.euros });
  dc.ecrire(25, 0, "Somme des flux actualisés"); dc.ecrire(25, 1, { f: `IF(ISNUMBER(${K}),SUM(C22:G22),"")`, s: S.euros });
  dc.ecrire(26, 0, "Valeur d'entreprise (DCF)", S.gras); dc.ecrire(26, 1, { f: `IF(AND(ISNUMBER(B25),ISNUMBER(B26)),B25+B26,"À compléter")`, s: S.eurosGras });
  dc.ecrire(28, 0, "", S.entete); dc.ecrire(28, 1, "CMPC + 1 pt", S.entete); dc.ecrire(28, 2, "CMPC", S.entete); dc.ecrire(28, 3, "CMPC − 1 pt", S.entete);
  dc.ecrire(29, 0, "Valeur d'entreprise");
  dc.ecrire(29, 1, { f: `IF(ISNUMBER(B27),${veA(`(${K}+0.01)`, G)},"")`, s: S.euros });
  dc.ecrire(29, 2, { f: "B27", s: S.euros });
  dc.ecrire(29, 3, { f: `IF(ISNUMBER(B27),IF(${K}-0.01>${G},${veA(`(${K}-0.01)`, G)},""),"")`, s: S.euros });
  dc.ecrire(30, 0, "Valeur des titres", S.gras);
  for (const c of [1, 2, 3]) dc.ecrire(30, c, { f: `IF(ISNUMBER(${dc.ref(29, c)}),${versTitres(dc.ref(29, c))},"")`, s: S.eurosTotal });
  dc.ecrire(32, 0, "Sensibilité à la croissance à l'infini (titres)", S.entete); dc.ecrire(32, 1, "g − 0,5 pt", S.entete); dc.ecrire(32, 2, "g", S.entete); dc.ecrire(32, 3, "g + 0,5 pt", S.entete);
  dc.ecrire(33, 0, "Valeur des titres");
  dc.ecrire(33, 1, { f: `IF(ISNUMBER(B27),IF(${K}>${G}-0.005,${versTitres(`(${veA(K, `(${G}-0.005)`)})`)},""),"")`, s: S.euros });
  dc.ecrire(33, 2, { f: "C31", s: S.euros });
  dc.ecrire(33, 3, { f: `IF(ISNUMBER(B27),IF(${K}>${G}+0.005,${versTitres(`(${veA(K, `(${G}+0.005)`)})`)},""),"")`, s: S.euros });

  // ------------------------------------------------------------ 8. ANCC
  const an = wb.feuille("ANCC", { largeurs: [52, 16] });
  an.ecrire(0, 0, "Méthode 3 : actif net comptable corrigé", S.titre);
  an.ecrire(1, 0, "Présenté à part, comme plancher de négociation.", S.petit);
  an.ecrire(3, 0, "Capitaux propres"); an.ecrire(3, 1, { f: CPx(ligne.capitaux_propres, nA - 1), s: S.euros });
  an.ecrire(4, 0, "Plus-values latentes justifiées (immobilier, fonds)"); an.ecrire(4, 1, co.plus_values_latentes ?? 0, S.saisieEuros);
  an.ecrire(5, 0, "Frais d'établissement (sans valeur, en moins)"); an.ecrire(5, 1, co.frais_etablissement ?? 0, S.saisieEuros);
  an.ecrire(6, 0, "Créances douteuses (en moins)"); an.ecrire(6, 1, co.creances_douteuses ?? 0, S.saisieEuros);
  an.ecrire(7, 0, "Actif net comptable corrigé", S.gras); an.ecrire(7, 1, { f: "B4+B5-B6-B7", s: S.eurosTotal });

  // ------------------------------------------------------------ 9. Synthèse
  const sy = wb.feuille("Synthèse", { largeurs: [44, 16, 16, 16] });
  sy.ecrire(0, 0, "Synthèse : valeur des titres", S.titre);
  sy.ecrire(2, 0, "Méthode", S.entete); sy.ecrire(2, 1, "Basse", S.entete); sy.ecrire(2, 2, "Centrale", S.entete); sy.ecrire(2, 3, "Haute", S.entete);
  sy.ecrire(3, 0, "Multiples d'EBE"); ["B8", "C8", "D8"].forEach((ref, i) => sy.ecrire(3, 1 + i, { f: `'Multiples'!${ref}`, s: S.euros }));
  sy.ecrire(4, 0, "DCF (CMPC ± 1 pt)"); ["B31", "C31", "D31"].forEach((ref, i) => sy.ecrire(4, 1 + i, { f: `'DCF'!${ref}`, s: S.euros }));
  sy.ecrire(5, 0, "Actif net corrigé (plancher)"); sy.ecrire(5, 2, { f: "'ANCC'!B8", s: S.euros });
  sy.ecrire(7, 0, "Poids des multiples"); sy.ecrire(7, 1, { f: `IF(AND(ISNUMBER(C4),ISNUMBER(C5)),${hyp.poids},IF(ISNUMBER(C4),1,0))`, s: S.pct });
  sy.ecrire(8, 0, "Poids du DCF"); sy.ecrire(8, 1, { f: "IF(AND(ISNUMBER(C4),ISNUMBER(C5)),1-B8,IF(ISNUMBER(C5),1,0))", s: S.pct });
  sy.ecrire(10, 0, "Valeur des titres (synthèse)", S.gras);
  for (const [c, col] of [[1, "B"], [2, "C"], [3, "D"]]) {
    sy.ecrire(10, c, { f: `IF($B$8+$B$9=0,"À compléter",$B$8*IF($B$8=0,0,${col}4)+$B$9*IF($B$9=0,0,IF(ISNUMBER(${col}5),${col}5,C5)))`, s: S.eurosTotal });
  }
  sy.ecrire(12, 0, "Sensibilités (valeur des titres)", S.entete); sy.ecrire(12, 1, "Basse", S.entete); sy.ecrire(12, 2, "Centrale", S.entete); sy.ecrire(12, 3, "Haute", S.entete);
  sy.ecrire(13, 0, "Multiple d'EBE − 1x / + 1x");
  sy.ecrire(13, 1, { f: `IF(ISNUMBER(C4),${versTitres(`${ebeN}*(${hyp.mc}-1)`)},"")`, s: S.euros });
  sy.ecrire(13, 2, { f: "C4", s: S.euros });
  sy.ecrire(13, 3, { f: `IF(ISNUMBER(C4),${versTitres(`${ebeN}*(${hyp.mc}+1)`)},"")`, s: S.euros });
  sy.ecrire(14, 0, "CMPC + 1 pt / − 1 pt"); ["B31", "C31", "D31"].forEach((ref, i) => sy.ecrire(14, 1 + i, { f: `'DCF'!${ref}`, s: S.euros }));
  sy.ecrire(15, 0, "Croissance à l'infini − 0,5 pt / + 0,5 pt"); ["B34", "C34", "D34"].forEach((ref, i) => sy.ecrire(15, 1 + i, { f: `'DCF'!${ref}`, s: S.euros }));
  sy.ecrire(17, 0, "Estimation indicative, non contractuelle. Calculs reproduits par formules : modifiez les cellules jaunes de l'onglet « Hypothèses ».", S.petit);

  // Ordre des onglets : celui du sommaire
  const ordre = ONGLETS.map(([n]) => n);
  wb.feuilles.sort((a, b) => ordre.indexOf(a.nom) - ordre.indexOf(b.nom));
  return wb;
}
