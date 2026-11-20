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
  const options = [-0.05, 0, 0.05, 0.1, 0.15];
  return options.reduce((m, o) => (Math.abs(o - tcam) < Math.abs(m - tcam) ? o : m), options[0]);
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
  const c = annee(entreprise.date_creation);
  if (c) lignes.push(entreprise.ville ? tr("serveur.propositions.dates.creation_ville", { annee: c, ville: entreprise.ville }) : tr("serveur.propositions.dates.creation", { annee: c }));
  for (const e of entreprise.evenements || []) {
    const a = annee(e.date);
    if (!a) continue;
    if (e.type === "transfert_siege") lignes.push(e.detail ? tr("serveur.propositions.dates.transfert_ville", { annee: a, ville: e.detail }) : tr("serveur.propositions.dates.transfert", { annee: a }));
    else if (e.type === "denomination") lignes.push(tr("serveur.propositions.dates.denomination", { annee: a }));
    else if (e.type === "reprise_fonds") lignes.push(e.detail ? tr("serveur.propositions.dates.reprise_ville", { annee: a, ville: e.detail }) : tr("serveur.propositions.dates.reprise", { annee: a }));
  }
  return lignes.slice(0, 6);
}

/**
 * @param {{ entreprise: object, tcam: number|null, reponses: object }} donnees
 * @returns {Record<string, { valeurs: Record<string, any>, source: string }>} by question identifier
 */
export function propositions({ entreprise = {}, tcam = null, reponses = {} }) {
  const p = {};
  const ajouter = (id, valeurs, source) => {
    const v = Object.fromEntries(Object.entries(valeurs).filter(([, x]) => x != null && x !== "" && !(Array.isArray(x) && !x.length)));
    if (Object.keys(v).length) p[id] = { valeurs: v, source };
  };
  const faits = (reponses.site?.faits || []).filter((f) => f.valide !== false);
  const texteSite = faits.map((f) => f.fait).join(" ");
  const secteur = secteurDe(entreprise.naf);
  const effectif = libelleEffectif(entreprise.tranche_effectif?.code);
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

  ajouter("histoire", { "activite.dates_cles": datesCles(entreprise).join("\n") }, SOURCES_PROPOSITION.registres);

  ajouter("detention", { "operation.detention": "En direct, à titre personnel" }, SOURCES_PROPOSITION.frequent);
  ajouter("exceptionnel", { "retraitements.exceptionnel_signale": "Non" }, SOURCES_PROPOSITION.frequent);

  const region = regionDe(entreprise.code_postal);
  const locale = /^47|^56|^96/.test(entreprise.naf || "");
  ajouter("clients", { "activite.zone": locale ? "Locale" : "Régionale", "clients.regions": region ? [region] : null, "clients.type_clientele": clienteleDuSecteur(entreprise.naf, entreprise.section_naf) }, SOURCES_PROPOSITION.secteur);

  const c = croissanceProposee(tcam);
  if (c != null) ajouter("perspectives", { "perspectives.croissance": c }, SOURCES_PROPOSITION.comptes);

  ajouter("cession", { "operation.accompagnement": "6 mois", "operation.repreneur": ["Indifférent"] }, SOURCES_PROPOSITION.frequent);
  return p;
}
