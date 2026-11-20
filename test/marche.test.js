// Market research: industry structure (public registries) and safeguard on web sources. Values calculated by hand.
import { describe, it, expect } from "vitest";
import { structureSecteur, bandeDe, CODES_REGIONS } from "../src/sources/secteur.js";
import { faitsSourcesVerifies, dernierJson } from "../src/lib/claude.js";

// Real counts recorded on 17/11/2026 (joinery 43.32A, Pays de la Loire, active companies)
const comptes = { region: { sans: 3210, "1_9": 1236, "10_49": 243, "50_plus": 19 }, france: { "10_49": 2317, "50_plus": 78 } };

describe("industry structure", () => {
  const s = structureSecteur(comptes, { naf: "43.32A", region: "Pays de la Loire", trancheEntreprise: "12", date: "17/11/2026" });
  it("regional total, share of companies with fewer than 10 employees, the company's size rank", () => {
    expect(s.region_total).toBe(4708);                          // 3 210 + 1 236 + 243 + 19
    expect(s.part_moins_10).toBeCloseTo(0.94435, 5);            // 4 446 / 4 708 = 0,944350
    expect(s.bande_entreprise).toBe("10_49");
    expect(s.nombre_meme_taille_ou_plus_region).toBe(262);      // 243 + 19
    expect(s.part_meme_taille_ou_plus).toBeCloseTo(0.0556, 4);  // 262 / 4 708
    expect(s.france_10_plus).toBe(2395);                        // 2 317 + 78
    expect(s.france_10_plus_plafonne).toBe(false);
    expect(s.source).toMatch(/INSEE Sirene.*43\.32A.*17\/11\/2026/);
  });
  it("company without employees: no rank; capped count flagged; unknown region without a result", () => {
    expect(structureSecteur(comptes, { naf: "43.32A", region: "Pays de la Loire", trancheEntreprise: "NN" }).part_meme_taille_ou_plus).toBeNull();
    expect(structureSecteur({ region: { ...comptes.region, sans: 10000 }, france: { "10_49": 10000, "50_plus": 5 } }, { naf: "x", region: "y", trancheEntreprise: "01" }))
      .toMatchObject({ region_plafonne: true, france_10_plus_plafonne: true });
    expect(structureSecteur(null, {})).toBeNull();
    expect(bandeDe("21")).toBe("50_plus");
    expect(Object.keys(CODES_REGIONS)).toHaveLength(18);
  });
});

describe("market facts: safeguard on sources", () => {
  it("keeps only facts whose address was returned by the search, well formed and of a known theme", () => {
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
  it("reads the last JSON block of the response", () => {
    expect(dernierJson("Texte\n```json\n{\"faits\":[]}\n```")).toEqual({ faits: [] });
    expect(dernierJson("pas de json")).toBeNull();
  });
});
