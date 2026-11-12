// Scène 3D « De l'esquisse à l'édifice » : l'état dépend uniquement de la position des fenêtres (défilement).
import { describe, it, expect } from "vitest";
import { avance, centreRelatif, etatScene, poseCamera, calendrierVolume, decalageStrate, PLAGES, STRATES } from "../public/js/edifice/etats.js";

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
    expect(poseCamera(9)).toEqual(poseCamera(5));
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

describe("scènes 4 à 6 : outils, enseigne, soir", () => {
  const fin = { esquisse: -5, ouvrage: -4 };
  it("la maquette s'ouvre en arrivant aux outils, reste ouverte pendant les cartes, se referme à la fin", () => {
    expect(etatScene({ ...fin, eclate: 1.5 }).ouvert).toBe(0);
    expect(etatScene({ ...fin, eclate: 0.3, outilsDefile: 0.4 }).ouvert).toBe(1);
    expect(etatScene({ ...fin, eclate: 0.3, outilsDefile: 1 }).ouvert).toBe(0);
    expect(etatScene({ ...fin, eclate: 0.3, outilsDefile: 0.9 }).ouvert).toBeGreaterThan(0);
  });
  it("aux outils, la maquette est finie (volume et matière à 1)", () => {
    expect(etatScene({ eclate: 0.3, outilsDefile: 0.4 })).toMatchObject({ trace: 1, volume: 1, matiere: 1 });
  });
  it("l'enseigne effacée implique les outils parcourus et la maquette refermée", () => {
    const e = etatScene({ ...fin, eclate: 0.3, outilsDefile: 0.4, enseigne: 0.8 });
    expect(e.efface).toBeGreaterThan(0);
    expect(e.outils).toBe(1);
    expect(e.ouvert).toBe(0);
  });
  it("le soir arrive en dernier ; l'étape va de 0 à 5", () => {
    const e = etatScene({ soir: 0.4 });
    expect(e).toMatchObject({ soir: 1, efface: 1, outils: 1, matiere: 1, etape: 5 });
    expect(etatScene({}).etape).toBe(0);
  });
  it("avec « réduire les animations », la vue éclatée est une image fixe ouverte pendant les cartes", () => {
    expect(etatScene({ ...fin, eclate: 0.3, outilsDefile: 0.4 }, { reduit: true }).ouvert).toBe(1);
    expect(etatScene({ ...fin, eclate: 1.5 }, { reduit: true }).ouvert).toBe(0);
    expect(etatScene({ ...fin, eclate: 0.3, outilsDefile: 1 }, { reduit: true }).ouvert).toBe(0);
  });
  it("six strates, une par outil, dans l'ordre des cartes", () => {
    expect(STRATES.map((x) => x.outil)).toEqual(["Valorisation", "Datapack Excel", "Teaser", "Mémorandum", "Ressources", "Chat expert"]);
    expect(new Set(STRATES.map((x) => x.cle)).size).toBe(6);
  });
  it("fermée, aucune strate ne bouge ; ouverte, elles s'empilent dans l'ordre", () => {
    for (const { cle } of STRATES) expect(decalageStrate(cle, 0, { etage: 2, nbEtages: 4 })).toEqual({ y: 0, z: 0 });
    const y = (cle) => decalageStrate(cle, 1, { etage: 1, nbEtages: 4 }).y;
    expect(y("fondations")).toBeLessThan(y("rdc"));
    expect(y("rdc")).toBeLessThan(y("etages"));
    expect(y("etages")).toBeLessThan(y("toiture"));
    expect(decalageStrate("enseigne", 1).z).toBeGreaterThan(0);
  });
});
