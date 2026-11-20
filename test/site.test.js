import { describe, it, expect, vi } from "vitest";
import { adressePublique, liensInternes, texteDepuisHtml, candidatsLogo, robotsAutorise, lireSite, PAGES_MAX } from "../src/documents/site.js";

const ACCUEIL = `<html><head><title>Atelier Exemple</title><meta property="og:image" content="/img/partage.jpg"><link rel="icon" href="/favicon.png"></head>
<body><header><img src="/img/logo-atelier.png" alt="Logo Atelier"></header><nav><a href="/">Accueil</a></nav>
<h1>Bienvenue</h1><p>Fabricant de meubles depuis 1980 &amp; artisans.</p><script>alert(1)</script>
<a href="/a-propos">Qui sommes-nous</a><a href="/contact">Contact</a><a href="https://facebook.com/x">FB</a>
<a href="/nos-produits">Produits</a><a href="/blog/article-1">Article</a><a href="/catalogue.pdf">PDF</a><a href="https://autre.fr/page">Ailleurs</a></body></html>`;

describe("website reading: rules", () => {
  it("public address only", () => {
    expect(adressePublique("atelier-exemple.fr")?.href).toBe("https://atelier-exemple.fr/");
    for (const a of ["http://127.0.0.1", "localhost", "ftp://x.fr", "https://www.facebook.com/atelier", "http://[::1]/", "intranet"]) expect(adressePublique(a)).toBeNull();
  });
  it("useful internal links first; contact, PDF, other domains excluded", () => {
    const l = liensInternes(ACCUEIL, new URL("https://atelier-exemple.fr/"));
    expect(l.slice(0, 2)).toEqual(expect.arrayContaining(["https://atelier-exemple.fr/a-propos", "https://atelier-exemple.fr/nos-produits"]));
    expect(l.join(" ")).not.toMatch(/contact|\.pdf|facebook|autre\.fr/);
  });
  it("text without scripts or menus, entities decoded", () => {
    const t = texteDepuisHtml(ACCUEIL);
    expect(t.titre).toBe("Atelier Exemple");
    expect(t.texte).toContain("Fabricant de meubles depuis 1980 & artisans.");
    expect(t.texte).not.toMatch(/alert|Accueil/);
  });
  it('logo candidates: "logo" image, share image, icon', () => {
    expect(candidatsLogo(ACCUEIL, new URL("https://atelier-exemple.fr/")).map((c) => c.url)).toEqual([
      "https://atelier-exemple.fr/img/logo-atelier.png", "https://atelier-exemple.fr/img/partage.jpg", "https://atelier-exemple.fr/favicon.png"]);
  });
  it("robots.txt respected (most specific rule)", () => {
    const r = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /prive\nAllow: /prive/public";
    expect(robotsAutorise(r, "/a-propos")).toBe(true);
    expect(robotsAutorise(r, "/prive/x")).toBe(false);
    expect(robotsAutorise(r, "/prive/public/y")).toBe(true);
    expect(robotsAutorise("User-agent: *\nDisallow: /", "/")).toBe(false);
  });
  it(`reading: ${PAGES_MAX} pages at most, pages disallowed by robots.txt ignored`, async () => {
    const liens = Array.from({ length: 12 }, (_, i) => `<a href="/page-produit-${i}">P${i}</a>`).join("");
    const f = vi.fn(async (u) => {
      const url = String(u);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /page-produit-1", { status: 200 });
      return new Response(`<html><title>${url}</title><body><p>Texte</p>${url.endsWith("fr/") ? liens : ""}</body></html>`, { headers: { "content-type": "text/html" } });
    });
    const r = await lireSite("atelier-exemple.fr", { fetch: f });
    expect(r.pages).toHaveLength(PAGES_MAX);
    expect(r.pages.map((p) => p.url)).not.toContain("https://atelier-exemple.fr/page-produit-1");
  });
  it("website entirely disallowed for robots: refusal", async () => {
    const f = async (u) => (String(u).endsWith("robots.txt") ? new Response("User-agent: *\nDisallow: /") : new Response("<p>x</p>", { headers: { "content-type": "text/html" } }));
    await expect(lireSite("atelier-exemple.fr", { fetch: f })).rejects.toThrow("robots_refuse");
  });
});
