// Home page content: rendering (typography, italics, empty keys) and consistency with index.html.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import accueil from "../src/contenu/fr/accueil.json";
import CLES from "../src/contenu/cles.json";
import commun from "../src/contenu/fr/commun.json";
// Home page content as the Worker assembles it: French texts and shared settings.
const contenu = { ...accueil, commun, cles: { ...CLES, ...accueil.cles } };
import { typographier, enLigne, interpoler, html, texte, lire, estVide, condition, pourJs, jsonDansScript, clesVides, lireAttributs, valeurAttribut, identiteLegale, completer, legendeTemoignage } from "../src/contenu/rendu.js";

const FINE = " ", INSEC = " ";
const PAGE = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

describe("French typography", () => {
  it("narrow no-break space before ; : ! ? and inside quotation marks", () => {
    expect(typographier("Et la vôtre ?")).toBe(`Et la vôtre${FINE}?`);
    expect(typographier("Comptes confidentiels ? Deux chiffres suffisent.")).toBe(`Comptes confidentiels${FINE}? Deux chiffres suffisent.`);
    expect(typographier("Note : rien ; enfin !")).toBe(`Note${FINE}: rien${FINE}; enfin${FINE}!`);
    expect(typographier("le bouton « Supprimer mon dossier » efface")).toBe(`le bouton «${FINE}Supprimer mon dossier${FINE}» efface`);
    expect(typographier("«Projet»")).toBe(`«${FINE}Projet${FINE}»`);
  });
  it("does not add a space where there was none (times, addresses)", () => {
    expect(typographier("mailto:x@y.fr")).toBe("mailto:x@y.fr");
    expect(typographier("8:00")).toBe("8:00");
  });
  it("typographic apostrophe, ellipsis, units and ranges with no-break spaces", () => {
    expect(typographier("qu'elle ouvre...")).toBe("qu’elle ouvre…");
    expect(typographier("1,8 – 2,4 M€")).toBe(`1,8${INSEC}– 2,4${INSEC}M€`);
    expect(typographier("490 €, 20 %")).toBe(`490${INSEC}€, 20${INSEC}%`);
  });
});

describe("display conditions", () => {
  const cles = { telephone: "", rappel: false, vrai: true, legal: { rcs: "Nantes 123", forme: "" }, guides: [{ titre: "a" }, { titre: "b" }, {}], vide: { a: "" } };
  it("empty key, false boolean, nested path", () => {
    expect(condition(cles, "telephone")).toBe(false);
    expect(condition(cles, "rappel")).toBe(false);
    expect(condition(cles, "vrai")).toBe(true);
    expect(condition(cles, "legal.rcs")).toBe(true);
    expect(condition(cles, "legal.forme")).toBe(false);
    expect(condition(cles, "vide")).toBe(false);
  });
  it("list with a minimum of non-empty entries", () => {
    expect(condition(cles, "guides:2")).toBe(true);
    expect(condition(cles, "guides:3")).toBe(false);
  });
  it("interpolation of nested paths; empty keys listed with their path", () => {
    expect(interpoler("RCS {legal.rcs}", cles)).toBe("RCS Nantes 123");
    expect(interpoler("{legal.forme} au capital", cles)).toBeNull();
    expect(clesVides({ cles })).toEqual(expect.arrayContaining(["telephone", "rappel", "legal.forme", "vide.a"]));
  });
  it("legal identity: empty parts disappear, nothing if everything is empty", () => {
    expect(identiteLegale({ raison_sociale: "Passation SAS", forme: "SAS", capital: "1 000 €", rcs: "Nantes 123 456 789", adresse: "1 rue X, 44000 Nantes" }))
      .toBe("Passation SAS, SAS au capital de 1 000 €, RCS Nantes 123 456 789, 1 rue X, 44000 Nantes.");
    expect(identiteLegale({ raison_sociale: "Passation SAS", forme: "", capital: "1 000 €", rcs: "", adresse: "Nantes" })).toBe("Passation SAS, au capital de 1 000 €, Nantes.");
    expect(identiteLegale({ raison_sociale: "", forme: "", capital: "", rcs: "", adresse: "" })).toBe("");
    expect(completer({ cles: { legal: { rcs: "Nantes 1" } }, pied: { a: 1 } }).pied).toEqual({ a: 1, identite: "RCS Nantes 1." });
  });
  it("key names with digits (prix_etape2, duree_etape2)", () => {
    expect(interpoler("{duree_etape2} · {prix_etape2}", { duree_etape2: "20 minutes", prix_etape2: "Gratuit" })).toBe("20 minutes · Gratuit");
    expect(interpoler("{prix_etape2}", { prix_etape2: "" })).toBeNull();
  });
});

