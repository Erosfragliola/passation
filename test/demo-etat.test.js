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

import { etatGestes, planifierGestes, resteGestes, GESTES, GESTES_JOUES, ORDRE_GESTES } from "../public/js/landing/demo-etat.js";

describe("les quatre gestes du nom de code (4e temps de l'histoire)", () => {
  it("durées voulues : nom 0,6 s, bandes 0,3 s, tampon 0,35 s, valeur 0,4 s", () => {
    expect(GESTES).toEqual({ nom: 0.6, bandes: 0.3, tampon: 0.35, valeur: 0.4 });
    expect(ORDRE_GESTES).toEqual(["nom", "bandes", "tampon", "valeur"]);
  });
  it("avant tout geste : le dossier attend, rien n'est écrit ni posé", () => {
    const e = etatGestes({});
    expect([e.attente, e.ecrit, e.metaOp, e.tampon.op, e.pastille.op, e.mentionOp]).toEqual([1, 0, 0, 0, 0, 0]);
    expect(e.bandeaux).toEqual([0, 0, 0]);
    expect(e.lignes.map((l) => l.revele)).toEqual([0, 0, 0, 0]);
  });
  it("le nom s'écrit en 0,6 s : moitié à 0,3 s, entier à 0,6 s", () => {
    expect(etatGestes({ nom: 0.3 }).ecrit).toBeCloseTo(0.5, 10);
    expect(etatGestes({ nom: 0.6 }).ecrit).toBe(1);
    expect(etatGestes({ nom: 0 }).attente).toBe(0);
  });
  it("les trois bandes noires sont passées à 0,3 s, pas avant", () => {
    expect(etatGestes({ nom: 1, bandes: 0.3 }).bandeaux).toEqual([1, 1, 1]);
    expect(etatGestes({ nom: 1, bandes: 0.29 }).bandeaux[2]).toBeLessThan(1);
  });
  it("le tampon tombe de 1,9 à 1 en 0,35 s, puis le choc s'amortit", () => {
    expect(etatGestes({ tampon: 0 }).tampon).toEqual({ op: 0, echelle: 1.9 });
    const pose = etatGestes({ tampon: 0.35 }).tampon;
    expect(pose.op).toBe(1);
    expect(pose.echelle).toBeCloseTo(1, 10);
    expect(Math.abs(etatGestes({ tampon: 0.4 }).secousse)).toBeGreaterThan(0);
    expect(etatGestes({ tampon: 2 }).secousse).toBe(0);
  });
  it("la valeur, les lignes du teaser et la mention sont en place à 0,4 s", () => {
    const e = etatGestes({ valeur: 0.4 });
    expect([e.pastille.op, e.pastille.echelle, e.mentionOp]).toEqual([1, 1, 1]);
    expect(e.lignes.map((l) => l.revele)).toEqual([1, 1, 1, 1]);
    expect(etatGestes({ valeur: 0.1 }).pastille.op).toBe(0);
  });
  it("état final (mouvement réduit) : tout est joué, sans secousse", () => {
    const e = etatGestes(GESTES_JOUES);
    expect([e.attente, e.ecrit, e.tampon.op, e.tampon.echelle, e.secousse, e.pastille.op, e.mentionOp]).toEqual([0, 1, 1, 1, 0, 1, 1]);
  });
  it("un défilement rapide met les gestes à la file : chacun part à la fin du précédent", () => {
    const d = planifierGestes({}, 4, 10);
    expect(d.nom).toBe(10);
    expect(d.bandes).toBeCloseTo(10.6, 10);
    expect(d.tampon).toBeCloseTo(10.9, 10);
    expect(d.valeur).toBeCloseTo(11.25, 10);
  });
  it("seuil atteint après la fin du geste précédent : départ immédiat ; départs déjà fixés inchangés", () => {
    let d = planifierGestes({}, 1, 10);
    expect(d).toEqual({ nom: 10 });
    d = planifierGestes(d, 2, 15);
    expect(d).toEqual({ nom: 10, bandes: 15 });
    expect(planifierGestes(d, 1, 20)).toEqual(d);   // retour en arrière : rien ne se défait
  });
  it("durée restante : jusqu'à la fin du dernier geste parti, choc du tampon compris", () => {
    expect(resteGestes({}, 0)).toBe(0);
    expect(resteGestes({ nom: 10 }, 10.2)).toBeCloseTo(0.4, 10);
    expect(resteGestes({ tampon: 10 }, 10)).toBeCloseTo(0.8, 10);
    expect(resteGestes({ nom: 10 }, 11)).toBe(0);
  });
});
