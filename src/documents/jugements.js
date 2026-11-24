// Réponses structurées de Claude (photo, relecture, parcours des dirigeants) : schémas JSON envoyés à l'API et
// validation par le code de ce qui revient. Les sorties structurées n'acceptent ni maxLength ni maxItems : les longueurs
// et les nombres d'éléments sont garantis ici. Règle commune : Claude ne produit jamais un chiffre (chiffresNouveaux).

// ---------------------------------------------------------------- Chiffres
/** Nombres écrits dans un texte, normalisés (« 1 200 » = « 1200 », « 15,8 » = « 15.8 »). */
export function nombres(texte) {
  return [...String(texte ?? "").matchAll(/\d+(?:[\s  ]\d{3})*(?:[.,]\d+)?/g)].map((m) => m[0].replace(/[\s  ]/g, "").replace(",", "."));
}
/** Chiffres d'un texte absents des textes de référence (ce que Claude aurait inventé ou modifié). */
export function chiffresNouveaux(texte, ...references) {
  const connus = new Set(references.flatMap((r) => nombres(typeof r === "string" ? r : JSON.stringify(r ?? ""))));
  return nombres(texte).filter((n) => !connus.has(n));
}
/** Même ensemble de chiffres dans deux textes (une correction ne doit en ajouter, retirer ni modifier aucun). */
export function memesChiffres(avant, apres) {
  const a = nombres(avant).sort(), b = nombres(apres).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const texte = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Au plus n mots (titres courts, légendes). */
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
/** Jugement validé et borné, ou null s'il est inutilisable (champ manquant, valeur hors liste). */
export function validerAnalysePhoto(o) {
  if (!o || typeof o !== "object") return null;
  const note = Number(o.note);
  if (!CATEGORIES_PHOTO.includes(o.categorie) || !USAGES_PHOTO.includes(o.usage) || !Number.isInteger(note) || note < 1 || note > 5) return null;
  const description = texte(o.description, 200);
  if (!description) return null;
  const signalements = [...new Set((Array.isArray(o.signalements) ? o.signalements : []).filter((s) => SIGNALEMENTS_PHOTO.includes(s)))];
  // Un dessin ou un visuel publicitaire n'est jamais proposé comme photo à utiliser
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
        texte_propose: { type: "string", description: "Le passage corrigé, sans aucun chiffre nouveau ni modifié ; chaîne vide si rien à remplacer" },
        importance: { type: "string", enum: ["indispensable", "conseille"] },
      },
    } },
  },
};
/**
 * Remarques gardées : chapitre connu, type connu, titre de 6 mots au plus, 10 au plus, indispensables d'abord. Une
 * correction qui changerait un chiffre est retirée (la remarque reste, sans correction : le dirigeant est renvoyé
 * vers ses comptes ou la valorisation). Une remarque de type « chiffre » n'a jamais de correction.
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
 * Applique une correction acceptée au texte d'un chapitre (« Oui, corriger ») : remplacement exact du passage, sans
 * toucher à un chiffre. @returns le nouveau texte, ou null si le passage a changé ou si un chiffre serait touché.
 */
export function appliquerCorrection(contenu, correction) {
  if (!correction?.texte_actuel || typeof correction.texte_propose !== "string") return null;
  const c = String(contenu ?? "");
  if (!c.includes(correction.texte_actuel)) return null;
  const nouveau = c.replace(correction.texte_actuel, correction.texte_propose);
  return memesChiffres(c, nouveau) ? nouveau : null;
}

// ---------------------------------------------------------------- Parcours des dirigeants (page équipe)
/** Propriété du schéma de section ajoutée pour le chapitre « Organisation » quand l'équipe est décrite. */
export const PROPRIETE_PARCOURS = {
  type: "array", description: "Pour chaque personne de « equipe_dirigeante », son parcours en une ou deux phrases (35 mots au plus), écrit uniquement à partir de ses réponses",
  items: { type: "object", additionalProperties: false, required: ["id", "texte"], properties: { id: { type: "string" }, texte: { type: "string" } } },
};
/** Parcours gardés : personne connue, 300 caractères au plus, aucun chiffre absent de ses réponses. */
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
