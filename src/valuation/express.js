// Valorisation express : fourchette de valeur d'entreprise (VE) à partir des derniers comptes publiés
// et des multiples sectoriels de src/data/multiples.json. Calcul déterministe, aucun appel à l'IA.
import MULTIPLES from "../data/multiples.json";
import { dernier } from "../../public/js/regles.js";
import { t as tr } from "../../public/js/i18n.js";

const complet = (m) => m && [m.bas, m.central, m.haut].every(Number.isFinite);

export function secteurPour(section, table = MULTIPLES) {
  return table.secteurs.find((s) => s.sections.includes(String(section || "").toUpperCase())) ?? null;
}

/**
 * @param d objet maquette (section_naf, ca[], ebe[]) ; ou saisie du dirigeant { section_naf, ca: [{annee, valeur}], ebe: [...] }
 * @returns { statut, exercice?, methode?, bas?, central?, haut?, multiples?, source? }
 *   statut : "ok" | "comptes_absents" | "reference_a_completer" | "non_calculable"
 */
export function estimationExpress(d, table = MULTIPLES) {
  const caD = dernier(d.ca);
  if (!caD) return { statut: "comptes_absents" };
  const ebeD = (d.ebe || []).find((e) => e.annee === caD.annee && Number.isFinite(e.valeur)) ?? null;
  const secteur = secteurPour(d.section_naf, table);
  const base = { exercice: caD.annee, secteur: secteur?.cle ?? null };

  if (ebeD && ebeD.valeur > 0 && complet(secteur?.ebe)) {
    const m = secteur.ebe;
    return { statut: "ok", ...base, methode: "multiple_ebe", agregat: ebeD.valeur,
      bas: ebeD.valeur * m.bas, central: ebeD.valeur * m.central, haut: ebeD.valeur * m.haut, multiples: m, source: secteur.source };
  }
  if (caD.valeur > 0 && complet(secteur?.ca)) {
    const m = secteur.ca;
    return { statut: "ok", ...base, methode: "multiple_ca", agregat: caD.valeur,
      bas: caD.valeur * m.bas, central: caD.valeur * m.central, haut: caD.valeur * m.haut, multiples: m, source: secteur.source,
      avertissement: tr("serveur.express.avertissement") };
  }
  if (!complet(secteur?.ebe) && !complet(secteur?.ca)) return { statut: "reference_a_completer", ...base };
  return { statut: "non_calculable", ...base };
}
