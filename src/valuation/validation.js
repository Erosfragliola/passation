// Validation des hypothèses et réglages saisis par le dirigeant (FIN-04, audit du 18/11/2026). Module pur, testé.
// Une valeur hors bornes est refusée avec un message : elle n'est jamais ramenée silencieusement dans les bornes.
// Bornes : src/data/hypotheses.json (bornes_saisie, decotes_primes.facteurs).

const absent = (x) => x === null || x === undefined || x === "";
const pct = (x) => `${Math.round(x * 1000) / 10} %`;
const fmt = (x) => `${Math.round(x).toLocaleString("fr-FR")} €`;

/**
 * @param etape  étape du questionnaire ou « reglages »
 * @param data   réponses de l'étape
 * @param H      hypothèses (hypotheses.json)
 * @returns [{ champ, message }] (vide si tout est valide)
 */
export function erreursEtape(etape, data, H) {
  const erreurs = [];
  if (!data || typeof data !== "object") return erreurs;
  const B = H.bornes_saisie;
  const nombre = (champ, v, libelle) => {
    const x = Number(v);
    if (typeof v === "boolean" || !Number.isFinite(x)) { erreurs.push({ champ, message: `${libelle} : « ${String(v).slice(0, 30)} » n'est pas un nombre.` }); return null; }
    return x;
  };

  for (const [chemin, [min, max]] of Object.entries(B.pourcentages)) {
    const [e, cle] = chemin.split(".");
    if (e !== etape || absent(data[cle])) continue;
    const x = nombre(chemin, data[cle], cle);
    if (x !== null && (x < min || x > max)) erreurs.push({ champ: chemin, message: `${cle} : ${pct(x)} est hors des bornes admises (${pct(min)} à ${pct(max)}). Les pourcentages s'expriment en fraction (5 % = 0,05).` });
  }
  for (const chemin of [...B.montants_positifs, ...B.montants]) {
    const [e, cle] = chemin.split(".");
    if (e !== etape || absent(data[cle])) continue;
    const x = nombre(chemin, data[cle], cle);
    if (x !== null && B.montants_positifs.includes(chemin) && x < 0) erreurs.push({ champ: chemin, message: `${cle} : un montant négatif (${fmt(x)}) n'est pas admis.` });
  }

  if (etape === "retraitements" && !absent(data.exceptionnels)) {
    if (!Array.isArray(data.exceptionnels)) erreurs.push({ champ: "retraitements.exceptionnels", message: "Les éléments exceptionnels doivent être une liste." });
    else data.exceptionnels.forEach((x, i) => { if (!absent(x?.montant)) nombre(`retraitements.exceptionnels.${i}`, x.montant, `Élément exceptionnel n° ${i + 1}`); });
  }

  if (etape === "reglages" && !absent(data.decotes)) {
    if (!Array.isArray(data.decotes)) erreurs.push({ champ: "reglages.decotes", message: "Les décotes doivent être une liste." });
    else {
      const facteurs = Object.fromEntries(H.decotes_primes.facteurs.map((f) => [f.cle, f]));
      for (const d of data.decotes) {
        const f = facteurs[d?.cle];
        if (!f) { erreurs.push({ champ: "reglages.decotes", message: `Décote inconnue : « ${String(d?.cle).slice(0, 40)} ».` }); continue; }
        if (absent(d.pct)) continue;
        const x = nombre(`reglages.decotes.${f.cle}`, d.pct, f.libelle);
        if (x !== null && (x < f.min || x > f.max)) erreurs.push({ champ: `reglages.decotes.${f.cle}`, message: `${f.libelle} : ${pct(x)} est hors des bornes admises (${pct(f.min)} à ${pct(f.max)}).` });
      }
    }
  }
  return erreurs;
}

/** Toutes les erreurs des réponses enregistrées qui alimentent le calcul. */
export function erreursReponses(reponses, H) {
  return ["reglages", "dirigeant", "retraitements", "perspectives", "bilan"].flatMap((e) => erreursEtape(e, reponses?.[e], H));
}
