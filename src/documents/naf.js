// Libellé le plus fin de l'activité (code NAF de l'entreprise), pour le mémorandum et le parcours guidé :
// sous-classe NAF rév. 2 en français (INSEE), classe NACE Rév. 2 en anglais (Eurostat ; les sous-classes sont
// propres à la France). Sources et dates dans les fichiers de src/data/.
// Jamais pour le teaser : le teaser anonyme reste au niveau de la division (anonymat.js, secteurDe).
import sousClasses from "../data/naf-sous-classes.json";
import classesEn from "../data/naf-classes-en.json";
import { langue } from "../../public/js/i18n.js";

/** « 16.23Z » → « Fabrication de charpentes et d'autres menuiseries » ; anglais : « Manufacture of other builders'
 *  carpentry and joinery ». null si le code est inconnu. */
export function activiteFine(naf, l = langue()) {
  const code = String(naf || "").trim().toUpperCase();
  if (!/^\d{2}\.\d{2}[A-Z]$/.test(code)) return null;
  if (l === "en") return classesEn.classes[code.slice(0, 5)] ?? null;
  return sousClasses.sous_classes[code] ?? null;
}
