// Mémorandum d'information, construit comme ceux des banques d'affaires : nom de code en couverture, synthèse
// organisée autour de six points forts numérotés (un par chapitre), titres qui affirment, source sous chaque chiffre.
// Le code calcule tout (compte de résultat, EBE retraité, endettement, ratios) ; Claude rédige à partir de ces
// chiffres, sans en produire de nouveaux. Présentation 100 % Passation ; seul le logo de l'entreprise apparaît.
import { secteurDe, anciennete, regionDe } from "./anonymat.js";
import { libelleEffectif } from "../../public/js/regles.js";
import { faitsUtilisables } from "../../public/js/faits-site.js";
import { activiteFine } from "./naf.js";
import { DETENTION, MURS, MURS_CESSION } from "../../public/js/parcours.js";
import { montant, pourcent, multiple } from "../../public/js/memo-format.js";
import { projet } from "./nom-de-code.js";
import { t as tr, T, avecTextes } from "../../public/js/i18n.js";
import { equipePourClaude } from "../../public/js/equipe.js";

/** Parties du mémorandum, chacune ouverte par une page d'ouverture (convention des banques d'affaires). */
export const PARTIES_MEMO = [
  { n: 1, titre: T, detail: T },
  { n: 2, titre: T, detail: T },
  { n: 3, titre: T, detail: T },
  { n: 4, titre: T, detail: T },
  { n: 5, titre: T, detail: T },
];

/**
 * Chapitres. `titre` : intitulé par défaut (remplacé par le titre affirmatif rédigé) ; `court` : nom dans le sommaire et
 * l'en-tête ; `partie` : numéro de partie ; `point_fort` : numéro du point fort de la synthèse que le chapitre développe.
 */
