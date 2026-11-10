// Enregistre des réponses réelles des trois sources pour les tests (npm run fixtures).
// Les données personnelles (dirigeants, administration, adresses, prix) sont retirées avant écriture.
import { writeFileSync } from "node:fs";
import { rechercherBrut } from "../src/sources/entreprise.js";
import { exercicesBruts } from "../src/sources/inpi.js";
import { annoncesBrutes } from "../src/sources/bodacc.js";

const SIRENS = ["434436622", "319252813", "794576231", "323234153", "512803552", "631880408", "814672010"];

const nettoyerEntreprise = (b) => ({
  results: b.results.map((r) => ({
    siren: r.siren, nom_complet: r.nom_complet, nom_raison_sociale: r.nom_raison_sociale,
    siege: { libelle_commune: r.siege?.libelle_commune, code_postal: r.siege?.code_postal },
    activite_principale: r.activite_principale, section_activite_principale: r.section_activite_principale,
    date_creation: r.date_creation, tranche_effectif_salarie: r.tranche_effectif_salarie,
    annee_tranche_effectif_salarie: r.annee_tranche_effectif_salarie, etat_administratif: r.etat_administratif,
    categorie_entreprise: r.categorie_entreprise,
  })),
});
const garder = (o, cles) => Object.fromEntries(cles.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const nettoyerAnnonce = (a) => {
  const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const lp = j(a.listepersonnes); const le = j(a.listeetablissements); const acte = j(a.acte); const mg = j(a.modificationsgenerales);
  const pers = (p) => p && { typePersonne: p.typePersonne, denomination: p.denomination, numeroImmatriculation: p.numeroImmatriculation };
  const etab = (e) => e && { adresse: { ville: e.adresse?.ville } };
  return {
    dateparution: a.dateparution, familleavis_lib: a.familleavis_lib, commercant: a.commercant, ville: a.ville,
    modificationsgenerales: mg ? JSON.stringify(garder(mg, ["descriptif"])) : null,
    acte: acte ? JSON.stringify({ creation: acte.creation && garder(acte.creation, ["categorieCreation"]), immatriculation: acte.immatriculation, vente: acte.vente && garder(acte.vente, ["categorieVente"]), descriptif: acte.descriptif && /transfert.{0,20}si[èe]ge/i.test(acte.descriptif) && !/prix|euros|€/i.test(acte.descriptif) ? acte.descriptif : undefined }) : null,
    listepersonnes: lp ? JSON.stringify({ personne: Array.isArray(lp.personne) ? lp.personne.map(pers) : pers(lp.personne) }) : null,
    listeetablissements: le ? JSON.stringify({ etablissement: Array.isArray(le.etablissement) ? le.etablissement.map(etab) : etab(le.etablissement) }) : null,
  };
};

for (const siren of SIRENS) {
  const [e, i, b] = await Promise.all([rechercherBrut(siren), exercicesBruts(siren), annoncesBrutes(siren)]);
  const fixture = { enregistre_le: new Date().toISOString().slice(0, 10), entreprise: nettoyerEntreprise(e), inpi: i, bodacc: { results: b.results.map(nettoyerAnnonce) } };
  writeFileSync(`test/fixtures/${siren}.json`, JSON.stringify(fixture, null, 1));
  console.log(siren, e.results[0]?.nom_complet, "| exercices", i.results.length, "| annonces", b.results.length);
}
