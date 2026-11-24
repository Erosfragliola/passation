// Teaser anonymization: general facts calculated by the code (industry, region, ranges) and automatic check
// of every published text. Forbidden: name (and its distinctive words), city, postal code, SIREN, exact amounts
// (revenue, EBITDA, net income, value), terms taken from the company's website. Pure module, tested.
import divisions from "../data/naf-divisions.json";
import divisionsEn from "../data/naf-divisions-en.json";
import { t as tr, langue } from "../../public/js/i18n.js";

/** Industry label displayed everywhere (home page, teaser, visuals, memorandum): the official NAF division (first two
 *  digits of the code), without the "except…" clause. "47.71Z" → "Commerce de détail" (retail trade). */
export function secteurDe(naf) {
  const code = String(naf || "").slice(0, 2);
  if (langue() === "en") { const e = divisionsEn.divisions[code]; return e ? e.split(", except")[0] : null; } // NACE Rev. 2, same divisions
  const l = divisions.divisions[code];
  return l ? l.split(", à l'exception")[0] : null;
}

/** Administrative regions since 2016 (INSEE, official geographic code): department → region. */
const REGIONS = {
  "Auvergne-Rhône-Alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "Bourgogne-Franche-Comté": ["21", "25", "39", "58", "70", "71", "89", "90"],
  "Bretagne": ["22", "29", "35", "56"],
  "Centre-Val de Loire": ["18", "28", "36", "37", "41", "45"],
  "Corse": ["20"],
  "Grand Est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "Hauts-de-France": ["02", "59", "60", "62", "80"],
  "Île-de-France": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "Normandie": ["14", "27", "50", "61", "76"],
  "Nouvelle-Aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  "Occitanie": ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "Pays de la Loire": ["44", "49", "53", "72", "85"],
  "Provence-Alpes-Côte d'Azur": ["04", "05", "06", "13", "83", "84"],
};
const DROM = { "971": "Guadeloupe", "972": "Martinique", "973": "Guyane", "974": "La Réunion", "976": "Mayotte" };

export function regionDe(codePostal) {
  const cp = String(codePostal || "").trim();
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("97")) return DROM[cp.slice(0, 3)] ?? null;
  const dep = cp.slice(0, 2);
  return Object.entries(REGIONS).find(([, deps]) => deps.includes(dep))?.[0] ?? null;
}

/** Sections of the NAF Rev. 2 classification (INSEE). Not for display (too broad, sometimes misleading: "G" for a
 *  clothing store): only as context for the market research, with the exact NAF code. */
export const SECTEURS_NAF = {
  A: "Agriculture, sylviculture et pêche", B: "Industries extractives", C: "Industrie manufacturière",
  D: "Production et distribution d'énergie", E: "Eau, assainissement, gestion des déchets et dépollution", F: "Construction",
  G: "Commerce, réparation d'automobiles et de motocycles", H: "Transports et entreposage", I: "Hébergement et restauration",
  J: "Information et communication", K: "Activités financières et d'assurance", L: "Activités immobilières",
  M: "Activités spécialisées, scientifiques et techniques", N: "Services administratifs et de soutien",
  O: "Administration publique", P: "Enseignement", Q: "Santé humaine et action sociale",
  R: "Arts, spectacles et activités récréatives", S: "Autres activités de services",
};

const BORNES_CA = [1e6, 2e6, 5e6, 10e6, 20e6, 50e6];
export function fourchetteCA(ca) {
  if (!(ca > 0)) return null;
  const m = (v) => tr("serveur.anonymat.meur", { n: v / 1e6 });
  if (ca < BORNES_CA[0]) return tr("serveur.anonymat.ca_moins", { m: m(BORNES_CA[0]) });
  for (let i = 1; i < BORNES_CA.length; i++) if (ca < BORNES_CA[i]) return tr("serveur.anonymat.ca_entre", { de: m(BORNES_CA[i - 1]), a: m(BORNES_CA[i]) });
  return tr("serveur.anonymat.ca_plus", { m: m(BORNES_CA.at(-1)) });
}
export function fourchetteMarge(marge) {
  if (!Number.isFinite(marge)) return null;
  if (marge < 0) return tr("serveur.anonymat.marge_negative");
  if (marge < 0.05) return tr("serveur.anonymat.marge_inferieure", { n: 5 });
  if (marge < 0.1) return tr("serveur.anonymat.marge_entre", { de: 5, a: 10 });
  if (marge < 0.15) return tr("serveur.anonymat.marge_entre", { de: 10, a: 15 });
  if (marge < 0.2) return tr("serveur.anonymat.marge_entre", { de: 15, a: 20 });
  return tr("serveur.anonymat.marge_superieure", { n: 20 });
}
export function anciennete(dateCreation, annee = new Date().getFullYear()) {
  const a = Number(String(dateCreation || "").slice(0, 4));
  if (!a) return null;
  const n = annee - a;
  if (n < 5) return tr("serveur.anonymat.moins_ans", { n: 5 });
  const palier = n >= 20 ? Math.floor(n / 10) * 10 : Math.floor(n / 5) * 5;
  return tr("serveur.anonymat.plus_ans", { n: palier });
}

