// Help of a field folded behind a « ? » (audit of 25/11/2026): a real button, reachable with the keyboard and announced
// by screen readers (aria-expanded, aria-controls), that unfolds the help below the field. Shared by the guided path
// and the Valuation page.
import { t } from "./i18n.js";

let n = 0;
/**
 * @param texte help text (nothing is built without it)
 * @param sujet what the help is about (the field label), read by screen readers: « Help: Your annual cost »
 * @returns { bouton, zone } to place next to the label and below the field, or null without text
 */
export function aideRepliee(texte, sujet = "") {
  if (!texte) return null;
  const id = `aide-${++n}`;
  const zone = document.createElement("p");
  Object.assign(zone, { id, className: "aide-repliee", hidden: true, textContent: texte });
  const bouton = document.createElement("button");
  Object.assign(bouton, { type: "button", className: "aide-bouton", textContent: "?" });
  bouton.setAttribute("aria-expanded", "false");
  bouton.setAttribute("aria-controls", id);
  bouton.setAttribute("aria-label", sujet ? t("commun.aide.sur", { sujet }) : t("commun.aide.afficher"));
  bouton.addEventListener("click", () => {
    const ouvert = bouton.getAttribute("aria-expanded") !== "true";
    bouton.setAttribute("aria-expanded", String(ouvert));
    zone.hidden = !ouvert;
  });
  return { bouton, zone };
}
