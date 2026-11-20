// Exemple fictif « Projet Chêne » de l'accueil (audit, point 12) : une seule fourchette partout, et une illustration
// des chiffres compatible avec les multiples du secteur. Valeurs attendues calculées à la main :
//   secteur « Travaux de construction spécialisés » (section F) : multiples de l'EBE 3 (bas) à 5 (haut) ;
//   valeur des titres = multiple × EBE + trésorerie nette ;
//   bas  = 3 × 300 k€ + 900 k€ = 1 800 k€ = 1,8 M€ ;
//   haut = 5 × 300 k€ + 900 k€ = 2 400 k€ = 2,4 M€.
import { describe, it, expect } from "vitest";
import accueil from "../src/contenu/fr/accueil.json";
import CLES from "../src/contenu/cles.json";
import commun from "../src/contenu/fr/commun.json";
// Contenu de la page d'accueil tel que le Worker le compose : textes français et réglages communs.
const contenu = { ...accueil, commun, cles: { ...CLES, ...accueil.cles } };
import MULTIPLES from "../src/data/multiples.json";

const FOURCHETTE = "1,8 – 2,4 M€";
/** Toutes les chaînes du contenu, avec leur chemin. */
function chaines(x, chemin = []) {
  if (typeof x === "string") return [[chemin.join("."), x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => chaines(v, [...chemin, i]));
  if (x && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => chaines(v, [...chemin, k]));
  return [];
}
const euros = (t) => { const m = /^(-?[\d,]+)\s*(M€|k€)$/.exec(t.replace(/ /g, " ").trim()); return m ? Number(m[1].replace(",", ".")) * (m[2] === "M€" ? 1e6 : 1e3) : NaN; };

describe("exemple fictif « Projet Chêne »", () => {
  const fourchettes = chaines(contenu).filter(([, t]) => /\d,\d\s*–\s*\d,\d\s*M€/.test(t));
  // 3 emplacements affichés (bulle du hero, illustrations du SIREN et des chiffres) ; les 5 autres copies étaient dans
  // des clés jamais lues par la page, retirées avec le nettoyage du 19/11/2026
  it("les 3 emplacements affichés portent la fourchette de l'exemple", () => expect(fourchettes.map(([c]) => c)).toEqual(["hero.bulles.code.valeur", "comment.illustrations.siren.valeur", "comment.illustrations.chiffres.fourchette"]));
  it.each(fourchettes)("%s : %s", (_, t) => expect(t).toBe(FOURCHETTE));
  it("plus de valeur centrale dans l'illustration des chiffres", () => {
    const c = contenu.comment.illustrations.chiffres;
    expect(c).not.toHaveProperty("centrale");
    expect([c.fourchette, c.bas, c.haut]).toEqual([FOURCHETTE, "1,8 M€", "2,4 M€"]);
  });
  it("EBE et trésorerie de l'illustration × multiples du secteur construction = la fourchette", () => {
    const c = contenu.comment.illustrations.chiffres;
    const ligne = (p) => euros(c.lignes.find((l) => l.poste === p).montant);
    const m = MULTIPLES.secteurs.find((s) => s.sections.includes("F")).ebe;
    expect([m.bas, m.haut]).toEqual([3, 5]);
    expect(ligne("EBE")).toBe(300_000);
    expect(ligne("Trésorerie nette")).toBe(900_000);
    expect(m.bas * ligne("EBE") + ligne("Trésorerie nette")).toBe(euros(c.bas));
    expect(m.haut * ligne("EBE") + ligne("Trésorerie nette")).toBe(euros(c.haut));
  });
  it("marge d'EBE plausible : 300 k€ / 2,4 M€ = 12,5 %", () => {
    const c = contenu.comment.illustrations.chiffres;
    expect(euros(c.lignes[1].montant) / euros(c.lignes[0].montant)).toBe(0.125);
  });
});