export const SECTIONS_MEMO = [
  { cle: "synthese", titre: T, court: T, partie: 1, point_fort: null,
    consigne: "Rédige la synthèse (executive summary). Un paragraphe d'ouverture : qui est l'entreprise, son métier, depuis quand, où, sa taille (chiffre d'affaires, effectif), son marché. Puis 3 à 4 puces sur ce qui fait l'intérêt du dossier pour un repreneur, chacune appuyée sur un fait ou un chiffre fourni. Termine par une phrase sur l'opération (part cédée, motif, accompagnement). Les six points forts numérotés sont affichés à part : ne les recopie pas.",
    donnees: ["entreprise", "activite", "atouts", "operation", "perimetre", "indicateurs", "clients", "marche_resume"] },
  { cle: "histoire", titre: T, court: T, partie: 2, point_fort: null,
    consigne: "Retrace le développement de l'entreprise dans l'ordre chronologique : création, implantations, changements de forme ou de dirigeant, agrandissements, étapes marquantes. Une puce par étape, commençant par l'année en gras. Termine par ce que cette histoire dit de l'entreprise aujourd'hui (ancrage, continuité, réputation), sans extrapoler.",
    donnees: ["entreprise", "frise", "activite", "faits:histoire,implantation"] },
  { cle: "activite", titre: T, court: T, partie: 2, point_fort: 1,
    consigne: "Décris le métier, l'offre de produits ou de services, la façon de produire ou de servir le client, et ce qui différencie l'entreprise (savoir-faire, qualité, équipements, certifications fournies). Le repreneur doit comprendre en une page comment l'entreprise gagne de l'argent. 4 à 6 puces, chacune un aspect distinct.",
    donnees: ["activite", "faits:activite,produits,qualite"] },
  { cle: "organisation", titre: T, court: T, partie: 2, point_fort: 2,
    consigne: "Décris l'organisation : effectif, métiers clés, encadrement intermédiaire, ce que fait aujourd'hui le dirigeant et ce qui dépend de lui. Le repreneur cherche à savoir si l'entreprise peut fonctionner sans son dirigeant actuel : réponds avec les faits fournis, et signale ce qui reste à organiser.",
    donnees: ["entreprise", "activite", "dirigeant_role", "equipe", "faits:equipe"] },
  { cle: "marche", titre: T, court: T, partie: 3, point_fort: 3,
    consigne: "Présente le marché de l'entreprise comme une banque d'affaires : structure du secteur (nombre d'entreprises, fragmentation, place de l'entreprise par sa taille, à partir de « structure_du_secteur »), puis taille et évolution du marché, moteurs de la demande, réglementation et concurrence, uniquement à partir des « faits_de_marche_sources ». Une puce par thème. Cite l'organisme source entre parenthèses après chaque chiffre de marché (par exemple « (INSEE, 2024) »). Si les faits de marché manquent, dis-le et ajoute la demande à a_completer.",
    donnees: ["entreprise", "activite", "marche"] },
  { cle: "clients", titre: T, court: T, partie: 3, point_fort: 4,
    consigne: "Analyse la clientèle comme un repreneur le ferait : typologie des clients, zone commerciale, concentration (part du premier client, des cinq premiers), ancienneté des relations, part récurrente du chiffre d'affaires. Le tableau des principaux clients est affiché à part : commente-le. Si la concentration est élevée, dis-le factuellement et indique ce qui l'atténue s'il est fourni ; ne la masque pas.",
    donnees: ["activite", "clients", "indicateurs", "faits:clients,marche"] },
  { cle: "finances", titre: T, court: T, partie: 4, point_fort: 5,
    consigne: "Commente la trajectoire financière à partir des indicateurs et des tableaux fournis : évolution du chiffre d'affaires (croissance annuelle moyenne), niveau et évolution de la marge d'EBE, nature de chaque retraitement entre l'EBE comptable et l'EBE retraité, endettement net (ou trésorerie nette) rapporté à l'EBE, besoin en fonds de roulement en jours de chiffre d'affaires. Les tableaux sont affichés à part : commente-les, ne les recopie pas en entier.",
    donnees: ["indicateurs", "compte_resultat", "ebe_retraite", "endettement"] },
  { cle: "perspectives", titre: T, court: T, partie: 5, point_fort: 6,
    consigne: "Présente 3 à 5 axes de développement identifiés par le dirigeant, un par puce, chacun avec ce qu'il suppose (investissement, recrutement, nouveaux marchés). Relie-les aux tendances de marché sourcées quand elles sont fournies. Présente toute croissance future comme l'estimation du dirigeant, jamais comme un fait.",
    donnees: ["atouts", "perspectives", "marche_resume", "faits:autre"] },
  { cle: "operation", titre: T, court: T, partie: 5, point_fort: null,
    consigne: "Présente l'opération : part du capital cédée, motif du cédant, accompagnement proposé au repreneur, calendrier souhaité, périmètre (détention des titres, situation des murs). Ton neutre et précis. Aucune indication de prix ni de valeur.",
    donnees: ["operation", "perimetre"] },
];
// Titres (parties et chapitres) : src/contenu/<langue>/serveur.json, lus dans la langue de la requête.
for (const x of PARTIES_MEMO) avecTextes(x, `serveur.memo.parties.${x.n}`);
for (const x of SECTIONS_MEMO) avecTextes(x, `serveur.memo.sections.${x.cle}`);

const ok = (v) => typeof v === "number" && Number.isFinite(v);
const exercicesDe = (entree) => entree?.exercices || [];

/** Taux de croissance annuel moyen entre deux valeurs positives séparées de `ans` années. */
export function tcam(debut, fin, ans) {
  if (!(debut > 0) || !(fin > 0) || !(ans > 0)) return null;
  return Math.pow(fin / debut, 1 / ans) - 1;
}

/**
 * Compte de résultat des exercices validés : montants (charges en négatif), croissance annuelle (annualisée quand les
 * exercices ne se suivent pas) et ratios en % du chiffre d'affaires. L'EBE est celui du moteur (pont : EBE comptable).
 */
