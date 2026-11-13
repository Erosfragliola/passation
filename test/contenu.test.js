// Contenus de la page d'accueil : rendu (typographie, italiques, clés vides) et cohérence avec index.html.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import contenu from "../src/contenu/landing.json";
import { typographier, enLigne, interpoler, html, texte, lire, estVide, condition, pourJs, jsonDansScript, clesVides, lireAttributs, valeurAttribut } from "../src/contenu/rendu.js";

const FINE = " ", INSEC = " ";
const PAGE = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

describe("typographie française", () => {
  it("espace fine insécable avant ; : ! ? et dans les guillemets", () => {
    expect(typographier("Et la vôtre ?")).toBe(`Et la vôtre${FINE}?`);
    expect(typographier("Comptes confidentiels ? Deux chiffres suffisent.")).toBe(`Comptes confidentiels${FINE}? Deux chiffres suffisent.`);
    expect(typographier("Note : rien ; enfin !")).toBe(`Note${FINE}: rien${FINE}; enfin${FINE}!`);
    expect(typographier("le bouton « Supprimer mon dossier » efface")).toBe(`le bouton «${FINE}Supprimer mon dossier${FINE}» efface`);
    expect(typographier("«Projet»")).toBe(`«${FINE}Projet${FINE}»`);
  });
  it("n'ajoute pas d'espace là où il n'y en avait pas (heures, adresses)", () => {
    expect(typographier("mailto:x@y.fr")).toBe("mailto:x@y.fr");
    expect(typographier("8:00")).toBe("8:00");
  });
  it("apostrophe typographique, points de suspension, unités et fourchettes insécables", () => {
    expect(typographier("qu'elle ouvre...")).toBe("qu’elle ouvre…");
    expect(typographier("1,8 – 2,4 M€")).toBe(`1,8${INSEC}– 2,4${INSEC}M€`);
    expect(typographier("490 €, 20 %")).toBe(`490${INSEC}€, 20${INSEC}%`);
  });
});

describe("conditions d'affichage", () => {
  const cles = { telephone: "", rappel: false, vrai: true, legal: { rcs: "Nantes 123", forme: "" }, guides: [{ titre: "a" }, { titre: "b" }, {}], vide: { a: "" } };
  it("clé vide, booléen faux, chemin imbriqué", () => {
    expect(condition(cles, "telephone")).toBe(false);
    expect(condition(cles, "rappel")).toBe(false);
    expect(condition(cles, "vrai")).toBe(true);
    expect(condition(cles, "legal.rcs")).toBe(true);
    expect(condition(cles, "legal.forme")).toBe(false);
    expect(condition(cles, "vide")).toBe(false);
  });
  it("liste avec un minimum d'entrées non vides", () => {
    expect(condition(cles, "guides:2")).toBe(true);
    expect(condition(cles, "guides:3")).toBe(false);
  });
  it("interpolation des chemins imbriqués ; clés vides listées avec leur chemin", () => {
    expect(interpoler("RCS {legal.rcs}", cles)).toBe("RCS Nantes 123");
    expect(interpoler("{legal.forme} au capital", cles)).toBeNull();
    expect(clesVides({ cles })).toEqual(expect.arrayContaining(["telephone", "rappel", "legal.forme", "vide.a"]));
  });
});

