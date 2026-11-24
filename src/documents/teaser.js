// Teaser: anonymous facts given to Claude (calculated by the code, never the exact figures) and list of amounts
// never to publish. The draft is checked by anonymat.js before anything is saved.
import { secteurDe, regionDe, fourchetteCA, fourchetteMarge, anciennete } from "./anonymat.js";
import { libelleEffectif, dernier } from "../../public/js/regles.js";
import { t as tr } from "../../public/js/i18n.js";

export const SECTIONS_TEASER = [["accroche"], ["activite"], ["chiffres"], ["atouts"], ["operation"]];
// Titles: src/contenu/<language>/serveur.json (element 1 of each pair), read in the request's language.
for (const s of SECTIONS_TEASER) Object.defineProperty(s, 1, { get: () => tr(`serveur.teaser.sections.${s[0]}`), enumerable: true, configurable: true });
const aCompleter = () => tr("teaser.js.a_completer");
const texte = (v) => (typeof v === "string" && v.trim() ? v.trim() : aCompleter());

export function faitsTeaser({ entreprise, resultat, entree, reponses = {} }) {
  const exs = entree?.exercices || [];
  const exD = exs.at(-1);
  const ca = exD?.chiffre_affaires ?? dernier(entreprise.ca)?.valeur ?? null;
  const ebe = resultat?.ebe_normatif?.valeur ?? dernier(entreprise.ebe)?.valeur ?? null;
  let tendance = aCompleter();
  if (exs.length >= 2 && exs[0].chiffre_affaires > 0) {
    const t = Math.pow(exD.chiffre_affaires / exs[0].chiffre_affaires, 1 / (exD.annee - exs[0].annee)) - 1;
    tendance = tr(t > 0.03 ? "serveur.teaser.tendance.hausse" : t < -0.03 ? "serveur.teaser.tendance.baisse" : "serveur.teaser.tendance.stable");
  }
  const a = reponses.activite || {}, f = reponses.atouts || {}, o = reponses.operation || {}, c = reponses.clients || {};
  const recurrent = Number.isFinite(c.part_recurrente) ? tr("serveur.teaser.recurrent", { n: Math.round(c.part_recurrente * 10) * 10 }) : aCompleter();
  return {
    secteur: secteurDe(entreprise.naf) ?? aCompleter(),
    region: regionDe(entreprise.code_postal) ?? tr("serveur.teaser.france"),
    anciennete: anciennete(entreprise.date_creation) ?? aCompleter(),
    effectif: libelleEffectif(entreprise.tranche_effectif?.code) ?? aCompleter(),
    chiffre_affaires: fourchetteCA(ca) ?? aCompleter(),
    marge_ebe: ca > 0 && Number.isFinite(ebe) ? fourchetteMarge(ebe / ca) : aCompleter(),
    tendance, recurrence: recurrent,
    activite: texte(a.description), produits_services: texte(a.produits_services), clientele: texte(a.clientele),
    zone_commerciale: texte(a.zone), equipe: texte(a.equipe),
    forces: texte(f.forces), developpement: texte(f.developpement),
    operation: { part_cedee: texte(o.part_cedee), motif: texte(o.motif), accompagnement: texte(o.accompagnement), calendrier: texte(o.calendrier) },
  };
}

/** Exact amounts of the file: never in the teaser. */
export function montantsSensibles({ entreprise, resultat, entree }) {
  const exD = entree?.exercices?.at(-1) || {};
  const s = resultat?.synthese || {}, e = entreprise.estimation || {};
  return [
    exD.chiffre_affaires, exD.ebe, exD.resultat_net, exD.resultat_exploitation, exD.capitaux_propres,
    dernier(entreprise.ca)?.valeur, dernier(entreprise.ebe)?.valeur, resultat?.ebe_normatif?.valeur,
    s.bas, s.central, s.haut, e.bas, e.central, e.haut,
  ].filter(Number.isFinite);
}

/** Sections → full text (for the check); strengths as a list. */
export const enSections = (r) => SECTIONS_TEASER.map(([cle]) => [cle, cle === "atouts" ? (r.atouts || []).map((x) => `- ${x}`).join("\n") : String(r[cle] ?? "")]);

// ---------------------------------------------------------------- Teaser visuals
// Chart data, calculated by the code and anonymous: bands (no amount), revenue trend as an index
// base 100 rounded to 5 points, relative years (N-2, N-1, N), recurring share rounded to 10%.
export const PALIERS_CA = ["< 1 M€", "1-2 M€", "2-5 M€", "5-10 M€", "10-20 M€", "20-50 M€", "> 50 M€"];
export const PALIERS_MARGE = ["négative", "< 5 %", "5-10 %", "10-15 %", "15-20 %", "> 20 %"];
const BORNES_CA = [1e6, 2e6, 5e6, 10e6, 20e6, 50e6];
const BORNES_MARGE = [0, 0.05, 0.1, 0.15, 0.2];
const palier = (v, bornes) => bornes.filter((b) => v >= b).length;

export function visuelsTeaser({ entreprise, resultat, entree, reponses = {} }) {
  const exs = (entree?.exercices || []).filter((e) => Number.isFinite(e.annee) && e.chiffre_affaires > 0);
  const exD = exs.at(-1);
  const ca = exD?.chiffre_affaires ?? dernier(entreprise.ca)?.valeur ?? null;
  const ebe = resultat?.ebe_normatif?.valeur ?? dernier(entreprise.ebe)?.valeur ?? null;
  const serie = exs.slice(-5);
  const evolution = serie.length >= 2
    ? serie.map((e) => ({ annee: e.annee === exD.annee ? "N" : `N-${exD.annee - e.annee}`, indice: Math.round((e.chiffre_affaires / serie[0].chiffre_affaires) * 20) * 5 }))
    : null;
  const r = reponses.clients?.part_recurrente;
  return {
    tuiles: {
      secteur: secteurDe(entreprise.naf),
      region: regionDe(entreprise.code_postal) ?? tr("serveur.teaser.france"),
      anciennete: anciennete(entreprise.date_creation),
      effectif: libelleEffectif(entreprise.tranche_effectif?.code),
    },
    ca: ca > 0 ? { palier: palier(ca, BORNES_CA), libelle: fourchetteCA(ca) } : null,
    marge: ca > 0 && Number.isFinite(ebe) ? { palier: palier(ebe / ca, BORNES_MARGE), libelle: fourchetteMarge(ebe / ca) } : null,
    evolution,
    recurrence: Number.isFinite(r) && r >= 0 && r <= 1 ? Math.round(r * 10) * 10 : null,
  };
}
