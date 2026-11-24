// Équipe dirigeante (mémorandum uniquement, jamais dans le teaser) : listes de choix, nettoyage des réponses, données
// transmises à Claude, phrase de transition écrite par le code. Partagé par le parcours guidé, la page du mémorandum
// et le serveur ; testé (test/equipe.test.js). Les valeurs enregistrées sont des codes ; leurs libellés sont lus
// dans src/contenu/<langue>/memo.json (« equipe »).
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
/** Identifiant d'une nouvelle personne (lettres et chiffres, sans donnée personnelle). */
export const nouvelId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/**
 * Réponses nettoyées : 4 personnes au plus, champs connus seulement, listes fermées, 3 expériences au plus. La photo
 * n'est jamais prise dans ce que le navigateur envoie : elle est reprise de `ancien` (enregistrée par sa propre
 * route, avec le consentement). Une personne sans nom est ignorée.
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

/** Identifiants des personnes retirées qui avaient une photo (la photo est alors supprimée du stockage). */
export const photosOrphelines = (avant, apres) => {
  const gardes = new Set((apres?.personnes || []).map((p) => p.id));
  return (avant?.personnes || []).filter((p) => p?.photo && !gardes.has(p.id)).map((p) => p.photo);
};

export const libelleRole = (p) => (p.role === "autre" && p.role_autre ? p.role_autre : p.role ? t(`memo.equipe.roles.${p.role}`) : "");
export const libelleFormation = (f) => (f ? t(`memo.equipe.formations.${f}`) : "");
export const libelleExperience = (ty) => (ty ? t(`memo.equipe.experiences.${ty}`) : "");
/** « Reste après la cession », « Accompagne le repreneur 6 mois », « Part après la cession ». */
export const libelleApres = (p) => (p.apres === "accompagne" ? (p.mois ? t("memo.equipe.apres_libelle.accompagne_mois", { n: p.mois }) : t("memo.equipe.apres_libelle.accompagne")) : p.apres ? t(`memo.equipe.apres_libelle.${p.apres}`) : "");
export const initiales = (nom) => String(nom || "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join("") || "?";
/** Personne complète : nom, rôle, ancienneté, formation, une expérience, place après la cession. */
export const personneComplete = (p) => Boolean(p.nom && p.role && p.anciennete != null && p.formation && p.experiences?.length && p.apres);

/** Ce que Claude reçoit pour rédiger les parcours : réponses seulement, jamais de photo ni de consentement. */
export function equipePourClaude(equipe) {
  return (equipe?.personnes || []).map((p) => ({
    id: p.id, role: libelleRole(p),
    anciennete_dans_l_entreprise_en_annees: p.anciennete, experience_du_metier_en_annees: p.experience,
    formation: libelleFormation(p.formation) || null,
    experiences_marquantes: (p.experiences || []).map((e) => [libelleExperience(e.type), e.precision].filter(Boolean).join(" : ")),
    apres_la_cession: libelleApres(p) || null,
  }));
}

/** Parcours écrit par le code quand Claude n'en a pas rédigé (formation et expériences, telles que saisies). */
export const parcoursDeSecours = (p) => [libelleFormation(p.formation), ...(p.experiences || []).map((e) => [libelleExperience(e.type), e.precision].filter(Boolean).join(" : "))].filter(Boolean).join(" · ");

/** Phrase de transition, écrite par le code : « 2 des 3 dirigeants restent ; 1 accompagne la transition (6 mois) ». */
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

/** Noms et prénoms des personnes (mots de 3 lettres et plus) : interdits dans le teaser. */
export function nomsEquipe(equipe) {
  const mots = new Set();
  for (const p of equipe?.personnes || []) {
    const nom = String(p.nom || "").trim();
    if (nom.length >= 3) mots.add(nom);
    for (const m of nom.split(/[\s-]+/)) if (m.length >= 3) mots.add(m);
  }
  return [...mots];
}