// ---------------------------------------------------------------- Check
const normal = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const FORMES = new Set(["sas", "sasu", "sarl", "eurl", "sa", "sci", "snc", "selarl", "scop", "et", "fils", "freres", "groupe", "societe", "france", "les", "des", "de", "la", "le", "du", "and", "co", "cie", "holding", "entreprise", "ets", "etablissements"]);

/** Terms never to publish in the teaser. */
export function termesInterdits({ nom, ville, code_postal, siren, naf }, montants = [], termesSite = []) {
  const mots = [];
  const n = normal(nom).replace(/[^a-z0-9]+/g, " ").trim();
  if (n) mots.push(n);
  // A word of the name that also appears in the industry label ("Travaux" for "Travaux Dupont") does not identify
  // the company: it stays allowed, otherwise the teaser could no longer name its own industry
  const motsSecteur = new Set(normal(secteurDe(naf)).replace(/[^a-z0-9]+/g, " ").split(" "));
  for (const m of n.split(" ")) if (m.length >= 4 && !FORMES.has(m) && !motsSecteur.has(m)) mots.push(m);
  if (ville) mots.push(normal(ville));
  for (const t of termesSite) if (normal(t).trim().length >= 3) mots.push(normal(t).trim());
  return {
    mots: [...new Set(mots)],
    numeros: [siren, code_postal].filter(Boolean).map((x) => String(x).replace(/\s/g, "")),
    montants: montants.filter((v) => Number.isFinite(v) && Math.abs(v) >= 1000),
  };
}

/** Numbers written in a text ("2,4 M€", "2 400 000 €", "380 k€"), in euros. */
export function nombresDuTexte(texte) {
  const res = [];
  const re = /(\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+|\d+(?:[.,]\d+)?)\s*(m€|millions?|m\b|k€|milliers?|k\b|€)?/gi;
  let m;
  while ((m = re.exec(texte))) {
    const brut = m[1].replace(/[\s\u00a0\u202f]/g, "");
    const decimal = /,\d+$/.test(brut) || (/\.\d{1,2}$/.test(brut));
    let v = Number(decimal ? brut.replace(",", ".") : brut.replace(/\./g, ""));
    const u = (m[2] || "").toLowerCase();
    if (u.startsWith("m")) v *= 1e6; else if (u.startsWith("k") || u.startsWith("millier")) v *= 1e3;
    const chiffres = brut.replace(/^0+|[^0-9]/g, "").replace(/0+$/, "").length; // significant digits
    res.push({ texte: m[0].trim(), valeur: v, significatifs: chiffres, unite: Boolean(u) });
  }
  return res;
}

/** @returns list of problems found (empty = text can be published). */
export function verifierAnonymat(texte, interdits) {
  const t = ` ${normal(texte).replace(/[^a-z0-9€%,.\s-]+/g, " ")} `;
  const problemes = [];
  for (const mot of interdits.mots) {
    const re = new RegExp(`(^|[^a-z0-9])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]+")}([^a-z0-9]|$)`);
    if (re.test(t)) problemes.push({ type: "nom", terme: mot });
  }
  const chiffres = String(texte).replace(/[\s\u00a0\u202f]/g, "");
  for (const num of interdits.numeros) if (chiffres.includes(num)) problemes.push({ type: "identifiant", terme: num });
  for (const n of nombresDuTexte(texte)) {
    if (n.significatifs < 2 || n.valeur < 1000) continue; // round range bounds (1, 2, 5, 10… M€) allowed
    for (const v of interdits.montants) if (Math.abs(n.valeur - Math.abs(v)) <= Math.abs(v) * 0.01) { problemes.push({ type: "montant", terme: n.texte }); break; }
  }
  return problemes;
}
