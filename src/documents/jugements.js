// Structured answers of Claude (photo, review, management backgrounds): JSON schemas sent to the API and
// validation by the code of what comes back. Structured outputs accept neither maxLength nor maxItems: lengths and
// numbers of elements are guaranteed here. Common rule: Claude never produces a figure (chiffresNouveaux).

// ---------------------------------------------------------------- Figures
/** Numbers written in a text, normalized (« 1 200 » = « 1200 », « 15,8 » = « 15.8 »). */
export function nombres(texte) {
  return [...String(texte ?? "").matchAll(/\d+(?:[\s  ]\d{3})*(?:[.,]\d+)?/g)].map((m) => m[0].replace(/[\s  ]/g, "").replace(",", "."));
}
/** Figures of a text missing from the reference texts (what Claude would have invented or changed). */
export function chiffresNouveaux(texte, ...references) {
  const connus = new Set(references.flatMap((r) => nombres(typeof r === "string" ? r : JSON.stringify(r ?? ""))));
  return nombres(texte).filter((n) => !connus.has(n));
}
/** Same set of figures in two texts (a correction must add, remove or change none). */
export function memesChiffres(avant, apres) {
  const a = nombres(avant).sort(), b = nombres(apres).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const texte = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** At most n words (short titles, captions). */
export const motsAuPlus = (t, n) => texte(t, 400).split(" ").filter(Boolean).slice(0, n).join(" ").replace(/[,;:.]+$/, "");

// ---------------------------------------------------------------- Photo
export const CATEGORIES_PHOTO = ["atelier", "produits", "realisations", "equipe", "locaux", "exterieur", "autre"];
export const USAGES_PHOTO = ["couverture", "activite", "realisations", "equipe", "eviter"];
export const SIGNALEMENTS_PHOTO = ["dessin", "publicite", "floue", "trop_petite", "identifiante"];
export const SCHEMA_PHOTO = {
  type: "object", additionalProperties: false,
  required: ["description", "categorie", "note", "raison", "usage", "legende", "signalements"],
  properties: {
    description: { type: "string", description: "Ce que montre la photo, en une phrase factuelle (20 mots au plus)" },
    categorie: { type: "string", enum: CATEGORIES_PHOTO },
    note: { type: "integer", description: "Qualité de 1 (inutilisable) à 5 (excellente) : netteté, lumière, cadrage, résolution" },
    raison: { type: "string", description: "La raison de la note, en une phrase courte" },
    usage: { type: "string", enum: USAGES_PHOTO },
    legende: { type: "string", description: "Légende proposée, 8 mots au plus, sans nom de personne" },
    signalements: { type: "array", items: { type: "string", enum: SIGNALEMENTS_PHOTO },
      description: "dessin : dessin, schéma ou pictogramme ; publicite : visuel publicitaire ou bandeau de texte ; floue ; trop_petite : résolution insuffisante pour une page entière ; identifiante : enseigne, logo, nom sur un véhicule, plaque, adresse ou personne reconnaissable (interdit dans le teaser)" },
  },
};
/** Assessment validated and bounded, or null if it is unusable (missing field, value outside the list). */
export function validerAnalysePhoto(o) {
  if (!o || typeof o !== "object") return null;
  const note = Number(o.note);
  if (!CATEGORIES_PHOTO.includes(o.categorie) || !USAGES_PHOTO.includes(o.usage) || !Number.isInteger(note) || note < 1 || note > 5) return null;
  const description = texte(o.description, 200);
  if (!description) return null;
  const signalements = [...new Set((Array.isArray(o.signalements) ? o.signalements : []).filter((s) => SIGNALEMENTS_PHOTO.includes(s)))];
  // A drawing or an advertising visual is never proposed as a photo to use
  const usage = signalements.includes("dessin") || signalements.includes("publicite") ? "eviter" : o.usage;
  return { description, categorie: o.categorie, note, raison: texte(o.raison, 160), usage, legende: motsAuPlus(o.legende, 8), signalements, teaser: !signalements.includes("identifiante") && !signalements.includes("dessin") && !signalements.includes("publicite") };
}

// ---------------------------------------------------------------- Relecture critique
export const TYPES_REMARQUE = ["non_sourcee", "contradiction", "repetition", "promotionnel", "photo", "page_vide", "incoherence_registres", "chiffre"];
export const SCHEMA_RELECTURE = {
  type: "object", additionalProperties: false, required: ["remarques"],
  properties: {
    remarques: { type: "array", description: "10 remarques au plus, les plus importantes d'abord", items: {
      type: "object", additionalProperties: false,
      required: ["section", "type", "titre", "constat", "texte_actuel", "texte_propose", "importance"],
      properties: {
        section: { type: "string", description: "Clé du chapitre concerné (une des clés fournies)" },
        type: { type: "string", enum: TYPES_REMARQUE },
        titre: { type: "string", description: "L'amélioration en 6 mots au plus, à l'infinitif (« Sourcer la part de marché »)" },
        constat: { type: "string", description: "Ce qui ne va pas, en une phrase simple" },
        texte_actuel: { type: "string", description: "Le passage exact à remplacer, recopié tel quel depuis le chapitre ; chaîne vide si la remarque ne se corrige pas dans le texte" },
        texte_propose: { type: "string", description: "Le passage corrigé, sans aucun chiffre nouveau ni modifié, et pas plus long que le passage actuel (le chapitre a des longueurs maximales : une correction plus longue ne peut pas être appliquée) ; chaîne vide si rien à remplacer" },
        importance: { type: "string", enum: ["indispensable", "conseille"] },
      },
    } },
  },
};
/**
 * Remarks kept: known chapter, known type, title of 6 words at most, 10 at most, essential ones first. A
 * correction that would change a figure is removed (the remark stays, without a correction: the owner is sent back to
 * their accounts or to the valuation). A remark of type « chiffre » never has a correction.
 */
export function validerRelecture(o, sections, max = 10) {
  const parCle = Object.fromEntries((sections || []).map((s) => [s.cle, s]));
  const liste = (Array.isArray(o?.remarques) ? o.remarques : [])
    .filter((r) => r && parCle[r.section] && TYPES_REMARQUE.includes(r.type) && texte(r.titre, 120) && texte(r.constat, 400))
    .map((r) => {
      const actuel = String(r.texte_actuel ?? "").trim(), propose = String(r.texte_propose ?? "").trim();
      const corrigeable = r.type !== "chiffre" && actuel && propose && actuel !== propose
        && String(parCle[r.section].contenu || "").includes(actuel) && memesChiffres(actuel, propose);
      return { section: r.section, type: r.type, titre: motsAuPlus(r.titre, 6), constat: texte(r.constat, 300),
        correction: corrigeable ? { texte_actuel: actuel.slice(0, 1200), texte_propose: propose.slice(0, 1200) } : null,
        importance: r.importance === "indispensable" ? "indispensable" : "conseille" };
    });
  return liste.sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "indispensable" ? -1 : 1)).slice(0, max)
    .map((r, k) => ({ id: `r${k + 1}`, ...r, statut: null }));
}
/**
 * Applies an accepted correction to a chapter's text (« Oui, corriger »): exact replacement of the passage,
 * without touching a figure. @returns the new text, or null if the passage has changed or a figure would be touched.
 */
