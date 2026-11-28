// Management team (memorandum only, never in the teaser): lists of choices, cleaning of the answers, data sent to
// Claude, transition sentence written by the code. Shared by the guided flow, the memorandum page and the server;
// tested (test/equipe.test.js). The values saved are codes; their labels are read in src/contenu/<language>/memo.json
// (« equipe »).
import { t } from "./i18n.js";

export const ROLES = ["fondateur", "cogerant", "commercial", "production", "raf", "autre"];
export const FORMATIONS = ["cap_bep", "bac_pro", "bts_dut", "licence", "master_ecole", "autodidacte"];
export const TYPES_EXPERIENCE = ["formation", "meme_metier", "encadrement", "creation", "grand_groupe", "autre"];
export const APRES = ["reste", "accompagne", "part"];
export const PERSONNES_MAX = 4, EXPERIENCES_MAX = 3;
export const BORNES = { anciennete: [0, 50], experience: [0, 60], mois: [1, 36] };

const court = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const entier = (v, [min, max]) => { const n = Math.round(Number(v)); return v === "" || v == null || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, n)); };
export const idValide = (id) => /^[a-z0-9]{6,16}$/.test(String(id ?? ""));
/** Identifier of a new person (letters and digits, no personal data). */
export const nouvelId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/**
 * Cleaned answers: 4 people at most, known fields only, closed lists, 3 experiences at most. The photo is never
 * taken from what the browser sends: it is taken from `ancien` (saved by its own route, with consent). A person
 * without a name is ignored.
 */
export function normaliserEquipe(data, ancien = null) {
  const photos = Object.fromEntries((ancien?.personnes || []).filter((p) => p?.photo && idValide(p.id)).map((p) => [p.id, p.photo]));
  const vus = new Set();
  const personnes = (Array.isArray(data?.personnes) ? data.personnes : [])
    .filter((p) => p && idValide(p.id) && !vus.has(p.id) && court(p.nom, 80) && vus.add(p.id))
    .slice(0, PERSONNES_MAX)
    .map((p) => {
      const apres = APRES.includes(p.apres) ? p.apres : null;
      const x = {
        id: p.id, nom: court(p.nom, 80),
        role: ROLES.includes(p.role) ? p.role : null, role_autre: p.role === "autre" ? court(p.role_autre, 60) || null : null,
        anciennete: entier(p.anciennete, BORNES.anciennete), experience: entier(p.experience, BORNES.experience),
        formation: FORMATIONS.includes(p.formation) ? p.formation : null,
        experiences: (Array.isArray(p.experiences) ? p.experiences : []).filter((e) => e && TYPES_EXPERIENCE.includes(e.type))
          .slice(0, EXPERIENCES_MAX).map((e) => ({ type: e.type, precision: court(e.precision, 80) || null })),
        apres, mois: apres === "accompagne" ? entier(p.mois, BORNES.mois) : null,
      };
      if (photos[p.id]) x.photo = photos[p.id];
      return x;
    });
  return { personnes };
}

/** Identifiers of the people removed who had a photo (the photo is then deleted from storage). */
export const photosOrphelines = (avant, apres) => {
  const gardes = new Set((apres?.personnes || []).map((p) => p.id));
  return (avant?.personnes || []).filter((p) => p?.photo && !gardes.has(p.id)).map((p) => p.photo);
};

export const libelleRole = (p) => (p.role === "autre" && p.role_autre ? p.role_autre : p.role ? t(`memo.equipe.roles.${p.role}`) : "");
export const libelleFormation = (f) => (f ? t(`memo.equipe.formations.${f}`) : "");
export const libelleExperience = (ty) => (ty ? t(`memo.equipe.experiences.${ty}`) : "");
/** « Stays after the sale », « Supports the buyer for 6 months », « Leaves after the sale ». */
export const libelleApres = (p) => (p.apres === "accompagne" ? (p.mois ? t("memo.equipe.apres_libelle.accompagne_mois", { n: p.mois }) : t("memo.equipe.apres_libelle.accompagne")) : p.apres ? t(`memo.equipe.apres_libelle.${p.apres}`) : "");
export const initiales = (nom) => String(nom || "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join("") || "?";
/** Complete person: name, role, seniority, education, one experience, place after the sale. */
export const personneComplete = (p) => Boolean(p.nom && p.role && p.anciennete != null && p.formation && p.experiences?.length && p.apres);

/** What Claude receives to draft the backgrounds: answers only, never a photo or a consent. */
export function equipePourClaude(equipe) {
  return (equipe?.personnes || []).map((p) => ({
    id: p.id, role: libelleRole(p),
    anciennete_dans_l_entreprise_en_annees: p.anciennete, experience_du_metier_en_annees: p.experience,
    formation: libelleFormation(p.formation) || null,
    experiences_marquantes: (p.experiences || []).map((e) => [libelleExperience(e.type), e.precision].filter(Boolean).join(" : ")),
    apres_la_cession: libelleApres(p) || null,
  }));
}

/** Background written by the code when Claude has not drafted one (education and experiences, as entered). */
export const parcoursDeSecours = (p) => [libelleFormation(p.formation), ...(p.experiences || []).map((e) => [libelleExperience(e.type), e.precision].filter(Boolean).join(" : "))].filter(Boolean).join(" · ");

/** Transition sentence, written by the code: « 2 of the 3 managers stay; 1 supports the transition (6 months) ». */
export function transitionEquipe(equipe) {
  const l = equipe?.personnes || [];
  if (!l.length) return null;
  const restent = l.filter((p) => p.apres === "reste").length, acc = l.filter((p) => p.apres === "accompagne"), partent = l.filter((p) => p.apres === "part").length;
  const morceaux = [];
  const accord = (cle, n, x = {}) => t(`memo.equipe.transition.${n === 1 ? `${cle}_un` : cle}`, { n, ...x });
  if (restent) morceaux.push(restent === 1 ? t("memo.equipe.transition.restent_un", { total: l.length }) : t("memo.equipe.transition.restent", { n: restent, total: l.length }));
  if (acc.length) morceaux.push(acc.length === 1 && acc[0].mois ? t("memo.equipe.transition.accompagne_mois", { n: acc[0].mois }) : acc.length === 1 ? t("memo.equipe.transition.accompagne_un") : t("memo.equipe.transition.accompagnent", { n: acc.length }));
  if (partent) morceaux.push(accord("partent", partent));
  return morceaux.join(t("memo.equipe.transition.separateur")) || null;
}

/** First and last names of the people (words of 3 letters or more): forbidden in the teaser. */
export function nomsEquipe(equipe) {
  const mots = new Set();
  for (const p of equipe?.personnes || []) {
    const nom = String(p.nom || "").trim();
    if (nom.length >= 3) mots.add(nom);
    for (const m of nom.split(/[\s-]+/)) if (m.length >= 3) mots.add(m);
  }
  return [...mots];
}