describe("rendering of values", () => {
  const c = { cles: { prix_dossier: "", telephone: "01 23 45 67 89" }, a: "Votre *transmission*.", b: "Prix : {prix_dossier} €",
    t: "Appelez le {telephone}", l: ["Un.", "", "Deux <b>"], x: "Comptes {exercice}", v: "   " };
  it("italics and escaping", () => {
    expect(enLigne("Votre *transmission*. <script>")).toBe("Votre <em>transmission</em>. &lt;script&gt;");
    expect(html(c, "a")).toBe("Votre <em>transmission</em>.");
  });
  it("an empty key removes the element; a filled key is interpolated", () => {
    expect(html(c, "b")).toBeNull();
    expect(html(c, "t")).toBe("Appelez le 01 23 45 67 89");
    expect(html(c, "v")).toBeNull();
    expect(html(c, "absent")).toBeNull();
  });
  it('placeholders unknown to "cles" stay for the JavaScript', () => {
    expect(interpoler("Comptes {exercice}", c.cles)).toBe("Comptes {exercice}");
    expect(pourJs(c, "x")).toBe("Comptes {exercice}");
  });
  it("list: one paragraph per non-empty element", () => {
    expect(html(c, "l")).toBe("<p>Un.</p><p>Deux &lt;b&gt;</p>");
  });
  it("attributes: plain text without asterisks", () => {
    expect(texte(c, "a")).toBe("Votre transmission.");
    expect(lireAttributs("alt=a.b; aria-label=c")).toEqual([["alt", "a.b"], ["aria-label", "c"]]);
  });
  it("phone link without spaces (including no-break ones), other attributes intact", () => {
    expect(valeurAttribut("href", `tel:01 23${INSEC}45 67 89`)).toBe("tel:0123456789");
    expect(valeurAttribut("href", "tel:+33 1 23 45 67 89")).toBe("tel:+33123456789");
    expect(valeurAttribut("aria-label", "Nous appeler au 01 23 45 67 89")).toBe("Nous appeler au 01 23 45 67 89");
    expect(valeurAttribut("alt", 'Le "dossier"')).toBe("Le ”dossier”");
  });
  it("safe JSON in a <script> tag", () => {
    expect(jsonDansScript({ a: "</script><b>" })).not.toContain("</script>");
  });
});

