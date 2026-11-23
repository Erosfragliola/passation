// File page and guided steps (pure module, tested in test/dossier-parcours.test.js): from the file's details
// (GET /api/dossiers/:id) and, if it is drafted, the memorandum (GET …/documents/memo), we derive the single state
// read by both pages:
//   - the 5-step progress line (done, current, upcoming), single list ETAPES_PARCOURS;
//   - "To do now": 3 tasks at most, what is required first (figures, questions, drafting), then what is
//     optional (previous fiscal years, memorandum recommendations, documents);
//   - the main action, which repeats exactly the first task;
//   - progress in %, the "ready" status (100% if and only if everything required is done);
//   - the status of the 4 documents, the displayed range, what it is based on and the explanation of how it changed.
// No data is invented: everything comes from the two API responses.
import { CHECKLIST, avancement } from "./dossier-regles.js";
import { fourchette, montant } from "./landing/estimation.js";
import { lien, t, locale } from "./i18n.js";

/** Single list of the steps, for the file page and the guided steps (same labels, same order). */
export const ETAPES_PARCOURS = [["estimation"], ["chiffres"], ["reponses"], ["redaction"], ["relecture"]];
// Labels: src/contenu/<language>/dossier.json, read at each access (element 1 of each pair).
for (const e of ETAPES_PARCOURS) Object.defineProperty(e, 1, { get: () => t(`dossier.etapes.${e[0]}`), enumerable: true, configurable: true });
/** Screen of the guided steps → step of the progress line. The website is a question of "Your answers". */
export const ETAPE_DE_L_ECRAN = { comptes: "chiffres", saisie: "chiffres", chiffres: "chiffres", questions: "reponses", site: "reponses", redaction: "redaction", pret: "relecture" };
/** Labels of the value, identical everywhere (home page card, file page, guided steps, valuation). */
export const etiquetteExpress = () => t("dossier.etiquette_express");
export const etiquetteTitres = () => t("dossier.etiquette_titres");
export const NB_PIECES = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
/** Threshold of the questions (in %) from which drafting can be launched. */
const SEUIL_REDACTION = 40;
const MAX_TACHES = 3;
/** Page du dossier : au plus 2 tâches sous l'action principale (« trop d'information tue l'information »). */
export const MAX_SECONDAIRES = 2;

