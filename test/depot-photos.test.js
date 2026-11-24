// Part D (24/11/2026): logo and photos, guided. Upload queue without any page (several files, attestation without
// losing the files, reduction before sending), reduction plan, file checks, where a photo appears, advice per error.
import { describe, it, expect } from "vitest";
import { creerFileDepot, planReduction, controleFichier, endroitPhoto, conseilErreur, CONSEILS, COTE_PHOTO_MAX } from "../public/js/depot-photos.js";
import { avecLangue } from "../src/i18n.js";
import { PHOTOS, LOGO_POIDS_MAX } from "../src/config.js";

const fichier = (nom, taille, type = "image/jpeg") => ({ name: nom, size: taille, type });
/** Fake server: answers with the list of photos, after a progress of 50 % then 100 %. */
function serveur(deja = 0) {
  const recus = [];
  return { recus, envoyer: async (f, progres) => { progres(0.5); progres(1); recus.push(f); return { photos: Array.from({ length: deja + recus.length }, (_, n) => ({ n })) }; } };
}
const sansReduction = async (f) => f;

describe("several files at once", () => {
  it("three photos sent one after the other, each with its progress, the places left updated", async () => {
    const s = serveur(2), etats = [];
    const q = creerFileDepot({ max: 12, restantes: 10, poidsMax: PHOTOS.poidsMax, reduire: sansReduction, envoyer: s.envoyer, surEtat: (x) => etats.push(`${x.nom}:${x.etat}`) });
    q.attester(true);
    q.recevoir([fichier("atelier.jpg", 900_000), fichier("locaux.png", 1_200_000, "image/png"), fichier("equipe.webp", 400_000, "image/webp")]);
    await q.fin();
    expect(s.recus.map((f) => f.name)).toEqual(["atelier.jpg", "locaux.png", "equipe.webp"]);
    expect(q.suivis.map((x) => [x.etat, x.progres])).toEqual([["ok", 1], ["ok", 1], ["ok", 1]]);
    expect(q.restantes).toBe(12 - 5);
    // one file at a time: the second is sent only once the first is done
    expect(etats.indexOf("locaux.png:envoi")).toBeGreaterThan(etats.indexOf("atelier.jpg:ok"));
  });
  it("beyond the quota of 12: refused with its own advice, the others sent", async () => {
    const s = serveur(11);
    const q = creerFileDepot({ max: 12, restantes: 1, poidsMax: PHOTOS.poidsMax, reduire: sansReduction, envoyer: s.envoyer });
    q.attester(true);
    q.recevoir([fichier("a.jpg", 1000), fichier("b.jpg", 1000)]);
    await q.fin();
    expect(q.suivis.map((x) => x.etat)).toEqual(["ok", "erreur"]);
    expect(q.suivis[1].code).toBe("trop_de_photos");
    expect(s.recus).toHaveLength(1);
  });
  it("a photo removed elsewhere frees its place: the upload works again (advice « remove a photo » kept its promise)", async () => {
    const s = serveur(11);
    const q = creerFileDepot({ max: 12, restantes: 0, poidsMax: PHOTOS.poidsMax, reduire: sansReduction, envoyer: s.envoyer });
    q.attester(true);
    q.recevoir([fichier("a.jpg", 1000)]);
    await q.fin();
    expect(q.suivis[0].code).toBe("trop_de_photos");
    q.ajuster(1); // one photo removed from the list
    q.recevoir([fichier("b.jpg", 1000)]);
    await q.fin();
    expect(q.suivis[1].etat).toBe("ok");
  });
  it("an error of the server on one file does not stop the others", async () => {
    let n = 0;
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire: sansReduction,
      envoyer: async () => { n += 1; if (n === 1) throw Object.assign(new Error("x"), { code: "doublon" }); return { photos: [{ n: 0 }] }; } });
    q.attester(true);
    q.recevoir([fichier("a.jpg", 1000), fichier("b.jpg", 1000)]);
    await q.fin();
    expect(q.suivis.map((x) => [x.etat, x.code ?? null])).toEqual([["erreur", "doublon"], ["ok", null]]);
  });
});

