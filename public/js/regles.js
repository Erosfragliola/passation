// Règles de traduction des données d'une entreprise en maquette et en frise.
// Module pur (aucun accès réseau ni DOM) : utilisé par le Worker, le navigateur et les tests.
import { t as tr, nombre } from "./i18n.js";

/**
 * Tranches d'effectif salarié de la nomenclature INSEE (variable « tranche d'effectif salarié » du
 * répertoire Sirene, reprise par recherche-entreprises.api.gouv.fr). NN = unité non employeuse.
 */
export const TRANCHES = {
  NN: { min: 0, max: 0 },
  "00": { min: 0, max: 0 },
  "01": { min: 1, max: 2 },
  "02": { min: 3, max: 5 },
  "03": { min: 6, max: 9 },
  "11": { min: 10, max: 19 },
  "12": { min: 20, max: 49 },
  "21": { min: 50, max: 99 },
  "22": { min: 100, max: 199 },
  "31": { min: 200, max: 249 },
  "32": { min: 250, max: 499 },
  "41": { min: 500, max: 999 },
  "42": { min: 1000, max: 1999 },
  "51": { min: 2000, max: 4999 },
  "52": { min: 5000, max: 9999 },
  "53": { min: 10000, max: null },
};

/** Libellé INSEE de la tranche d'effectif salarié : « 20 à 49 salariés », « non employeuse », « 0 salarié ». */
export function libelleSalaries(code) {
  if (code === "NN") return tr("regles.salaries.non_employeuse");
  const t = TRANCHES[code];
  if (!t) return null;
  const n = (v) => nombre(v);
  if (t.max === 0) return tr("regles.salaries.zero");
  if (t.max == null) return tr("regles.salaries.et_plus", { n: n(t.min) });
  if (code === "01") return tr("regles.salaries.un_deux");
  return tr("regles.salaries.tranche", { min: n(t.min), max: n(t.max) });
}

const ETAGES_MAX = 8;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Dernier exercice dont la valeur est connue ({annee, valeur} ou null). */
export function dernier(serie) {
  const connus = (serie || []).filter((p) => Number.isFinite(p.valeur)).sort((a, b) => a.annee - b.annee);
  return connus.at(-1) ?? null;
}

/**
 * Nombre d'étages selon le chiffre d'affaires : 1 + round(2 × log10(CA / 100 000)), borné à [1, 8].
 * < 100 k€ → 1 ; 10 M€ → 5 ; 8 étages à partir d'environ 178 M€. CA inconnu → null (étages en pointillés).
 */
export function etages(ca) {
  if (!Number.isFinite(ca)) return null;
  if (ca <= 100_000) return 1;
  return clamp(1 + Math.round(2 * Math.log10(ca / 100_000)), 1, ETAGES_MAX);
}

/**
 * Fenêtres allumées : milieu de la tranche, 1 fenêtre par tranche de 5 salariés (arrondi supérieur),
 * au moins 1 (le bureau du dirigeant), plafonné au nombre de fenêtres du bâtiment.
 */
export function fenetresAllumees(codeTranche, totalFenetres) {
  const t = TRANCHES[codeTranche];
  if (!t) return Math.min(1, totalFenetres);
  const milieu = t.max == null ? t.min : (t.min + t.max) / 2;
  return clamp(Math.ceil(milieu / 5), 1, totalFenetres);
}

/** Arbres selon la marge d'EBE (EBE / CA). Marge négative ou inconnue : aucun arbre, sans autre signal. */
export function arbres(ca, ebe) {
  if (!Number.isFinite(ca) || !Number.isFinite(ebe) || ca <= 0) return { nombre: 0, haie: false, marge: null };
  const marge = ebe / ca;
  if (marge < 0) return { nombre: 0, haie: false, marge };
  if (marge < 0.05) return { nombre: 1, haie: false, marge };
  if (marge < 0.10) return { nombre: 2, haie: false, marge };
  if (marge <= 0.15) return { nombre: 3, haie: false, marge };
  return { nombre: 4, haie: true, marge };
}