export function compteResultat(entree, resultat) {
  const exs = exercicesDe(entree);
  const annees = exs.map((e) => e.annee);
  const ebeParAnnee = Object.fromEntries((resultat?.pont_ebe || []).map((p) => [p.annee, p.ebe_comptable]));
  const brut = (cle) => exs.map((e) => (cle === "ebe" ? (ok(ebeParAnnee[e.annee]) ? ebeParAnnee[e.annee] : ok(e.ebe) ? e.ebe : null) : ok(e[cle]) ? e[cle] : null));
  const ca = brut("chiffre_affaires");
  const achats = brut("achats_consommes");
  const parCa = (vals) => vals.map((v, i) => (ok(v) && ca[i] > 0 ? v / ca[i] : null));
  const negatif = (vals) => vals.map((v) => (ok(v) ? -v : null));
  const croissance = ca.map((v, i) => (i === 0 ? null : tcam(ca[i - 1], v, annees[i] - annees[i - 1])));
  const margeBrute = ca.map((v, i) => (ok(v) && ok(achats[i]) ? v - achats[i] : null));
  const ebe = brut("ebe"), rex = brut("resultat_exploitation"), rn = brut("resultat_net");
  const lignes = [
    { cle: "chiffre_affaires", libelle: tr("demarrer.js.chiffres.ca"), type: "total", valeurs: ca },
    { cle: "croissance", libelle: tr("serveur.memo.cr.croissance"), type: "ratio", valeurs: croissance },
    { cle: "achats_consommes", libelle: tr("memo.js.charges.achats"), type: "montant", valeurs: negatif(achats) },
    { cle: "marge_brute", libelle: tr("memo.js.finances.marge_brute"), type: "total", valeurs: margeBrute },
    { cle: "marge_brute_pct", libelle: tr("serveur.memo.cr.pct_ca"), type: "ratio", valeurs: parCa(margeBrute) },
    { cle: "charges_externes", libelle: tr("champs.champs.charges_externes.libelle"), type: "montant", valeurs: negatif(brut("charges_externes")) },
    { cle: "impots_taxes", libelle: tr("memo.js.charges.impots"), type: "montant", valeurs: negatif(brut("impots_taxes")) },
    { cle: "charges_personnel", libelle: tr("champs.champs.charges_personnel.libelle"), type: "montant", valeurs: negatif(brut("charges_personnel")) },
    { cle: "ebe", libelle: tr("demarrer.js.chiffres.ebe"), type: "total", valeurs: ebe },
    { cle: "ebe_pct", libelle: tr("teaser.js.marge_ebe"), type: "ratio", valeurs: parCa(ebe) },
    { cle: "dotations_amortissements", libelle: tr("champs.champs.dotations_amortissements.libelle"), type: "montant", valeurs: negatif(brut("dotations_amortissements")) },
    { cle: "resultat_exploitation", libelle: tr("champs.champs.resultat_exploitation.libelle"), type: "total", valeurs: rex },
    { cle: "resultat_exploitation_pct", libelle: tr("serveur.memo.cr.pct_ca"), type: "ratio", valeurs: parCa(rex) },
    { cle: "resultat_net", libelle: tr("demarrer.js.chiffres.rn"), type: "total", valeurs: rn },
    { cle: "resultat_net_pct", libelle: tr("serveur.memo.cr.pct_ca"), type: "ratio", valeurs: parCa(rn) },
  ].filter((l) => l.valeurs.some(ok));
  const premier = annees[0], dernier = annees.at(-1), ans = dernier - premier;
  const consecutifs = annees.every((a, i) => i === 0 || a - annees[i - 1] === 1);
  return {
    annees, lignes, consecutifs,
    tcam: annees.length >= 2 ? { de: premier, a: dernier, ca: tcam(ca[0], ca.at(-1), ans), ebe: tcam(ebe[0], ebe.at(-1), ans) } : null,
  };
}

