// Mémorandum « banque d'affaires » : chiffres calculés par le code. Valeurs attendues calculées à la main.
import { describe, it, expect } from "vitest";
import { PARTIES_MEMO, compteResultat, tableauEbeRetraite, tableauEndettement, clientsPrincipaux, perimetre, sourcesChiffres, indicateurs, tcam, titreValide, SECTIONS_MEMO, profilMemo } from "../src/documents/memo.js";
import { pontEbe, ebeNormatif, detteNette } from "../src/valuation/approfondie.js";
import { kEuros, montant, pourcent, ratioTableau, multiple } from "../public/js/memo-format.js";
import { DETENTION, MURS, MURS_CESSION, QUESTIONS, champsVisibles } from "../public/js/parcours.js";

const espaces = (s) => String(s).replace(/[  ]/g, " ");

// Trois exercices détaillés. EBE = CA − achats − charges externes − impôts − personnel :
// 2022 : 1 000 000 − 400 000 − 150 000 − 20 000 − 300 000 = 130 000
// 2023 : 1 100 000 − 440 000 − 160 000 − 22 000 − 320 000 = 158 000
// 2024 : 1 210 000 − 480 000 − 170 000 − 24 000 − 350 000 = 186 000
const exercices = [
  { annee: 2022, chiffre_affaires: 1_000_000, achats_consommes: 400_000, charges_externes: 150_000, impots_taxes: 20_000, charges_personnel: 300_000, dotations_amortissements: 30_000, resultat_exploitation: 100_000, resultat_net: 70_000 },
  { annee: 2023, chiffre_affaires: 1_100_000, achats_consommes: 440_000, charges_externes: 160_000, impots_taxes: 22_000, charges_personnel: 320_000, dotations_amortissements: 32_000, resultat_exploitation: 126_000, resultat_net: 90_000 },
  { annee: 2024, chiffre_affaires: 1_210_000, achats_consommes: 480_000, charges_externes: 170_000, impots_taxes: 24_000, charges_personnel: 350_000, dotations_amortissements: 34_000, resultat_exploitation: 152_000, resultat_net: 110_000, emprunts: 300_000, tresorerie: 120_000 },
];
// Retraitements : dirigeant 90 000 − 70 000 = +20 000 chaque année ; litige 2023 +15 000.
// EBE retraité : 2022 150 000 ; 2023 158 000 + 20 000 + 15 000 = 193 000 ; 2024 206 000.
const pont = pontEbe(exercices, { remuneration_dirigeant_reelle: 90_000, remuneration_normative: 70_000, exceptionnels: [{ annee: 2023, libelle: "Litige prud'homal", montant: 15_000 }] });
const resultat = {
  pont_ebe: pont,
  ebe_normatif: ebeNormatif(pont, "moyenne"),            // (150 000 + 193 000 + 206 000) / 3 = 183 000
  dette_nette: detteNette(exercices[2]),                  // 300 000 − 120 000 = 180 000
  bfr: { normatif: { par_exercice: [{ annee: 2024, bfr: 100_000, jours: 30.17 }] } },
};
const entree = { exercices };

describe("mise en forme des chiffres", () => {
  it("tableaux en k€, négatifs entre parenthèses, n.d. si absent", () => {
    expect(espaces(kEuros(12_825_400))).toBe("12 825");
    expect(espaces(kEuros(-1_294_000))).toBe("(1 294)");
    expect(kEuros(null)).toBe("n.d.");
    expect(kEuros(200)).toBe("–");
  });
  it("montants et pourcentages dans le texte", () => {
    expect(espaces(montant(1_234_567))).toBe("1,2 M€");
    expect(espaces(montant(890_400))).toBe("890 k€");
    expect(espaces(montant(-45_000))).toBe("−45 k€");
    expect(espaces(pourcent(0.0794))).toBe("7,9 %");
    expect(espaces(pourcent(0.041, { signe: true }))).toBe("+4,1 %");
    expect(espaces(ratioTableau(-0.05))).toBe("(5,0 %)");
    expect(multiple(0.98361)).toBe("1,0x");
  });
});

