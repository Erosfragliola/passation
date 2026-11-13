// Nom de code d'un dossier (« Projet Chêne ») : déterministe, tiré du seul code NAF (src/data/noms-de-code.json).
// Jamais du SIREN : on ne pourrait sinon recalculer le nom de code d'une société connue et lever l'anonymat.
import donnees from "../data/noms-de-code.json";

/** Empreinte FNV-1a (32 bits) d'un texte. */
function empreinte(texte) {
  let h = 2166136261;
  for (const c of String(texte)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

/** « 43.32A » → « Chêne » ; code inconnu ou absent → un nom de repli, toujours le même pour un même code. */
export function nomDeCode(naf) {
  const code = String(naf || "").trim().toUpperCase();
  for (const r of donnees.regles) if (code && r.prefixes.some((p) => code.startsWith(p))) return r.nom;
  return donnees.repli[empreinte(code) % donnees.repli.length];
}

export const projet = (naf) => `Projet ${nomDeCode(naf)}`;
