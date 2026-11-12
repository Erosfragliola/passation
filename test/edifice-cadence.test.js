// Qualité adaptative de la maquette : la cadence n'est mesurée que sur les images enchaînées.
// Valeurs attendues calculées à la main (fenêtres de 500 ms, seuil 45 i/s, 2 s cumulées sous le seuil).
import { describe, it, expect } from "vitest";
import { creerCadence } from "../public/js/edifice/cadence.js";

/** Envoie des tics de t0 à t1 (exclu) tous les `pas` ms ; renvoie les instants où une baisse est demandée. */
function jouer(c, t0, t1, pas, enchaine = true) {
  const baisses = [];
  for (let k = 0; t0 + k * pas < t1; k++) {
    const t = t0 + k * pas;
    if (c.tic(t, enchaine)) baisses.push(t);
  }
  return baisses;
}

describe("creerCadence", () => {
  it("ne baisse jamais la qualité à 60 i/s enchaînées", () => {
    const c = creerCadence({ depart: 0 });
    expect(jouer(c, 4000, 14000, 1000 / 60)).toEqual([]);
    expect(c.ips).toBeCloseTo(60, 0);
  });

  it("ignore les images demandées par le défilement, même une sur deux (cas du rendu à la demande)", () => {
    // Le défilement relance la scène une image sur deux (33,3 ms) : avant correction, cela se lisait 30 i/s.
    const c = creerCadence({ depart: 0 });
    expect(jouer(c, 4000, 14000, 1000 / 30, false)).toEqual([]);
    expect(c.ips).toBe(60);
  });

  it("baisse d'un palier après 2 s cumulées à 25 i/s enchaînées, puis à nouveau 2 s plus tard", () => {
    // Pas de 40 ms : le premier tic (4000) ouvre la mesure ; une fenêtre se ferme au 13e tic suivant (520 ms ≥ 500),
    // à 13 × 1000 / 520 = 25 i/s. Il faut 4 fenêtres (4 × 520 = 2080 ms ≥ 2000) : baisse à 4000 + 2080 = 6080,
    // puis à 6080 + 2080 = 8160.
    const c = creerCadence({ depart: 0 });
    expect(jouer(c, 4000, 8200, 40)).toEqual([6080, 8160]);
    expect(c.ips).toBeCloseTo(25, 10);
  });

  it("une fenêtre fluide remet le compteur à zéro", () => {
    // 3 fenêtres lentes (1560 ms), une fenêtre à 60 i/s, puis 3 fenêtres lentes : jamais 2 s d'affilée sous le seuil.
    const c = creerCadence({ depart: 0 });
    let t = 4000;
    const baisses = [...jouer(c, t, (t += 3 * 520 + 40), 40)];
    baisses.push(...jouer(c, t, (t += 520), 1000 / 60));
    baisses.push(...jouer(c, t, (t += 3 * 520), 40));
    expect(baisses).toEqual([]);
  });

  it("ne juge rien pendant le chargement ni onglet masqué", () => {
    const c = creerCadence({ depart: 0 });
    expect(jouer(c, 0, 3500, 100)).toEqual([]);            // 10 i/s, mais avant 3,5 s
    for (let t = 4000; t < 12000; t += 100) expect(c.tic(t, true, true)).toBe(false); // masqué
    expect(c.ips).toBe(60);
  });

  it("une pause de plus de 250 ms coupe la mesure en cours", () => {
    // 480 ms à 40 ms (12 tics, fenêtre non close), pause de 300 ms : la fenêtre repart de zéro, aucune mesure n'est
    // faite avec l'intervalle de la pause.
    const c = creerCadence({ depart: 0 });
    jouer(c, 4000, 4480, 40);
    expect(c.tic(4780, true)).toBe(false);
    jouer(c, 4780 + 1000 / 60, 4780 + 500, 1000 / 60);
    expect(c.tic(4780 + 520, true)).toBe(false);
    expect(c.ips).toBeGreaterThan(55);
  });
});
