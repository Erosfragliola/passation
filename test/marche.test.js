// Étude de marché : structure du secteur (registres publics) et garde-fou sur les sources web. Valeurs calculées à la main.
import { describe, it, expect } from "vitest";
import { structureSecteur, bandeDe, CODES_REGIONS } from "../src/sources/secteur.js";
import { faitsSourcesVerifies, dernierJson } from "../src/lib/claude.js";

// Comptes réels relevés le 17/11/2026 (menuiserie 43.32A, Pays de la Loire, entreprises actives)
const comptes = { region: { sans: 3210, "1_9": 1236, "10_49": 243, "50_plus": 19 }, france: { "10_49": 2317, "50_plus": 78 } };

describe("structure du secteur", () => {
  const s = structureSecteur(comptes, { naf: "43.32A", region: "Pays de la Loire", trancheEntreprise: "12", date: "17/11/2026" });
  it("total régional, part des moins de 10 salariés, rang de taille de l'entreprise", () => {
    expect(s.region_total).toBe(4708);                          // 3 210 + 1 236 + 243 + 19
    expect(s.part_moins_10).toBeCloseTo(0.94435, 5);            // 4 446 / 4 708 = 0,944350
    expect(s.bande_entreprise).toBe("10_49");
    expect(s.nombre_meme_taille_ou_plus_region).toBe(262);      // 243 + 19
    expect(s.part_meme_taille_ou_plus).toBeCloseTo(0.0556, 4);  // 262 / 4 708
    expect(s.france_10_plus).toBe(2395);                        // 2 317 + 78
    expect(s.france_10_plus_plafonne).toBe(false);
    expect(s.source).toMatch(/INSEE Sirene.*43\.32A.*17\/11\/2026/);
  });
  it("entreprise sans salarié : pas de rang ; compte plafonné signalé ; région inconnue sans résultat", () => {
    expect(structureSecteur(comptes, { naf: "43.32A", region: "Pays de la Loire", trancheEntreprise: "NN" }).part_meme_taille_ou_plus).toBeNull();
    expect(structureSecteur({ region: { ...comptes.region, sans: 10000 }, france: { "10_49": 10000, "50_plus": 5 } }, { naf: "x", region: "y", trancheEntreprise: "01" }))
      .toMatchObject({ region_plafonne: true, france_10_plus_plafonne: true });
    expect(structureSecteur(null, {})).toBeNull();
    expect(bandeDe("21")).toBe("50_plus");
    expect(Object.keys(CODES_REGIONS)).toHaveLength(18);
  });
});

describe("faits de marché : garde-fou des sources", () => {
  it("ne garde que les faits dont l'adresse a été renvoyée par la recherche, bien formés et d'un thème connu", () => {
    const faits = [
      { theme: "taille", fait: "Le marché pèse 4 Md€.", chiffre: "4 Md€", annee: 2024, source: "INSEE", url: "https://www.insee.fr/fr/statistiques/1/" },
      { theme: "taille", fait: "Chiffre inventé.", url: "https://inconnu.fr/page" },
      { theme: "meteo", fait: "Hors sujet.", url: "https://www.insee.fr/fr/statistiques/1" },
      { theme: "tendance", fait: "", url: "https://www.insee.fr/fr/statistiques/1" },
      { theme: "demande", fait: "Adresse non web.", url: "javascript:alert(1)" },
    ];
    const r = faitsSourcesVerifies(faits, ["https://www.insee.fr/fr/statistiques/1", "javascript:alert(1)"]);
    expect(r).toEqual([{ theme: "taille", fait: "Le marché pèse 4 Md€.", chiffre: "4 Md€", annee: "2024", source: "INSEE", url: "https://www.insee.fr/fr/statistiques/1/" }]);
    expect(faitsSourcesVerifies(null, [])).toEqual([]);
  });
  it("lit le dernier bloc JSON de la réponse", () => {
    expect(dernierJson("Texte\n```json\n{\"faits\":[]}\n```")).toEqual({ faits: [] });
    expect(dernierJson("pas de json")).toBeNull();
  });
});
