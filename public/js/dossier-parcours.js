// Page d'un dossier et parcours guidé (module pur, testé dans test/dossier-parcours.test.js) : à partir du détail du
// dossier (GET /api/dossiers/:id) et, s'il est rédigé, du mémorandum (GET …/documents/memo), on déduit l'état unique
// lu par les deux pages :
//   - le fil du parcours en 5 étapes (fait, actuelle, à venir), liste unique ETAPES_PARCOURS ;
//   - « À faire maintenant » : 3 tâches au plus, l'indispensable d'abord (chiffres, questions, rédaction), puis le
//     facultatif (exercices précédents, recommandations du mémorandum, pièces) ;
//   - l'action principale, qui reprend exactement la première tâche ;
//   - l'avancement en %, le statut « prêt » (100 % si et seulement si tout l'indispensable est fait) ;
//   - l'état des 4 documents, la fourchette affichée, ce sur quoi elle repose et l'explication de son évolution.
// Aucune donnée n'est inventée : tout vient des deux réponses de l'API.
import { CHECKLIST, avancement } from "./dossier-regles.js";
import { fourchette, montant } from "./landing/estimation.js";
import { lien } from "./i18n.js";

/** Liste unique des étapes, pour la page du dossier et le parcours guidé (mêmes libellés, même ordre). */
export const ETAPES_PARCOURS = [
  ["estimation", "Estimation"], ["chiffres", "Vos chiffres"], ["reponses", "Vos réponses"],
  ["redaction", "Rédaction"], ["relecture", "Relecture et envoi"],
];
/** Écran du parcours guidé → étape du fil. Le site est une question de « Vos réponses ». */
export const ETAPE_DE_L_ECRAN = { comptes: "chiffres", saisie: "chiffres", chiffres: "chiffres", questions: "reponses", site: "reponses", redaction: "redaction", pret: "relecture" };
/** Étiquettes de la valeur, identiques partout (fiche de l'accueil, page du dossier, parcours guidé, valorisation). */
export const ETIQUETTE_EXPRESS = "Valeur d'entreprise estimée";
export const ETIQUETTE_TITRES = "Valeur de vos titres";
export const NB_PIECES = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
/** Seuil des questions (en %) à partir duquel la rédaction peut être lancée. */
const SEUIL_REDACTION = 40;
const MAX_TACHES = 3;

