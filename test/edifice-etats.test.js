// Scène 3D « De l'esquisse à l'édifice » : l'état dépend uniquement de la position des fenêtres (défilement).
import { describe, it, expect } from "vitest";
import { avance, centreRelatif, etatScene, poseCamera, calendrierVolume, PLAGES } from "../public/js/edifice/etats.js";

describe("avance", () => {
  it("vaut 0 avant le début, 1 après la fin, et progresse entre les deux", () => {
    expect(avance(1.5, 1.2, 0.6)).toBe(0);
    expect(avance(0.3, 1.2, 0.6)).toBe(1);
    expect(avance(0.9, 1.2, 0.6)).toBeCloseTo(0.5, 10); // (1,2 − 0,9) / (1,2 − 0,6) = 0,5
  });
  it("vaut 0 quand la fenêtre n'existe pas", () => {
    expect(avance(undefined, 1.2, 0.6)).toBe(0);
    expect(avance(NaN, 1.2, 0.6)).toBe(0);
  });
});

describe("centreRelatif", () => {
  it("place le centre d'une fenêtre en hauteurs d'écran", () => {
    // haut 300 px, hauteur 600 px, écran 900 px : centre à 600 px, soit 2/3 de l'écran
    expect(centreRelatif(300, 600, 900)).toBeCloseTo(2 / 3, 10);
  });
});

describe("etatScene", () => {
  it("avant la section : rien n'est tracé", () => {
    expect(etatScene({ esquisse: 2, ouvrage: 4 })).toMatchObject({ trace: 0, volume: 0, matiere: 0, etape: 0 });
  });
  it("esquisse centrée : le tracé est fini, le volume n'a pas commencé", () => {
    expect(etatScene({ esquisse: 0.5, ouvrage: 2.5 })).toMatchObject({ trace: 1, volume: 0, matiere: 0 });
  });
  it("même position, même état (fonction pure, réversible quand on remonte)", () => {
    const positions = [3, 1.1, 0.9, 0.7, 0.4, 0.1];
    const descente = positions.map((c) => etatScene({ esquisse: c - 1.6, ouvrage: c }));
    const montee = [...positions].reverse().map((c) => etatScene({ esquisse: c - 1.6, ouvrage: c })).reverse();
    expect(montee).toEqual(descente);
  });
  it("le volume précède la matière, et la matière implique l'ouvrage monté", () => {
    const [, debutMatiere] = PLAGES.matiere;
    const e = etatScene({ esquisse: -2, ouvrage: debutMatiere - 0.01 });
    expect(e.volume).toBe(1);
    expect(e.matiere).toBeGreaterThan(0);
    expect(e.trace).toBe(1);
  });
  it("une étape plus loin termine les précédentes, même si une fenêtre manque", () => {
    expect(etatScene({ ouvrage: 0 })).toMatchObject({ trace: 1, volume: 1, matiere: 1, etape: 2 });
  });
  it("avec « réduire les animations », chaque grandeur vaut 0 ou 1", () => {
    for (let c = 2; c > -1; c -= 0.05) {
      const e = etatScene({ esquisse: c, ouvrage: c + 0.8 }, { reduit: true });
      for (const k of ["trace", "volume", "matiere"]) expect([0, 1]).toContain(e[k]);
    }
  });
});

describe("poseCamera", () => {
  it("reste dans les bornes et passe exactement par les poses clés", () => {
    expect(poseCamera(-1)).toEqual(poseCamera(0));
    expect(poseCamera(9)).toEqual(poseCamera(2));
    expect(poseCamera(1).elevation).toBeCloseTo(0.44, 10);
  });
  it("descend progressivement de la vue d'esquisse à la vue de matière", () => {
    let precedente = Infinity;
    for (let k = 0; k <= 2; k += 0.1) {
      const { elevation } = poseCamera(k);
      expect(elevation).toBeLessThanOrEqual(precedente + 1e-12);
      precedente = elevation;
    }
  });
});

describe("calendrierVolume", () => {
  const cal = calendrierVolume(4, 6, 3);
  it("monte les étages un à un, dans l'ordre", () => {
    expect(cal.niveau(0.01, 0)).toBeGreaterThan(0);
    expect(cal.niveau(0.01, 1)).toBe(0);
    expect(cal.niveau(0.5, 3)).toBe(1);
  });
  it("allume les fenêtres une par une, puis fait pousser les arbres", () => {
    const allumees = (p) => [0, 1, 2, 3, 4, 5].filter((i) => cal.fenetreAllumee(p, i)).length;
    expect(allumees(0.6)).toBe(0);
    expect(allumees(0.75)).toBeGreaterThan(0);
    expect(allumees(0.75)).toBeLessThan(6);
    expect(allumees(0.9)).toBe(6);
    expect(cal.arbre(0.69, 0)).toBe(0);
    expect(cal.arbre(1, 2)).toBe(1);
  });
});
