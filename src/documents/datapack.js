// Datapack Excel de la valorisation, présenté comme un datapack de banque d'affaires : page de présentation (logo,
// sommaire par section avec liens), onglets numérotés par section, bandeaux de section, retour « >> Présentation »
// en tête de chaque onglet, montants en € (négatifs entre parenthèses). Charte Passation.
// Formules vivantes qui reproduisent le moteur (approfondie.js) : les cellules cuivre sur fond crème sont les
// hypothèses modifiables, tout le reste se recalcule dans Excel. Les tests vérifient que les formules redonnent
// exactement les chiffres du moteur (test/datapack.test.js).
import { creerClasseur, S, COULEURS } from "./xlsx.js";
import { LOGO_PNG, LOGO_TAILLE } from "./logo-datapack.js";
import { CHAMPS } from "../../public/js/champs-financiers.js";
import { t as tr, locale } from "../../public/js/i18n.js";

// Noms des onglets : un seul endroit (les formules entre onglets les lisent ici)
export const NOMS = {};
for (const k of ["presentation", "comptes", "retraitements", "hypotheses", "titres", "multiples", "dcf", "ancc", "synthese"]) {
  Object.defineProperty(NOMS, k, { get: () => tr(`serveur.datapack_onglets.${k}`), enumerable: true });
}
const X = (cle) => `'${NOMS[cle]}'!`;
/** Origine d'une hypothèse de prévision : « dirigeant » est un identifiant, affiché dans la langue du classeur. */
const origine = (o) => (o === "dirigeant" ? tr("serveur.valorisation_moteur.origines.dirigeant") : o ?? "");
const SECTIONS = [
  ["1", tr("serveur.datapack.donnees_hypotheses"), COULEURS.cuivre, [
    ["comptes", tr("serveur.datapack.comptes_resultat_bilans_valides")],
    ["retraitements", tr("serveur.datapack.pont_ebe_comptable_ebe")],
    ["hypotheses", tr("serveur.datapack.parametres_sources_dates_modifiables")],
  ]],
  ["2", tr("serveur.datapack.valorisation"), COULEURS.vert, [
    ["titres", tr("serveur.datapack.dette_nette_bfr_normatif")],
    ["multiples", tr("serveur.datapack.methode_1_multiples_ebe")],
    ["dcf", tr("serveur.datapack.methode_2_flux_tresorerie")],
    ["ancc", tr("serveur.datapack.methode_3_actif_net")],
    ["synthese", tr("serveur.datapack.fourchettes_ponderation_sensibilites")],
  ]],
];
const ORDRE = [NOMS.presentation, ...SECTIONS.flatMap(([, , , l]) => l.map(([k]) => NOMS[k]))];
const couleurOnglet = (cle) => SECTIONS.find(([, , , l]) => l.some(([k]) => k === cle))[2];

/** Bandeau de section vert sur toute la largeur utile de l'onglet. */
function bandeau(fe, r, texte, de = 0) {
  for (let c = de; c < fe.largeurs.length; c++) fe.ecrire(r, c, c === de ? texte : "", S.section);
  fe.hauteur(r, 18);
}
/** Ligne de tête d'un onglet : retour à la présentation et unité, dans la dernière colonne. */
function tete(fe, unite = tr("serveur.datapack.unite_euros")) {
  const c = fe.largeurs.length - 1;
  fe.lien(0, c, tr("serveur.datapack.presentation"), NOMS.presentation);
  if (unite) fe.ecrire(1, c, unite, S.unite);
}