/** Passage de l'EBE comptable à l'EBE retraité, par exercice ; une ligne par nature de retraitement. */
export function tableauEbeRetraite(entree, resultat) {
  const pont = resultat?.pont_ebe || [];
  const annees = pont.map((p) => p.annee);
  const ca = annees.map((a) => exercicesDe(entree).find((e) => e.annee === a)?.chiffre_affaires ?? null);
  const natures = [];
  for (const p of pont) for (const l of p.lignes) {
    const n = natures.find((x) => x.cle === l.cle && x.libelle === l.libelle);
    if (!n) natures.push({ cle: l.cle, libelle: l.libelle, justification: l.justification || null });
    else if (!n.justification && l.justification) n.justification = l.justification;
  }
  const retraitements = natures.map((n) => ({ ...n, valeurs: pont.map((p) => {
    const l = p.lignes.filter((x) => x.cle === n.cle && x.libelle === n.libelle);
    return l.length ? l.reduce((s, x) => s + x.montant, 0) : null;
  }) }));
  const retraite = pont.map((p) => p.ebe_retraite);
  return {
    annees,
    ebe_comptable: pont.map((p) => p.ebe_comptable),
    retraitements,
    ebe_retraite: retraite,
    marge_retraitee: retraite.map((v, i) => (ok(v) && ca[i] > 0 ? v / ca[i] : null)),
    normatif: resultat?.ebe_normatif ?? null,
  };
}

/** Endettement net au dernier exercice (lignes non nulles), rapporté à l'EBE normatif ; BFR en jours de CA. */
export function tableauEndettement(entree, resultat) {
  const dn = resultat?.dette_nette;
  if (!dn) return null;
  const normatif = resultat.ebe_normatif?.valeur;
  return {
    annee: exercicesDe(entree).at(-1)?.annee ?? null,
    lignes: dn.lignes.filter((l) => ok(l.montant) && l.montant !== 0),
    total: dn.total,
    sur_ebe: ok(normatif) && normatif > 0 ? dn.total / normatif : null,
    bfr: (resultat.bfr?.normatif?.par_exercice || []).map((b) => ({ annee: b.annee, jours: ok(b.jours) ? b.jours : null, montant: b.bfr })),
  };
}

/** Principaux clients (anonymes), triés par part décroissante ; concentration dérivée du tableau s'il est rempli. */
export function clientsPrincipaux(reponses = {}) {
  const c = reponses.clients || {};
  const lignes = (Array.isArray(c.principaux) ? c.principaux : [])
    .filter((x) => ok(x?.part) && x.part > 0 && x.part <= 1)
    .sort((a, b) => b.part - a.part).slice(0, 5)
    .map((x, i) => ({ rang: i + 1, part: x.part, anciennete: ok(x.anciennete) ? x.anciennete : null, secteur: x.secteur || null }));
  const somme = lignes.reduce((s, x) => s + x.part, 0);
  return {
    lignes,
    premier: lignes.length ? lignes[0].part : ok(c.part_premier_client) ? c.part_premier_client : null,
    cinq: lignes.length >= 5 ? somme : ok(c.part_cinq_clients) ? c.part_cinq_clients : lignes.length ? somme : null,
    cinq_complet: lignes.length >= 5 || ok(c.part_cinq_clients),
    recurrent: ok(c.part_recurrente) ? c.part_recurrente : null,
  };
}

/** Périmètre de l'opération : détention des titres, situation des murs, part cédée (réponses du dirigeant). */
export function perimetre(reponses = {}) {
  const o = reponses.operation || {}, r = reponses.retraitements || {};
  const connu = (v, liste) => (Object.values(liste).includes(v) ? v : null);
  return {
    detention: connu(o.detention, DETENTION),
    holding: o.detention === DETENTION.holding,
    associes: o.detention === DETENTION.associes,
    murs: connu(r.murs, MURS),
    murs_cession: r.murs === MURS.dirigeant ? connu(r.murs_cession, MURS_CESSION) : null,
    part_cedee: o.part_cedee ?? null,
  };
}