describe("compte de résultat", () => {
  const cr = compteResultat(entree, resultat);
  const ligne = (cle) => cr.lignes.find((l) => l.cle === cle)?.valeurs;
  it("croissance annuelle et TCAM", () => {
    expect(ligne("croissance")[0]).toBeNull();
    expect(ligne("croissance")[1]).toBeCloseTo(0.10, 6);       // 1,1 / 1,0 − 1
    expect(ligne("croissance")[2]).toBeCloseTo(0.10, 6);       // 1,21 / 1,1 − 1
    expect(cr.tcam.ca).toBeCloseTo(0.10, 6);                   // 1,21^(1/2) − 1
    expect(cr.tcam.ebe).toBeCloseTo(0.1961, 4);                // (186 000 / 130 000)^(1/2) − 1 = 0,19615
    expect(cr.consecutifs).toBe(true);
  });
  it("charges en négatif, marges en % du chiffre d'affaires", () => {
    expect(ligne("ebe")).toEqual([130_000, 158_000, 186_000]);
    expect(ligne("achats_consommes")[2]).toBe(-480_000);
    expect(ligne("marge_brute")[2]).toBe(730_000);             // 1 210 000 − 480 000
    expect(ligne("marge_brute_pct")[2]).toBeCloseTo(0.6033, 4); // 730 / 1 210
    expect(ligne("ebe_pct")[2]).toBeCloseTo(0.1537, 4);        // 186 / 1 210
    expect(ligne("resultat_net_pct")[0]).toBeCloseTo(0.07, 6);
  });
  it("exercices non consécutifs : croissance annualisée ; comptes publics seuls : lignes vides retirées", () => {
    const cr2 = compteResultat({ exercices: [{ annee: 2019, chiffre_affaires: 1_000_000, ebe: 80_000 }, { annee: 2021, chiffre_affaires: 1_210_000, ebe: 90_000 }] }, {});
    expect(cr2.lignes.find((l) => l.cle === "croissance").valeurs[1]).toBeCloseTo(0.10, 6); // (1,21)^(1/2) − 1
    expect(cr2.consecutifs).toBe(false);
    expect(cr2.lignes.map((l) => l.cle)).toEqual(["chiffre_affaires", "croissance", "ebe", "ebe_pct"]);
  });
  it("TCAM impossible avec une valeur négative ou nulle", () => {
    expect(tcam(-10, 20, 2)).toBeNull();
    expect(tcam(10, 20, 0)).toBeNull();
  });
});

describe("EBE retraité et endettement", () => {
  it("une ligne par nature de retraitement, vide les années sans retraitement", () => {
    const t = tableauEbeRetraite(entree, resultat);
    expect(t.ebe_comptable).toEqual([130_000, 158_000, 186_000]);
    expect(t.retraitements.map((r) => r.libelle)).toEqual(["Rémunération du dirigeant ramenée à la normale", "Litige prud'homal"]);
    expect(t.retraitements[0].valeurs).toEqual([20_000, 20_000, 20_000]);
    expect(t.retraitements[1].valeurs).toEqual([null, 15_000, null]);
    expect(t.ebe_retraite).toEqual([150_000, 193_000, 206_000]);
    expect(t.marge_retraitee[2]).toBeCloseTo(0.1702, 4);       // 206 / 1 210
    expect(t.normatif.valeur).toBe(183_000);
  });
  it("dette nette : lignes non nulles, rapport à l'EBE normatif", () => {
    const e = tableauEndettement(entree, resultat);
    expect(e.annee).toBe(2024);
    expect(e.total).toBe(180_000);
    expect(e.lignes.map((l) => [l.cle, l.montant])).toEqual([["emprunts", 300_000], ["tresorerie", -120_000]]);
    expect(e.sur_ebe).toBeCloseTo(0.9836, 4);                  // 180 000 / 183 000
    expect(e.bfr[0].jours).toBeCloseTo(30.17, 2);
  });
});

