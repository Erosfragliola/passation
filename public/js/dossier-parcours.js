// Page of a file and guided flow (pure module, tested in test/dossier-parcours.test.js): from the file's detail
// (GET /api/dossiers/:id) and, if it is drafted, from the memorandum (GET …/documents/memo), the single state read by
// both pages is derived:
//   - the steps of the flow in 5 steps (done, current, to come), single list ETAPES_PARCOURS;
//   - « What to do now »: 3 tasks at most, the essential first (figures, questions, drafting), then the optional
//     (earlier fiscal years, memorandum recommendations, supporting documents);
//   - the main action, which repeats exactly the first task;
//   - the progress in %, the « ready » status (100% if and only if everything essential is done);
//   - the state of the 4 documents, the range shown, what it rests on and the explanation of how it changed.
// No data is invented: everything comes from the two API responses.
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
// Labels: src/contenu/<language>/dossier.json, read at each access (element 1 of each pair).
for (const e of ETAPES_PARCOURS) Object.defineProperty(e, 1, { get: () => t(`dossier.etapes.${e[0]}`), enumerable: true, configurable: true });
/** Stage of a step ("valorisation" or "memo"). */
export const tempsDe = (cle) => TEMPS.find((x) => x.etapes.includes(cle))?.cle ?? null;
/** Screen of the guided flow → step of the flow. The website is a question of « Your company ». */
export const ETAPE_DE_L_ECRAN = { accueil: "chiffres", comptes: "chiffres", saisie: "chiffres", chiffres: "chiffres", exercices: "chiffres",
  retraitements: "retraitements", dette: "dette", valeur: "valeur",
  questions: "entreprise", site: "entreprise", photos: "photos", equipe: "equipe", redaction: "redaction", pret: "redaction" };
/** Name of a question still without an answer (the website or a question of the memorandum). */
export const nomQuestion = (id) => (id === "site" ? t("dossier.question_site") : QUESTIONS.find((q) => q.id === id)?.titre ?? id);
/** Labels of the value, the same everywhere (home page card, file page, guided flow, valuation). */
export const etiquetteExpress = () => t("dossier.etiquette_express");
export const etiquetteTitres = () => t("dossier.etiquette_titres");
export const NB_PIECES = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
/** Threshold of the questions (in %) from which the drafting can be started. */
const SEUIL_REDACTION = 40;
const MAX_TACHES = 3;
/** File page: at most 2 tasks under the main action (« too much information kills information »). */
export const MAX_SECONDAIRES = 2;