describe("rendu des valeurs", () => {
  const c = { cles: { prix_dossier: "", telephone: "01 23 45 67 89" }, a: "Votre *transmission*.", b: "Prix : {prix_dossier} €",
    t: "Appelez le {telephone}", l: ["Un.", "", "Deux <b>"], x: "Comptes {exercice}", v: "   " };
  it("italique et échappement", () => {
    expect(enLigne("Votre *transmission*. <script>")).toBe("Votre <em>transmission</em>. &lt;script&gt;");
    expect(html(c, "a")).toBe("Votre <em>transmission</em>.");
  });
  it("une clé vide retire l'élément ; une clé remplie est interpolée", () => {
    expect(html(c, "b")).toBeNull();
    expect(html(c, "t")).toBe("Appelez le 01 23 45 67 89");
    expect(html(c, "v")).toBeNull();
    expect(html(c, "absent")).toBeNull();
  });
  it("les repères inconnus de « cles » restent pour le JavaScript", () => {
    expect(interpoler("Comptes {exercice}", c.cles)).toBe("Comptes {exercice}");
    expect(pourJs(c, "x")).toBe("Comptes {exercice}");
  });
  it("liste : un paragraphe par élément non vide", () => {
    expect(html(c, "l")).toBe("<p>Un.</p><p>Deux &lt;b&gt;</p>");
  });
  it("attributs : texte brut sans astérisques", () => {
    expect(texte(c, "a")).toBe("Votre transmission.");
    expect(lireAttributs("alt=a.b; aria-label=c")).toEqual([["alt", "a.b"], ["aria-label", "c"]]);
  });
  it("lien téléphone sans espaces (y compris insécables), autres attributs intacts", () => {
    expect(valeurAttribut("href", `tel:01 23${INSEC}45 67 89`)).toBe("tel:0123456789");
    expect(valeurAttribut("href", "tel:+33 1 23 45 67 89")).toBe("tel:+33123456789");
    expect(valeurAttribut("aria-label", "Nous appeler au 01 23 45 67 89")).toBe("Nous appeler au 01 23 45 67 89");
    expect(valeurAttribut("alt", 'Le "dossier"')).toBe("Le ”dossier”");
  });
  it("JSON sûr dans une balise <script>", () => {
    expect(jsonDansScript({ a: "</script><b>" })).not.toContain("</script>");
  });
});

describe("fichier de contenu et page d'accueil", () => {
  const chemins = [...PAGE.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1]);
  const attributs = [...PAGE.matchAll(/data-t-attr="([^"]+)"/g)].flatMap((m) => lireAttributs(m[1]).map(([, ch]) => ch));
  const si = [...PAGE.matchAll(/data-si(?:-un)?="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));

  it("chaque texte de la page existe dans le fichier de contenu", () => {
    const absents = [...chemins, ...attributs].filter((ch) => lire(contenu, ch) === undefined);
    expect(absents).toEqual([]);
    expect(chemins.length).toBeGreaterThan(100);
  });
  it("chaque condition porte sur une clé déclarée", () => {
    expect(si.filter((k) => lire(contenu.cles, k.split(":")[0]) === undefined)).toEqual([]);
  });
  it("aucun texte entre crochets dans la page ni dans le contenu", () => {
    const valeurs = [];
    const parcourir = (v) => (typeof v === "string" ? valeurs.push(v) : v && typeof v === "object" && Object.values(v).forEach(parcourir));
    parcourir(contenu);
    expect(valeurs.filter((v) => v.includes("["))).toEqual([]);
    const texteDeLaPage = PAGE.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    expect(texteDeLaPage).not.toContain("[");
  });
  it("aucun texte d'attente ni faux contenu", () => {
    for (const source of [PAGE, JSON.stringify(contenu)]) {
      expect(source).not.toMatch(/À remplir|\[PRIX\]|Lorem|TODO|XXX/i);
    }
  });
  it("la page d'accueil ne charge plus la 3D", () => {
    expect(PAGE).not.toMatch(/three|edifice|votre-maquette|data-fenetre|data-maquette/);
  });
  it("les clés fournies plus tard sont vides, pas inventées", () => {
    expect(clesVides(contenu)).toEqual(expect.arrayContaining(["prix_dossier", "fondateur_nom", "telephone", "hebergement", "partenaires", "videos_metiers",
      "nb_dirigeants", "note_avis", "nb_avis", "rappel", "chiffres.entreprises_estimees", "legal.raison_sociale", "temoignages", "guides", "faq_prix"]));
  });
  it("les textes visibles qui dépendent du prix sont retirés avec lui", () => {
    // Section tarifs, lien de navigation et question « Combien ça coûte ? » : sous condition prix_dossier
    expect(PAGE).toMatch(/<section id="tarifs"[^>]*data-si="prix_dossier"/);
    expect(PAGE).toMatch(/<details data-si="prix_dossier"><summary><span data-t="questions\.liste\.6\.q">/);
    expect(estVide(lire(contenu, "tarifs.dossier_prix"))).toBe(false);
  });
});
