// Teaser : faits anonymes donnés à Claude (calculés par le code, jamais les chiffres exacts) et liste des montants
// à ne jamais publier. La rédaction est contrôlée par anonymat.js avant tout enregistrement.
import { SECTEURS_NAF, regionDe, fourchetteCA, fourchetteMarge, anciennete } from "./anonymat.js";
import { libelleEffectif, dernier } from "../../public/js/regles.js";

export const SECTIONS_TEASER = [
  ["accroche", "Accroche"], ["activite", "L'activité"], ["chiffres", "Chiffres clés"], ["atouts", "Atouts"], ["operation", "L'opération"],
];
const texte = (v) => (typeof v === "string" && v.trim() ? v.trim() : "À compléter");

export function faitsTeaser({ entreprise, resultat, entree, reponses = {} }) {
  const exs = entree?.exercices || [];
  const exD = exs.at(-1);
  const ca = exD?.chiffre_affaires ?? dernier(entreprise.ca)?.valeur ?? null;
  const ebe = resultat?.ebe_normatif?.valeur ?? dernier(entreprise.ebe)?.valeur ?? null;
  let tendance = "À compléter";
  if (exs.length >= 2 && exs[0].chiffre_affaires > 0) {
    const t = Math.pow(exD.chiffre_affaires / exs[0].chiffre_affaires, 1 / (exD.annee - exs[0].annee)) - 1;
    tendance = t > 0.03 ? "chiffre d'affaires en croissance" : t < -0.03 ? "chiffre d'affaires en baisse" : "chiffre d'affaires stable";
  }
  const a = reponses.activite || {}, f = reponses.atouts || {}, o = reponses.operation || {}, c = reponses.clients || {};
  const recurrent = Number.isFinite(c.part_recurrente) ? `environ ${Math.round(c.part_recurrente * 10) * 10} % du chiffre d'affaires récurrent` : "À compléter";
  return {
    secteur: SECTEURS_NAF[entreprise.section_naf] ?? "À compléter",
    region: regionDe(entreprise.code_postal) ?? "France",
    anciennete: anciennete(entreprise.date_creation) ?? "À compléter",
    effectif: libelleEffectif(entreprise.tranche_effectif?.code) ?? "À compléter",
    chiffre_affaires: fourchetteCA(ca) ?? "À compléter",
    marge_ebe: ca > 0 && Number.isFinite(ebe) ? fourchetteMarge(ebe / ca) : "À compléter",
    tendance, recurrence: recurrent,
    activite: texte(a.description), produits_services: texte(a.produits_services), clientele: texte(a.clientele),
    zone_commerciale: texte(a.zone), equipe: texte(a.equipe),
    forces: texte(f.forces), developpement: texte(f.developpement),
    operation: { part_cedee: texte(o.part_cedee), motif: texte(o.motif), accompagnement: texte(o.accompagnement), calendrier: texte(o.calendrier) },
  };
}

/** Montants exacts du dossier : jamais dans le teaser. */
export function montantsSensibles({ entreprise, resultat, entree }) {
  const exD = entree?.exercices?.at(-1) || {};
  const s = resultat?.synthese || {}, e = entreprise.estimation || {};
  return [
    exD.chiffre_affaires, exD.ebe, exD.resultat_net, exD.resultat_exploitation, exD.capitaux_propres,
    dernier(entreprise.ca)?.valeur, dernier(entreprise.ebe)?.valeur, resultat?.ebe_normatif?.valeur,
    s.bas, s.central, s.haut, e.bas, e.central, e.haut,
  ].filter(Number.isFinite);
}

/** Sections → texte complet (pour le contrôle) ; atouts en liste. */
export const enSections = (r) => SECTIONS_TEASER.map(([cle]) => [cle, cle === "atouts" ? (r.atouts || []).map((x) => `- ${x}`).join("\n") : String(r[cle] ?? "")]);