/** "2024"; "2023 and 2024"; "2022 to 2024" (consecutive); "2019, 2021 and 2024". */
export function listeAnnees(annees = []) {
  const l = [...annees].sort((a, b) => a - b);
  if (l.length <= 1) return l.join("");
  if (l.length > 2 && l.every((a, i) => !i || a - l[i - 1] === 1)) return t("dossier.annees.suite", { de: l[0], a: l.at(-1) });
  return t("dossier.annees.liste", { debut: l.slice(0, -1).join(", "), fin: l.at(-1) });
}
/** Timestamp in seconds (database format) → "18/11/2026", Paris time. */
export function dateCourte(secondes) {
  if (!Number.isFinite(secondes)) return null;
  return new Date(secondes * 1000).toLocaleDateString(locale(), { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "To be completed" points of the memorandum, one per element flagged in a chapter: "Team: Number of employees".
 *  The only count of the remaining work (file page, tasks and final screen of the guided steps). */
export function pointsACompleter(memo) {
  return (memo?.sections || []).flatMap((s) => (s.a_completer || []).map((x) => t("dossier.point", { chapitre: s.titre, point: x })));
}
/** "1 point to complete", "4 points to complete". */
export const libellePoints = (n) => t("dossier.points_a_completer", { n });

/** A part of the teaser counts as drafted if it has a real text (neither empty nor "To be completed"). */
const partieRedigee = (contenu) => { const x = String(contenu ?? "").trim(); return x !== "" && !/^(à compléter|to be completed)\.?$/i.test(x); };
/** Parts of the teaser still empty (GET …/documents/teaser). All are required: the page is short. */
export function partiesTeaserVides(teaser) {
  return (teaser?.teaser?.sections || []).filter((s) => !partieRedigee(s.contenu));
}

/** Reading of the memorandum: undrafted chapters, "To be completed" elements, photos. null if not drafted. */
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

/** Engine result (valorisationApprofondie) → what the owner sees: the range for the shares (never the
 *  central value) and what explains it. Used by the server (file details) and the valuation page. */
export function resumeValorisation(r) {
  const s = r?.synthese;
  if (!s || !Number.isFinite(s.bas) || !Number.isFinite(s.haut)) return null;
  return { bas: s.bas, haut: s.haut, plancher_ancc: s.plancher_ancc ?? null,
    annees: r.annees || [], ebe_normatif: r.ebe_normatif?.valeur ?? null, dette_nette: r.dette_nette?.total ?? null,
    facteur_decotes: r.pont_titres?.facteur_decotes ?? 1, ecart_bfr: r.pont_titres?.ecart_bfr ?? 0, hors_exploitation: r.pont_titres?.hors_exploitation ?? 0 };
}

/** Engine alerts shown to the owner: those of the discounted cash flows (method left out, never displayed) are
 *  removed; the one that compares the central value with the net assets is reworded on the range. */
export function alertesDirigeant(alertes = []) {
  return alertes
    .filter((a) => !/DCF|valeur terminale|flux actualis|terminal value|discounted cash/i.test(a))
    .map((a) => (/valeur centrale est inférieure à l'actif net|central value is below .*net assets/i.test(a)
      ? t("dossier.alerte_plancher")
      : a));
}

/**
 * Sentence that explains the move from the quick estimate (enterprise value, public accounts) to the detailed
 * valuation (value of the shares, your accounts), from the calculated amounts only. null if the displayed range
 * does not change or if one of the two is missing.
 * @param est  quick estimate of the file { statut, exercice, methode, agregat, bas, haut }
 * @param v    valuation of the file { bas, haut, annees, ebe_normatif, dette_nette, facteur_decotes, ecart_bfr, hors_exploitation }
 */
export function explicationEcart(est, v) {
  if (est?.statut !== "ok" || !v || !Number.isFinite(v.bas) || !Number.isFinite(v.haut)) return null;
  const avant = fourchette(est.bas, est.haut), apres = fourchette(v.bas, v.haut);
  if (avant === apres) return null;
  const m = (x) => montant(Math.abs(x), Math.abs(x));
  const visible = (x) => Number.isFinite(x) && Math.round(Math.abs(x) / 1e4) > 0; // €5K at least (rounded to the nearest €10K)
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
 * @param d  file details (GET /api/dossiers/:id)
 * @param memo  response of GET …/documents/memo, or null if the memorandum is not drafted
 * @param teaser  response of GET …/documents/teaser, or null if the teaser is not drafted
 */
export function etatParcours(d, memo = null, teaser = null) {
  const id = d.id, p = d.parcours || {}, docs = d.documents || {};
  const ex = p.exercices || { dernier: null, dernier_complet: false, recommandes: [], recommandes_manquants: [], anciens: [] };
  const q = p.questions || { faits: 0, total: 0, pct: 0 };
  const restantes = Math.max(0, (q.total || 0) - (q.faits || 0));
  const v = p.valorisation && Number.isFinite(p.valorisation.bas) && Number.isFinite(p.valorisation.haut) ? p.valorisation : null;
  const m = docs.memo ? lectureMemo(memo) : null;
  const memoARelire = Boolean(m && (m.nonRedigees.length || m.nbACompleter));
  // A document is "ready" only if it has content: an empty teaser or memorandum is "incomplete"
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

  // ---------- Progress line: a step is done only if the owner has done or approved something
  const fait = {
    estimation: true, // the owner entered their SIREN and saw the card: the file comes from it
    chiffres: Boolean(ex.dernier_complet), // the latest fiscal year, confirmed by the owner (never by default)
    reponses: q.total > 0 && restantes === 0,
    redaction: Boolean(v && docs.memo && docs.teaser && !(m && m.nonRedigees.length) && !teaserVides.length),
    relecture: false, // sending happens outside the page: the step stays the last one open
  };
  const pret = fait.chiffres && fait.reponses && fait.redaction;
  const redige = Boolean(v && docs.memo && docs.teaser); // documents produced (some chapters may still need drafting)
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

  // ---------- To do now: what is required first, then what is optional (marked as such)
  const taches = [];
  if (!fait.chiffres) {
    taches.push(ex.dernier == null
      ? { cle: "chiffres", titre: t("dossier.taches.chiffres.titre_aucun"), detail: t("dossier.taches.chiffres.detail_aucun"), action: t("dossier.actions.confirmer"), href: liens.demarrer }
      : { cle: "chiffres", titre: t("dossier.taches.chiffres.titre", { annee: ex.dernier }), detail: t("dossier.taches.chiffres.detail"), action: t("dossier.actions.confirmer"), href: `${liens.demarrer}&etape=chiffres` });
  }
  if (restantes > 0) {
    taches.push({
      cle: "questions",
      titre: q.faits ? t("dossier.taches.questions.titre_reste", { n: restantes }) : t("dossier.taches.questions.titre", { n: q.total }),
      detail: q.faits ? t("dossier.taches.questions.detail_reste", { faits: q.faits, total: q.total }) : t("dossier.taches.questions.detail"),
      action: q.faits ? t("dossier.actions.reprendre") : t("dossier.actions.commencer"), href: `${liens.demarrer}&etape=questions`,
    });
  }
  if (fait.chiffres && !fait.redaction && !m?.nonRedigees.length && !teaserVides.length && (restantes === 0 || (q.pct || 0) >= SEUIL_REDACTION)) {
    taches.push({ cle: "redaction", titre: v || docs.memo || docs.teaser ? t("dossier.taches.redaction.terminer") : t("dossier.taches.redaction.lancer"), detail: t("dossier.taches.redaction.detail"), action: t("dossier.actions.rediger"), href: `${liens.demarrer}&etape=redaction` });
  }
  if (m?.nonRedigees.length) {
    const n = m.nonRedigees.length;
    taches.push({ cle: "chapitres", titre: t("dossier.taches.chapitres.titre", { n }), detail: t("dossier.taches.chapitres.detail", { n, liste: m.nonRedigees.map((s) => s.court || s.titre).join(", ") }), action: t("dossier.actions.rediger"), href: liens.memo });
  }
  if (teaserVides.length) {
    const n = teaserVides.length;
    taches.push({ cle: "teaser", titre: t("dossier.taches.teaser.titre", { n }), detail: t("dossier.taches.teaser.detail", { n, liste: teaserVides.map((x) => x.titre).join(", ") }), action: t("dossier.actions.rediger"), href: liens.teaser });
  }
  if (fait.chiffres && ex.recommandes_manquants?.length) {
    const annees = [...ex.recommandes_manquants].sort((a, b) => b - a);
    taches.push({ cle: "exercices", facultatif: true, titre: t("dossier.taches.exercices.titre", { annees: annees.length > 1 ? t("dossier.annees.liste", { debut: annees.slice(0, -1).join(", "), fin: annees.at(-1) }) : annees[0] }),
      detail: t("dossier.taches.exercices.detail", { annee: ex.dernier }), action: t("dossier.actions.ajouter"), href: `${liens.demarrer}&etape=exercice` });
  }
  if (m && m.photos === 0 && m.photosTrouvees > 0) {
    // Photos trouvées sur le site : on propose de les choisir (écran « Votre logo et vos photos » du parcours)
    taches.push({ cle: "photo", facultatif: true, titre: t("dossier.taches.photo.titre_choisir", { n: m.photosTrouvees }), detail: t("dossier.taches.photo.detail_choisir"), action: t("dossier.actions.choisir"), href: `${liens.demarrer}&etape=photos` });
  } else if (m && m.photos < 2) {
    taches.push(m.photos === 0
      ? { cle: "photo", facultatif: true, titre: t("dossier.taches.photo.titre_premiere"), detail: t("dossier.taches.photo.detail_premiere"), action: t("dossier.actions.ajouter"), href: `${liens.memo}#donnees` }
      : { cle: "photo", facultatif: true, titre: t("dossier.taches.photo.titre_seconde"), detail: t("dossier.taches.photo.detail_seconde"), action: t("dossier.actions.ajouter"), href: `${liens.memo}#donnees` });
  }
  if (m?.nbACompleter) {
    const n = m.nbACompleter, chap = m.aCompleter.map((s) => t("dossier.guillemets", { texte: s.court || s.titre }));
    taches.push({ cle: "a-completer", facultatif: true, titre: t("dossier.taches.a_completer.titre", { n }), detail: t("dossier.taches.a_completer.detail", { liste: `${chap.slice(0, 3).join(", ")}${chap.length > 3 ? "…" : ""}` }), action: t("dossier.actions.completer"), href: `${liens.memo}#section-${m.aCompleter[0].cle}` });
  }
  if (manquantes > 0) {
    taches.push({ cle: "pieces", facultatif: true, titre: fournies === 0 ? t("dossier.taches.pieces.titre_premieres") : t("dossier.taches.pieces.titre", { n: manquantes }), detail: t("dossier.taches.pieces.detail", { n: fournies, total: NB_PIECES }), action: t("dossier.actions.deposer"), href: "#checklist", pieces: true });
  }
  const affichees = taches.slice(0, MAX_TACHES);

  // ---------- Main action: exactly the first task (same label, same link)
  const action = affichees.length
    ? { texte: affichees[0].titre, href: affichees[0].href, cle: affichees[0].cle, pieces: Boolean(affichees[0].pieces) }
    : { texte: t("dossier.relire_envoyer"), href: `${liens.demarrer}&etape=pret`, cle: "relecture", pieces: false };

  // ---------- Progress: 100% if and only if everything required is done
  const brut = avancement({
    estimation_express: d.estimation?.statut === "ok", dernier_exercice: fait.chiffres, questions_pct: q.pct,
    valorisation_approfondie: Boolean(v), documents: ["datapack", "teaser", "memo"].filter((k) => docs[k]).length,
  }).global;
  const pct = pret ? 100 : Math.min(99, brut);

  // ---------- Documents
  const venir = (detail) => ({ etat: "a-venir", detail, actions: [] });
  const documents = [
    { cle: "valorisation", titre: t("dossier.documents.valorisation"), ...(v
      ? { etat: "pret", detail: p.valorisation_le ? t("dossier.documents.mise_a_jour_f", { date: dateCourte(p.valorisation_le) }) : t("dossier.documents.prete"), actions: [{ libelle: t("dossier.actions.ouvrir"), href: `${liens.valorisation}#valorisation`, principal: true }, { libelle: t("dossier.actions.excel"), href: liens.datapack, telecharger: true }] }
      : venir(fait.chiffres ? t("dossier.documents.calculee_redaction") : t("dossier.documents.debloque_chiffres_reponses"))) },
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
      : venir(t("dossier.documents.redige_redaction"))) },
  ];

  // ---------- Displayed range (never a central value), what it is based on, and why it changed
  const est = d.estimation;
  let valeur;
  if (v) {
    valeur = { etiquette: etiquetteTitres(), bas: v.bas, haut: v.haut,
      base: t("dossier.valeur.base_titres"),
      ecart: explicationEcart(est, v),
      lien: { texte: t("dossier.valeur.voir_detail"), href: `${liens.valorisation}#valorisation` } };
  } else if (est?.statut === "ok") {
    valeur = { etiquette: `${etiquetteExpress()}${est.exercice ? ` · ${t("dossier.valeur.comptes", { annee: est.exercice })}` : ""}`, bas: est.bas, haut: est.haut,
      base: t("dossier.valeur.base_express"),
      ecart: null, lien: { texte: t("dossier.valeur.voir_calcul"), href: `${liens.valorisation}#chiffres` } };
  } else {
    valeur = { etiquette: t("dossier.documents.valorisation"), bas: null, haut: null,
      base: t("dossier.valeur.base_aucune"),
      ecart: null, lien: { texte: t("dossier.valeur.saisir"), href: liens.demarrer } };
  }

  return {
    etapes, actuelle, fait, pret, redige, avancement: pct, action, taches: affichees, secondaires, documents, valeur,
    questions: { faits: q.faits || 0, total: q.total || 0, restantes },
    pieces: { fournies, total: NB_PIECES, ouvert: actuelle === "relecture" && manquantes > 0 && affichees.length > 0 && affichees.every((t) => t.cle === "pieces") },
  };
}

/** Final screen of the guided steps: "ready" only if everything required is done; otherwise "drafted" (or not
 *  yet), with exactly the same tasks as "To do now" on the file page. */
export function ecranFinal(e) {
  if (e.pret) {
    return { titre: t("dossier.final.pret_titre"), aide: t("dossier.final.pret_aide"),
      resteTitre: e.taches.length ? t("dossier.final.plus_loin") : null, reste: e.taches };
  }
  return { titre: e.redige ? t("dossier.final.redige_titre") : t("dossier.final.non_redige_titre"),
    aide: t("dossier.final.non_pret_aide", { pct: e.avancement }),
    resteTitre: t("dossier.final.reste"), reste: e.taches };
}
