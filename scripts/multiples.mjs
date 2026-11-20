// Calculates src/data/multiples.json by cross-checking three sources (npm run multiples).
// Method (also documented in the output file):
//   r_s  = Damodaran industry / Damodaran market         (relative level of the industry, listed companies)
//   E1   = midpoint of the SME scale's range (Captain)
//   E2   = Dealsuite industry average if published, otherwise Dealsuite all-industry average × r_s
//   E3   = Argos mid-market × r_s × (3.9 / 6.9)          (brought down to SME size by the Dealsuite gap)
//   central = average of the available estimates; low / high = range of the SME scale, widened to the central value.
//   Without a scale line: range = central × average relative gaps of the scale (derived range).
import { readFileSync, writeFileSync } from "node:fs";

const S = JSON.parse(readFileSync(new URL("../src/data/multiples-sources.json", import.meta.url)));
const ancien = JSON.parse(readFileSync(new URL("../src/data/multiples.json", import.meta.url)));
const moy = (t) => t.reduce((a, b) => a + b, 0) / t.length;
const arr = (x) => Math.round(x * 10) / 10;
const tailleFacteur = S.taille_dealsuite.multiple_ebitda_200k / S.taille_dealsuite.multiple_ebitda_10m;

// Average relative gaps of the scale (low/mid and high/mid), for industries without a scale line
const lignes = Object.values(S.bareme_pme.lignes);
const ecartBas = moy(lignes.map(([b, h]) => b / ((b + h) / 2)));
const ecartHaut = moy(lignes.map(([b, h]) => h / ((b + h) / 2)));

export function calculer() {
  return ancien.secteurs.map((sect) => {
    const c = S.correspondances[sect.cle];
    const rS = moy(c.damodaran.map((i) => S.damodaran.industries[i])) / S.damodaran.marche_hors_financieres;
    const bareme = c.bareme.map((l) => S.bareme_pme.lignes[l]);
    const estimations = {};
    if (bareme.length) estimations.E1_bareme_pme = moy(bareme.map(([b, h]) => (b + h) / 2));
    estimations.E2_dealsuite = c.dealsuite.length
      ? moy(c.dealsuite.map((l) => S.dealsuite_secteurs.secteurs[l]))
      : S.dealsuite_secteurs.moyenne_tous_secteurs * rS;
    estimations.E3_argos_ajuste = S.argos.mediane_ve_ebitda * rS * tailleFacteur;
    const central = moy(Object.values(estimations));
    let bas, haut, derivee = false;
    if (bareme.length) {
      bas = Math.min(moy(bareme.map((x) => x[0])), central);
      haut = Math.max(moy(bareme.map((x) => x[1])), central);
    } else {
      bas = central * ecartBas; haut = central * ecartHaut; derivee = true;
    }
    return {
      cle: sect.cle, sections: sect.sections,
      ebe: { bas: arr(bas), central: arr(central), haut: arr(haut) },
      ca: { bas: null, central: null, haut: null },
      source: "croisement-2026-11",
      detail: { niveau_relatif_damodaran: Math.round(rS * 1000) / 1000, ...Object.fromEntries(Object.entries(estimations).map(([k, v]) => [k, arr(v)])), fourchette_derivee: derivee },
    };
  });
}

const secteurs = calculer();
const sortie = {
  version: S.consulte_le,
  regle: "Multiples VE / EBE obtenus par croisement de trois sources citées (src/data/multiples-sources.json, scripts/multiples.mjs). Aucun chiffre saisi à la main. Ordres de grandeur pour une estimation indicative, non contractuelle.",
  methode: "central = moyenne de E1 (milieu du barème PME Captain), E2 (moyenne Dealsuite du secteur, ou moyenne tous secteurs × niveau relatif Damodaran) et E3 (Argos mid-market × niveau relatif Damodaran × 3,9/6,9) ; bas/haut = barème PME, élargi au central ; sans barème, fourchette dérivée des écarts moyens du barème. Pas de multiple de CA : EBE négatif ou absent → estimation express non calculable.",
  sources: {
    "croisement-2026-11": [S.argos, S.taille_dealsuite, S.dealsuite_secteurs, S.bareme_pme, S.damodaran].map(({ titre, url }) => ({ titre, url, consulte_le: S.consulte_le })),
  },
  secteurs,
};
writeFileSync(new URL("../src/data/multiples.json", import.meta.url), JSON.stringify(sortie, null, 2) + "\n");
console.table(secteurs.map((s) => ({ secteur: s.cle, bas: s.ebe.bas, central: s.ebe.central, haut: s.ebe.haut, ...s.detail })));