/** « 2024 »; « 2023 and 2024 »; « 2022 to 2024 » (consecutive); « 2019, 2021 and 2024 ». */
export function listeAnnees(annees = []) {
  const l = [...annees].sort((a, b) => a - b);
  if (l.length <= 1) return l.join("");
  if (l.length > 2 && l.every((a, i) => !i || a - l[i - 1] === 1)) return t("dossier.annees.suite", { de: l[0], a: l.at(-1) });
  return t("dossier.annees.liste", { debut: l.slice(0, -1).join(", "), fin: l.at(-1) });
}
/** Timestamp in seconds (database format) → « 18/11/2026 », Paris time. */
export function dateCourte(secondes) {
  if (!Number.isFinite(secondes)) return null;
  return new Date(secondes * 1000).toLocaleDateString(locale(), { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * « To be completed » points of the memorandum, one per element flagged in a chapter: « Team: Number of
 * employees ». Only count of the work left (file page, tasks and final screen of the guided flow).
 */
export function pointsACompleter(memo) {
  return (memo?.sections || []).flatMap((s) => (s.a_completer || []).map((x) => t("dossier.point", { chapitre: s.titre, point: x })));
}
/** « 1 point to complete », « 4 points to complete ». */
export const libellePoints = (n) => t("dossier.points_a_completer", { n });

/** A part of the teaser counts as drafted if it has a real text (neither empty nor « To be completed »). */
const partieRedigee = (contenu) => { const x = String(contenu ?? "").trim(); return x !== "" && !/^(à compléter|to be completed)\.?$/i.test(x); };
/** Parts of the teaser still empty (GET …/documents/teaser). All are essential: the page is short. */
export function partiesTeaserVides(teaser) {
  return (teaser?.teaser?.sections || []).filter((s) => !partieRedigee(s.contenu));
}

/** Reading of the memorandum: chapters not drafted, « To be completed » elements, photos. null if not drafted. */
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

/**
 * Result of the engine (valorisationApprofondie) → what the owner sees: the range of the shares (never the central
 * value) and what explains it. Used by the server (file detail) and the valuation page.
 */
export function resumeValorisation(r) {
  const s = r?.synthese;
  if (!s || !Number.isFinite(s.bas) || !Number.isFinite(s.haut)) return null;
  return { bas: s.bas, haut: s.haut, plancher_ancc: s.plancher_ancc ?? null,
    annees: r.annees || [], ebe_normatif: r.ebe_normatif?.valeur ?? null, dette_nette: r.dette_nette?.total ?? null,
    facteur_decotes: r.pont_titres?.facteur_decotes ?? 1, ecart_bfr: r.pont_titres?.ecart_bfr ?? 0, hors_exploitation: r.pont_titres?.hors_exploitation ?? 0 };
}

/**
 * Alerts of the engine shown to the owner: those of the discounted cash flows (method set aside, never shown) are
 * removed; the one that compares the central value with the net assets is reworded on the range.
 */
export function alertesDirigeant(alertes = []) {
  return alertes
    .filter((a) => !/DCF|valeur terminale|flux actualis|terminal value|discounted cash/i.test(a))
    .map((a) => (/valeur centrale est inférieure à l'actif net|central value is below .*net assets/i.test(a)
      ? t("dossier.alerte_plancher")
      : a));
}

/**
 * Sentence that explains the move from the quick estimate (enterprise value, public accounts) to the detailed
 * valuation (value of the shares, your accounts), from the calculated amounts only. null if the range shown does not
 * change or if one of the two is missing.
 * @param est  quick estimate of the file { statut, exercice, methode, agregat, bas, haut }
 * @param v    valuation of the file { bas, haut, annees, ebe_normatif, dette_nette, facteur_decotes, ecart_bfr,
 * hors_exploitation }
 */
export function explicationEcart(est, v) {
  if (est?.statut !== "ok" || !v || !Number.isFinite(v.bas) || !Number.isFinite(v.haut)) return null;
  const avant = fourchette(est.bas, est.haut), apres = fourchette(v.bas, v.haut);
  if (avant === apres) return null;
  const m = (x) => montant(Math.abs(x), Math.abs(x));
  const visible = (x) => Number.isFinite(x) && Math.round(Math.abs(x) / 1e4) > 0; // at least €5K (rounded to the €10K)
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
 * @param d  detail of the file (GET /api/dossiers/:id)
 * @param memo  response of GET …/documents/memo, or null if the memorandum is not drafted
 * @param teaser  response of GET …/documents/teaser, or null if the teaser is not drafted
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
  // A document is « ready » only if it has content: an empty teaser or memorandum is « incomplete »
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

  // ---------- The two stages: a step is done only if the owner has done or approved something
  const fait = {
    // the latest fiscal year confirmed, and the two earlier ones confirmed or knowingly skipped
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
  const redige = Boolean(v && docs.memo && docs.teaser); // documents produced (chapters may still be left to draft)
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

  // ---------- What to do now: the steps in order (the memorandum after the figures are approved), then the optional
  // ones (marked as such)
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
      // Unanswered questions, by their name (never « the last question » without saying which one)
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

  // ---------- Main action: the first essential task (same label, same link); never an optional task (20/11/2026):
  // without an essential task, « Review and send your file » (final screen).
  const indispensable = taches.find((x) => !x.facultatif);
  const action = indispensable
    ? { texte: indispensable.titre, detail: indispensable.detail, bouton: indispensable.action, href: indispensable.href, cle: indispensable.cle, pieces: Boolean(indispensable.pieces) }
    : { texte: t("dossier.relire_envoyer"), detail: redige ? t("dossier.relire_detail") : t("dossier.relire_detail_non_redige"), bouton: t("dossier.actions.relire_envoyer"), href: etape("pret"), cle: "relecture", pieces: false };
  // Tasks shown under the main action: two at most, without repeating the action
  const secondaires = taches.filter((x) => x !== indispensable).slice(0, MAX_SECONDAIRES);

  // ---------- Progress: the file opened (the owner does not start from scratch, choice of 17/11/2026) and the 8 steps,
  // the questions pro rata; 100% if and only if everything is done
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

  // ---------- Range shown (never a central value), what it rests on, and why it changed: the move from the quick
  // enterprise value to the value of the shares is explained on the file page too
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

/**
 * Final screen of the guided flow: « ready » only if everything essential is done; otherwise what is left, named
 * (never « drafted » and « 99% » without saying what is missing), with exactly the same tasks as the file page.
 */
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