describe("attestation without losing the files", () => {
  it("files dropped before the attestation wait; ticking it sends them, nothing to choose again", async () => {
    const s = serveur();
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire: sansReduction, envoyer: s.envoyer });
    q.recevoir([fichier("a.jpg", 1000), fichier("b.jpg", 1000)]);
    await q.fin();
    expect(q.enAttente).toBe(2);
    expect(s.recus).toHaveLength(0);
    q.recevoir([fichier("c.jpg", 1000)]);
    expect(q.enAttente).toBe(3);
    q.attester(true);
    await q.fin();
    expect(q.enAttente).toBe(0);
    expect(s.recus.map((f) => f.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });
  it("unticked: nothing leaves", async () => {
    const s = serveur();
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire: sansReduction, envoyer: s.envoyer });
    q.attester(true); q.attester(false);
    q.recevoir([fichier("a.jpg", 1000)]);
    await q.fin();
    expect(s.recus).toHaveLength(0);
    expect(q.atteste).toBe(false);
  });
});

describe("a photo too heavy is reduced before sending, never refused for its weight", () => {
  it("iPhone photo (4,032 × 3,024, 5.2 MB) and PNG of 8 MB: reduced, then sent; a light photo is sent as is", async () => {
    const s = serveur(), reduites = [];
    const reduire = async (f) => { if (f.size <= PHOTOS.poidsMax) return f; reduites.push(f.name); return { name: f.name.replace(/\.\w+$/, ".jpg"), size: 1_400_000, type: "image/jpeg" }; };
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire, envoyer: s.envoyer });
    q.attester(true);
    q.recevoir([fichier("IMG_0412.JPG", 5_200_000), fichier("plan-atelier.png", 8_000_000, "image/png"), fichier("petite.jpg", 600_000)]);
    await q.fin();
    expect(reduites).toEqual(["IMG_0412.JPG", "plan-atelier.png"]);
    expect(s.recus.map((f) => [f.name, f.size <= PHOTOS.poidsMax])).toEqual([["IMG_0412.jpg", true], ["plan-atelier.jpg", true], ["petite.jpg", true]]);
    expect(q.suivis.map((x) => x.reduite)).toEqual([true, true, false]);
    expect(q.suivis[0]).toMatchObject({ etat: "ok", apres: 1_400_000 });
  });
  it("an image the browser cannot decode: its own advice, nothing sent", async () => {
    const s = serveur();
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire: async () => { throw Object.assign(new Error("r"), { code: "reduction" }); }, envoyer: s.envoyer });
    q.attester(true);
    q.recevoir([fichier("abime.jpg", 4_000_000)]);
    await q.fin();
    expect(q.suivis[0]).toMatchObject({ etat: "erreur", code: "reduction" });
    expect(s.recus).toHaveLength(0);
  });
  it("reduction plan: 4,032 × 3,024 → 2,560 × 1,920 (longest side 2,560, ratio kept); light and small: unchanged", () => {
    expect(planReduction({ largeur: 4032, hauteur: 3024, poids: 5_200_000, poidsMax: 3_000_000 })).toEqual({ reduire: true, largeur: 2560, hauteur: 1920 });
    expect(planReduction({ largeur: 1600, hauteur: 1200, poids: 900_000, poidsMax: 3_000_000 })).toEqual({ reduire: false, largeur: 1600, hauteur: 1200 });
    // heavy but small (PNG): reduced at its own size, then smaller on the next attempt (× 0.8 → 1,280 × 800)
    expect(planReduction({ largeur: 1600, hauteur: 1000, poids: 8_000_000, poidsMax: 3_000_000 })).toEqual({ reduire: true, largeur: 1600, hauteur: 1000 });
    expect(planReduction({ largeur: 1600, hauteur: 1000, poids: 8_000_000, poidsMax: 3_000_000, facteur: 0.8 })).toEqual({ reduire: true, largeur: 1280, hauteur: 800 });
    // large and heavy, second attempt: 4,032 × 3,024 → 2,560 × 1,920 × 0.8 = 2,048 × 1,536
    expect(planReduction({ largeur: 4032, hauteur: 3024, poids: 5_200_000, poidsMax: 3_000_000, facteur: 0.8 })).toEqual({ reduire: true, largeur: 2048, hauteur: 1536 });
    // a page needs 1,200 px: the photo kept stays above that
    expect(COTE_PHOTO_MAX).toBeGreaterThanOrEqual(2 * PHOTOS.largeurPleinePage);
    expect(LOGO_POIDS_MAX).toBe(1_000_000);
  });
});