/** Origine des chiffres, par exercice validé : « liasses fiscales 2023 et 2024 ; comptes déposés (INPI) 2022 ». */
const origine = (o, n) => tr(`serveur.memo.origines.${o}`, { n });
export function sourcesChiffres(lignesChiffres = {}, annees = []) {
  const parOrigine = {};
  for (const a of annees) {
    const cellules = Object.values(lignesChiffres[a] || {}).filter((x) => x.valide && ok(x.valeur));
    const presentes = new Set(cellules.map((x) => x.source));
    const o = ["liasse", "dirigeant", "inpi"].find((s) => presentes.has(s));
    if (o) (parOrigine[o] ??= []).push(a);
  }
  const liste = (l) => (l.length === 1 ? String(l[0]) : tr("dossier.annees.liste", { debut: l.slice(0, -1).join(", "), fin: l.at(-1) }));
  return ["liasse", "dirigeant", "inpi"].filter((o) => parOrigine[o])
    .map((o) => `${origine(o, parOrigine[o].length)} ${liste(parOrigine[o])}`).join(" ; ") || null;
}

/** Indicateurs clés, calculés ici et déjà mis en forme : Claude les recopie, il ne calcule rien. */
export function indicateurs({ cr, ebeR, endet, clients, entreprise }) {
  const d = (cle) => cr.lignes.find((l) => l.cle === cle)?.valeurs.at(-1) ?? null;
  const ca = d("chiffre_affaires"), ebe = d("ebe");
  const retraite = ebeR.ebe_retraite.at(-1) ?? null;
  return {
    dernier_exercice: cr.annees.at(-1) ?? null,
    chiffre_affaires: ok(ca) ? montant(ca) : null,
    croissance_derniere_annee: ok(d("croissance")) ? pourcent(d("croissance"), { signe: true }) : null,
    croissance_annuelle_moyenne: cr.tcam && ok(cr.tcam.ca) ? `${pourcent(cr.tcam.ca, { signe: true })} par an entre ${cr.tcam.de} et ${cr.tcam.a}` : null,
    ebe_comptable: ok(ebe) ? montant(ebe) : null,
    marge_ebe: ok(ebe) && ca > 0 ? pourcent(ebe / ca) : null,
    ebe_retraite: ok(retraite) && retraite !== ebe ? montant(retraite) : null,
    marge_ebe_retraitee: ok(retraite) && retraite !== ebe && ca > 0 ? pourcent(retraite / ca) : null,
    resultat_net: ok(d("resultat_net")) ? montant(d("resultat_net")) : null,
    endettement_net: endet && ok(endet.total) ? (endet.total < 0 ? `trésorerie nette de ${montant(-endet.total)}` : `dette nette de ${montant(endet.total)}`) : null,
    dette_nette_sur_ebe: endet && ok(endet.sur_ebe) && endet.total > 0 ? multiple(endet.sur_ebe) : null,
    bfr_jours_de_ca: endet?.bfr?.length && ok(endet.bfr.at(-1).jours) ? `${Math.round(endet.bfr.at(-1).jours)} jours` : null,
    part_premier_client: ok(clients.premier) ? pourcent(clients.premier, { decimales: 0 }) : null,
    part_cinq_premiers_clients: ok(clients.cinq) && clients.cinq_complet ? pourcent(clients.cinq, { decimales: 0 }) : null,
    part_recurrente_du_ca: ok(clients.recurrent) ? pourcent(clients.recurrent, { decimales: 0 }) : null,
    effectif: libelleEffectif(entreprise.tranche_effectif?.code) ?? null,
  };
}

/** Tout ce que le mémorandum calcule, en une fois (servi à la page et aux consignes de rédaction). */
export function chiffresMemo({ entreprise = {}, entree, resultat, reponses = {}, lignesChiffres = {} }) {
  const cr = compteResultat(entree, resultat);
  const ebeR = tableauEbeRetraite(entree, resultat);
  const endet = tableauEndettement(entree, resultat);
  const clients = clientsPrincipaux(reponses);
  return { cr, ebeR, endet, clients, perimetre: perimetre(reponses), indicateurs: indicateurs({ cr, ebeR, endet, clients, entreprise }), sources: sourcesChiffres(lignesChiffres, cr.annees) };
}

