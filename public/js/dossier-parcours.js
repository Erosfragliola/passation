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
import { CHECKLIST } from "./dossier-regles.js";
import { QUESTIONS } from "./parcours.js";
import { fourchette, montant } from "./landing/estimation.js";
import { lien, t, locale } from "./i18n.js";

/**
 * Two stages (24/11/2026, part C): the owner first wants to know what the company is worth and why, then the
 * memorandum. Single list of steps, for the file page and the guided steps (same labels, same order).
 */
export const TEMPS = [
  { cle: "valorisation", etapes: ["chiffres", "retraitements", "dette", "valeur"] },
  { cle: "memo", etapes: ["entreprise", "photos", "equipe", "redaction"] },
];
for (const x of TEMPS) Object.defineProperty(x, "titre", { get: () => t(`dossier.temps.${x.cle}`), enumerable: true });
export const ETAPES_PARCOURS = TEMPS.flatMap((x) => x.etapes.map((cle) => [cle]));
// Libellés : src/contenu/<langue>/dossier.json, lus à chaque accès (élément 1 de chaque paire).
for (const e of ETAPES_PARCOURS) Object.defineProperty(e, 1, { get: () => t(`dossier.etapes.${e[0]}`), enumerable: true, configurable: true });
/** Stage of a step ("valorisation" or "memo"). */
export const tempsDe = (cle) => TEMPS.find((x) => x.etapes.includes(cle))?.cle ?? null;
/** Écran du parcours guidé → étape du fil. Le site est une question de « Votre entreprise ». */
export const ETAPE_DE_L_ECRAN = { accueil: "chiffres", comptes: "chiffres", saisie: "chiffres", chiffres: "chiffres", exercices: "chiffres",
  retraitements: "retraitements", dette: "dette", valeur: "valeur",
  questions: "entreprise", site: "entreprise", photos: "photos", equipe: "equipe", redaction: "redaction", pret: "redaction" };
/** Name of a question still without an answer (the website or a question of the memorandum). */
export const nomQuestion = (id) => (id === "site" ? t("dossier.question_site") : QUESTIONS.find((q) => q.id === id)?.titre ?? id);
/** Étiquettes de la valeur, identiques partout (fiche de l'accueil, page du dossier, parcours guidé, valorisation). */
export const etiquetteExpress = () => t("dossier.etiquette_express");
export const etiquetteTitres = () => t("dossier.etiquette_titres");
export const NB_PIECES = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
/** Seuil des questions (en %) à partir duquel la rédaction peut être lancée. */
const SEUIL_REDACTION = 40;
const MAX_TACHES = 3;
/** Page du dossier : au plus 2 tâches sous l'action principale (« trop d'information tue l'information »). */
export const MAX_SECONDAIRES = 2;

