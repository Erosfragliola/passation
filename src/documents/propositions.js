// Answers proposed to the owner for the guided flow (« Passation prepares, the owner approves »).
// Each proposal says where it comes from: public registries, accounts, approved website, or « most frequent choice »
// (then to be confirmed). Nothing is saved until the owner has approved the screen. Pure module, tested.
import { regionDe } from "./anonymat.js";
import { activiteFine } from "./naf.js";
import { faitsUtilisables } from "../../public/js/faits-site.js";
import { t as tr } from "../../public/js/i18n.js";

export const SOURCES_PROPOSITION = Object.fromEntries(["registres", "comptes", "site", "secteur", "frequent"].map((k) => [k, null]));
for (const k of Object.keys(SOURCES_PROPOSITION)) Object.defineProperty(SOURCES_PROPOSITION, k, { get: () => tr(`serveur.propositions.sources.${k}`), enumerable: true });

const ok = (v) => typeof v === "number" && Number.isFinite(v);
const annee = (d) => (d ? Number(String(d).slice(0, 4)) || null : null);

/** Proposed growth (slider): the past average annual growth, rounded to the point, bounded to −20% / +30%. */
export function croissanceProposee(tcam) {
  if (!ok(tcam)) return null;
  return Math.min(0.3, Math.max(-0.2, Math.round(tcam * 100) / 100));
}

/** Type of customers from the NAF section (retail, accommodation, personal services: individuals). */
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

const CERTIFS = /\b(RGE|Qualibat|Qualifelec|Qualit['’]?EnR|QualiPAC|QualiBois|Qualisol|ISO\s?\d{4,5}|MASE|EPV|Entreprise du Patrimoine Vivant|Origine France Garantie|Ma[iî]tre artisan|Artisan d['’]art|Imprim['’]Vert|Ecocert|Label Rouge|NF\s?[A-Z]?\d{2,5})\b/gi;
/** Certifications named in the website facts (« qualifiée RGE », « certifiée ISO 9001 »): short names, no duplicate. */
export function certificationsCitees(faits = []) {
  const vus = new Map();
  for (const f of faits) for (const m of String(f.fait || "").matchAll(CERTIFS)) { const n = m[1].replace(/\s+/g, " ").replace(/^iso ?/i, "ISO "); if (!vus.has(n.toLowerCase())) vus.set(n.toLowerCase(), n); }
  return [...vus.values()];
}

/**
 * Key dates: incorporation, then public events (moves, change of name, acquisition of a business), as rows
 * { date, type, precision, source }; the source is always « public registries ».
 */
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
 * @returns {Record<string, { valeurs: Record<string, any>, source: string }>} par identifiant de question
 */
export function propositions({ entreprise = {}, tcam = null, reponses = {} }) {
  const p = {};
  const ajouter = (id, valeurs, source) => {
    const v = Object.fromEntries(Object.entries(valeurs).filter(([, x]) => x != null && x !== "" && !(Array.isArray(x) && !x.length)));
    if (Object.keys(v).length) p[id] = { ...(p[id] || {}), valeurs: { ...(p[id]?.valeurs || {}), ...v }, source: p[id]?.source || source };
  };
  const site = reponses.site || {};
  // Website facts: those the owner has not removed, without an unresolved contradiction with the registries
  const faits = faitsUtilisables(site.faits || [], entreprise);
  const texteSite = faits.map((f) => f.fait).join(" ");
  const codeEff = String(entreprise.tranche_effectif?.code || "NN");

  // Business: trades read on the website, then the finest NAF label (subclass); type of customers from the
  // industry. The memorandum's sentence is written on screen from the owner's choices (activite.description).
  // The NAF label is pre-ticked only if no trade was read on the website; otherwise it is proposed, unticked.
  const lus = (Array.isArray(site.metiers) ? site.metiers : []).slice(0, 8), naf = activiteFine(entreprise.naf);
  ajouter("activite", { "activite.metiers": lus.length ? lus : [naf] }, lus.length ? SOURCES_PROPOSITION.site : SOURCES_PROPOSITION.registres);
  if (lus.length && naf && p.activite && !lus.includes(naf)) p.activite.autres = { "activite.metiers": [naf] };
  ajouter("activite", { "clients.type_clientele": clienteleDuSecteur(entreprise.naf, entreprise.section_naf) }, SOURCES_PROPOSITION.secteur);

  // What sets the company apart: spotted in the website facts (three at most); named certifications
  const distinctions = DISTINCTIONS.filter(([, re]) => re.test(texteSite)).map(([n]) => n).slice(0, 3);
  ajouter("distinctions", { "activite.distinctions": distinctions, "activite.certifications": certificationsCitees(faits) }, SOURCES_PROPOSITION.site);

  ajouter("histoire", { "activite.dates_cles": datesCles(entreprise) }, SOURCES_PROPOSITION.registres);

  // Team: management estimated from the headcount (to be confirmed). No multiple choice pre-ticked without a source.
  const encadrement = codeEff >= "11" && codeEff !== "NN" ? "Oui, un ou plusieurs responsables" : ["01", "02", "03"].includes(codeEff) ? "En partie" : null;
  ajouter("equipe", { "dirigeant.encadrement": encadrement }, tr("serveur.propositions.sources.effectif"));

  const region = regionDe(entreprise.code_postal);
  const locale = /^47|^56|^96/.test(entreprise.naf || "");
  ajouter("clients", { "activite.zone": locale ? "Locale" : "Régionale", "clients.regions": region ? [region] : null }, SOURCES_PROPOSITION.secteur);

  // Nothing that changes the value is ever prepared (24/11/2026): exceptional items, holding of the shares and share
  // sold are asked in the first stage, on screens the owner validates as a whole. Only questions of the memorandum here.
  ajouter("operation", { "operation.calendrier": "6 à 12 mois", "operation.accompagnement": "6 mois" }, SOURCES_PROPOSITION.frequent);

  const c = croissanceProposee(tcam);
  if (c != null) ajouter("perspectives", { "perspectives.croissance": c }, SOURCES_PROPOSITION.comptes);
  return p;
}
