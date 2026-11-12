// Démo « Et la vôtre ? » : déroulé conforme au brief (durées calculées à la main).
import { describe, it, expect } from "vitest";
import { etatDemo, DEMO } from "../public/js/landing/demo-etat.js";

describe("démo du nom de code", () => {
  it("le nom s'écrit en 0,6 s", () => {
    expect(etatDemo(0).ecrit).toBe(0);
    expect(etatDemo(0.3).ecrit).toBeCloseTo(0.5, 10);
    expect(etatDemo(0.6).ecrit).toBe(1);
    expect(DEMO.nom[1] - DEMO.nom[0]).toBeCloseTo(0.6, 10);
  });
  it("trois bandeaux de 0,35 s, le troisième sur la ligne SIREN et ville, dans l'ordre", () => {
    for (const [a, b] of DEMO.bandeaux) expect(b - a).toBeCloseTo(0.35, 10);
    expect(etatDemo(1.25).bandeaux).toEqual([1, 0, 0]);
    expect(etatDemo(1.95).bandeaux).toEqual([1, 1, 1]);
  });
  it("le tampon tombe de l'échelle 1,9 à 1 en 0,35 s, puis le dossier encaisse un petit choc qui s'amortit", () => {
    expect(etatDemo(DEMO.tampon[0]).tampon).toEqual({ op: 0, echelle: 1.9 });
    expect(etatDemo(DEMO.tampon[1]).tampon.op).toBe(1);
    expect(etatDemo(DEMO.tampon[1]).tampon.echelle).toBeCloseTo(1, 10);
    expect(DEMO.tampon[1] - DEMO.tampon[0]).toBeCloseTo(0.35, 10);
    expect(Math.abs(etatDemo(DEMO.tampon[1] + 0.05).secousse)).toBeGreaterThan(0);
    expect(etatDemo(DEMO.tampon[1] + 1).secousse).toBe(0);
  });
  it("le teaser s'affiche ligne par ligne, 0,38 s chacune, après le tampon", () => {
    const [a0, b0] = DEMO.lignes(0), [a3, b3] = DEMO.lignes(3);
    expect(b0 - a0).toBeCloseTo(0.38, 10);
    expect(a0).toBeGreaterThan(DEMO.tampon[1]);
    expect(etatDemo(b0).lignes.map((l) => l.revele)).toEqual([1, 0, 0, 0]);
    expect(etatDemo(b3).lignes.map((l) => l.revele)).toEqual([1, 1, 1, 1]);
  });
  it("puis la pastille, la mention, et le texte de gauche change", () => {
    const fin = etatDemo(DEMO.fin);
    expect([fin.pastille.op, fin.pastille.echelle, fin.mentionOp, fin.apres]).toEqual([1, 1, 1, 1]);
    expect(etatDemo(DEMO.pastille[0]).pastille.op).toBe(0);
    expect(DEMO.pastille[0]).toBeGreaterThan(DEMO.lignes(3)[1]);
  });
});
