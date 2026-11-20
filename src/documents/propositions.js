// Réponses proposées au dirigeant pour le parcours guidé (« Passation prépare, le dirigeant valide »).
// Chaque proposition dit d'où elle vient : registres publics, comptes, site validé, ou « choix le plus fréquent »
// (alors à confirmer). Rien n'est enregistré tant que le dirigeant n'a pas validé l'écran. Module pur, testé.
import { regionDe } from "./anonymat.js";
import { activiteFine } from "./naf.js";
import { faitsUtilisables } from "../../public/js/faits-site.js";
import { t as tr } from "../../public/js/i18n.js";

export const SOURCES_PROPOSITION = Object.fromEntries(["registres", "comptes", "site", "secteur", "frequent"].map((k) => [k, null]));
for (const k of Object.keys(SOURCES_PROPOSITION)) Object.defineProperty(SOURCES_PROPOSITION, k, { get: () => tr(`serveur.propositions.sources.${k}`), enumerable: true });

const ok = (v) => typeof v === "number" && Number.isFinite(v);
const annee = (d) => (d ? Number(String(d).slice(0, 4)) || null : null);

/** Croissance proposée (curseur) : la croissance annuelle moyenne passée, arrondie au point, bornée à −20 % / +30 %. */
export function croissanceProposee(tcam) {
  if (!ok(tcam)) return null;
  return Math.min(0.3, Math.max(-0.2, Math.round(tcam * 100) / 100));
}

/** Type de clientèle d'après la section NAF (commerce de détail, hébergement, services aux personnes : particuliers). */
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
/** Certifications nommées dans les faits du site (« qualifiée RGE », « certifiée ISO 9001 ») : noms courts, sans doublon. */
export function certificationsCitees(faits = []) {
  const vus = new Map();
  for (const f of faits) for (const m of String(f.fait || "").matchAll(CERTIFS)) { const n = m[1].replace(/\s+/g, " ").replace(/^iso ?/i, "ISO "); if (!vus.has(n.toLowerCase())) vus.set(n.toLowerCase(), n); }
  return [...vus.values()];
}

/** Dates clés : création, puis événements publics (transferts, dénomination, reprise de fonds), en lignes
 *  { date, type, precision, source } ; la source est toujours « registres publics ». */
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
  // Faits du site : ceux que le dirigeant n'a pas retirés, sans contradiction non tranchée avec les registres
  const faits = faitsUtilisables(site.faits || [], entreprise);
  const texteSite = faits.map((f) => f.fait).join(" ");
  const codeEff = String(entreprise.tranche_effectif?.code || "NN");

  // Activité : métiers lus sur le site, puis l'intitulé NAF le plus fin (sous-classe) ; type de clientèle d'après le
  // secteur. La phrase du mémorandum est rédigée à l'écran à partir des choix du dirigeant (activite.description).
  // Le libellé NAF n'est pré-coché que s'il n'y a pas de métier lu sur le site ; sinon il est proposé, décoché.
  const lus = (Array.isArray(site.metiers) ? site.metiers : []).slice(0, 8), naf = activiteFine(entreprise.naf);
  ajouter("activite", { "activite.metiers": lus.length ? lus : [naf] }, lus.length ? SOURCES_PROPOSITION.site : SOURCES_PROPOSITION.registres);
  if (lus.length && naf && p.activite && !lus.includes(naf)) p.activite.autres = { "activite.metiers": [naf] };
  ajouter("activite", { "clients.type_clientele": clienteleDuSecteur(entreprise.naf, entreprise.section_naf) }, SOURCES_PROPOSITION.secteur);

  // Ce qui distingue l'entreprise : repéré dans les faits du site (trois au plus) ; certifications nommées
  const distinctions = DISTINCTIONS.filter(([, re]) => re.test(texteSite)).map(([n]) => n).slice(0, 3);
  ajouter("distinctions", { "activite.distinctions": distinctions, "activite.certifications": certificationsCitees(faits) }, SOURCES_PROPOSITION.site);

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
