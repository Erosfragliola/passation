// L'histoire des clés : poses aux repères du brief. Valeurs attendues calculées à la main depuis les constantes du
// prototype (PILE, ROWX = 960 + (i − 4) × 160, KEYY = 660, TAGY = 606, STK, TABT…).
import { describe, it, expect } from "vitest";
import { cle, etiquette, ficelle, onglet, dossier, bloc, lampe, tempsDefilement, PILE, NB, T_POSE } from "../public/js/landing/histoire-poses.js";

const tous = (f) => Array.from({ length: NB }, (_, i) => f(i));

describe("allumage et chute (joués au temps)", () => {
  it("lampe : 0,24 éteinte, 1 allumée", () => {
    expect(lampe(6.6)).toBeCloseTo(0.24, 10);
    expect(lampe(7.2)).toBe(1);
  });
  it("avant la chute, rien sur l'établi", () => {
    expect(tous((i) => cle(i, 6.6).op)).toEqual(Array(NB).fill(0));
    expect(tous((i) => etiquette(i, 6.6).op)).toEqual(Array(NB).fill(0));
  });
  it("à 8,2 toutes les clés et étiquettes sont posées, en vrac (aucune en l'air)", () => {
    // Dernière clé : départ 7,05 + 8 × 0,075 = 7,65, posée à 8,15 ; dernière étiquette posée à 8,19
    for (let i = 0; i < NB; i++) {
      const k = cle(i, T_POSE), e = etiquette(i, T_POSE);
      expect([k.x, k.y, k.rot, k.op, k.h]).toEqual([PILE[i][0], PILE[i][1], PILE[i][2], 1, 0]);
      expect([e.x, e.y, e.rot, e.op, e.h]).toEqual([PILE[i][0] + PILE[i][3], PILE[i][1] + PILE[i][4], PILE[i][5], 1, 0]);
    }
    expect([cle(4, T_POSE).x, cle(4, T_POSE).y, cle(4, T_POSE).rot]).toEqual([1078, 672, 12]);
  });
  it("le défilement ne ramène jamais avant la fin de la chute ; p = 1 → 24,5", () => {
    expect(tempsDefilement(0)).toBe(8.2);
    expect(tempsDefilement(0.5)).toBeCloseTo(16.1, 10);   // 7,7 + 0,5 × 16,8
    expect(tempsDefilement(1)).toBeCloseTo(24.5, 10);
  });
});

describe("rangement, retournements, sortie, regroupement, onglets", () => {
  it("à 13,7 les clés sont alignées (x = 960 + (i − 4) × 160, y = 660, droites)", () => {
    expect(tous((i) => cle(i, 13.7).x)).toEqual([320, 480, 640, 800, 960, 1120, 1280, 1440, 1600]);
    expect(tous((i) => Math.round(cle(i, 13.7).y * 1e6) / 1e6)).toEqual(Array(NB).fill(660));
    expect(tous((i) => cle(i, 13.7).rot + 0)).toEqual(Array(NB).fill(0));
  });
  it("à 13,8 les étiquettes sont au-dessus (y = 606), encore côté recto", () => {
    expect(tous((i) => Math.round(etiquette(i, 13.8).y * 1e6) / 1e6)).toEqual(Array(NB).fill(606));
    expect(tous((i) => etiquette(i, 13.8).flip)).toEqual(Array(NB).fill(0));
  });
  it("retournements de 14,25 à 17,25, une étiquette toutes les 0,3 s", () => {
    expect(etiquette(0, 14.25).flip).toBe(0);
    expect(etiquette(0, 14.85).flip).toBe(1);
    expect(etiquette(8, 16.65).flip).toBe(0);           // 14,25 + 8 × 0,3
    expect(tous((i) => etiquette(i, 17.25).flip)).toEqual(Array(NB).fill(1));
  });
  it("à 20 les clés sont sorties ; les ficelles ont disparu dès 19,25", () => {
    expect(tous((i) => cle(i, 20).op)).toEqual(Array(NB).fill(0));
    expect(tous((i) => ficelle(i, 19.3))).toEqual(Array(NB).fill(null));
    expect(ficelle(0, 15)).not.toBeNull();
  });
  it("à 20,7 les étiquettes sont regroupées en pile (x = 1340 + (i − 4) × 2,5 ; y = 600 − 1,5 i)", () => {
    const e = etiquette(8, 20.7);
    expect([e.x, e.y, e.rot, e.s]).toEqual([1350, 588, 0, 0.92]);
    expect(etiquette(0, 20.7).x).toBe(1330);
  });
  it("à 22,6 les étiquettes sont devenues les onglets du dossier", () => {
    expect(tous((i) => onglet(i, 22.6).op)).toEqual(Array(NB).fill(1));
    expect(tous((i) => etiquette(i, 22.6).op)).toEqual(Array(NB).fill(0));
    expect(onglet(0, 21.5).op).toBe(0);                   // onglet 01 : 21,15 + 8 × 0,08 + 0,4 = 22,19
  });
  it("le dossier arrive de 20,45 à 21,45", () => {
    expect(dossier(20.3).visible).toBe(false);
    expect(dossier(20.45).y).toBe(860);
    expect(dossier(21.45).y).toBe(0);
    expect(dossier(21.45).rot).toBeCloseTo(-0.8, 10);
  });
});

describe("textes", () => {
  it("temps 1 lisible de 7,9 à 12,55, effacé à 12,95", () => {
    expect(bloc(10, 7.9, 12.55).enfants.map((e) => e.op)).toEqual([1, 1, 1]);
    expect(bloc(13, 7.9, 12.55).visible).toBe(false);
    expect(bloc(7.9, 7.9, 12.55).enfants[0].op).toBe(0);
  });
  it("temps 3 reste jusqu'à la fin", () => {
    expect(bloc(24.5, 21.0, Infinity).enfants.map((e) => e.op)).toEqual([1, 1, 1]);
  });
});