/** Données transmises à Claude pour une section (uniquement ce dont la section a besoin). */
export function donneesSection(section, { entreprise, entree, resultat, reponses = {}, lignesChiffres = {} }) {
  const site = reponses.site || {};
  // Faits validés, sauf ceux que les registres contredisent tant que le dirigeant n'a pas tranché
  const faitsValides = faitsUtilisables((site.faits || []).filter((f) => f.valide), entreprise);
  const ch = chiffresMemo({ entreprise, entree, resultat, reponses, lignesChiffres });
  const d = {};
  for (const cle of section.donnees) {
    if (cle === "entreprise") d.entreprise = { nom: entreprise.nom, ville: entreprise.ville, date_creation: entreprise.date_creation, anciennete: anciennete(entreprise.date_creation), secteur: secteurDe(entreprise.naf), activite_naf: activiteFine(entreprise.naf), code_naf: entreprise.naf, effectif: libelleEffectif(entreprise.tranche_effectif?.code) };
    else if (cle === "frise") d.frise_publique = (entreprise.evenements || []).map((e) => ({ date: e.date, type: e.type, detail: e.detail ?? (e.nouveau ? `${e.ancien ?? ""} → ${e.nouveau}` : null) }));
    else if (cle === "activite") d.activite = reponses.activite || {};
    else if (cle === "atouts") d.atouts = reponses.atouts || {};
    else if (cle === "perspectives") d.perspectives_du_dirigeant = { ...(reponses.perspectives || {}), croissance: ok(reponses.perspectives?.croissance) ? `${pourcent(reponses.perspectives.croissance, { signe: true, decimales: 0 })} par an (estimation du dirigeant)` : null };
    else if (cle === "operation") d.operation = reponses.operation || {};
    else if (cle === "perimetre") d.perimetre = ch.perimetre;
    else if (cle === "marche" || cle === "marche_resume") {
      const m = reponses.marche || {}, sct = m.secteur;
      const faits = (m.faits || []).filter((f) => f.valide).map((f) => ({ theme: f.theme, fait: f.fait, chiffre: f.chiffre, annee: f.annee, source: f.source }));
      d.structure_du_secteur = sct ? {
        source: sct.source, region: sct.region, entreprises_actives_dans_la_region: sct.region_total,
        part_de_moins_de_10_salaries: pourcent(sct.part_moins_10, { decimales: 0 }),
        place_de_l_entreprise: sct.part_meme_taille_ou_plus == null ? null : `parmi les ${pourcent(sct.part_meme_taille_ou_plus, { decimales: 0 })} d'entreprises de la région de sa taille ou plus grandes (${sct.nombre_meme_taille_ou_plus_region} entreprises)`,
        entreprises_de_10_salaries_et_plus_en_france: sct.france_10_plus == null ? null : `${sct.france_10_plus_plafonne ? "plus de " : ""}${sct.france_10_plus}`,
      } : null;
      d.faits_de_marche_sources = cle === "marche" ? faits : faits.slice(0, 3);
    }
    else if (cle === "clients") d.clients = { ...(reponses.clients || {}), principaux: ch.clients.lignes.map((x) => ({ client: `Client ${x.rang}`, part_du_ca: pourcent(x.part, { decimales: 0 }), client_depuis: x.anciennete == null ? null : `${x.anciennete} ans`, activite: x.secteur })) };
    else if (cle === "dirigeant_role") { const dg = reponses.dirigeant || {}; d.organisation_declaree = { role_actuel_du_dirigeant: dg.role_dirigeant ?? null, encadrement_en_place: dg.encadrement ?? null, anciennete_moyenne_des_salaries: dg.anciennete_equipe ?? null }; }
    else if (cle === "equipe") { const l = equipePourClaude(reponses.equipe); if (l.length) d.equipe_dirigeante = l; }
    else if (cle === "indicateurs") d.indicateurs_calcules = ch.indicateurs;
    else if (cle === "compte_resultat") d.compte_de_resultat = { annees: ch.cr.annees, exercices_consecutifs: ch.cr.consecutifs, lignes: ch.cr.lignes.map((l) => ({ libelle: l.libelle, valeurs: l.valeurs.map((v) => (v == null ? null : l.type === "ratio" ? pourcent(v, { signe: l.cle === "croissance" }) : montant(v))) })) };
    else if (cle === "ebe_retraite") d.passage_ebe_comptable_ebe_retraite = { annees: ch.ebeR.annees, ebe_comptable: ch.ebeR.ebe_comptable.map(montant), retraitements: ch.ebeR.retraitements.map((r) => ({ nature: r.libelle, montants: r.valeurs.map((v) => (v == null ? null : montant(v))) })), ebe_retraite: ch.ebeR.ebe_retraite.map(montant), justifications: (reponses.retraitements?.exceptionnels || []).map((e) => ({ annee: e.annee, libelle: e.libelle, justification: e.justification })) };
    else if (cle === "endettement") d.endettement = ch.endet ? { exercice: ch.endet.annee, composantes: ch.endet.lignes.map((l) => ({ libelle: l.libelle, montant: montant(l.montant) })), total: ch.endet.total < 0 ? `trésorerie nette de ${montant(-ch.endet.total)}` : `dette nette de ${montant(ch.endet.total)}`, bfr_jours_de_ca: ch.endet.bfr.map((b) => ({ annee: b.annee, jours: b.jours == null ? null : Math.round(b.jours) })) } : null;
    else if (cle.startsWith("faits:")) { const cats = cle.slice(6).split(","); d.faits_du_site_valides = faitsValides.filter((f) => cats.includes(f.categorie)).map((f) => ({ fait: f.fait, source: f.source })); }
  }
  // Réponses du dirigeant aux demandes « à compléter » de ce chapitre (panneau d'amélioration)
  const complements = (reponses.complements?.[section.cle] || []).filter((c) => c?.demande && c?.reponse);
  if (complements.length) d.complements_du_dirigeant = complements.map((c) => ({ demande: String(c.demande).slice(0, 300), reponse: String(c.reponse).slice(0, 600) }));
  return d;
}

