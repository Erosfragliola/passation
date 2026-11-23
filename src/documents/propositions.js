// Answers proposed to the owner for the guided steps ("Passation prepares, the owner approves").
// Each proposal says where it comes from: public registries, accounts, approved website, or "most common choice"
// (then to be confirmed). Nothing is saved until the owner has approved the screen. Pure module, tested.
import { regionDe, secteurDe } from "./anonymat.js";
import { libelleEffectif } from "../../public/js/regles.js";
import { t as tr } from "../../public/js/i18n.js";

export const SOURCES_PROPOSITION = Object.fromEntries(["registres", "comptes", "site", "secteur", "frequent"].map((k) => [k, null]));
for (const k of Object.keys(SOURCES_PROPOSITION)) Object.defineProperty(SOURCES_PROPOSITION, k, { get: () => tr(`serveur.propositions.sources.${k}`), enumerable: true });

const ok = (v) => typeof v === "number" && Number.isFinite(v);
const annee = (d) => (d ? Number(String(d).slice(0, 4)) || null : null);

/** Proposed growth: the option closest to the past compound annual growth. */
export function croissanceProposee(tcam) {
  if (!ok(tcam)) return null;
  return Math.min(0.3, Math.max(-0.2, Math.round(tcam * 100) / 100));
}

/** Type of customers based on the NAF section (retail trade, accommodation, personal services: individuals). */
export function clienteleDuSecteur(naf, section) {
  if (/^47/.test(naf || "") || ["I", "S", "P", "Q", "R"].includes(section)) return ["Particuliers"];
  if (["F", "C", "H", "M", "N", "J", "B", "D", "E"].includes(section)) return ["Entreprises"];
  if (section === "G") return ["Entreprises"];
  return null;
}

const DISTINCTIONS = [
  ["Qualité", /qualit|finition|haut de gamme|exigen/i], ["Sur mesure", /sur mesure|personnalis/i],
  ["Délais", /d[ée]lai|r[ée]activit|rapidit/i], ["Équipements", /machine|[ée]quipement|num[ée]rique|usinage|atelier/i],
  ["Certifications", /certif|qualibat|rge|iso\s?\d|label|agr[ée]ment/i], ["Relation client", /conseil|accompagn|service client|sav|proximit/i],
];

/** Key dates: creation, then public events (transfers, name change, acquisition of a business). */
export function datesCles(entreprise) {
  const lignes = [];
  const source = SOURCES_PROPOSITION.registres;
  const c = annee(entreprise.date_creation);
  if (c) lignes.push({ date: String(c), type: "creation", precision: entreprise.ville ? tr("serveur.propositions.precisions.creation_ville", { ville: entreprise.ville }) : "", source });
  for (const e of entreprise.evenements || []) {
    const a = annee(e.date);
    if (!a) continue;
    const mois = /^\d{4}-(\d{2})/.exec(String(e.date))?.[1];
    const date = mois ? `${mois}/${a}` : String(a);
    if (e.type === "transfert_siege") lignes.push({ date, type: "transfert_siege", precision: e.detail ? tr("serveur.propositions.precisions.ville", { ville: e.detail }) : "", source });
    else if (e.type === "denomination") lignes.push({ date, type: "autre", precision: tr("serveur.propositions.precisions.denomination"), source });
    else if (e.type === "reprise_fonds") lignes.push({ date, type: "reprise", precision: e.detail ? tr("serveur.propositions.precisions.reprise_ville", { ville: e.detail }) : tr("serveur.propositions.precisions.reprise"), source });
  }
  return lignes.slice(0, 8);
}

/**
 * @param {{ entreprise: object, tcam: number|null, reponses: object }} donnees
 * @returns {Record<string, { valeurs: Record<string, any>, source: string }>} by question identifier
 */