/** « 2024 » ; « 2023 et 2024 » ; « 2022 à 2024 » (consécutifs) ; « 2019, 2021 et 2024 ». */
export function listeAnnees(annees = []) {
  const l = [...annees].sort((a, b) => a - b);
  if (l.length <= 1) return l.join("");
  if (l.length > 2 && l.every((a, i) => !i || a - l[i - 1] === 1)) return t("dossier.annees.suite", { de: l[0], a: l.at(-1) });
  return t("dossier.annees.liste", { debut: l.slice(0, -1).join(", "), fin: l.at(-1) });
}
/** Horodatage en secondes (format de la base) → « 18/11/2026 », heure de Paris. */
export function dateCourte(secondes) {
  if (!Number.isFinite(secondes)) return null;
  return new Date(secondes * 1000).toLocaleDateString(locale(), { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Points « À compléter » du mémorandum, un par élément signalé dans un chapitre : « Équipe : Nombre de salariés ».
 *  Seul décompte du travail restant (page du dossier, tâches et écran final du parcours guidé). */
export function pointsACompleter(memo) {
  return (memo?.sections || []).flatMap((s) => (s.a_completer || []).map((x) => t("dossier.point", { chapitre: s.titre, point: x })));
}
/** « 1 point à compléter », « 4 points à compléter ». */
export const libellePoints = (n) => t("dossier.points_a_completer", { n });

/** Une partie du teaser compte comme rédigée si elle a un vrai texte (ni vide, ni « À compléter »). */
const partieRedigee = (contenu) => { const x = String(contenu ?? "").trim(); return x !== "" && !/^(à compléter|to be completed)\.?$/i.test(x); };
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
    photosTrouvees: (memo.site?.photos_candidates || []).length,
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
    .filter((a) => !/DCF|valeur terminale|flux actualis|terminal value|discounted cash/i.test(a))
    .map((a) => (/valeur centrale est inférieure à l'actif net|central value is below .*net assets/i.test(a)
      ? t("dossier.alerte_plancher")
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
  if (an.length) raisons.push(t("dossier.ecart.comptes", { annees: listeAnnees(an) }));
  if (est.methode === "multiple_ca") raisons.push(t("dossier.ecart.sur_ebe"));
  else if (Number.isFinite(v.ebe_normatif) && Number.isFinite(est.agregat) && m(v.ebe_normatif) !== m(est.agregat)) {
    raisons.push(t("dossier.ecart.ebe_retenu", { ebe: m(v.ebe_normatif), avant: m(est.agregat) }));
  }
  const f = Number.isFinite(v.facteur_decotes) ? v.facteur_decotes : 1, pts = Math.round((f - 1) * 100);
  if (pts) raisons.push(t(pts < 0 ? "dossier.ecart.decotes" : "dossier.ecart.primes", { pct: Math.abs(pts) }));
  if (visible(v.dette_nette)) raisons.push(t(v.dette_nette < 0 ? "dossier.ecart.tresorerie" : "dossier.ecart.dettes", { montant: m(v.dette_nette) }));
  if (visible(v.ecart_bfr)) raisons.push(t(v.ecart_bfr > 0 ? "dossier.ecart.bfr_superieur" : "dossier.ecart.bfr_inferieur", { montant: `${v.ecart_bfr > 0 ? "+" : "−"}${m(v.ecart_bfr)}` }));
  if (visible(v.hors_exploitation) && v.hors_exploitation > 0) raisons.push(t("dossier.ecart.hors_exploitation", { montant: m(v.hors_exploitation) }));
  const liste = raisons.length > 1 ? t("dossier.annees.liste", { debut: raisons.slice(0, -1).join(", "), fin: raisons.at(-1) }) : raisons[0];
  return liste ? t("dossier.ecart.phrase_raisons", { avant, apres, raisons: liste }) : t("dossier.ecart.phrase", { avant, apres });
}

/**
 * @param d  détail du dossier (GET /api/dossiers/:id)
 * @param memo  réponse de GET …/documents/memo, ou null si le mémorandum n'est pas rédigé
 * @param teaser  réponse de GET …/documents/teaser, ou null si le teaser n'est pas rédigé
 */
export function etatParcours(d, memo = null, teaser = null) {
  const id = d.id, p = d.parcours || {}, docs = d.documents || {};
  const ex = p.exercices || { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] };
  const q = p.questions || { faits: 0, total: 0, pct: 0, restantes: [] };
  const restantes = Math.max(0, (q.total || 0) - (q.faits || 0));
  const ev = p.etapes || {};
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
  const etape = (e) => `${liens.demarrer}&etape=${e}`;

  // ---------- Les deux temps : une étape n'est faite que si le dirigeant a fait ou validé quelque chose
  const fait = {
    // le dernier exercice confirmé, et les deux précédents confirmés ou passés en connaissance de cause
    chiffres: Boolean(ex.dernier_complet) && (!(ex.recommandes_manquants || []).length || Boolean(ev.exercices_passes)),
    retraitements: Boolean(ev.retraitements),
    dette: Boolean(ev.dette),
    // approved, and unchanged since (figures modified after the approval: to approve again)
    valeur: Boolean(ev.validation && v && ev.validation.a_jour !== false),
    entreprise: q.total > 0 && restantes === 0,
    photos: Boolean(ev.photos),
    equipe: Boolean(ev.equipe),
    redaction: Boolean(v && docs.memo && docs.teaser && !(m && m.nonRedigees.length) && !teaserVides.length),
  };
  const valorisationFaite = TEMPS[0].etapes.every((k) => fait[k]);
  const pret = ETAPES_PARCOURS.every(([k]) => fait[k]);
  const redige = Boolean(v && docs.memo && docs.teaser); // documents produits (des chapitres peuvent rester à rédiger)
  const lienEtape = {
    chiffres: etape("chiffres"), retraitements: etape("retraitements"), dette: etape("dette"), valeur: etape("valeur"),
    entreprise: etape("questions"), photos: etape("photos"), equipe: etape("equipe"), redaction: liens.memo,
  };
  const actuelle = ETAPES_PARCOURS.find(([k]) => !fait[k])?.[0] ?? "redaction";
  const iActuelle = ETAPES_PARCOURS.findIndex(([k]) => k === actuelle);
  const etapes = ETAPES_PARCOURS.map(([cle, libelle], i) => ({
    cle, libelle, temps: tempsDe(cle), etat: i === iActuelle && !pret ? "actuelle" : fait[cle] ? "fait" : "a-venir",
    href: (i !== iActuelle || pret) && fait[cle] ? lienEtape[cle] : null,
  }));
  const temps = TEMPS.map((x) => ({ cle: x.cle, titre: x.titre, fait: x.etapes.every((k) => fait[k]), etapes: etapes.filter((e) => e.temps === x.cle) }));

  // ---------- À faire maintenant : les étapes dans l'ordre (le mémorandum après la validation des chiffres), puis le
  // facultatif (marqué comme tel)
  const taches = [];
  if (!fait.chiffres) {
    if (!ex.dernier_complet) {
      taches.push(ex.dernier == null
        ? { cle: "chiffres", titre: t("dossier.taches.chiffres.titre_aucun"), detail: t("dossier.taches.chiffres.detail_aucun"), action: t("dossier.actions.confirmer"), href: liens.demarrer }
        : { cle: "chiffres", titre: t("dossier.taches.chiffres.titre", { annee: ex.dernier }), detail: t("dossier.taches.chiffres.detail"), action: t("dossier.actions.confirmer"), href: etape("chiffres") });
    } else {
      const annees = [...ex.recommandes_manquants].sort((a, b) => b - a);
      taches.push({ cle: "exercices", titre: t("dossier.taches.exercices.titre", { annees: listeAnnees(annees) }), detail: t("dossier.taches.exercices.detail"), action: t("dossier.actions.ajouter"), href: etape("exercices") });
    }
  }
  if (!fait.retraitements) taches.push({ cle: "retraitements", titre: t("dossier.taches.retraitements.titre"), detail: t("dossier.taches.retraitements.detail"), action: t("dossier.actions.commencer"), href: etape("retraitements") });
  if (!fait.dette) taches.push({ cle: "dette", titre: t("dossier.taches.dette.titre"), detail: t("dossier.taches.dette.detail"), action: t("dossier.actions.commencer"), href: etape("dette") });
  const aRevalider = Boolean(ev.validation && ev.validation.a_jour === false);
  if (!fait.valeur) {
    taches.push(aRevalider
      ? { cle: "valeur", titre: t("dossier.taches.valeur.a_revalider"), detail: t("dossier.taches.valeur.detail_revalider", { date: dateCourte(ev.validation.le) }), action: t("dossier.actions.verifier"), href: etape("valeur") }
      : { cle: "valeur", titre: t("dossier.taches.valeur.titre"), detail: v ? t("dossier.taches.valeur.detail_calculee", { fourchette: fourchette(v.bas, v.haut) }) : t("dossier.taches.valeur.detail"), action: t("dossier.actions.verifier"), href: etape("valeur") });
  }
  if (valorisationFaite) {
    if (restantes > 0) {
      // Les questions sans réponse, par leur nom (jamais « la dernière question » sans dire laquelle)
      const noms = (q.restantes || []).map(nomQuestion);
      taches.push({
        cle: "questions",
        titre: noms.length === 1 ? t("dossier.taches.questions.titre_une", { question: noms[0] }) : q.faits ? t("dossier.taches.questions.titre_reste", { n: restantes }) : t("dossier.taches.questions.titre", { n: q.total }),
        detail: noms.length > 1 ? t("dossier.taches.questions.detail_noms", { liste: noms.map((x) => t("dossier.guillemets", { texte: x })).join(", ") }) : q.faits ? t("dossier.taches.questions.detail_reste", { faits: q.faits, total: q.total }) : t("dossier.taches.questions.detail"),
        action: q.faits ? t("dossier.actions.reprendre") : t("dossier.actions.commencer"), href: etape("questions"),
      });
    }
    if (!fait.photos) taches.push({ cle: "photos", titre: t("dossier.taches.photos.titre"), detail: t("dossier.taches.photos.detail"), action: t("dossier.actions.choisir"), href: etape("photos") });
    if (!fait.equipe) taches.push({ cle: "equipe", titre: t("dossier.taches.equipe.titre"), detail: t("dossier.taches.equipe.detail"), action: t("dossier.actions.commencer"), href: etape("equipe") });
    if (!fait.redaction && !m?.nonRedigees.length && !teaserVides.length && (restantes === 0 || (q.pct || 0) >= SEUIL_REDACTION)) {
      taches.push({ cle: "redaction", titre: docs.memo || docs.teaser ? t("dossier.taches.redaction.terminer") : t("dossier.taches.redaction.lancer"), detail: t("dossier.taches.redaction.detail"), action: t("dossier.actions.rediger"), href: etape("redaction") });
    }
  }
  if (m?.nonRedigees.length) {
    const n = m.nonRedigees.length;
    taches.push({ cle: "chapitres", titre: t("dossier.taches.chapitres.titre", { n }), detail: t("dossier.taches.chapitres.detail", { n, liste: m.nonRedigees.map((s) => s.court || s.titre).join(", ") }), action: t("dossier.actions.rediger"), href: liens.memo });
  }
  if (teaserVides.length) {
    const n = teaserVides.length;
    taches.push({ cle: "teaser", titre: t("dossier.taches.teaser.titre", { n }), detail: t("dossier.taches.teaser.detail", { n, liste: teaserVides.map((x) => x.titre).join(", ") }), action: t("dossier.actions.rediger"), href: liens.teaser });
  }
  if (m && fait.photos && m.photos < 2) {
    taches.push(m.photos === 0
      ? { cle: "photo", facultatif: true, titre: t("dossier.taches.photo.titre_premiere"), detail: t("dossier.taches.photo.detail_premiere"), action: t("dossier.actions.ajouter"), href: etape("photos") }
      : { cle: "photo", facultatif: true, titre: t("dossier.taches.photo.titre_seconde"), detail: t("dossier.taches.photo.detail_seconde"), action: t("dossier.actions.ajouter"), href: etape("photos") });
  }
  if (m?.nbACompleter) {
    const n = m.nbACompleter, chap = m.aCompleter.map((s) => t("dossier.guillemets", { texte: s.court || s.titre }));
    taches.push({ cle: "a-completer", facultatif: true, titre: t("dossier.taches.a_completer.titre", { n }), detail: t("dossier.taches.a_completer.detail", { liste: `${chap.slice(0, 3).join(", ")}${chap.length > 3 ? "…" : ""}` }), action: t("dossier.actions.completer"), href: `${liens.memo}#section-${m.aCompleter[0].cle}` });
  }
  if (manquantes > 0) {
    taches.push({ cle: "pieces", facultatif: true, titre: fournies === 0 ? t("dossier.taches.pieces.titre_premieres") : t("dossier.taches.pieces.titre", { n: manquantes }), detail: t("dossier.taches.pieces.detail", { n: fournies, total: NB_PIECES }), action: t("dossier.actions.deposer"), href: "#checklist", pieces: true });
  }
  const affichees = taches.slice(0, MAX_TACHES);

  // ---------- Banner, never a silent change of status: figures modified since their approval, or a file drafted
  // before the two stages existed (24/11/2026) that now has to approve its figures; it leads to the screen concerned
  const premiereValeur = taches.find((x) => ["chiffres", "exercices", "retraitements", "dette", "valeur"].includes(x.cle));
  const nouvelleEtape = aRevalider ? { genre: "revalider", texte: t("dossier.bandeau.revalider", { date: dateCourte(ev.validation.le) }), bouton: t("dossier.bandeau.bouton_revalider"), href: etape("valeur") }
    : !valorisationFaite && (docs.memo || docs.teaser) && premiereValeur ? { genre: "nouvelle", texte: t("dossier.bandeau.nouvelle_etape"), bouton: premiereValeur.titre, href: premiereValeur.href }
    : null;

  // ---------- Action principale : la première tâche indispensable (même libellé, même lien) ; jamais une tâche
  // facultative (20/11/2026) : sans tâche indispensable, « Relire et envoyer votre dossier » (écran final).
  const indispensable = taches.find((x) => !x.facultatif);
  const action = indispensable
    ? { texte: indispensable.titre, detail: indispensable.detail, bouton: indispensable.action, href: indispensable.href, cle: indispensable.cle, pieces: Boolean(indispensable.pieces) }
    : { texte: t("dossier.relire_envoyer"), detail: redige ? t("dossier.relire_detail") : t("dossier.relire_detail_non_redige"), bouton: t("dossier.actions.relire_envoyer"), href: etape("pret"), cle: "relecture", pieces: false };
  // Tâches montrées sous l'action principale : deux au plus, sans répéter l'action
  const secondaires = taches.filter((x) => x !== indispensable).slice(0, MAX_SECONDAIRES);

  // ---------- Avancement : le dossier ouvert (le dirigeant ne part pas de zéro, choix du 17/11/2026) et les 8 étapes,
  // les questions au prorata ; 100 % si et seulement si tout est fait
  const nFaits = 1 + ETAPES_PARCOURS.filter(([k]) => fait[k]).length + (fait.entreprise ? 0 : Math.min(1, (q.pct || 0) / 100));
  const pct = pret ? 100 : Math.min(99, Math.round((100 * nFaits) / (ETAPES_PARCOURS.length + 1)));

  // ---------- Documents
  const venir = (detail) => ({ etat: "a-venir", detail, actions: [] });
  const documents = [
    { cle: "valorisation", titre: t("dossier.documents.valorisation"), ...(v
      ? { etat: fait.valeur ? "pret" : "a-relire", detail: fait.valeur ? t("dossier.documents.validee_le", { date: dateCourte(ev.validation.le) }) : aRevalider ? t("dossier.taches.valeur.a_revalider") : t("dossier.documents.a_valider"), actions: [{ libelle: t("dossier.actions.ouvrir"), href: fait.valeur ? `${liens.valorisation}#valorisation` : etape("valeur"), principal: true }, { libelle: t("dossier.actions.excel"), href: liens.datapack, telecharger: true }] }
      : venir(t("dossier.documents.debloque_chiffres_reponses"))) },
    { cle: "datapack", titre: t("dossier.documents.datapack"), ...(p.exercices_complets
      ? { etat: "pret", detail: docs.datapack ? `${t("dossier.documents.mis_a_jour", { date: dateCourte(docs.datapack.le) })}${docs.datapack.version > 1 ? ` · ${t("dossier.documents.version", { n: docs.datapack.version })}` : ""}` : t("dossier.documents.prepare_chiffres"), actions: [{ libelle: t("dossier.actions.excel"), href: liens.datapack, principal: true, telecharger: true }] }
      : venir(t("dossier.documents.debloque_exercice"))) },
    { cle: "teaser", titre: t("dossier.documents.teaser"), ...(docs.teaser
      ? teaserVides.length
        ? { etat: "incomplet", detail: t("dossier.documents.parties_a_rediger", { n: teaserVides.length, total: nbPartiesTeaser }), actions: [{ libelle: t("dossier.actions.rediger"), href: liens.teaser, principal: true }] }
        : { etat: "pret", detail: t("dossier.documents.redige_le", { date: dateCourte(docs.teaser.le) }), actions: [{ libelle: t("dossier.actions.ouvrir"), href: liens.teaser, principal: true }, { libelle: t("commun.documents.pdf"), href: `${liens.teaser}&imprimer=1` }] }
      : venir(t("dossier.documents.redige_redaction"))) },
    { cle: "memo", titre: t("dossier.documents.memo"), ...(docs.memo
      ? m?.nonRedigees.length
        ? { etat: "incomplet", detail: t("dossier.documents.chapitres_a_rediger", { n: m.nonRedigees.length, total: (memo?.sections || []).length }), actions: [{ libelle: t("dossier.actions.rediger"), href: liens.memo, principal: true }] }
        : { etat: memoARelire ? "a-relire" : "pret", badge: m?.nbACompleter ? libellePoints(m.nbACompleter) : null, detail: `${t("dossier.documents.redige_le", { date: dateCourte(docs.memo.le) })}${m?.nbACompleter ? ` · ${libellePoints(m.nbACompleter)}` : ""}`, actions: [{ libelle: t("dossier.actions.ouvrir"), href: liens.memo, principal: true }, { libelle: t("commun.documents.pdf"), href: `${liens.memo}&imprimer=1` }] }
      : venir(valorisationFaite ? t("dossier.documents.redige_redaction") : t("dossier.documents.apres_validation"))) },
  ];

  // ---------- Fourchette affichée (jamais de valeur centrale), ce sur quoi elle repose, et pourquoi elle a changé :
  // le passage de la valeur d'entreprise express à la valeur des titres est expliqué aussi sur la page du dossier
  const est = d.estimation;
  let valeur;
  if (v) {
    valeur = { etiquette: etiquetteTitres(), bas: v.bas, haut: v.haut,
      base: fait.valeur ? t("dossier.valeur.base_titres") : t("dossier.valeur.base_titres_a_valider"),
      ecart: explicationEcart(est, v),
      lien: fait.valeur ? { texte: t("dossier.valeur.voir_detail"), href: `${liens.valorisation}#valorisation` } : null };
  } else if (est?.statut === "ok") {
    valeur = { etiquette: `${etiquetteExpress()}${est.exercice ? ` · ${t("dossier.valeur.comptes", { annee: est.exercice })}` : ""}`, bas: est.bas, haut: est.haut,
      base: t("dossier.valeur.base_express"),
      ecart: null, lien: { texte: t("dossier.valeur.voir_calcul"), href: `${liens.valorisation}#chiffres` } };
  } else {
    valeur = { etiquette: t("dossier.documents.valorisation"), bas: null, haut: null,
      base: t("dossier.valeur.base_aucune"),
      ecart: null, lien: { texte: t("dossier.valeur.saisir"), href: liens.demarrer } };
  }

  const prochaine = prochaineEtape({ aRevalider, pret, etapes, actuelle, lienEtape, nbACompleter: m?.nbACompleter || 0, liens, taches, finale: etape("pret") });
  return {
    etapes, temps, actuelle, fait, pret, redige, valorisationFaite, nouvelleEtape, avancement: pct, action, prochaine, taches: affichees, secondaires, documents, valeur,
    questions: { faits: q.faits || 0, total: q.total || 0, restantes, noms: (q.restantes || []).map(nomQuestion) },
    pieces: { fournies, total: NB_PIECES, ouvert: pret && manquantes > 0 && affichees.length > 0 && affichees.every((x) => x.cle === "pieces") },
  };
}

/**
 * « Next step » card of the file page (audit of 25/11/2026): one button, for the first true situation in this order:
 *   1. figures to approve again → « Your figures changed since your approval », « Check and approve » (alert style);
 *   2. a step of the path is left → « Resume: {step} »;
 *   3. points of the memorandum are left to complete → « Complete the memorandum ({n} points) »;
 *   4. otherwise → « Review and download your documents ».
 * Below the button, two secondary links at most (the optional tasks: a photo, the documents to gather…).
 */
export function prochaineEtape({ aRevalider = false, pret = false, etapes = [], actuelle = null, lienEtape = {}, nbACompleter = 0, liens = {}, taches = [], finale = "" }) {
  const secondaires = (exclure) => taches.filter((x) => x.facultatif && x.cle !== exclure).slice(0, 2).map((x) => ({ texte: x.titre, href: x.href, pieces: Boolean(x.pieces) }));
  if (aRevalider) return { cas: "revalider", alerte: true, texte: t("dossier.prochaine.revalider"), bouton: t("dossier.prochaine.revalider_bouton"), href: lienEtape.valeur, liens: secondaires() };
  const reste = !pret && etapes.find((e) => e.cle === actuelle && e.etat !== "fait");
  if (reste) return { cas: "reprendre", texte: null, bouton: t("dossier.prochaine.reprendre", { etape: reste.libelle }), href: lienEtape[actuelle] || liens.demarrer, liens: secondaires() };
  if (nbACompleter > 0) return { cas: "memo", texte: null, bouton: t("dossier.prochaine.memo", { n: nbACompleter }), href: liens.memo, liens: secondaires("a-completer") };
  return { cas: "documents", texte: null, bouton: t("dossier.prochaine.documents"), href: finale, liens: secondaires() };
}

/** Écran final du parcours guidé : « prêt » seulement si tout l'indispensable est fait ; sinon ce qui reste, nommé
 *  (jamais « rédigé » et « 99 % » sans dire ce qui manque), avec exactement les mêmes tâches que la page du dossier. */
export function ecranFinal(e) {
  if (e.pret) {
    return { titre: t("dossier.final.pret_titre"), aide: t("dossier.final.pret_aide"),
      resteTitre: e.taches.length ? t("dossier.final.plus_loin") : null, reste: e.taches };
  }
  const indispensables = e.taches.filter((x) => !x.facultatif);
  const premiere = indispensables[0];
  return { titre: e.redige ? t("dossier.final.redige_reste", { n: indispensables.length || 1 }) : t("dossier.final.non_redige_titre"),
    aide: premiere ? t("dossier.final.prochaine", { tache: premiere.titre }) : t("dossier.final.non_pret_aide", { pct: e.avancement }),
    resteTitre: t("dossier.final.reste"), reste: e.taches };
}
