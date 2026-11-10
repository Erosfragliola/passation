// Mémorandum d'information : sections, données transmises à Claude pour chacune, tableau financier calculé par le code.
// Présentation 100 % Passation ; seul le logo de l'entreprise apparaît (couverture, en-tête).
import { SECTEURS_NAF, anciennete } from "./anonymat.js";
import { libelleEffectif } from "../../public/js/regles.js";

export const SECTIONS_MEMO = [
  { cle: "synthese", titre: "Synthèse de l'opportunité", consigne: "Présente en quelques paragraphes l'entreprise, ses atouts et l'opération recherchée.", donnees: ["entreprise", "activite", "atouts", "operation", "finances_resume"] },
  { cle: "histoire", titre: "Histoire et identité", consigne: "Retrace la création et les étapes connues (frise publique, faits du site).", donnees: ["entreprise", "frise", "faits:histoire,implantation"] },
  { cle: "activite", titre: "Activité, produits et services", consigne: "Décris le métier, l'offre et le savoir-faire.", donnees: ["activite", "faits:activite,produits,qualite"] },
  { cle: "marche", titre: "Marché et clients", consigne: "Décris la clientèle, la zone commerciale, la concentration et la récurrence du chiffre d'affaires.", donnees: ["activite", "clients", "faits:clients,marche"] },
  { cle: "organisation", titre: "Organisation et équipe", consigne: "Décris l'équipe, l'encadrement et le rôle actuel du dirigeant.", donnees: ["entreprise", "activite", "dirigeant_role", "faits:equipe"] },
  { cle: "finances", titre: "Commentaire des données financières", consigne: "Commente l'évolution des chiffres validés fournis (le tableau est ajouté à part). Pas de nouveau calcul.", donnees: ["finances"] },
  { cle: "perspectives", titre: "Atouts et perspectives", consigne: "Présente les forces et les pistes de développement indiquées par le dirigeant.", donnees: ["atouts", "faits:autre"] },
  { cle: "operation", titre: "L'opération envisagée", consigne: "Présente la part cédée, le motif, l'accompagnement et le calendrier.", donnees: ["operation"] },
];

const LIGNES_FIN = [["chiffre_affaires", "Chiffre d'affaires"], ["ebe", "EBE"], ["resultat_exploitation", "Résultat d'exploitation"], ["resultat_net", "Résultat net"], ["capitaux_propres", "Capitaux propres"], ["emprunts", "Emprunts et dettes financières"], ["tresorerie", "Disponibilités"]];

/** Tableau financier (chiffres validés uniquement) ; l'EBE est celui du pont (comptable), jamais retraité ici. */
export function tableauFinancier(entree, resultat) {
  const exs = entree?.exercices || [];
  const ebeParAnnee = Object.fromEntries((resultat?.pont_ebe || []).map((p) => [p.annee, p.ebe_comptable]));
  return {
    annees: exs.map((e) => e.annee),
    lignes: LIGNES_FIN.map(([cle, libelle]) => ({ cle, libelle, valeurs: exs.map((e) => (cle === "ebe" ? ebeParAnnee[e.annee] ?? null : Number.isFinite(e[cle]) ? e[cle] : null)) }))
      .filter((l) => l.valeurs.some((v) => v != null)),
  };
}

/** Données transmises à Claude pour une section (uniquement ce dont la section a besoin). */
export function donneesSection(section, { entreprise, entree, resultat, reponses = {} }) {
  const site = reponses.site || {};
  const faitsValides = (site.faits || []).filter((f) => f.valide);
  const d = {};
  for (const cle of section.donnees) {
    if (cle === "entreprise") d.entreprise = { nom: entreprise.nom, ville: entreprise.ville, date_creation: entreprise.date_creation, anciennete: anciennete(entreprise.date_creation), secteur: SECTEURS_NAF[entreprise.section_naf] ?? null, code_naf: entreprise.naf, effectif: libelleEffectif(entreprise.tranche_effectif?.code) };
    else if (cle === "frise") d.frise_publique = (entreprise.evenements || []).map((e) => ({ date: e.date, type: e.type, detail: e.detail ?? (e.nouveau ? `${e.ancien ?? ""} → ${e.nouveau}` : null) }));
    else if (cle === "activite") d.activite = reponses.activite || {};
    else if (cle === "atouts") d.atouts = reponses.atouts || {};
    else if (cle === "operation") d.operation = reponses.operation || {};
    else if (cle === "clients") d.clients = reponses.clients || {};
    else if (cle === "dirigeant_role") d.role_actuel_du_dirigeant = reponses.dirigeant?.role_dirigeant ?? null;
    else if (cle === "finances") d.chiffres_valides = tableauFinancier(entree, resultat);
    else if (cle === "finances_resume") { const t = tableauFinancier(entree, resultat); d.dernier_exercice = t.annees.length ? Object.fromEntries(t.lignes.map((l) => [l.libelle, l.valeurs.at(-1)])) : null; }
    else if (cle.startsWith("faits:")) { const cats = cle.slice(6).split(","); d.faits_du_site_valides = faitsValides.filter((f) => cats.includes(f.categorie)).map((f) => ({ fait: f.fait, source: f.source })); }
  }
  return d;
}

/** Le mémorandum s'ouvre quand l'activité est décrite et l'opération précisée. */
export function memoDeverrouille(reponses = {}) {
  const manque = [];
  if (!reponses.activite?.description?.trim()) manque.push("Décrire votre activité (questionnaire, « Votre activité »)");
  if (!reponses.operation?.part_cedee) manque.push("Préciser l'opération envisagée (questionnaire, « L'opération envisagée »)");
  return { ok: manque.length === 0, manque };
}