/** Archétype du bâtiment selon la section NAF. */
export function archetype(section) {
  const s = String(section || "").toUpperCase();
  if (s === "C") return "industrie";
  if (s === "F") return "construction";
  if (s === "G") return "commerce";
  if (s === "I") return "restauration";
  if (s === "H") return "logistique";
  if (s === "A") return "ferme";
  if (["J", "K", "M", "N"].includes(s)) return "bureaux";
  if (s === "Q") return "sante";
  return "generique";
}

/**
 * Croissance du CA ramenée à 3 ans : entre le dernier exercice et l'exercice connu le plus proche de 3 ans
 * plus tôt (écart de 2 à 4 ans). Null si impossible.
 */
export function croissance3ans(serie) {
  const connus = (serie || []).filter((p) => Number.isFinite(p.valeur) && p.valeur > 0);
  const fin = dernier(connus);
  if (!fin) return null;
  const candidats = connus
    .filter((p) => fin.annee - p.annee >= 2 && fin.annee - p.annee <= 4)
    .sort((a, b) => Math.abs(fin.annee - a.annee - 3) - Math.abs(fin.annee - b.annee - 3) || b.annee - a.annee);
  const debut = candidats[0];
  if (!debut) return null;
  const ecart = fin.annee - debut.annee;
  return Math.pow(fin.valeur / debut.valeur, 3 / ecart) - 1;
}

export const echafaudage = (serieCA) => (croissance3ans(serieCA) ?? 0) > 0.2;

/** Paramètres complets de la maquette, calculés à partir des données normalisées. */
export function parametresMaquette(d, totalFenetres = 24) {
  const ca = dernier(d.ca)?.valeur ?? null;
  const ebeDernier = dernier(d.ebe);
  const ebe = ebeDernier && dernier(d.ca)?.annee === ebeDernier.annee ? ebeDernier.valeur : null;
  return {
    archetype: archetype(d.section_naf),
    etages: etages(ca),
    fenetresAllumees: fenetresAllumees(d.tranche_effectif?.code, totalFenetres),
    arbres: arbres(ca, ebe),
    echafaudage: echafaudage(d.ca),
    depuis: d.date_creation ? Number(d.date_creation.slice(0, 4)) : null,
    comptesManquants: ca == null,
    personnages: personnages(d.tranche_effectif?.code),
    effectif: libelleEffectif(d.tranche_effectif?.code),
  };
}

// ---------------------------------------------------------------------------------------------
// Frise « Vous avez bâti »
// ---------------------------------------------------------------------------------------------

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const memeVille = (a, b) => sansAccents(a) === sansAccents(b);

// i18n:ignorer-debut : mots de liaison des noms de villes (casseVille), jamais affichés tels quels.
const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "en", "sur", "sous", "et", "lès", "lez", "aux", "au"]);
/** « SAINT-LEONARD » → « Saint-Leonard », « ERDRE-EN-ANJOU » → « Erdre-en-Anjou ». */
export function casseVille(v) {
  if (!v) return v;
  if (v !== v.toUpperCase()) return v.charAt(0).toUpperCase() + v.slice(1);
  return v.toLowerCase()
    .replace(/[^\s\-']+/g, (mot, i) => (i > 0 && PETITS_MOTS.has(mot) ? mot : mot.charAt(0).toUpperCase() + mot.slice(1)))
    // L'INSEE écrit « VILLENEUVE D ASCQ » : on rétablit l'élision devant une voyelle.
    .replace(/(^|[\s-])([DdLl])[\s-]+(?=[AEIOUYÉÈÂÎÔaeiouyéèâîô])/g, (_, avant, lettre) => `${avant}${avant ? lettre.toLowerCase() : lettre.toUpperCase()}'`);
}

/** Personnages de maquette : 1 par tranche entamée de 10 salariés (borne basse INSEE), entre 1 et max. */
export function personnages(code, max = 8) {
  const t = TRANCHES[code];
  return clamp(Math.ceil((t?.min ?? 0) / 10), 1, max);
}

export function libelleEffectif(code) {
  const t = TRANCHES[code];
  if (!t || t.max === 0) return null;
  if (t.max == null) return tr("regles.effectif.plus_de", { n: nombre(t.min) });
  if (code === "01") return tr("regles.effectif.un_deux");
  return tr("regles.effectif.tranche", { min: nombre(t.min), max: nombre(t.max) });
}

// i18n:ignorer-fin
