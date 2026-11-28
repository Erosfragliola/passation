// Improvement panel of the memorandum: a list of short titles (6 words at most), sorted by importance, that unfold
// into a simple answer (multiple choice, proposed answer to correct, direct action) or into a remark of the critical
// review (« Oui, corriger » / « Non »). « Valider » saves the answer through the same routes as the guided flow
// (answers step of the file), then the chapter concerned is drafted again. Nothing here produces or changes a figure:
// choice answers are labels, the additions are the owner's text, and a remark about a figure points back to the
// accounts. Pure functions, tested (test/ameliorations.test.js).
import { QUESTIONS } from "./parcours.js";
import { ETAPES } from "./questionnaire.js";
import { t } from "./i18n.js";

/** Choice answers proposed as multiple choice when they are missing: step, key, memorandum chapter, importance. */
export const QCM = [
  { id: "anciennete_equipe", etape: "dirigeant", cle: "anciennete_equipe", section: "organisation", importance: "conseille" },
  { id: "encadrement", etape: "dirigeant", cle: "encadrement", section: "organisation", importance: "indispensable" },
  { id: "zone", etape: "activite", cle: "zone", section: "clients", importance: "conseille" },
  { id: "motif", etape: "operation", cle: "motif", section: "operation", importance: "conseille" },
  { id: "calendrier", etape: "operation", cle: "calendrier", section: "operation", importance: "conseille" },
  { id: "accompagnement", etape: "operation", cle: "accompagnement", section: "operation", importance: "indispensable" },
];
/** Steps that « Valider » can write (never the figures: they have their own screens, approved line by line). */
export const ETAPES_MODIFIABLES = new Set(["dirigeant", "activite", "operation", "complements"]);

/** Saved options of a choice question (those of the guided flow, otherwise of the full questionnaire). */
export function optionsDe(etape, cle) {
  for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) if (c.etape === etape && c.cle === cle && Array.isArray(c.options)) return c.options.map((o) => (Array.isArray(o) ? o[0] : o));
  return ETAPES.find((e) => e.cle === etape)?.questions.find((q) => q.cle === cle)?.options || null;
}

const vide = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
/** Title of 6 words at most. */
export const titreCourt = (texte) => { const m = String(texte ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean); return m.slice(0, 6).join(" ").replace(/[,;:.]+$/, "") + (m.length > 6 ? "…" : ""); };
/** Stable identifier of a « to be completed » request (for « Ignorer » and « Fait ✓ » from one visit to the next). */
export const idDemande = (section, demande) => `ac-${section}-${[...String(demande)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;

/**
 * Improvements to propose, sorted: essential ones first, then in the order of the chapters.
 * @param etat answer of the memorandum API; @param reponses answers of the file; @param placement placementPhotos()
 * @param ignores identifiers dismissed with « Ignorer »
 */
export function ameliorations({ etat, reponses = {}, placement = {}, ignores = [] }) {
  const l = [];
  const sections = etat?.sections || [];
  const redigee = (cle) => sections.find((s) => s.cle === cle)?.redigee;
  // Critical review: remarks without an answer
  for (const r of etat?.relecture?.remarques || []) {
    if (r.statut) continue;
    l.push({ id: `rel-${r.id}`, genre: "remarque", titre: titreCourt(r.titre), section: r.section, importance: r.importance, remarque: r,
      action: r.type === "chiffre" ? "comptes" : r.type === "photo" ? "photos" : null });
  }
  // Missing choice answers
  for (const q of QCM) {
    if (!vide(reponses[q.etape]?.[q.cle])) continue;
    const options = optionsDe(q.etape, q.cle);
    if (options?.length) l.push({ ...q, genre: "qcm", titre: t(`memo.js.ameliorations.titres.${q.id}`), options });
  }
  // « To be completed » requests of the drafted chapters: proposed answer, corrected by the owner
  const vues = new Set(); // a request raised by two chapters is shown only once (under the first)
  for (const s of sections) {
    if (!s.redigee) continue;
    const deja = new Set((reponses.complements?.[s.cle] || []).map((c) => c.demande));
    for (const demande of s.a_completer || []) {
      const cle = String(demande).trim().toLowerCase();
      if (deja.has(demande) || vues.has(cle)) continue;
      vues.add(cle);
      l.push({ id: idDemande(s.cle, demande), genre: "proposition", titre: titreCourt(demande), section: s.cle, importance: "conseille", demande, proposition: "" });
    }
  }
  // Actions directes
  const action = (id, section, importance, act, valeurs) => l.push({ id, genre: "action", titre: t(`memo.js.ameliorations.titres.${id}`, valeurs), section, importance, action: act });
  if (!(etat?.equipe?.personnes || []).length) action("equipe", "organisation", "indispensable", "equipe");
  // Fewer than three fiscal years in the income statement: a buyer reasons over three years
  // Entered fiscal years left out (a line missing or not approved), otherwise fewer than three fiscal years
  const annees = etat?.chiffres?.compte_resultat?.annees, exclus = etat?.chiffres?.exercices_exclus || [];
  if (exclus.length) action("exercices_incomplets", "finances", "indispensable", "comptes", { annees: exclus.join(", ") });
  else if (Array.isArray(annees) && annees.length && annees.length < 3) action("exercices", "finances", "indispensable", "comptes");
  if ((etat?.photos || []).some((p) => p.analyse && !p.decision)) action("jugements", null, "conseille", "photos");
  if (placement.equipe == null && (etat?.equipe?.personnes || []).length) action("photo_equipe", "organisation", "conseille", "photos");
  if (!(placement.activite || []).length) action("photo_activite", "activite", "conseille", "photos");
  if (!(etat?.marche?.faits || []).some((f) => f.valide) && (etat?.marche?.essais_restants ?? 0) > 0 && redigee("marche")) action("marche", "marche", "conseille", "marche");

  const ordre = Object.fromEntries(sections.map((s, k) => [s.cle, k]));
  const ign = new Set(ignores);
  return l.filter((x) => !ign.has(x.id))
    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "indispensable" ? -1 : 1) || (ordre[a.section] ?? -1) - (ordre[b.section] ?? -1));
}

/**
 * Answer saved by « Valider »: a single step of the file's answers, only the key concerned.
 * Multiple choice: the value must be one of the options; proposed answer: the owner's text, stored with the request in
 * the chapter's additions. @returns { etape, data } to send to PUT /answers/:etape, or null if the answer is invalid.
 */
export function reponsePour(item, valeur, reponses = {}) {
  if (item?.genre === "qcm") {
    if (!ETAPES_MODIFIABLES.has(item.etape) || !(item.options || []).includes(valeur)) return null;
    return { etape: item.etape, data: { ...(reponses[item.etape] || {}), [item.cle]: valeur } };
  }
  if (item?.genre === "proposition") {
    const texte = String(valeur ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!texte) return null;
    const c = { ...(reponses.complements || {}) };
    c[item.section] = [...(c[item.section] || []).filter((x) => x.demande !== item.demande), { demande: item.demande, reponse: texte }];
    return { etape: "complements", data: c };
  }
  return null;
}
