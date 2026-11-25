// Sample file of the demonstration (docs/DEMO.md): « Menuiserie Exemple », SIREN 000000018, entirely fictitious.
// One definition, used by the demonstration video (scripts/video-demo.mjs) and checked by test/dossier-exemple.test.js:
// the file is complete, its first stage validated (adjustments, net debt and scope, value) in its own data.
// The adjustments are neutral on purpose (actual pay = normalized pay, walls rented from an outside owner, no exceptional
// item, no other debt): the expected results of docs/DEMO.md stay those of the tax return alone.

export const SIREN_EXEMPLE = "000000018";

/** Public data placed in the local cache (no call to the public APIs for this company). */
export const ENTREPRISE_EXEMPLE = { siren: SIREN_EXEMPLE, nom: "MENUISERIE EXEMPLE", ville: "Exempleville", code_postal: "44000", ville_creation: "Exempleville", naf: "16.23Z", section_naf: "C", date_creation: "1998-03-01", tranche_effectif: { code: "12", annee: 2024 }, actif: true, ca: [{ annee: 2024, valeur: 2200000 }, { annee: 2025, valeur: 2400000 }], ebe: [{ annee: 2024, valeur: 320000 }, { annee: 2025, valeur: 380000 }], evenements: [], comptes_confidentiels: false, exercices_non_publies: [] };

/** Fictitious tax return of docs/DEMO.md (euros). */
export const EXERCICES_EXEMPLE = {
  2024: { chiffre_affaires: 2200000, autres_produits: 0, achats_consommes: 880000, charges_externes: 320000, impots_taxes: 40000, charges_personnel: 640000, dotations_amortissements: 66000, stocks: 180000, creances_clients: 370000, placements: 50000, tresorerie: 210000, capitaux_propres: 590000, provisions_risques: 20000, emprunts: 340000, dettes_fournisseurs: 230000, dettes_fiscales_sociales: 140000 },
  2025: { chiffre_affaires: 2400000, autres_produits: 0, achats_consommes: 960000, charges_externes: 340000, impots_taxes: 40000, charges_personnel: 680000, dotations_amortissements: 72000, stocks: 200000, creances_clients: 400000, placements: 50000, tresorerie: 250000, capitaux_propres: 700000, provisions_risques: 20000, emprunts: 300000, dettes_fournisseurs: 250000, dettes_fiscales_sociales: 150000 },
};

/** Answers of the two stages (same keys as the guided steps). Screens validated by the owner: "vues". */
export const REPONSES_EXEMPLE = {
  dirigeant: { remuneration_dirigeant_reelle: 85000, remuneration_normative: 85000, encadrement: "Oui, un ou plusieurs responsables", role_dirigeant: ["Commercial", "Gestion"] },
  retraitements: { murs: "À un propriétaire extérieur", exceptionnel_signale: "Non", exceptionnels: [] },
  bilan: {},
  operation: { detention: "En direct, à titre personnel", part_cedee: "100 %", calendrier: "6 à 12 mois", motif: "Départ à la retraite", accompagnement: "6 mois", repreneur: ["Entreprise du secteur"] },
  activite: { description: "Menuiserie fictive de démonstration : escaliers et agencements sur mesure.", metiers: ["Escaliers sur mesure", "Agencement"], zone: "Régionale", dates_cles: [{ date: "1998", type: "creation", precision: "Création (fictive)", source: null }], distinctions: ["Sur mesure"], certifications: [] },
  clients: { type_clientele: ["Particuliers", "Entreprises"], part_premier_client: 0.12 },
  perspectives: { croissance: 0.05, axes: ["Nouveaux clients"] },
  site: { aucun: true },
  // 2023 is not in the fictitious tax return: the owner skipped it knowingly (« exercices_passes »)
  parcours: { vues: ["accueil", "exercices_passes", "retraitements", "dette", "histoire", "equipe", "activite", "distinctions", "clients", "operation", "perspectives", "photos", "equipe_dirigeante"] },
};

/**
 * Fills the sample file through the API, then approves its figures (« Je valide ces chiffres », recorded by the server).
 * @param appel(chemin, { methode, corps }) → Response (session already open)
 */
export async function remplirDossierExemple(appel, id) {
  for (const [annee, valeurs] of Object.entries(EXERCICES_EXEMPLE)) {
    const r = await appel(`/api/dossiers/${id}/financials`, { methode: "PUT", corps: { annee: Number(annee), valeurs, valider: true } });
    if (!r.ok) throw new Error(`exercice ${annee} : ${r.status}`);
  }
  for (const [etape, data] of Object.entries(REPONSES_EXEMPLE)) {
    const r = await appel(`/api/dossiers/${id}/answers/${etape}`, { methode: "PUT", corps: { data } });
    if (!r.ok) throw new Error(`réponses ${etape} : ${r.status}`);
  }
  const v = await appel(`/api/dossiers/${id}/valuation/validation`, { methode: "POST" });
  if (!v.ok) throw new Error(`validation : ${v.status}`);
  return v.json();
}