/** Le mémorandum s'ouvre quand l'activité est décrite et l'opération précisée. */
export function memoDeverrouille(reponses = {}) {
  const manque = [];
  if (!reponses.activite?.description?.trim()) manque.push(tr("serveur.memo.manque.activite"));
  if (!reponses.operation?.part_cedee) manque.push(tr("serveur.memo.manque.operation"));
  return { ok: manque.length === 0, manque };
}

/** Profil affiché dans les mises en avant des diapositives (données publiques + réponses du dirigeant). */
export function profilMemo(entreprise = {}, reponses = {}, codeName = null) {
  const c = clientsPrincipaux(reponses), o = reponses.operation || {}, a = reponses.activite || {};
  return {
    nom_de_code: codeName || (entreprise.naf ? projet(entreprise.naf) : "Projet"),
    secteur: secteurDe(entreprise.naf),
    ville: entreprise.ville ?? null, region: regionDe(entreprise.code_postal),
    creation: entreprise.date_creation ? Number(String(entreprise.date_creation).slice(0, 4)) : null,
    effectif: libelleEffectif(entreprise.tranche_effectif?.code),
    zone: a.zone ?? null,
    clients: { premier: c.premier, cinq: c.cinq_complet ? c.cinq : null, recurrent: c.recurrent, regions: Array.isArray(reponses.clients?.regions) ? reponses.clients.regions : [] },
    operation: { part_cedee: o.part_cedee ?? null, motif: o.motif ?? null, accompagnement: o.accompagnement ?? null, calendrier: o.calendrier ?? null },
    perspectives: { croissance: ok(reponses.perspectives?.croissance) ? reponses.perspectives.croissance : null, marge_ebe: ok(reponses.perspectives?.marge_ebe) ? reponses.perspectives.marge_ebe : null },
    frise: (entreprise.evenements || []).map((e) => ({ annee: Number(String(e.date || "").slice(0, 4)) || null, type: e.type })).filter((e) => e.annee),
  };
}

/** Titre affirmatif et accroche rédigés : acceptés s'ils sont courts et sans marque de mise en forme. */
export function titreValide(t, max = 110) {
  const s = String(t || "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  return s && s.length <= max && !/[*#_`]/.test(s) ? s : null;
}