export function construireDatapack({ entreprise, entree, H, resultat, validation = null, nomDeCode = null, genereLe = new Date() }) {
  const wb = creerClasseur();
  const annees = resultat.annees;
  const nA = annees.length;
  const ex = Object.fromEntries(entree.exercices.map((e) => [e.annee, e]));
  const dateTxt = genereLe.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

  // ------------------------------------------------------------ Présentation
  const cv = wb.feuille(NOMS.presentation, { largeurs: [3, 7, 26, 66, 10], onglet: COULEURS.espresso });
  cv.hauteur(0, 12); cv.hauteur(1, 34);
  cv.image({ png: LOGO_PNG, r: 1, c: 1, largeur: LOGO_TAILLE.largeur / 2, hauteur: LOGO_TAILLE.hauteur / 2, nom: "Logo Passation" });
  cv.ecrire(3, 1, `${nomDeCode ? (/^Projet /.test(nomDeCode) ? nomDeCode : `Projet ${nomDeCode}`) : entreprise.nom || tr("serveur.datapack.entreprise")} | Datapack`, S.titreCouverture); cv.hauteur(3, 30);
  if (nomDeCode) cv.ecrire(4, 1, entreprise.nom || tr("serveur.datapack.entreprise"), S.sousTitre);
  cv.ecrire(5, 1, `SIREN ${String(entreprise.siren || "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}${entreprise.ville ? ` · ${entreprise.ville}` : ""}`);
  cv.ecrire(6, 1, tr("serveur.datapack.genere_le", { date: dateTxt }));
  cv.ecrire(7, 1, tr("serveur.datapack.strictement_confidentiel"), S.confidentiel);
  // Figures changed since the owner approved them: said on the first sheet (24/11/2026)
  if (validation && validation.a_jour === false) cv.ecrire(8, 1, tr("serveur.datapack.a_revalider", { date: new Date(validation.le * 1000).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) }), S.confidentiel);
  let rc = 9;
  bandeau(cv, rc++, tr("serveur.datapack.sommaire"), 1);
  cv.ecrire(rc, 1, "N°", S.entete); cv.ecrire(rc, 2, tr("serveur.datapack.onglet"), S.entete); cv.ecrire(rc, 3, tr("serveur.datapack.contenu"), S.entete); cv.ecrire(rc, 4, tr("serveur.datapack.lien"), S.entete); rc++;
  for (const [num, titre, , onglets] of SECTIONS) {
    rc++;
    cv.ecrire(rc, 1, num, S.sectionNumero); cv.ecrire(rc, 2, tr("serveur.datapack.section_num", { num, titre }), S.gras); rc++;
    for (const [cle, desc] of onglets) {
      const [n, ...nom] = NOMS[cle].split(" ");
      cv.ecrire(rc, 1, n); cv.ecrire(rc, 2, nom.join(" ")); cv.ecrire(rc, 3, desc, S.note); cv.lien(rc, 4, tr("serveur.datapack.lien"), NOMS[cle]);
      rc++;
    }
  }
  rc++;
  bandeau(cv, rc++, tr("serveur.datapack.lecture"), 1);
  const legende = [
    [1000, S.saisieEuros, tr("serveur.datapack.saisie_ou_hypothese_modifiable")],
    [1000, S.euros, tr("serveur.datapack.formule_se_recalcule_seule")],
    [1000, S.eurosTotal, tr("serveur.datapack.total_ou_resultat_methode")],
    [-1000, S.euros, tr("serveur.datapack.montants_euros_valides_par")],
  ];
  for (const [v, st, txt] of legende) { rc++; cv.ecrire(rc, 2, v, st); cv.ecrire(rc, 3, txt, S.note); }
  rc += 2;
  bandeau(cv, rc++, tr("serveur.datapack.avertissement"), 1);
  rc++;
  cv.ecrire(rc, 1, tr("serveur.datapack.estimation_indicative_non_contractuelle") + NOMS.hypotheses + " ».", S.petit);
  cv.fusionner(`B${rc + 1}:E${rc + 1}`); cv.hauteur(rc, 30);

  // ------------------------------------------------------------ 2. Comptes
  const cp = wb.feuille(NOMS.comptes, { largeurs: [78, ...annees.map(() => 16), 60], onglet: couleurOnglet("comptes"), paysage: true });
  const colA = (i) => 1 + i;                      // colonne de l'année i
  const dernier = colA(nA - 1);
  cp.ecrire(0, 0, tr("serveur.datapack.comptes_valides"), S.titre); tete(cp);
  cp.ecrire(2, 0, tr("serveur.datapack.poste"), S.entete); annees.forEach((a, i) => cp.ecrire(2, colA(i), a, S.enteteDroite)); cp.ecrire(2, nA + 1, tr("serveur.datapack.ou_trouver"), S.entete);
  const ligne = {};
  let r = 3;
  for (const [groupe, titre] of [["resultat", tr("serveur.datapack.compte_resultat")], ["bilan", tr("serveur.datapack.bilan")]]) {
    bandeau(cp, r++, titre);
    for (const c of CHAMPS.filter((x) => x.groupe === groupe)) {
      ligne[c.cle] = r;
      cp.ecrire(r, 0, c.libelle);
      annees.forEach((a, i) => { const v = ex[a]?.[c.cle]; cp.ecrire(r, colA(i), Number.isFinite(v) ? v : null, S.euros); });
      cp.ecrire(r, nA + 1, c.aide, S.petit);
      r++;
    }
    r++;
  }
  bandeau(cp, r++, tr("serveur.datapack.agregats_calcules"));
  const L = (cle, i) => cp.ref(ligne[cle], colA(i));
  const rEbe = r++, rBfr = r++, rJours = r++;
  cp.ecrire(rEbe, 0, tr("serveur.datapack.ebe_calcule"), S.gras);
  cp.ecrire(rBfr, 0, tr("serveur.datapack.bfr_exploitation_stocks_clients"));
  cp.ecrire(rJours, 0, tr("serveur.datapack.bfr_jours_chiffre_affaires"));
  annees.forEach((_, i) => {
    // Même règle que le moteur (approfondie.js, ebe) : détail complet des trois charges obligatoires, sinon EBE publié,
    // sinon « Non déterminable » (jamais de charge manquante comptée à zéro).
    const det = ["achats_consommes", "charges_externes", "charges_personnel"].map((k) => L(k, i)).join(",");
    cp.ecrire(rEbe, colA(i), { f: `IF(AND(ISNUMBER(${L("chiffre_affaires", i)}),COUNT(${det})=3),${L("chiffre_affaires", i)}+${L("autres_produits", i)}-${L("achats_consommes", i)}-${L("charges_externes", i)}-${L("impots_taxes", i)}-${L("charges_personnel", i)},IF(ISNUMBER(${L("ebe", i)}),${L("ebe", i)},"${tr("serveur.datapack.non_determinable")}"))`, s: S.eurosGras });
    // Earlier fiscal year used for its income statement only: no working capital if an item is missing (never zero)
    const postes = ["stocks", "creances_clients", "dettes_fournisseurs", "dettes_fiscales_sociales"].map((k) => L(k, i)).join(",");
    cp.ecrire(rBfr, colA(i), { f: `IF(COUNT(${postes})=4,${L("stocks", i)}+${L("creances_clients", i)}-${L("dettes_fournisseurs", i)}-${L("dettes_fiscales_sociales", i)},"")`, s: S.euros });
    cp.ecrire(rJours, colA(i), { f: `IF(AND(${L("chiffre_affaires", i)}>0,ISNUMBER(${cp.ref(rBfr, colA(i))})),${cp.ref(rBfr, colA(i))}/${L("chiffre_affaires", i)}*365,"")`, s: S.nombre });
  });
  const CPx = (rr, i) => `${X("comptes")}${cp.ref(rr, colA(i))}`;

  // ------------------------------------------------------------ 4. Hypothèses (avant les onglets qui les lisent)
  const hy = wb.feuille(NOMS.hypotheses, { largeurs: [98, 14, 70, 14], onglet: couleurOnglet("hypotheses"), paysage: true });
  hy.ecrire(0, 0, tr("serveur.datapack.hypotheses"), S.titre); tete(hy, tr("serveur.datapack.unite_euros_pct"));
  hy.ecrire(1, 0, tr("serveur.datapack.cellules_cuivre_sur_fond"), S.petit);
  hy.ecrire(3, 0, tr("serveur.datapack.parametre"), S.entete); hy.ecrire(3, 1, tr("serveur.datapack.valeur"), S.enteteDroite); hy.ecrire(3, 2, tr("serveur.datapack.source"), S.entete); hy.ecrire(3, 3, tr("serveur.datapack.date"), S.entete);
  const hyp = {};
  let h = 4;
  const param = (cle, libelle, valeur, style, source = "", date = "") => {
    hyp[cle] = `${X("hypotheses")}${hy.ref(h, 1, true)}`;
    hy.ecrire(h, 0, libelle); hy.ecrire(h, 1, valeur ?? null, style); hy.ecrire(h, 2, source, S.petit); hy.ecrire(h, 3, date, S.petit);
    h++;
  };
  const d = resultat.dcf, hd = d.hypotheses || {};
  const betaS = H.betas.secteurs[entree.secteur];
  bandeau(hy, h++, tr("serveur.datapack.cout_capital"));
  param("rf", H.taux_sans_risque.libelle, H.taux_sans_risque.valeur, S.saisiePct, H.taux_sans_risque.source, H.taux_sans_risque.date);
  param("erp", H.prime_risque_marche.libelle, H.prime_risque_marche.valeur, S.saisiePct, H.prime_risque_marche.source, H.prime_risque_marche.date);
  param("prime", H.prime_taille.libelle, entree.primeTaille, S.saisiePct, Number.isFinite(entree.primeTaille) ? tr("serveur.datapack.reglage_dirigeant") : tr("serveur.datapack.completer_aucune_source_publique"), "");
  param("bu", tr("serveur.datapack.beta_secteur", { industrie: betaS?.industrie_damodaran ?? tr("teaser.js.a_completer_minuscule") }), betaS?.beta_desendette ?? null, S.saisieNombre, H.betas.source, H.betas.date);
  param("de", tr("serveur.datapack.ratio_dette_capitaux_propres"), Number.isFinite(entree.detteSurCapitaux) ? entree.detteSurCapitaux : betaS?.dette_sur_capitaux ?? null, S.saisieNombre, H.betas.source, H.betas.date);
  param("kd", H.cout_dette_avant_impot.libelle, H.cout_dette_avant_impot.valeur, S.saisiePct, H.cout_dette_avant_impot.source, H.cout_dette_avant_impot.date);
  h++; bandeau(hy, h++, tr("serveur.datapack.impot_sur_societes"));
  param("tn", tr("serveur.datapack.taux_normal"), H.impot_societes.taux_normal, S.saisiePct, H.impot_societes.source, H.impot_societes.date);
  param("tr", tr("serveur.datapack.taux_reduit_pme"), H.impot_societes.taux_reduit, S.saisiePct, H.impot_societes.source, H.impot_societes.date);
  param("plaf", tr("serveur.datapack.plafond_taux_reduit"), H.impot_societes.plafond_taux_reduit, S.saisieEuros, H.impot_societes.conditions_taux_reduit, "");
  param("elig", tr("serveur.datapack.taux_reduit_applicable_1"), entree.tauxReduit ? 1 : 0, S.saisieNombre, tr("serveur.datapack.reponse_dirigeant_capital_detenu"), "");
  h++; bandeau(hy, h++, tr("serveur.datapack.previsions_dcf"));
  param("g", tr("serveur.datapack.croissance_infini"), hd.croissance_terminale?.valeur ?? H.croissance_terminale.valeur, S.saisiePct, hd.croissance_terminale?.origine === "dirigeant" ? tr("serveur.datapack.reglage_dirigeant") : H.croissance_terminale.source, H.croissance_terminale.date);
  param("gca", tr("serveur.datapack.croissance_annuelle_chiffre_affaires"), hd.croissance?.valeur ?? 0, S.saisiePct, origine(hd.croissance?.origine), "");
  param("marge", tr("serveur.datapack.marge_ebe"), hd.marge_ebe?.valeur ?? 0, S.saisiePct, origine(hd.marge_ebe?.origine), "");
  param("amort", tr("serveur.datapack.amortissements_ca"), hd.amortissements_pct?.valeur ?? 0, S.saisiePct, origine(hd.amortissements_pct?.origine), "");
  param("invest", tr("serveur.datapack.investissements_ca"), hd.investissements_pct?.valeur ?? 0, S.saisiePct, origine(hd.investissements_pct?.origine), "");
  param("jours", tr("serveur.datapack.bfr_jours_ca"), hd.bfr_jours?.valeur ?? 0, S.saisieNombre, origine(hd.bfr_jours?.origine), "");
  h++; bandeau(hy, h++, tr("serveur.datapack.multiples_synthese"));
  const mult = resultat.multiples.multiples || {};
  param("mb", tr("serveur.datapack.multiple_ebe_bas"), mult.bas ?? null, S.saisieNombre, tr("serveur.datapack.croisement_trois_sources_src"), "");
  param("mc", tr("serveur.datapack.multiple_ebe_central"), mult.central ?? null, S.saisieNombre, "", "");
  param("mh", tr("serveur.datapack.multiple_ebe_haut"), mult.haut ?? null, S.saisieNombre, "", "");
  param("poids", tr("serveur.datapack.poids_multiples_dans_synthese"), entree.ponderation?.multiples ?? H.ponderation.multiples, S.saisiePct, H.ponderation.note, "");
  param("mode", tr("serveur.datapack.ebe_normatif_moyenne_ou"), entree.modeEbe === "dernier" ? "dernier" : "moyenne", S.saisieTexte, tr("serveur.datapack.reglage_dirigeant"), "");
  h++; bandeau(hy, h++, tr("serveur.datapack.decotes_primes"));
  hy.ecrire(h, 0, tr("serveur.datapack.facteur"), S.entete); hy.ecrire(h, 1, "%", S.enteteDroite); hy.ecrire(h, 2, tr("serveur.datapack.justification"), S.entete); h++;
  const debutDec = h;
  for (const f of H.decotes_primes.facteurs) {
    const x = (entree.decotes || []).find((y) => y.cle === f.cle);
    hy.ecrire(h, 0, f.libelle); hy.ecrire(h, 1, x?.pct ?? 0, S.saisiePct); hy.ecrire(h, 2, x?.justification || "", S.saisieTexte); h++;
  }
  hyp.facteur = `${X("hypotheses")}${hy.ref(h, 1, true)}`;
  hy.ecrire(h, 0, tr("serveur.datapack.facteur_applique_aux_valeurs"), S.gras);
  hy.ecrire(h, 1, { f: `1+SUM(${hy.ref(debutDec, 1)}:${hy.ref(h - 1, 1)})`, s: S.nombre });
  h += 2;
  bandeau(hy, h++, tr("serveur.datapack.sources"));
  for (const k of ["taux_sans_risque", "prime_risque_marche", "cout_dette_avant_impot", "impot_societes", "croissance_terminale", "betas"]) { hy.ecrire(h, 0, H[k].source, S.petit); hy.ecrire(h, 2, H[k].url || "", S.petit); h++; }

  // ------------------------------------------------------------ 3. Retraitements
  const rt = wb.feuille(NOMS.retraitements, { largeurs: [52, ...annees.map(() => 16), 40], onglet: couleurOnglet("retraitements") });
  const rr = entree.retraitements || {};
  rt.ecrire(0, 0, tr("serveur.datapack.pont_ebe_comptable_ebe"), S.titre); tete(rt);
  rt.ecrire(2, 0, tr("serveur.datapack.remuneration_reelle_dirigeant_charges")); rt.ecrire(2, 1, rr.remuneration_dirigeant_reelle ?? null, S.saisieEuros);
  rt.ecrire(3, 0, tr("serveur.datapack.remuneration_normative_directeur_salarie")); rt.ecrire(3, 1, rr.remuneration_normative ?? null, S.saisieEuros);
  rt.ecrire(4, 0, tr("serveur.datapack.loyer_paye_locaux_dirigeant")); rt.ecrire(4, 1, rr.loyer_paye ?? null, S.saisieEuros);
  rt.ecrire(5, 0, tr("serveur.datapack.loyer_marche")); rt.ecrire(5, 1, rr.loyer_marche ?? null, S.saisieEuros);
  bandeau(rt, 7, tr("serveur.datapack.elements_exceptionnels"));
  rt.ecrire(8, 0, tr("serveur.datapack.libelle"), S.entete); rt.ecrire(8, 1, tr("serveur.datapack.exercice"), S.entete); rt.ecrire(8, 2, tr("serveur.datapack.montant"), S.entete); rt.ecrire(8, 3, tr("serveur.datapack.justification"), S.entete);
  const exc = rr.exceptionnels || [];
  const lignesExc = Math.max(exc.length, 3);
  for (let i = 0; i < lignesExc; i++) {
    const e = exc[i]; // année en format général (pas « 2 024,000 »)
    rt.ecrire(9 + i, 0, e?.libelle ?? "", S.saisieTexte); rt.ecrire(9 + i, 1, e?.annee ?? null, S.saisieTexte); rt.ecrire(9 + i, 2, e?.montant ?? null, S.saisieEuros); rt.ecrire(9 + i, 3, e?.justification ?? "", S.saisieTexte);
  }
  const p0 = 9 + lignesExc + 1;
  rt.ecrire(p0, 0, tr("serveur.datapack.pont"), S.entete); annees.forEach((a, i) => rt.ecrire(p0, colA(i), a, S.enteteDroite));
  const [pE, pD, pL, pX, pR] = [p0 + 1, p0 + 2, p0 + 3, p0 + 4, p0 + 5];
  rt.ecrire(pE, 0, tr("serveur.datapack.ebe_comptable")); rt.ecrire(pD, 0, tr("serveur.datapack.remuneration_dirigeant_ramenee_normale")); rt.ecrire(pL, 0, tr("serveur.datapack.loyer_ramene_prix_marche")); rt.ecrire(pX, 0, tr("serveur.datapack.elements_exceptionnels")); rt.ecrire(pR, 0, tr("serveur.datapack.ebe_retraite"), S.gras);
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
  rt.ecrire(pN, 0, tr("serveur.datapack.ebe_normatif"), S.gras);
  rt.ecrire(pN, 1, { f: `IF(${hyp.mode}="dernier",${rt.ref(pR, dernier)},AVERAGE(${rt.ref(pR, colA(0))}:${rt.ref(pR, dernier)}))`, s: S.eurosTotal });
  const ebeN = `${X("retraitements")}${rt.ref(pN, 1, true)}`;

  // ------------------------------------------------------------ 5. Passage aux titres
  const pt = wb.feuille(NOMS.titres, { largeurs: [52, 16, 50], onglet: couleurOnglet("titres") });
  const co = entree.complements || {};
  pt.ecrire(0, 0, tr("serveur.datapack.dette_nette_bfr_actifs"), S.titre); tete(pt);
  pt.ecrire(1, 0, tr("serveur.datapack.dernier_exercice", { annee: annees.at(-1) }), S.petit);
  pt.ecrire(3, 0, tr("serveur.datapack.dette_nette"), S.entete); pt.ecrire(3, 1, tr("serveur.datapack.montant"), S.enteteDroite);
  const dn = [
    [tr("serveur.datapack.emprunts_dettes_financieres"), { f: CPx(ligne.emprunts, nA - 1), s: S.euros }],
    [tr("serveur.datapack.credit_bail_restant"), co.credit_bail_restant ?? 0, S.saisieEuros],
    [tr("serveur.datapack.comptes_courants_associes_remboursables"), co.comptes_courants_remboursables ?? 0, S.saisieEuros],
    [tr("serveur.datapack.provisions_pour_risques"), { f: CPx(ligne.provisions_risques, nA - 1), s: S.euros }],
    [tr("serveur.datapack.dividendes_votes_non_verses"), co.dividendes_a_verser ?? 0, S.saisieEuros],
    [tr("serveur.datapack.tresorerie_moins"), { f: `-${CPx(ligne.tresorerie, nA - 1)}`, s: S.euros }],
    [tr("serveur.datapack.placements_moins"), { f: `-${CPx(ligne.placements, nA - 1)}`, s: S.euros }],
  ];
  dn.forEach(([lib, v, s], i) => { pt.ecrire(4 + i, 0, lib); pt.ecrire(4 + i, 1, v, s ?? S.euros); });
  pt.ecrire(11, 0, tr("serveur.datapack.dette_nette_negative_tresorerie"), S.gras); pt.ecrire(11, 1, { f: "SUM(B5:B11)", s: S.eurosTotal });
  pt.ecrire(13, 0, "BFR", S.entete); pt.ecrire(13, 1, tr("serveur.datapack.montant"), S.enteteDroite);
  pt.ecrire(14, 0, tr("serveur.datapack.bfr_reel_dernier_exercice")); pt.ecrire(14, 1, { f: CPx(rBfr, nA - 1), s: S.euros });
  pt.ecrire(15, 0, tr("serveur.datapack.bfr_normatif_jours_moyenne")); pt.ecrire(15, 1, { f: `AVERAGE(${X("comptes")}${cp.ref(rJours, colA(0))}:${cp.ref(rJours, dernier)})`, s: S.nombre });
  pt.ecrire(16, 0, tr("serveur.datapack.bfr_normatif_jours_dernier")); pt.ecrire(16, 1, { f: `B16/365*${CPx(ligne.chiffre_affaires, nA - 1)}`, s: S.euros });
  pt.ecrire(17, 0, tr("serveur.datapack.ecart_bfr_reel_normatif"), S.gras); pt.ecrire(17, 1, { f: "B15-B17", s: S.eurosGras });
  pt.ecrire(19, 0, tr("serveur.datapack.actifs_hors_exploitation")); pt.ecrire(19, 1, co.actifs_hors_exploitation ?? 0, S.saisieEuros);
  pt.ecrire(21, 0, tr("serveur.datapack.passage_ve_titres_ve"), S.petit);
  const DN = `${X("titres")}$B$12`, ECART = `${X("titres")}$B$18`, HORS = `${X("titres")}$B$20`;
  const versTitres = (ve) => `${ve}*${hyp.facteur}-${DN}+${ECART}+${HORS}`;

  // ------------------------------------------------------------ 6. Multiples
  const mu = wb.feuille(NOMS.multiples, { largeurs: [40, 16, 16, 16], onglet: couleurOnglet("multiples") });
  mu.ecrire(0, 0, tr("serveur.datapack.methode_1_multiples_ebe"), S.titre); tete(mu);
  mu.ecrire(2, 0, tr("serveur.datapack.ebe_normatif")); mu.ecrire(2, 1, { f: ebeN, s: S.eurosGras });
  mu.ecrire(4, 0, "", S.entete); mu.ecrire(4, 1, tr("serveur.datapack.basse"), S.enteteDroite); mu.ecrire(4, 2, tr("serveur.datapack.centrale"), S.enteteDroite); mu.ecrire(4, 3, tr("serveur.datapack.haute"), S.enteteDroite);
  mu.ecrire(5, 0, tr("serveur.datapack.multiple_ebe"));
  mu.ecrire(6, 0, tr("serveur.datapack.valeur_entreprise"));
  mu.ecrire(7, 0, tr("serveur.datapack.valeur_titres"), S.gras);
  [["mb", 1], ["mc", 2], ["mh", 3]].forEach(([k, c]) => {
    mu.ecrire(5, c, { f: hyp[k], s: S.nombre });
    mu.ecrire(6, c, { f: `IF($B$3>0,$B$3*${mu.ref(5, c)},"${tr("serveur.datapack.non_applicable")}")`, s: S.euros });
    mu.ecrire(7, c, { f: `IF(ISNUMBER(${mu.ref(6, c)}),${versTitres(mu.ref(6, c))},"${tr("serveur.datapack.non_applicable")}")`, s: S.eurosTotal });
  });

  // ------------------------------------------------------------ 7. DCF
  const dc = wb.feuille(NOMS.dcf, { largeurs: [72, 15, 15, 15, 15, 15, 15], onglet: couleurOnglet("dcf"), paysage: true });
  dc.ecrire(0, 0, tr("serveur.datapack.methode_2_dcf_sur"), S.titre); tete(dc);
  dc.ecrire(2, 0, tr("serveur.datapack.cout_capital"), S.entete); dc.ecrire(2, 1, tr("serveur.datapack.valeur"), S.enteteDroite);
  const cmpcL = [
    [tr("serveur.datapack.beta_endette_beta_desendette"), `${hyp.bu}*(1+(1-${hyp.tn})*${hyp.de})`, S.nombre],
    [tr("serveur.datapack.cout_fonds_propres_taux"), `${hyp.rf}+B4*${hyp.erp}+${hyp.prime}`, S.pct2],
    [tr("serveur.datapack.part_dette_e_1"), `${hyp.de}/(1+${hyp.de})`, S.pct2],
    [tr("serveur.datapack.cout_dette_apres_impot"), `${hyp.kd}*(1-${hyp.tn})`, S.pct2],
    ["CMPC", `IF(AND(ISNUMBER(${hyp.prime}),ISNUMBER(${hyp.bu})),(1-B6)*B5+B6*B7,"${tr("serveur.datapack.completer")}")`, S.pct2],
  ];
  cmpcL.forEach(([lib, f, s], i) => { dc.ecrire(3 + i, 0, lib, i === 4 ? S.gras : S.normal); dc.ecrire(3 + i, 1, { f, s }); });
  const K = "$B$8", G = hyp.g;
  dc.ecrire(9, 0, tr("serveur.datapack.projection"), S.entete); dc.ecrire(9, 1, tr("serveur.datapack.an_0"), S.enteteDroite);
  for (let t = 1; t <= 5; t++) dc.ecrire(9, 1 + t, `An ${t}`, S.enteteDroite);
  const R = { t: 10, ca: 11, ebe: 12, da: 13, ebit: 14, is: 15, inv: 16, bfr: 17, dbfr: 18, flux: 19, fa: 20, act: 21 };
  const libs = { t: tr("serveur.datapack.annee"), ca: tr("serveur.datapack.chiffre_affaires"), ebe: "EBE", da: tr("serveur.datapack.amortissements"), ebit: tr("serveur.datapack.resultat_exploitation_ebit"), is: tr("serveur.datapack.impot_sur_ebit"), inv: tr("serveur.datapack.investissements"), bfr: "BFR", dbfr: tr("serveur.datapack.variation_bfr"), flux: tr("serveur.datapack.flux_disponible"), fa: tr("serveur.datapack.facteur_actualisation"), act: tr("serveur.datapack.flux_actualise") };
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
  dc.ecrire(23, 0, tr("serveur.datapack.valeur_terminale_gordon_shapiro")); dc.ecrire(23, 1, { f: `IF(ISNUMBER(${K}),IF(${K}>${G},${F(5)}*(1+${G})/(${K}-${G}),"${tr("serveur.datapack.cmpc_g")}"),"${tr("serveur.datapack.completer")}")`, s: S.euros });
  dc.ecrire(24, 0, tr("serveur.datapack.valeur_terminale_actualisee")); dc.ecrire(24, 1, { f: `IF(ISNUMBER(B24),B24/(1+${K})^5,"")`, s: S.euros });
  dc.ecrire(25, 0, tr("serveur.datapack.somme_flux_actualises")); dc.ecrire(25, 1, { f: `IF(ISNUMBER(${K}),SUM(C22:G22),"")`, s: S.euros });
  dc.ecrire(26, 0, tr("serveur.datapack.valeur_entreprise_dcf"), S.gras); dc.ecrire(26, 1, { f: `IF(AND(ISNUMBER(B25),ISNUMBER(B26)),B25+B26,"${tr("serveur.datapack.completer")}")`, s: S.eurosGras });
  dc.ecrire(28, 0, "", S.entete); dc.ecrire(28, 1, tr("serveur.datapack.cmpc_1_pt"), S.enteteDroite); dc.ecrire(28, 2, "CMPC", S.enteteDroite); dc.ecrire(28, 3, tr("serveur.datapack.cmpc_1_pt_2"), S.enteteDroite);
  dc.ecrire(29, 0, tr("serveur.datapack.valeur_entreprise"));
  dc.ecrire(29, 1, { f: `IF(ISNUMBER(B27),${veA(`(${K}+0.01)`, G)},"")`, s: S.euros });
  dc.ecrire(29, 2, { f: "B27", s: S.euros });
  dc.ecrire(29, 3, { f: `IF(ISNUMBER(B27),IF(${K}-0.01>${G},${veA(`(${K}-0.01)`, G)},""),"")`, s: S.euros });
  dc.ecrire(30, 0, tr("serveur.datapack.valeur_titres"), S.gras);
  for (const c of [1, 2, 3]) dc.ecrire(30, c, { f: `IF(ISNUMBER(${dc.ref(29, c)}),${versTitres(dc.ref(29, c))},"")`, s: S.eurosTotal });
  dc.ecrire(32, 0, tr("serveur.datapack.sensibilite_croissance_infini_titres"), S.entete); dc.ecrire(32, 1, tr("serveur.datapack.g_0_5_pt"), S.enteteDroite); dc.ecrire(32, 2, "g", S.enteteDroite); dc.ecrire(32, 3, tr("serveur.datapack.g_0_5_pt_2"), S.enteteDroite);
  dc.ecrire(33, 0, tr("serveur.datapack.valeur_titres"));
  dc.ecrire(33, 1, { f: `IF(ISNUMBER(B27),IF(${K}>${G}-0.005,${versTitres(`(${veA(K, `(${G}-0.005)`)})`)},""),"")`, s: S.euros });
  dc.ecrire(33, 2, { f: "C31", s: S.euros });
  dc.ecrire(33, 3, { f: `IF(ISNUMBER(B27),IF(${K}>${G}+0.005,${versTitres(`(${veA(K, `(${G}+0.005)`)})`)},""),"")`, s: S.euros });

  // ------------------------------------------------------------ 8. ANCC
  const an = wb.feuille(NOMS.ancc, { largeurs: [52, 16, 30], onglet: couleurOnglet("ancc") });
  an.ecrire(0, 0, tr("serveur.datapack.methode_3_actif_net_2"), S.titre); tete(an);
  an.ecrire(1, 0, tr("serveur.datapack.presente_part_comme_plancher"), S.petit);
  an.ecrire(3, 0, tr("serveur.datapack.capitaux_propres")); an.ecrire(3, 1, { f: CPx(ligne.capitaux_propres, nA - 1), s: S.euros });
  an.ecrire(4, 0, tr("serveur.datapack.plus_values_latentes_justifiees")); an.ecrire(4, 1, co.plus_values_latentes ?? 0, S.saisieEuros);
  an.ecrire(5, 0, tr("serveur.datapack.frais_etablissement_sans_valeur")); an.ecrire(5, 1, co.frais_etablissement ?? 0, S.saisieEuros);
  an.ecrire(6, 0, tr("serveur.datapack.creances_douteuses_moins")); an.ecrire(6, 1, co.creances_douteuses ?? 0, S.saisieEuros);
  an.ecrire(7, 0, tr("serveur.datapack.actif_net_comptable_corrige"), S.gras); an.ecrire(7, 1, { f: "B4+B5-B6-B7", s: S.eurosTotal });

  // ------------------------------------------------------------ 9. Synthèse
  const sy = wb.feuille(NOMS.synthese, { largeurs: [52, 16, 16, 16], onglet: couleurOnglet("synthese") });
  sy.ecrire(0, 0, tr("serveur.datapack.synthese_valeur_titres"), S.titre); tete(sy);
  sy.ecrire(2, 0, tr("serveur.datapack.methode"), S.entete); sy.ecrire(2, 1, tr("serveur.datapack.basse"), S.enteteDroite); sy.ecrire(2, 2, tr("serveur.datapack.centrale"), S.enteteDroite); sy.ecrire(2, 3, tr("serveur.datapack.haute"), S.enteteDroite);
  sy.ecrire(3, 0, tr("serveur.datapack.multiples_ebe")); ["B8", "C8", "D8"].forEach((ref, i) => sy.ecrire(3, 1 + i, { f: `${X("multiples")}${ref}`, s: S.euros }));
  sy.ecrire(4, 0, tr("serveur.datapack.dcf_cmpc_1_pt")); ["B31", "C31", "D31"].forEach((ref, i) => sy.ecrire(4, 1 + i, { f: `${X("dcf")}${ref}`, s: S.euros }));
  sy.ecrire(5, 0, tr("serveur.datapack.actif_net_corrige_plancher")); sy.ecrire(5, 2, { f: `${X("ancc")}B8`, s: S.euros });
  sy.ecrire(7, 0, tr("serveur.datapack.poids_multiples")); sy.ecrire(7, 1, { f: `IF(AND(ISNUMBER(C4),ISNUMBER(C5)),${hyp.poids},IF(ISNUMBER(C4),1,0))`, s: S.pct });
  sy.ecrire(8, 0, tr("serveur.datapack.poids_dcf")); sy.ecrire(8, 1, { f: "IF(AND(ISNUMBER(C4),ISNUMBER(C5)),1-B8,IF(ISNUMBER(C5),1,0))", s: S.pct });
  sy.ecrire(10, 0, tr("serveur.datapack.valeur_titres_synthese"), S.gras);
  for (const [c, col] of [[1, "B"], [2, "C"], [3, "D"]]) {
    sy.ecrire(10, c, { f: `IF($B$8+$B$9=0,"${tr("serveur.datapack.completer")}",$B$8*IF($B$8=0,0,${col}4)+$B$9*IF($B$9=0,0,IF(ISNUMBER(${col}5),${col}5,C5)))`, s: S.eurosTotal });
  }
  sy.ecrire(12, 0, tr("serveur.datapack.sensibilites_valeur_titres"), S.entete); sy.ecrire(12, 1, tr("serveur.datapack.basse"), S.enteteDroite); sy.ecrire(12, 2, tr("serveur.datapack.centrale"), S.enteteDroite); sy.ecrire(12, 3, tr("serveur.datapack.haute"), S.enteteDroite);
  sy.ecrire(13, 0, tr("serveur.datapack.multiple_ebe_1x_1x"));
  sy.ecrire(13, 1, { f: `IF(ISNUMBER(C4),${versTitres(`${ebeN}*(${hyp.mc}-1)`)},"")`, s: S.euros });
  sy.ecrire(13, 2, { f: "C4", s: S.euros });
  sy.ecrire(13, 3, { f: `IF(ISNUMBER(C4),${versTitres(`${ebeN}*(${hyp.mc}+1)`)},"")`, s: S.euros });
  sy.ecrire(14, 0, tr("serveur.datapack.cmpc_1_pt_1")); ["B31", "C31", "D31"].forEach((ref, i) => sy.ecrire(14, 1 + i, { f: `${X("dcf")}${ref}`, s: S.euros }));
  sy.ecrire(15, 0, tr("serveur.datapack.croissance_infini_0_5")); ["B34", "C34", "D34"].forEach((ref, i) => sy.ecrire(15, 1 + i, { f: `${X("dcf")}${ref}`, s: S.euros }));
  // Contrôle (convention des datapacks bancaires) : la somme des poids doit faire 100 %
  sy.ecrire(16, 0, tr("serveur.datapack.controle_poids_multiples_poids"), S.petit); sy.ecrire(16, 1, { f: `IF(ROUND($B$8+$B$9,6)=1,"OK","${tr("serveur.datapack.a_verifier")}")`, s: S.controle });
  sy.ecrire(17, 0, tr("serveur.datapack.pied_synthese", { onglet: NOMS.hypotheses }), S.petit);

  // Ordre des onglets : celui du sommaire
  wb.feuilles.sort((a, b) => ORDRE.indexOf(a.nom) - ORDRE.indexOf(b.nom));
  return wb;
}
