// Panneau d'amélioration du mémorandum : une liste de titres courts (6 mots au plus), triés par importance, qui se
// déplient en une réponse simple (QCM, réponse proposée à corriger, action directe) ou en une remarque de la relecture
// critique (« Oui, corriger » / « Non »). « Valider » enregistre la réponse avec les mêmes routes que le parcours guidé
// (étape des réponses du dossier), puis le chapitre concerné est rédigé à nouveau. Rien ici ne produit ni ne modifie
// un chiffre : les réponses à choix sont des libellés, les compléments du texte du dirigeant, et une remarque sur un
// chiffre renvoie vers les comptes. Fonctions pures, testées (test/ameliorations.test.js).
import { QUESTIONS } from "./parcours.js";
import { ETAPES } from "./questionnaire.js";
import { t } from "./i18n.js";

/** Réponses à choix proposées en QCM quand elles manquent : étape, clé, chapitre du mémorandum, importance. */
export const QCM = [
  { id: "anciennete_equipe", etape: "dirigeant", cle: "anciennete_equipe", section: "organisation", importance: "conseille" },
  { id: "encadrement", etape: "dirigeant", cle: "encadrement", section: "organisation", importance: "indispensable" },
  { id: "zone", etape: "activite", cle: "zone", section: "clients", importance: "conseille" },
  { id: "motif", etape: "operation", cle: "motif", section: "operation", importance: "conseille" },
  { id: "calendrier", etape: "operation", cle: "calendrier", section: "operation", importance: "conseille" },
  { id: "accompagnement", etape: "operation", cle: "accompagnement", section: "operation", importance: "indispensable" },
];
/** Étapes que « Valider » peut écrire (jamais les chiffres : ils ont leurs propres écrans, validés ligne à ligne). */
export const ETAPES_MODIFIABLES = new Set(["dirigeant", "activite", "operation", "complements"]);

/** Options enregistrées d'une question à choix (celles du parcours guidé, sinon du questionnaire complet). */
export function optionsDe(etape, cle) {
  for (const q of QUESTIONS) for (const c of [...q.champs, ...(q.suite?.champs || [])]) if (c.etape === etape && c.cle === cle && Array.isArray(c.options)) return c.options.map((o) => (Array.isArray(o) ? o[0] : o));
  return ETAPES.find((e) => e.cle === etape)?.questions.find((q) => q.cle === cle)?.options || null;
}

const vide = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
/** Titre de 6 mots au plus. */
export const titreCourt = (texte) => { const m = String(texte ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean); return m.slice(0, 6).join(" ").replace(/[,;:.]+$/, "") + (m.length > 6 ? "…" : ""); };
/** Identifiant stable d'une demande « à compléter » (pour « Ignorer » et « Fait ✓ » d'une visite à l'autre). */
export const idDemande = (section, demande) => `ac-${section}-${[...String(demande)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;

/**
 * Améliorations à proposer, triées : indispensables d'abord, puis dans l'ordre des chapitres.
 * @param etat réponse de l'API du mémorandum ; @param reponses réponses du dossier ; @param placement placementPhotos()
 * @param ignores identifiants écartés par « Ignorer »
 */
export function ameliorations({ etat, reponses = {}, placement = {}, ignores = [] }) {
  const l = [];
  const sections = etat?.sections || [];
  const redigee = (cle) => sections.find((s) => s.cle === cle)?.redigee;
  // Relecture critique : remarques sans réponse
  for (const r of etat?.relecture?.remarques || []) {
    if (r.statut) continue;
    l.push({ id: `rel-${r.id}`, genre: "remarque", titre: titreCourt(r.titre), section: r.section, importance: r.importance, remarque: r,
      action: r.type === "chiffre" ? "comptes" : r.type === "photo" ? "photos" : null });
  }
  // Réponses à choix manquantes
  for (const q of QCM) {
    if (!vide(reponses[q.etape]?.[q.cle])) continue;
    const options = optionsDe(q.etape, q.cle);
    if (options?.length) l.push({ ...q, genre: "qcm", titre: t(`memo.js.ameliorations.titres.${q.id}`), options });
  }
  // Demandes « à compléter » des chapitres rédigés : réponse proposée, corrigée par le dirigeant
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
  const action = (id, section, importance, act) => l.push({ id, genre: "action", titre: t(`memo.js.ameliorations.titres.${id}`), section, importance, action: act });
  if (!(etat?.equipe?.personnes || []).length) action("equipe", "organisation", "indispensable", "equipe");
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
 * Réponse enregistrée par « Valider » : une seule étape des réponses du dossier, la clé visée seulement.
 * QCM : la valeur doit être une des options ; réponse proposée : texte du dirigeant, rangé avec la demande dans les
 * compléments du chapitre. @returns { etape, data } à envoyer à PUT /answers/:etape, ou null si la réponse est invalide.
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
