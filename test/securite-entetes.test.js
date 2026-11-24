// En-têtes de sécurité (audit SEC-04) et lecture des adresses fournies par l'utilisateur (audit SEC-05).
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import { politiqueContenu, avecEntetes } from "../src/lib/entetes.js";
import { fetchPublic, hoteSur, adressePublique, lireSite } from "../src/documents/site.js";

describe("en-têtes de sécurité (SEC-04)", () => {
  it("toute réponse du Worker porte CSP, nosniff, anti-cadre, Referrer-Policy et HSTS en https", async () => {
    const r = await worker.fetch(new Request("https://passation.example/api/health"), { SESSION_SECRET: "x" });
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
  });
  it("aussi sur les erreurs (route inconnue)", async () => {
    const r = await worker.fetch(new Request("https://passation.example/api/nexiste-pas"), { SESSION_SECRET: "x" });
    expect(r.status).toBe(404);
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
  it("en local (http) : ni HSTS ni upgrade-insecure-requests, qui casseraient wrangler dev", () => {
    const r = avecEntetes(new Response("x"), new URL("http://127.0.0.1:8787/"));
    expect(r.headers.has("strict-transport-security")).toBe(false);
    expect(r.headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
  });
  it("une réponse qui a déjà sa CSP (fichier servi en « default-src 'none' ») la garde", () => {
    const r = avecEntetes(new Response("x", { headers: { "content-security-policy": "default-src 'none'" } }), new URL("https://a.fr/"));
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
  });
  it("aucune page ne contient de script en ligne ni de gestionnaire onclick=\"…\" (la CSP les bloquerait)", () => {
    const pages = [];
    (function parcourir(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) parcourir(p); else if (p.endsWith(".html")) pages.push(p); } })(fileURLToPath(new URL("../public/", import.meta.url)));
    expect(pages.length).toBeGreaterThan(5);
    for (const p of pages) {
      const html = readFileSync(p, "utf8");
      for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(m[1]) || /type="application\/json"/.test(m[1])) continue;
        expect(m[2].trim(), `${p} : script en ligne`).toBe("");
      }
      expect(html, p).not.toMatch(/\son[a-z]+="/);
    }
  });
  it("la CSP n'autorise aucune source externe pour les scripts", () => {
    const script = politiqueContenu(true).split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self'");
  });
});

describe("adresses fournies par l'utilisateur (SEC-05)", () => {
  it("hôtes refusés : IP, noms locaux, ports internes, identifiants dans l'adresse", () => {
    for (const a of ["http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/", "http://localhost/", "http://0x7f000001/", "http://intranet.corp/", "http://imprimante.local/", "http://atelier-exemple.fr:8080/", "http://a:b@atelier-exemple.fr/"]) {
      expect(hoteSur(new URL(a)), a).toBe(false);
    }
    expect(hoteSur(new URL("https://www.atelier-exemple.fr/"))).toBe(true);
    expect(adressePublique("atelier-exemple.fr:3000")).toBe(null);
  });
  it("une redirection vers une adresse interne est refusée, avant toute requête vers elle", async () => {
    const f = vi.fn(async (u) => (u.startsWith("https://atelier-exemple.fr") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }) : new Response("secret")));
    await expect(fetchPublic("https://atelier-exemple.fr/logo.png", {}, f)).rejects.toThrow("adresse_refusee");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1].redirect).toBe("manual");
  });
  it("une redirection publique est suivie (http → https, sans www → www)", async () => {
    const f = vi.fn(async (u) => (u === "http://atelier-exemple.fr/" ? new Response(null, { status: 301, headers: { location: "https://www.atelier-exemple.fr/" } }) : new Response("ok")));
    const r = await fetchPublic("http://atelier-exemple.fr/", {}, f);
    expect(await r.text()).toBe("ok");
    expect(f.mock.calls.map((c) => c[0])).toEqual(["http://atelier-exemple.fr/", "https://www.atelier-exemple.fr/"]);
  });
  it("boucle de redirections : arrêt après 5", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/encore" } }));
    await expect(fetchPublic("https://atelier-exemple.fr/", {}, f)).rejects.toThrow("trop_de_redirections");
    expect(f).toHaveBeenCalledTimes(6);
  });
  it("lecture du site : l'accueil qui redirige vers une adresse interne n'est pas lu", async () => {
    const f = vi.fn(async (u) => (u.endsWith("robots.txt") ? new Response("", { status: 404 }) : new Response(null, { status: 302, headers: { location: "http://192.168.1.1/" } })));
    await expect(lireSite("atelier-exemple.fr", { fetch: f })).rejects.toThrow();
    expect(f.mock.calls.some((c) => String(c[0]).includes("192.168"))).toBe(false);
  });
});