const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
/** « 2024 » ; « 2023 et 2024 » ; « 2022 à 2024 » (consécutifs) ; « 2019, 2021 et 2024 ». */
export function listeAnnees(annees = []) {
  const l = [...annees].sort((a, b) => a - b);
  if (l.length <= 1) return l.join("");
  if (l.length > 2 && l.every((a, i) => !i || a - l[i - 1] === 1)) return `${l[0]} à ${l.at(-1)}`;
  return `${l.slice(0, -1).join(", ")} et ${l.at(-1)}`;
}
/** Horodatage en secondes (format de la base) → « 18/11/2026 », heure de Paris. */
export function dateCourte(secondes) {
  if (!Number.isFinite(secondes)) return null;
  return new Date(secondes * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Points « À compléter » du mémorandum, un par élément signalé dans un chapitre : « Équipe : Nombre de salariés ».
 *  Seul décompte du travail restant (page du dossier, tâches et écran final du parcours guidé). */
export function pointsACompleter(memo) {
  return (memo?.sections || []).flatMap((s) => (s.a_completer || []).map((t) => `${s.titre} : ${t}`));
}
/** « 1 point à compléter », « 4 points à compléter ». */
export const libellePoints = (n) => `${n} ${pluriel(n, "point", "points")} à compléter`;

/** Une partie du teaser compte comme rédigée si elle a un vrai texte (ni vide, ni « À compléter »). */
const partieRedigee = (contenu) => { const t = String(contenu ?? "").trim(); return t !== "" && !/^à compléter\.?$/i.test(t); };
/** Parties du teaser encore vides (GET …/documents/teaser). Toutes sont indispensables : la page est courte. */
export function partiesTeaserVides(teaser) {
  return (teaser?.teaser?.sections || []).filter((s) => !partieRedigee(s.contenu));
}

/** Lecture du mémorandum : chapitres non rédigés, éléments « À compléter », photos. null si non rédigé. */
export function lectureMemo(memo) {
  if (!memo) return null;
  const sections = memo.sections || [];
  const aCompleter = sections.filter((s) => (s.a_completer || []).length);
  return {
    nonRedigees: sections.filter((s) => !s.redigee),
    aCompleter,
    nbACompleter: pointsACompleter(memo).length,
    photos: (memo.photos || []).length,
  };
}

/** Résultat du moteur (valorisationApprofondie) → ce que voit le dirigeant : la fourchette des titres (jamais la
 *  valeur centrale) et ce qui l'explique. Utilisé par le serveur (détail du dossier) et la page valorisation. */
export function resumeValorisation(r) {
  const s = r?.synthese;
  if (!s || !Number.isFinite(s.bas) || !Number.isFinite(s.haut)) return null;
  return { bas: s.bas, haut: s.haut, plancher_ancc: s.plancher_ancc ?? null,
    annees: r.annees || [], ebe_normatif: r.ebe_normatif?.valeur ?? null, dette_nette: r.dette_nette?.total ?? null,
    facteur_decotes: r.pont_titres?.facteur_decotes ?? 1, ecart_bfr: r.pont_titres?.ecart_bfr ?? 0, hors_exploitation: r.pont_titres?.hors_exploitation ?? 0 };
}

/** Alertes du moteur montrées au dirigeant : celles des flux actualisés (méthode écartée, jamais affichée) sont
 *  retirées ; celle qui compare la valeur centrale à l'actif net est reformulée sur la fourchette. */
export function alertesDirigeant(alertes = []) {
  return alertes
    .filter((a) => !/DCF|valeur terminale|flux actualis/i.test(a))
    .map((a) => (/valeur centrale est inférieure à l'actif net/i.test(a)
      ? "Une partie de la fourchette est inférieure à l'actif net corrigé : celui-ci sert de plancher de négociation."
      : a));
}

/**
 * Phrase qui explique le passage de l'estimation express (valeur d'entreprise, comptes publics) à la valorisation
 * approfondie (valeur des titres, vos comptes), à partir des seuls montants calculés. null si la fourchette affichée
 * ne change pas ou s'il manque l'une des deux.
 * @param est  estimation express du dossier { statut, exercice, methode, agregat, bas, haut }
 * @param v    valorisation du dossier { bas, haut, annees, ebe_normatif, dette_nette, facteur_decotes, ecart_bfr, hors_exploitation }
 */
export function explicationEcart(est, v) {
  if (est?.statut !== "ok" || !v || !Number.isFinite(v.bas) || !Number.isFinite(v.haut)) return null;
  const avant = fourchette(est.bas, est.haut), apres = fourchette(v.bas, v.haut);
  if (avant === apres) return null;
  const m = (x) => montant(Math.abs(x), Math.abs(x));
  const visible = (x) => Number.isFinite(x) && Math.round(Math.abs(x) / 1e4) > 0; // 5 k€ au moins (arrondi à la dizaine de k€)
  const raisons = [];
  const an = (v.annees || []).filter(Number.isInteger);
  if (an.length) raisons.push(`comptes ${listeAnnees(an)} confirmés`);
  if (est.methode === "multiple_ca") raisons.push("calcul sur l'excédent brut d'exploitation (EBE) au lieu du chiffre d'affaires");
  else if (Number.isFinite(v.ebe_normatif) && Number.isFinite(est.agregat) && m(v.ebe_normatif) !== m(est.agregat)) {
    raisons.push(`excédent brut d'exploitation (EBE) retenu de ${m(v.ebe_normatif)} au lieu de ${m(est.agregat)}`);
  }
  const f = Number.isFinite(v.facteur_decotes) ? v.facteur_decotes : 1, pts = Math.round((f - 1) * 100);
  if (pts) raisons.push(`${pts < 0 ? "décotes" : "primes"} de ${Math.abs(pts)} % appliquées`);
  if (visible(v.dette_nette)) raisons.push(v.dette_nette < 0 ? `trésorerie nette de ${m(v.dette_nette)} ajoutée` : `dettes nettes de ${m(v.dette_nette)} déduites`);
  if (visible(v.ecart_bfr)) raisons.push(`besoin en fonds de roulement ${v.ecart_bfr > 0 ? "supérieur" : "inférieur"} à la normale : ${v.ecart_bfr > 0 ? "+" : "−"}${m(v.ecart_bfr)}`);
  if (visible(v.hors_exploitation) && v.hors_exploitation > 0) raisons.push(`actifs hors exploitation de ${m(v.hors_exploitation)} ajoutés`);
  const liste = raisons.length > 1 ? `${raisons.slice(0, -1).join(", ")} et ${raisons.at(-1)}` : raisons[0];
  return `Votre fourchette passe de ${avant} à ${apres}${liste ? ` : ${liste}` : ""}.`;
}

/**
 * @param d  détail du dossier (GET /api/dossiers/:id)
 * @param memo  réponse de GET …/documents/memo, ou null si le mémorandum n'est pas rédigé
 * @param teaser  réponse de GET …/documents/teaser, ou null si le teaser n'est pas rédigé
 */
export function etatParcours(d, memo = null, teaser = null) {
  const id = d.id, p = d.parcours || {}, docs = d.documents || {};
  const ex = p.exercices || { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] };
  const q = p.questions || { faits: 0, total: 0, pct: 0 };
  const restantes = Math.max(0, (q.total || 0) - (q.faits || 0));
  const v = p.valorisation && Number.isFinite(p.valorisation.bas) && Number.isFinite(p.valorisation.haut) ? p.valorisation : null;
  const m = docs.memo ? lectureMemo(memo) : null;
  const memoARelire = Boolean(m && (m.nonRedigees.length || m.nbACompleter));
  // Un document n'est « prêt » que s'il a du contenu : un teaser ou un mémorandum vide est « incomplet »
  const teaserVides = docs.teaser && teaser ? partiesTeaserVides(teaser) : [];
  const nbPartiesTeaser = teaser?.teaser?.sections?.length || 0;
  const fournies = new Set((d.checklist || []).filter((k) => CHECKLIST.some((g) => g.items.some(([c]) => c === k)))).size;
  const manquantes = NB_PIECES - fournies;

  const liens = {
    demarrer: lien(`/espace/demarrer/?dossier=${id}`),
    valorisation: lien(`/espace/valorisation/?dossier=${id}`),
    memo: lien(`/espace/documents/memo/?dossier=${id}`),
    teaser: lien(`/espace/documents/teaser/?dossier=${id}`),
    datapack: `/api/dossiers/${id}/documents/datapack`,
  };

  // ---------- Fil du parcours : une étape n'est faite que si le dirigeant a fait ou validé quelque chose
  const fait = {
    estimation: true, // le dirigeant a saisi son SIREN et vu la fiche : le dossier en est issu
    chiffres: Boolean(ex.dernier_complet), // le dernier exercice, confirmé par le dirigeant (jamais d'office)
    reponses: q.total > 0 && restantes === 0,
    redaction: Boolean(v && docs.memo && docs.teaser && !(m && m.nonRedigees.length) && !teaserVides.length),
    relecture: false, // l'envoi se fait hors de la page : l'étape reste la dernière ouverte
  };
  const pret = fait.chiffres && fait.reponses && fait.redaction;
  const redige = Boolean(v && docs.memo && docs.teaser); // documents produits (des chapitres peuvent rester à rédiger)
  const lienEtape = {
    estimation: `${liens.valorisation}#chiffres`, chiffres: `${liens.demarrer}&etape=chiffres`,
    reponses: `${liens.demarrer}&etape=questions`, redaction: liens.memo, relecture: liens.memo,
  };
  const actuelle = ETAPES_PARCOURS.find(([k]) => !fait[k])[0];
  const iActuelle = ETAPES_PARCOURS.findIndex(([k]) => k === actuelle);
  const etapes = ETAPES_PARCOURS.map(([cle, libelle], i) => ({
    cle, libelle, etat: i === iActuelle ? "actuelle" : fait[cle] ? "fait" : "a-venir",
    href: i !== iActuelle && fait[cle] ? lienEtape[cle] : null,
  }));

  // ---------- À faire maintenant : l'indispensable d'abord, puis le facultatif (marqué comme tel)
  const taches = [];
  if (!fait.chiffres) {
    taches.push(ex.dernier == null
      ? { cle: "chiffres", titre: "Confirmer votre dernier exercice", detail: "Aucun exercice confirmé pour l'instant", action: "Confirmer", href: liens.demarrer }
      : { cle: "chiffres", titre: `Confirmer l'exercice ${ex.dernier}`, detail: "Le seul exercice indispensable : la valorisation repose sur lui", action: "Confirmer", href: `${liens.demarrer}&etape=chiffres` });
  }
  if (restantes > 0) {
    taches.push({
      cle: "questions",
      titre: q.faits ? (restantes === 1 ? "Répondre à la dernière question" : `Répondre aux ${restantes} dernières questions`) : `Répondre aux ${q.total} questions`,
      detail: q.faits ? `${q.faits} sur ${q.total} déjà faites` : "Des écrans courts, la plupart en un clic",
      action: q.faits ? "Reprendre" : "Commencer", href: `${liens.demarrer}&etape=questions`,
    });
  }
  if (fait.chiffres && !fait.redaction && !m?.nonRedigees.length && !teaserVides.length && (restantes === 0 || (q.pct || 0) >= SEUIL_REDACTION)) {
    taches.push({ cle: "redaction", titre: v || docs.memo || docs.teaser ? "Terminer la rédaction" : "Lancer la rédaction", detail: "Valorisation, teaser et mémorandum, d'un coup", action: "Rédiger", href: `${liens.demarrer}&etape=redaction` });
  }
  if (m?.nonRedigees.length) {
    const n = m.nonRedigees.length;
    taches.push({ cle: "chapitres", titre: `Rédiger ${n} ${pluriel(n, "chapitre", "chapitres")} du mémorandum`, detail: `${pluriel(n, "Chapitre", "Chapitres")} : ${m.nonRedigees.map((s) => s.court || s.titre).join(", ")}`, action: "Rédiger", href: liens.memo });
  }
  if (teaserVides.length) {
    const n = teaserVides.length;
    taches.push({ cle: "teaser", titre: `Rédiger ${n} ${pluriel(n, "partie", "parties")} du teaser`, detail: `${pluriel(n, "Partie vide", "Parties vides")} : ${teaserVides.map((x) => x.titre).join(", ")}`, action: "Rédiger", href: liens.teaser });
  }
  if (fait.chiffres && ex.recommandes_manquants?.length) {
    const annees = [...ex.recommandes_manquants].sort((a, b) => b - a);
    taches.push({ cle: "exercices", facultatif: true, titre: `Ajouter ${annees.join(" et ")} pour fiabiliser la fourchette (facultatif)`,
      detail: `La fourchette repose déjà sur ${ex.dernier} ; les exercices précédents la confirment`, action: "Ajouter", href: `${liens.demarrer}&etape=exercice` });
  }
  if (m && m.photos < 2) {
    taches.push(m.photos === 0
      ? { cle: "photo", facultatif: true, titre: "Ajouter une photo de l'atelier ou des produits", detail: "Recommandation du mémorandum : elle rend la page « Savoir-faire » vivante", action: "Ajouter", href: `${liens.memo}#donnees` }
      : { cle: "photo", facultatif: true, titre: "Ajouter une photo de l'équipe ou du site", detail: "Recommandation du mémorandum, page « Équipe »", action: "Ajouter", href: `${liens.memo}#donnees` });
  }
  if (m?.nbACompleter) {
    const n = m.nbACompleter, chap = m.aCompleter.map((s) => `« ${s.court || s.titre} »`);
    taches.push({ cle: "a-completer", facultatif: true, titre: `Compléter ${n} ${pluriel(n, "point", "points")} du mémorandum`, detail: `Indiqués « À compléter » : ${chap.slice(0, 3).join(", ")}${chap.length > 3 ? "…" : ""}`, action: "Compléter", href: `${liens.memo}#section-${m.aCompleter[0].cle}` });
  }
  if (manquantes > 0) {
    taches.push({ cle: "pieces", facultatif: true, titre: fournies === 0 ? "Déposer vos premières pièces" : `Déposer ${manquantes} ${pluriel(manquantes, "pièce manquante", "pièces manquantes")}`, detail: `${fournies} ${pluriel(fournies, "pièce", "pièces")} sur ${NB_PIECES}`, action: "Déposer", href: "#checklist", pieces: true });
  }
  const affichees = taches.slice(0, MAX_TACHES);

  // ---------- Action principale : exactement la première tâche (même libellé, même lien)
  const action = affichees.length
    ? { texte: affichees[0].titre, href: affichees[0].href, cle: affichees[0].cle, pieces: Boolean(affichees[0].pieces) }
    : { texte: "Relire et envoyer votre dossier", href: `${liens.demarrer}&etape=pret`, cle: "relecture", pieces: false };

  // ---------- Avancement : 100 % si et seulement si tout l'indispensable est fait
  const brut = avancement({
    estimation_express: d.estimation?.statut === "ok", dernier_exercice: fait.chiffres, questions_pct: q.pct,
    valorisation_approfondie: Boolean(v), documents: ["datapack", "teaser", "memo"].filter((k) => docs[k]).length,
  }).global;
  const pct = pret ? 100 : Math.min(99, brut);

  // ---------- Documents
  const venir = (detail) => ({ etat: "a-venir", detail, actions: [] });
  const documents = [
    { cle: "valorisation", titre: "Valorisation", ...(v
      ? { etat: "pret", detail: p.valorisation_le ? `Mise à jour le ${dateCourte(p.valorisation_le)}` : "Prête", actions: [{ libelle: "Ouvrir", href: `${liens.valorisation}#valorisation`, principal: true }, { libelle: "Télécharger l'Excel", href: liens.datapack, telecharger: true }] }
      : venir(fait.chiffres ? "Calculée à l'étape Rédaction, avec vos réponses." : "Se débloque avec vos chiffres et vos réponses.")) },
    { cle: "datapack", titre: "Datapack Excel", ...(p.exercices_complets
      ? { etat: "pret", detail: docs.datapack ? `Mis à jour le ${dateCourte(docs.datapack.le)}${docs.datapack.version > 1 ? ` · version ${docs.datapack.version}` : ""}` : "Préparé à partir de vos chiffres confirmés", actions: [{ libelle: "Télécharger l'Excel", href: liens.datapack, principal: true, telecharger: true }] }
      : venir("Se débloque dès qu'un exercice est confirmé.")) },
    { cle: "teaser", titre: "Teaser anonyme", ...(docs.teaser
      ? teaserVides.length
        ? { etat: "incomplet", detail: `${teaserVides.length} ${pluriel(teaserVides.length, "partie", "parties")} sur ${nbPartiesTeaser} à rédiger`, actions: [{ libelle: "Rédiger", href: liens.teaser, principal: true }] }
        : { etat: "pret", detail: `Rédigé le ${dateCourte(docs.teaser.le)}`, actions: [{ libelle: "Ouvrir", href: liens.teaser, principal: true }, { libelle: "Télécharger en PDF", href: `${liens.teaser}&imprimer=1` }] }
      : venir("Rédigé à l'étape Rédaction, après vos réponses.")) },
    { cle: "memo", titre: "Mémorandum", ...(docs.memo
      ? m?.nonRedigees.length
        ? { etat: "incomplet", detail: `${m.nonRedigees.length} ${pluriel(m.nonRedigees.length, "chapitre", "chapitres")} sur ${(memo?.sections || []).length} à rédiger`, actions: [{ libelle: "Rédiger", href: liens.memo, principal: true }] }
        : { etat: memoARelire ? "a-relire" : "pret", detail: `Rédigé le ${dateCourte(docs.memo.le)}${m?.nbACompleter ? ` · ${libellePoints(m.nbACompleter)}` : ""}`, actions: [{ libelle: "Ouvrir", href: liens.memo, principal: true }, { libelle: "Télécharger en PDF", href: `${liens.memo}&imprimer=1` }] }
      : venir("Rédigé à l'étape Rédaction, après vos réponses.")) },
  ];

  // ---------- Fourchette affichée (jamais de valeur centrale), ce sur quoi elle repose, et pourquoi elle a changé
  const est = d.estimation;
  let valeur;
  if (v) {
    valeur = { etiquette: ETIQUETTE_TITRES, bas: v.bas, haut: v.haut,
      base: "Fondée sur les multiples d'EBE (excédent brut d'exploitation) de votre secteur, après dettes et trésorerie.",
      ecart: explicationEcart(est, v),
      lien: { texte: "Voir le détail", href: `${liens.valorisation}#valorisation` } };
  } else if (est?.statut === "ok") {
    valeur = { etiquette: `${ETIQUETTE_EXPRESS}${est.exercice ? ` · comptes ${est.exercice}` : ""}`, bas: est.bas, haut: est.haut,
      base: "Estimée sur les derniers comptes publics et les multiples du secteur, avant dettes et trésorerie ; vos chiffres la préciseront.",
      ecart: null, lien: { texte: "Voir le calcul", href: `${liens.valorisation}#chiffres` } };
  } else {
    valeur = { etiquette: "Valorisation", bas: null, haut: null,
      base: "Les comptes publics ne suffisent pas pour une première estimation : vos chiffres permettront de la calculer.",
      ecart: null, lien: { texte: "Saisir vos chiffres", href: liens.demarrer } };
  }

  return {
    etapes, actuelle, fait, pret, redige, avancement: pct, action, taches: affichees, documents, valeur,
    questions: { faits: q.faits || 0, total: q.total || 0, restantes },
    pieces: { fournies, total: NB_PIECES, ouvert: actuelle === "relecture" && manquantes > 0 && affichees.length > 0 && affichees.every((t) => t.cle === "pieces") },
  };
}

/** Écran final du parcours guidé : « prêt » seulement si tout l'indispensable est fait ; sinon « rédigé » (ou pas
 *  encore), avec exactement les mêmes tâches que « À faire maintenant » sur la page du dossier. */
export function ecranFinal(e) {
  if (e.pret) {
    return { titre: "Votre dossier est prêt", aide: "Relisez chaque document avant de le diffuser. Vous pouvez tout modifier.",
      resteTitre: e.taches.length ? "Pour aller plus loin (facultatif)" : null, reste: e.taches };
  }
  return { titre: e.redige ? "Votre dossier est rédigé" : "Votre dossier n'est pas encore rédigé",
    aide: `Il n'est pas encore prêt à être envoyé : ${e.avancement} % du parcours. Voici ce qui reste.`,
    resteTitre: "Ce qui reste à faire", reste: e.taches };
}
