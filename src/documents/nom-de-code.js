// Code name of a file ("Projet Chêne"): deterministic, drawn from the NAF code only (src/data/noms-de-code.json).
// Never from the SIREN: otherwise one could recalculate the code name of a known company and break the anonymity.
import donnees from "../data/noms-de-code.json";

/** FNV-1a hash (32 bits) of a text. */
function empreinte(texte) {
  let h = 2166136261;
  for (const c of String(texte)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

/** "43.32A" → "Chêne"; unknown or missing code → a fallback name, always the same for the same code. */
export function nomDeCode(naf) {
  const code = String(naf || "").trim().toUpperCase();
  for (const r of donnees.regles) if (code && r.prefixes.some((p) => code.startsWith(p))) return r.nom;
  return donnees.repli[empreinte(code) % donnees.repli.length];
}

export const projet = (naf) => `Projet ${nomDeCode(naf)}`;