describe("file checks and advice", () => {
  it("HEIC (iPhone) recognised by its type or its name; other formats refused; JPEG, PNG, WebP accepted", () => {
    expect(controleFichier(fichier("IMG_1.HEIC", 1, ""))).toBe("heic");
    expect(controleFichier(fichier("x.jpg", 1, "image/heic"))).toBe("heic");
    expect(controleFichier(fichier("plan.pdf", 1, "application/pdf"))).toBe("format");
    expect(controleFichier(fichier("x.gif", 1, "image/gif"))).toBe("format");
    for (const t of ["image/jpeg", "image/png", "image/webp"]) expect(controleFichier(fichier("x", 1, t))).toBeNull();
  });
  it("a HEIC file never reaches the reduction or the server", async () => {
    const s = serveur(); let reduit = 0;
    const q = creerFileDepot({ max: 12, restantes: 12, poidsMax: PHOTOS.poidsMax, reduire: async (f) => { reduit += 1; return f; }, envoyer: s.envoyer });
    q.attester(true); q.recevoir([fichier("IMG_9.HEIC", 2_000_000, "image/heic")]); await q.fin();
    expect([reduit, s.recus.length, q.suivis[0].code]).toEqual([0, 0, "heic"]);
  });
  it("every error says what to do, in French and in English", () => {
    for (const l of ["fr", "en"]) for (const code of CONSEILS) {
      const texte = avecLangue(l, () => conseilErreur(code, { max: 12, poids: "3" }));
      expect(texte).not.toMatch(/memo\.js|\{/);
      expect(texte).toMatch(/:/); // the problem, then what to do
    }
    expect(avecLangue("fr", () => conseilErreur("heic"))).toMatch(/JPEG/);
    expect(avecLangue("fr", () => conseilErreur("trop_de_photos", { max: 12 }))).toMatch(/12 photos.*retirez/);
    expect(avecLangue("fr", () => conseilErreur("analyse_indisponible"))).toMatch(/enregistrée/);
    expect(avecLangue("en", () => conseilErreur("inconnu"))).toMatch(/try again/);
  });
});

describe("where each photo will appear in the memorandum", () => {
  const ph = (n, categorie, extra = {}) => ({ n, decision: categorie ? "utilise" : null, categorie, usage: extra.usage ?? null, analyse: { note: extra.note ?? 3 }, largeur: extra.largeur ?? 1600 });
  it("same placement as the memorandum: cover, team, business page, opening pages", () => {
    const l = [ph(0, "equipe"), ph(1, "atelier"), ph(2, "locaux", { note: 4 }), ph(3, "produits"), ph(4, "exterieur", { note: 2 })];
    expect(l.map((p) => endroitPhoto(l, p.n))).toEqual(["equipe", "activite", "couverture", "activite", "ouverture"]);
  });
  it("a photo to avoid or too small for a full page is said not to be placed", () => {
    const l = [ph(0, "locaux"), ph(1, "atelier", { usage: "eviter" })];
    expect(endroitPhoto(l, 1)).toBe("non_placee");
  });
});
