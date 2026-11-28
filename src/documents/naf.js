// Finest label of the business (company's NAF code), for the memorandum and the guided flow:
// NAF rev. 2 subclass in French (INSEE), NACE Rev. 2 class in English (Eurostat; subclasses are specific to France).
// Sources and dates in the files of src/data/.
// Never for the teaser: the anonymous teaser stays at the division level (anonymat.js, secteurDe).
import sousClasses from "../data/naf-sous-classes.json";
import classesEn from "../data/naf-classes-en.json";
import { langue } from "../../public/js/i18n.js";

/**
 * « 16.23Z » → « Fabrication de charpentes et d'autres menuiseries »; in English: « Manufacture of other builders'
 * carpentry and joinery ». null if the code is unknown.
 */
export function activiteFine(naf, l = langue()) {
  const code = String(naf || "").trim().toUpperCase();
  if (!/^\d{2}\.\d{2}[A-Z]$/.test(code)) return null;
  if (l === "en") return classesEn.classes[code.slice(0, 5)] ?? null;
  return sousClasses.sous_classes[code] ?? null;
}
