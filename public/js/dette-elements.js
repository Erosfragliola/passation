// Net debt screen, « What the balance sheet does not detail » (audit of 25/11/2026): a question first (« Do you have
// any of these? »), then one amount field per ticked item. Pure functions, tested in test/parcours-allege.test.js.

/** The four items, in the order of the screen (answers of the « bilan » step). */
export const ELEMENTS_DETTE = ["comptes_courants_remboursables", "credit_bail_restant", "dividendes_a_verser", "actifs_hors_exploitation"];

/**
 * State when the screen opens: an amount already saved ticks its box; « None » is ticked when the screen was already
 * validated without any item. @param bilan answers of the « bilan » step ; @param vu screen already validated
 */
export function etatInitial(bilan = {}, vu = false) {
  const coches = new Set(ELEMENTS_DETTE.filter((k) => Number.isFinite(bilan?.[k]) && bilan[k] !== 0));
  return { coches, aucun: vu && coches.size === 0 };
}

/**
 * Amounts to save: a ticked item keeps its amount; an unticked one is erased (null, never 0 without an entry).
 * @param montants { cle: number|null } read from the fields
 */
export function valeursAEnregistrer({ coches, aucun }, montants = {}) {
  return Object.fromEntries(ELEMENTS_DETTE.map((k) => [k, !aucun && coches.has(k) && Number.isFinite(montants[k]) ? montants[k] : null]));
}

/** « Validate and see my value » is active when « None » is ticked, or when every ticked item has its amount. */
export function peutValider({ coches, aucun }, montants = {}) {
  if (aucun) return true;
  return coches.size > 0 && [...coches].every((k) => Number.isFinite(montants[k]));
}