describe("content file and home page", () => {
  const chemins = [...PAGE.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1]);
  const attributs = [...PAGE.matchAll(/data-t-attr="([^"]+)"/g)].flatMap((m) => lireAttributs(m[1]).map(([, ch]) => ch));
  const si = [...PAGE.matchAll(/data-si(?:-un|non)?="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));

  // Served content (calculated values included); a list element still empty (testimonial, guide) is not an oversight
  const servi = completer(contenu);
  const existe = (ch) => {
    let v = servi;
    for (const k of ch.split(".")) {
      if (Array.isArray(v) && /^\d+$/.test(k) && Number(k) >= v.length) return true;
      v = v?.[k];
      if (v === undefined) return false;
    }
    return true;
  };
  it("each text of the page exists in the content file", () => {
    const absents = [...chemins, ...attributs].filter((ch) => !existe(ch));
    expect(absents).toEqual([]);
    expect(chemins.length).toBeGreaterThan(100);
  });
  it("each condition is on a declared key", () => {
    expect(si.filter((k) => !existe(`cles.${k.split(":")[0]}`))).toEqual([]);
  });
  it("no text in square brackets in the page or in the content", () => {
    const valeurs = [];
    const parcourir = (v) => (typeof v === "string" ? valeurs.push(v) : v && typeof v === "object" && Object.values(v).forEach(parcourir));
    parcourir(contenu);
    expect(valeurs.filter((v) => v.includes("["))).toEqual([]);
    const texteDeLaPage = PAGE.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    expect(texteDeLaPage).not.toContain("[");
  });
  it("no placeholder text or fake content", () => {
    for (const source of [PAGE, JSON.stringify(contenu)]) {
      expect(source).not.toMatch(/À remplir|\[PRIX\]|Lorem|TODO|XXX/i);
    }
  });
  it("the home page no longer loads the 3D", () => {
    expect(PAGE).not.toMatch(/three|edifice|votre-maquette|data-fenetre|data-maquette/);
  });
  it("keys provided later are empty, not invented", () => {
    expect(clesVides(contenu)).toEqual(expect.arrayContaining(["prix_dossier", "fondateur_nom", "telephone", "hebergement", "partenaires", "videos_metiers",
      "nb_dirigeants", "note_avis", "nb_avis", "rappel", "chiffres.entreprises_estimees", "legal.raison_sociale", "temoignages", "guides", "faq_prix"]));
  });
  it("the price and duration badges of the steps are removed with their key", () => {
    expect(PAGE).toMatch(/<li data-si="duree_etape2" data-t="comment\.etapes\.1\.pastilles\.0">/);
    expect(PAGE).toMatch(/<li data-si="prix_etape2" data-t="comment\.etapes\.1\.pastilles\.1">/);
    expect(PAGE).toMatch(/<li data-si="prix_dossier" data-t="comment\.etapes\.2\.pastilles\.1">/);
    expect(PAGE).not.toMatch(/id="tarifs"|nav\.tarifs/);
  });
  it("the parts in order (audit of 25/11/2026: each argument once; confidentiality and final call removed); a single video tag", () => {
    const ids = [...PAGE.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["accueil", "resultat", "livrables", "comment", "equipe", "preuves", "guides", "questions"]);
    expect(PAGE).toMatch(/<header class="nav-zone"[\s\S]*<main[\s\S]*<\/main>\s*<footer class="pied">/);
    expect(PAGE).not.toMatch(/id="essai"|id="parti-pris"|id="tarifs"|id="histoire"|histoire-page\.js|etabli-1200|parti-pris-video/);
    expect([...PAGE.matchAll(/<video class="([^"]+)"/g)].every((m) => m[1] === "hero-video")).toBe(true);
  });
  it("sections and elements removed without content: team, proof (2 testimonials), guides (3), questions to complete", () => {
    expect(PAGE).toMatch(/<section id="equipe"[^>]*data-si="fondateur_nom fondateur_texte"/);
    expect(PAGE).toMatch(/<section id="preuves"[^>]*data-si="temoignages:2"/);
    expect(PAGE).toMatch(/<section id="guides"[^>]*data-si="guides:3"/);
    for (const k of ["faq_prix", "faq_duree", "faq_qui", "faq_repreneur"]) expect(PAGE).toMatch(new RegExp(`<details data-si="${k}">`));
    const q = contenu.questions.liste.map((x) => x.q);
    expect(q[0]).toBe("Combien ça coûte ?");
    expect(q.indexOf("D'où viennent les chiffres de ma société ?")).toBe(q.indexOf("L'estimation express est-elle fiable ?") + 1);
    expect(q).toHaveLength(11);
  });
  it("caption of a testimonial: first name, trade, city, empty parts removed", () => {
    expect(legendeTemoignage({ prenom: "Anne", metier: "boulangère", ville: "Nantes", texte: "…" })).toBe("Anne, boulangère, Nantes");
    expect(legendeTemoignage({ prenom: "Anne", metier: "", ville: "Nantes" })).toBe("Anne, Nantes");
    expect(completer({ cles: { temoignages: [{ prenom: "A" }, { ville: "B" }] }, preuves: { x: 1 } }).preuves).toEqual({ x: 1, legendes: ["A", "B"] });
  });
  it("bento: three steps, two blocks, hero notch with an example marked fictitious, real sources", () => {
    expect(PAGE).not.toMatch(/role="tablist"|role="tabpanel"|onglets\.js|data-dossier-final|hero-tuiles/);
    expect([...PAGE.matchAll(/<li class="parcours-etape" id="comment-(\d)" data-scene>/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    // Two blocks (audit of 25/11/2026): the three documents and the three sources; the list repeating the documents is removed
    expect(PAGE.match(/<article class="bento-bloc /g)).toHaveLength(2);
    expect(PAGE.match(/href="#livrables"/g).length).toBeGreaterThanOrEqual(2);           // menu, mobile menu
    // Two bubbles placed in the shape (audit of 25/11/2026): « 30 s » and the code-name example; « 3 sources » and the
    // four document labels are said once, further down
    expect(PAGE.match(/class="hero-bulle /g)).toHaveLength(2);
    expect(PAGE).toMatch(/<div class="hero-scene" id="hero-scene">[\s\S]*class="conteneur hero-contenu"/);           // the text is inside the shape
    expect(PAGE).not.toMatch(/pied-trousseau|resultat-suites|btn-autre/);
    expect(contenu.hero.bulles.code.fictif).toBe("exemple fictif");                      // never presented as real
    expect(contenu.sources.liste).toEqual(["INSEE", "INPI", "BODACC"]);                  // registries actually used
    expect(contenu.hero.note_comptes).toBe("");
  });
  it("batch 1: step scenes and stamp marked fictitious, played once, nothing without motion allowed", () => {
    const SCENES = readFileSync(new URL("../public/js/landing/scenes.js", import.meta.url), "utf8");
    expect(SCENES).toMatch(/prefers-reduced-motion: reduce/);                            // final state directly
    expect(SCENES).toMatch(/unobserve/);                                                 // only once
    expect(PAGE.match(/data-scene/g)).toHaveLength(3);                                   // the three steps
    expect(PAGE.match(/data-t="comment\.illustrations\.fictif"/g)).toHaveLength(2);     // steps 1 and 2 (example figures)
    expect(contenu.comment.illustrations.fictif).toBe("exemple fictif");
    expect(contenu.comment.etapes.every((e) => e.chiffre && e.texte && !e.obtenez)).toBe(true);
  });
  it("batch 1: result card with a single action, footer with the large name", () => {
    expect(PAGE).not.toMatch(/dossier-cta|resultat-dossier/);
    expect(PAGE.match(/id="resultat-ouvrir"/g)).toHaveLength(1);
    expect(PAGE).toMatch(/<p class="pied-marque" aria-hidden="true" data-t="pied\.marque"><\/p>/);
    expect(contenu.js.resultat.sources).toMatch(/\{exercice\}[\s\S]*\{mois\}/);
  });
});

// Cleanup of 19/11/2026: every content key must be used. A key is read if the page cites it (data-t, data-t-attr,
// data-t-liste, data-t-json), or if a home page script reads it in the "js" subtree. Documented exceptions:
// "cles" (list to be provided by the owner, data-si conditions and {…} templates), js.erreurs (read by the error code
// returned by the API), "_lisez_moi" (instructions for the file).
describe("no orphan key in accueil.json", () => {
  const source = (f) => readFileSync(new URL(`../public/js/landing/${f}`, import.meta.url), "utf8");
  const lues = new Set([
    ...[...source("resultat.js").matchAll(/\bR\.([a-z_]+)/g)].map((m) => `js.resultat.${m[1]}`),
    ...[...source("video.js").matchAll(/\btextes\.([a-z_]+)/g)].map((m) => `js.video.${m[1]}`),
  ]);
  const cites = new Set([...PAGE.matchAll(/data-t(?:-liste)?="([^"]+)"/g)].map((m) => m[1]));
  for (const m of PAGE.matchAll(/data-t-attr="([^"]+)"/g)) for (const [, c] of lireAttributs(m[1])) cites.add(c);
  const json = [...PAGE.matchAll(/data-t-json="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== "js");
  const feuilles = [];
  const parcourir = (v, c) => (v && typeof v === "object" ? Object.entries(v).forEach(([k, y]) => parcourir(y, c ? `${c}.${k}` : k)) : feuilles.push(c));
  parcourir(accueil, "");
  const servie = (c) => c === "_lisez_moi" || c.startsWith("cles.") || c.startsWith("js.erreurs.")
    || [...cites, ...json].some((p) => c === p || c.startsWith(`${p}.`) || p.startsWith(`${c}.`))
    || [...lues].some((p) => c === p || c.startsWith(`${p}.`));
  it("all keys are read by the page or by its scripts", () => expect(feuilles.filter((c) => !servie(c))).toEqual([]));
});
