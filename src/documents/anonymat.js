// Anonymisation du teaser : faits généraux calculés par le code (secteur, région, fourchettes) et contrôle
// automatique de tout texte publié. Interdits : nom (et ses mots distinctifs), ville, code postal, SIREN, montants
// exacts (CA, EBE, résultat, valeur), termes issus du site de l'entreprise. Module pur, testé.

/** Régions administratives depuis 2016 (INSEE, code officiel géographique) : département → région. */
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

/** Sections de la nomenclature NAF rév. 2 (INSEE). */
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
  const m = (v) => `${v / 1e6} M€`;
  if (ca < BORNES_CA[0]) return "moins de 1 M€";
  for (let i = 1; i < BORNES_CA.length; i++) if (ca < BORNES_CA[i]) return `entre ${m(BORNES_CA[i - 1])} et ${m(BORNES_CA[i])}`;
  return "plus de 50 M€";
}
export function fourchetteMarge(marge) {
  if (!Number.isFinite(marge)) return null;
  if (marge < 0) return "négative";
  if (marge < 0.05) return "inférieure à 5 %";
  if (marge < 0.1) return "entre 5 et 10 %";
  if (marge < 0.15) return "entre 10 et 15 %";
  if (marge < 0.2) return "entre 15 et 20 %";
  return "supérieure à 20 %";
}
export function anciennete(dateCreation, annee = new Date().getFullYear()) {
  const a = Number(String(dateCreation || "").slice(0, 4));
  if (!a) return null;
  const n = annee - a;
  if (n < 5) return "moins de 5 ans";
  const palier = n >= 20 ? Math.floor(n / 10) * 10 : Math.floor(n / 5) * 5;
  return `plus de ${palier} ans`;
}

// ---------------------------------------------------------------- Contrôle
const normal = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const FORMES = new Set(["sas", "sasu", "sarl", "eurl", "sa", "sci", "snc", "selarl", "scop", "et", "fils", "freres", "groupe", "societe", "france", "les", "des", "de", "la", "le", "du", "and", "co", "cie", "holding", "entreprise", "ets", "etablissements"]);

/** Termes à ne jamais publier dans le teaser. */
export function termesInterdits({ nom, ville, code_postal, siren }, montants = [], termesSite = []) {
  const mots = [];
  const n = normal(nom).replace(/[^a-z0-9]+/g, " ").trim();
  if (n) mots.push(n);
  for (const m of n.split(" ")) if (m.length >= 4 && !FORMES.has(m)) mots.push(m);
  if (ville) mots.push(normal(ville));
  for (const t of termesSite) if (normal(t).trim().length >= 3) mots.push(normal(t).trim());
  return {
    mots: [...new Set(mots)],
    numeros: [siren, code_postal].filter(Boolean).map((x) => String(x).replace(/\s/g, "")),
    montants: montants.filter((v) => Number.isFinite(v) && Math.abs(v) >= 1000),
  };
}

/** Nombres écrits dans un texte (« 2,4 M€ », « 2 400 000 € », « 380 k€ »), en euros. */
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
    const chiffres = brut.replace(/^0+|[^0-9]/g, "").replace(/0+$/, "").length; // chiffres significatifs
    res.push({ texte: m[0].trim(), valeur: v, significatifs: chiffres, unite: Boolean(u) });
  }
  return res;
}

/** @returns liste des problèmes trouvés (vide = texte publiable). */
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
    if (n.significatifs < 2 || n.valeur < 1000) continue; // bornes rondes de fourchettes (1, 2, 5, 10… M€) autorisées
    for (const v of interdits.montants) if (Math.abs(n.valeur - Math.abs(v)) <= Math.abs(v) * 0.01) { problemes.push({ type: "montant", terme: n.texte }); break; }
  }
  return problemes;
}