describe("clients, périmètre, sources", () => {
  it("cinq premiers clients triés, concentration dérivée", () => {
    const c = clientsPrincipaux({ clients: { principaux: [{ part: 0.12, anciennete: 8 }, { part: 0.2, anciennete: 15, secteur: "Industrie" }, { part: 0.05 }, { part: 0.04 }, { part: 0.03 }], part_recurrente: 0.7 } });
    expect(c.lignes.map((x) => x.part)).toEqual([0.2, 0.12, 0.05, 0.04, 0.03]);
    expect(c.lignes[0]).toMatchObject({ rang: 1, anciennete: 15, secteur: "Industrie" });
    expect(c.premier).toBe(0.2);
    expect(c.cinq).toBeCloseTo(0.44, 6);                       // 0,20 + 0,12 + 0,05 + 0,04 + 0,03
    expect(c.cinq_complet).toBe(true);
    expect(c.recurrent).toBe(0.7);
  });
  it("tableau incomplet : la part des cinq premiers n'est pas affichée sauf si elle est déclarée", () => {
    expect(clientsPrincipaux({ clients: { principaux: [{ part: 0.3 }, { part: 0.1 }] } }).cinq_complet).toBe(false);
    expect(clientsPrincipaux({ clients: { principaux: [{ part: 0.3 }], part_cinq_clients: 0.55 } })).toMatchObject({ premier: 0.3, cinq: 0.55, cinq_complet: true });
    expect(clientsPrincipaux({ clients: { principaux: [{ part: 1.5 }, { part: -0.1 }] } }).lignes).toEqual([]);
  });
  it("périmètre : holding, murs au dirigeant hors cession", () => {
    expect(perimetre({ operation: { detention: DETENTION.holding, part_cedee: "100 %" }, retraitements: { murs: MURS.dirigeant, murs_cession: MURS_CESSION.bail } }))
      .toEqual({ detention: DETENTION.holding, holding: true, associes: false, murs: MURS.dirigeant, murs_cession: MURS_CESSION.bail, part_cedee: "100 %" });
    expect(perimetre({ retraitements: { murs: "texte libre" } }).murs).toBeNull();
  });
  it("origine des chiffres par exercice (liasse avant dirigeant avant INPI)", () => {
    const l = (source) => ({ chiffre_affaires: { valeur: 1, source, valide: true } });
    expect(sourcesChiffres({ 2022: l("inpi"), 2023: l("liasse"), 2024: l("liasse") }, [2022, 2023, 2024])).toBe("liasses fiscales 2023 et 2024 ; comptes annuels déposés (INPI) 2022");
    expect(sourcesChiffres({ 2024: l("liasse") }, [2024])).toBe("liasse fiscale 2024");
    expect(sourcesChiffres({ 2024: { chiffre_affaires: { valeur: 1, source: "liasse", valide: false } } }, [2024])).toBeNull();
  });
  it("indicateurs mis en forme pour la rédaction", () => {
    const cr = compteResultat(entree, resultat), ebeR = tableauEbeRetraite(entree, resultat), endet = tableauEndettement(entree, resultat);
    const i = indicateurs({ cr, ebeR, endet, clients: clientsPrincipaux({}), entreprise: {} });
    expect(espaces(i.chiffre_affaires)).toBe("1,2 M€");
    expect(espaces(i.croissance_annuelle_moyenne)).toBe("+10,0 % par an entre 2022 et 2024");
    expect(espaces(i.marge_ebe)).toBe("15,4 %");               // 186 / 1 210 = 15,37 %
    expect(espaces(i.ebe_retraite)).toBe("206 k€");
    expect(espaces(i.endettement_net)).toBe("dette nette de 180 k€");
    expect(i.dette_nette_sur_ebe).toBe("1,0x");
    expect(i.bfr_jours_de_ca).toBe("30 jours");
  });
});

describe("structure du mémorandum", () => {
  it("cinq parties, neuf chapitres dont Marché et Clients ; six points forts numérotés dans l'ordre, sans chapitre de valeur", () => {
    expect(PARTIES_MEMO.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    expect(SECTIONS_MEMO.map((s) => s.cle)).toEqual(["synthese", "histoire", "activite", "organisation", "marche", "clients", "finances", "perspectives", "operation"]);
    expect(SECTIONS_MEMO.filter((s) => s.point_fort).map((s) => [s.cle, s.point_fort])).toEqual([["activite", 1], ["organisation", 2], ["marche", 3], ["clients", 4], ["finances", 5], ["perspectives", 6]]);
    expect(SECTIONS_MEMO.every((s) => PARTIES_MEMO.some((p) => p.n === s.partie))).toBe(true);
  });
  it("nom de code : celui du dossier, sinon celui tiré du code NAF", () => {
    expect(profilMemo({}, {}, "Projet Chêne").nom_de_code).toBe("Projet Chêne");
    expect(profilMemo({ naf: "43.32A" }, {}).nom_de_code).toMatch(/^Projet \S/);
  });
  it("titres rédigés : une ligne, sans mise en forme ni point final", () => {
    expect(titreValide("Une croissance de 10 % par an depuis 2022.")).toBe("Une croissance de 10 % par an depuis 2022");
    expect(titreValide("**Gras**")).toBeNull();
    expect(titreValide("x".repeat(111))).toBeNull();
    expect(titreValide("")).toBeNull();
  });
  // 24/11/2026 (partie C) : murs et loyer dans « Retraitements », détention et cession des murs dans « Dette nette et
  // périmètre » (premier temps) ; cinq premiers clients repliés dans l'écran « Vos clients »
  it("parcours : détention des titres, murs (avec la cession s'ils appartiennent au dirigeant), cinq premiers clients", () => {
    const champs = (id) => QUESTIONS.find((q) => q.id === id).champs.map((c) => `${c.etape}.${c.cle}`);
    expect(champs("clients")).toContain("clients.principaux");
    const visibles = (ecran, r) => champsVisibles(ecran, r).map((c) => c.cle);
    expect(visibles("retraitements", { retraitements: { murs: MURS.dirigeant } })).toEqual(expect.arrayContaining(["murs", "loyer_paye", "loyer_marche"]));
    expect(visibles("retraitements", { retraitements: { murs: MURS.tiers } })).not.toContain("loyer_paye");
    expect(visibles("dette", { retraitements: { murs: MURS.dirigeant } })).toEqual(expect.arrayContaining(["detention", "murs_cession", "part_cedee"]));
    expect(visibles("dette", { retraitements: { murs: MURS.tiers } })).not.toContain("murs_cession");
  });
});