export function propositions({ entreprise = {}, tcam = null, reponses = {} }) {
  const p = {};
  const ajouter = (id, valeurs, source) => {
    const v = Object.fromEntries(Object.entries(valeurs).filter(([, x]) => x != null && x !== "" && !(Array.isArray(x) && !x.length)));
    if (Object.keys(v).length) p[id] = { ...(p[id] || {}), valeurs: { ...(p[id]?.valeurs || {}), ...v }, source: p[id]?.source || source };
  };
  const site = reponses.site || {};
  // Faits du site : ceux que le dirigeant n'a pas retirés, sans contradiction non tranchée avec les registres
  const faits = faitsUtilisables(site.faits || [], entreprise);
  const texteSite = faits.map((f) => f.fait).join(" ");
  const codeEff = String(entreprise.tranche_effectif?.code || "NN");

  // Business: website facts, otherwise a sentence drawn from the registries (to be completed by the owner)
  const activiteSite = faits.filter((f) => ["activite", "produits", "clients", "qualite"].includes(f.categorie)).slice(0, 5).map((f) => f.fait).join(" ");
  if (activiteSite) ajouter("activite", { "activite.description": activiteSite }, SOURCES_PROPOSITION.site);
  else if (secteur) ajouter("activite", { "activite.description": [tr("serveur.propositions.activite.secteur", { secteur }), annee(entreprise.date_creation) ? tr("regles.suggestion.creee", { annee: annee(entreprise.date_creation) }) : null, entreprise.ville ? tr("serveur.propositions.activite.ville", { ville: entreprise.ville }) : null, effectif ? `(${effectif})` : null].filter(Boolean).join(" ") + tr("serveur.propositions.activite.precisez") }, SOURCES_PROPOSITION.registres);
  // Simple starting point drawn from the registries: to be completed by the owner, never approved in one click in the summary
  if (p.activite?.source === SOURCES_PROPOSITION.registres) p.activite.a_completer = true;

  ajouter("operation", { "operation.part_cedee": "100 %", "operation.calendrier": "6 à 12 mois" }, SOURCES_PROPOSITION.frequent);

  // What sets the company apart: found in the website facts
  const distinctions = DISTINCTIONS.filter(([, re]) => re.test(texteSite)).map(([n]) => n).slice(0, 3);
  const certifs = faits.filter((f) => DISTINCTIONS[4][1].test(f.fait)).map((f) => f.fait).join(" ");
  ajouter("distinctions", { "activite.distinctions": distinctions, "activite.certifications": certifs }, SOURCES_PROPOSITION.site);

  // Team: management estimated from the headcount (to be confirmed)
  const encadrement = codeEff >= "11" && codeEff !== "NN" ? "Oui, un ou plusieurs responsables" : ["01", "02", "03"].includes(codeEff) ? "En partie" : null;
  ajouter("equipe", { "dirigeant.encadrement": encadrement, "dirigeant.role_dirigeant": ["Commercial", "Gestion"] }, encadrement ? tr("serveur.propositions.sources.effectif") : SOURCES_PROPOSITION.frequent);

  ajouter("histoire", { "activite.dates_cles": datesCles(entreprise) }, SOURCES_PROPOSITION.registres);

  // Équipe : encadrement estimé d'après l'effectif (à confirmer). Aucun choix multiple pré-coché sans source.
  const encadrement = codeEff >= "11" && codeEff !== "NN" ? "Oui, un ou plusieurs responsables" : ["01", "02", "03"].includes(codeEff) ? "En partie" : null;
  ajouter("equipe", { "dirigeant.encadrement": encadrement }, tr("serveur.propositions.sources.effectif"));

  const region = regionDe(entreprise.code_postal);
  const locale = /^47|^56|^96/.test(entreprise.naf || "");
  ajouter("clients", { "activite.zone": locale ? "Locale" : "Régionale", "clients.regions": region ? [region] : null }, SOURCES_PROPOSITION.secteur);

  ajouter("remuneration", { "retraitements.exceptionnel_signale": "Non" }, SOURCES_PROPOSITION.frequent);
  ajouter("detention", { "operation.detention": "En direct, à titre personnel" }, SOURCES_PROPOSITION.frequent);
  ajouter("operation", { "operation.part_cedee": "100 %", "operation.calendrier": "6 à 12 mois", "operation.accompagnement": "6 mois" }, SOURCES_PROPOSITION.frequent);

  const c = croissanceProposee(tcam);
  if (c != null) ajouter("perspectives", { "perspectives.croissance": c }, SOURCES_PROPOSITION.comptes);
  return p;
}
