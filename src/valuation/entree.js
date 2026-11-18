// Assemble l'entrée du moteur de valorisation à partir du dossier : chiffres validés, réponses du questionnaire,
// réglages du dirigeant (prime de taille, décotes, pondération, hypothèses modifiées). Pur et testé.
import { exerciceValide, manquants } from "../../public/js/champs-financiers.js";
import { secteurPour } from "./express.js";
import { erreursReponses } from "./validation.js";

const num = (x) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
const deep = (o) => JSON.parse(JSON.stringify(o));

/**
 * @param entreprise company_json du dossier (section_naf…)
 * @param lignes { [annee]: { [cle]: { valeur, valide, source } } }
 * @param reponses { [etape]: { ... } } ; reglages = reponses.reglages
 * @param H hypothèses Passation (hypotheses.json)
 * @returns { entree, H } : H modifié si le dirigeant a remplacé une hypothèse (tracé dans H.modifiees)
 */
export function assemblerEntree(entreprise, lignes, reponses, H) {
  const r = reponses || {};
  const reg = r.reglages || {};
  // Seuls les exercices complets entrent dans le calcul : un poste obligatoire manquant ou non validé n'est jamais
  // compté à zéro (un zéro saisi et validé, lui, est un vrai zéro). Les exercices écartés sont signalés.
  const exercices = [], exercices_exclus = [];
  for (const [annee, l] of Object.entries(lignes || {})) {
    const ex = { annee: Number(annee), ...exerciceValide(l) };
    if (!Number.isFinite(ex.chiffre_affaires)) continue; // rien d'exploitable validé pour cet exercice
    const manque = manquants(l);
    if (manque.length) exercices_exclus.push({ annee: ex.annee, manquants: manque });
    else exercices.push(ex);
  }
  exercices.sort((a, b) => a.annee - b.annee);
  exercices_exclus.sort((a, b) => a.annee - b.annee);

  const d = r.dirigeant || {}, rt = r.retraitements || {}, p = r.perspectives || {}, b = r.bilan || {};
  const retraitements = {
    remuneration_dirigeant_reelle: num(d.remuneration_dirigeant_reelle) ?? undefined,
    remuneration_normative: num(d.remuneration_normative) ?? undefined,
    loyer_paye: num(rt.loyer_paye) ?? undefined,
    loyer_marche: num(rt.loyer_marche) ?? undefined,
    exceptionnels: (rt.exceptionnels || []).map((e) => ({ annee: Number(e.annee), libelle: e.libelle, montant: num(e.montant), justification: e.justification }))
      .filter((e) => Number.isFinite(e.montant) && Number.isFinite(e.annee)),
  };
  const complements = {};
  for (const k of ["comptes_courants_remboursables", "credit_bail_restant", "dividendes_a_verser", "plus_values_latentes", "frais_etablissement", "creances_douteuses", "actifs_hors_exploitation"]) {
    if (num(b[k]) != null) complements[k] = num(b[k]);
  }
  const previsions = {};
  for (const k of ["croissance", "marge_ebe", "investissements_pct"]) if (num(p[k]) != null) previsions[k] = num(p[k]);
  if (num(reg.croissance_terminale) != null) previsions.croissance_terminale = num(reg.croissance_terminale);

  const caDernier = exercices.at(-1)?.chiffre_affaires ?? 0;
  const tauxReduit = b.capital_personnes_physiques === "oui" && caDernier <= 10_000_000;

  // Hypothèses remplacées par le dirigeant (traçées)
  const h = deep(H);
  h.modifiees = [];
  for (const [cle, chemin] of [["taux_sans_risque", "taux_sans_risque"], ["prime_risque_marche", "prime_risque_marche"], ["cout_dette_avant_impot", "cout_dette_avant_impot"]]) {
    if (num(reg[cle]) != null && num(reg[cle]) !== h[chemin].valeur) { h[chemin].valeur = num(reg[cle]); h.modifiees.push(cle); }
  }

  const poids = num(reg.poids_multiples);
  const entree = {
    secteur: secteurPour(entreprise?.section_naf)?.cle ?? null,
    exercices, exercices_exclus, retraitements, complements, previsions,
    decotes: (reg.decotes || []).map((f) => ({ cle: f.cle, pct: num(f.pct) ?? 0, justification: f.justification || "" })),
    primeTaille: num(reg.prime_taille),
    tauxReduit,
    modeEbe: reg.mode_ebe === "dernier" ? "dernier" : "moyenne",
    ponderation: poids != null ? { multiples: poids, dcf: 1 - poids } : undefined,
    // Réglages hors bornes déjà enregistrés : signalés, le calcul est refusé (jamais corrigés en silence)
    erreurs: erreursReponses(r, H),
  };
  return { entree, H: h };
}
