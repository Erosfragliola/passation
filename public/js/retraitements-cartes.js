// Adjustments screen, one card at a time (audit of 25/11/2026): your pay, the rent of your premises, the exceptional
// items. A card is answered by the owner (never answered in advance); only one is open at a time; « Validate these
// adjustments » waits for the three. Pure functions, tested in test/parcours-allege.test.js.

export const CARTES = ["remuneration", "loyer", "exceptionnels"];
const montant = (v) => Number.isFinite(v);

/**
 * Which cards are answered. @param r amounts read on the screen { remuneration_dirigeant_reelle,
 * remuneration_normative, loyer_paye, loyer_marche, exceptionnels: [{ montant }] } ; @param choix { murs,
 * exceptionnel_signale } ; @param mursDirigeant the answer « the walls belong to you » (rent to bring to market price)
 */
export function cartesRepondues(r = {}, choix = {}, mursDirigeant) {
  return {
    remuneration: montant(r.remuneration_dirigeant_reelle) && montant(r.remuneration_normative),
    loyer: Boolean(choix.murs) && (choix.murs !== mursDirigeant || (montant(r.loyer_paye) && montant(r.loyer_marche))),
    exceptionnels: choix.exceptionnel_signale === "Non" || (choix.exceptionnel_signale === "Oui" && (r.exceptionnels || []).some((e) => montant(e.montant) && e.montant !== 0)),
  };
}

/**
 * The card to open: the one asked for (click on its title), otherwise the first card not answered after `apres` (the
 * card just closed), otherwise the first not answered at all; null when the three are answered (all closed, with their
 * summary: a file already filled opens like this).
 */
export function carteAOuvrir(repondues, { demandee = null, apres = null } = {}) {
  if (demandee) return demandee;
  const i = apres ? CARTES.indexOf(apres) : -1;
  return CARTES.slice(i + 1).find((k) => !repondues[k]) ?? CARTES.find((k) => !repondues[k]) ?? null;
}

/** « Validate these adjustments » only when the three cards are answered. */
export const retraitementsComplets = (repondues) => CARTES.every((k) => repondues[k]);