export function appliquerCorrection(contenu, correction) {
  if (!correction?.texte_actuel || typeof correction.texte_propose !== "string") return null;
  const c = String(contenu ?? "");
  if (!c.includes(correction.texte_actuel)) return null;
  const nouveau = c.replace(correction.texte_actuel, correction.texte_propose);
  return memesChiffres(c, nouveau) ? nouveau : null;
}

// ---------------------------------------------------------------- Management backgrounds (team page)
/** Property of the section schema added for the « Organisation » chapter when the team is described. */
export const PROPRIETE_PARCOURS = {
  type: "array", description: "Pour chaque personne de « equipe_dirigeante », son parcours en une ou deux phrases (35 mots au plus), écrit uniquement à partir de ses réponses",
  items: { type: "object", additionalProperties: false, required: ["id", "texte"], properties: { id: { type: "string" }, texte: { type: "string" } } },
};
/** Backgrounds kept: known person, 300 characters at most, no figure missing from their answers. */
export function validerParcours(liste, personnes) {
  const parId = Object.fromEntries((personnes || []).map((p) => [p.id, p]));
  const res = {};
  for (const x of Array.isArray(liste) ? liste : []) {
    const p = parId[x?.id];
    const t = texte(x?.texte, 300);
    if (p && t && !chiffresNouveaux(t, p).length) res[p.id] = t;
  }
  return res;
}
