// HTML pages of the site, in each language: the file from public/ filled with src/contenu/<language>/*.json.
// English at the original addresses (/cgu), French under /fr/ (/fr/cgu). The text stays real HTML (readable without
// JavaScript, indexable); an empty value removes the element.
//
// Attributes recognized in the pages:
//   data-t="chemin"                 content of the element (inline text, or paragraphs for a list);
//   data-t-html="chemin"            HTML content copied as is (links, <strong>… in the text);
//   data-t-attr="alt=chemin; …"     attributes;
//   data-si="cle cle2"              element removed if one of the conditions is missing ("cle", "legal.rcs",
//                                   "guides:3" = at least 3 entries);
//   data-si-un="cle cle2"           element removed if all these conditions are missing;
//   data-sinon="cle"                element removed as soon as one of these conditions is met (fallback content);
//   data-t-json="chemin"            <script type="application/json">: subtree for the page's JavaScript;
//   data-t-liste="cles.partenaires" one <li> per element;
//   data-langue="en"                link of the language switcher: same page in that language.
// Paths are read in the page's namespace (accueil.json for "/"…); "commun.…" in commun.json.
// The page also receives <html lang>, the hreflang, canonical and og:locale tags, and, for its JavaScript, the
// <script id="i18n"> dictionary; in French, internal links move under /fr/.
import { html, texte, lire, estVide, condition, lireAttributs, pourJs, jsonDansScript, clesVides, echapper, typographier, valeurAttribut, completer } from "../contenu/rendu.js";
import { DICTIONNAIRES, CLES, LANGUES, LANGUE_DEFAUT, decouper, adresse, langueDuCookie } from "../i18n.js";

const local = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

/** Namespace of each page (path without the language prefix). */
export const PAGES = {
  "/": "accueil",
  "/connexion": "connexion",
  "/cgu": "cgu",
  "/confidentialite": "confidentialite",
  "/mentions-legales": "mentions_legales",
  "/estimation": "estimation",
  "/espace/": "espace",
  "/espace/demarrer/": "demarrer",
  "/espace/valorisation/": "valorisation",
  "/espace/documents/memo/": "memo",
  "/espace/documents/teaser/": "teaser",
};
/** Indexable public pages (sitemap.xml). */
export const PAGES_PUBLIQUES = ["/", "/connexion", "/cgu", "/confidentialite", "/mentions-legales"];
/** Namespaces the browser's JavaScript needs (t() from public/js/i18n.js), in addition to the page's own.
 *  The pages of the owner's space share their modules and some texts: each receives all the namespaces of the space. */
const POUR_JS_ESPACE = ["commun", "regles", "champs", "questionnaire", "parcours", "dossier", "espace", "demarrer", "valorisation", "memo", "teaser"];
const POUR_JS = {
  accueil: ["commun", "regles", "connexion_code"],
  connexion: ["commun", "connexion_code"],
  espace: POUR_JS_ESPACE, demarrer: POUR_JS_ESPACE, valorisation: POUR_JS_ESPACE, memo: POUR_JS_ESPACE, teaser: POUR_JS_ESPACE,
};

const LOCALES_OG = { en: "en_US", fr: "fr_FR" };
const RESSOURCE = /^\/(css|js|img|fonts|video)\/|\.(?!html?$)[a-z0-9]{2,5}$/i;

/** Content of a page: its namespace, "commun" and the settings ("cles"). */
export function contenuDePage(espace, langue) {
  const d = DICTIONNAIRES[langue];
  if (espace === "accueil") return completer({ ...d.accueil, cles: { ...CLES, ...d.accueil.cles }, commun: d.commun, langue });
  return { ...(d[espace] || {}), commun: d.commun, cles: CLES, langue, typo: false };
}

/** Internal link to the same page in the page's language (resources and API unchanged). */
function lienLocal(href, langue) {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/") || RESSOURCE.test(href.split(/[?#]/)[0])) return href;
  const [chemin, reste = ""] = href.split(/(?=[?#])/);
  return adresse(decouper(chemin).chemin, langue) + reste;
}

/** Fills an HTML page (Response) in a language. chemin: path without prefix; espace: namespace. */
export function rendrePage(page, { url, langue, chemin, espace, statut = page.status, indexable = true }) {
  const contenu = contenuDePage(espace, langue);
  // JavaScript dictionary: without the "accueil" namespace, already placed in the page (data-t-json)
  const espacesJs = [...(POUR_JS[espace] || ["commun"]), espace].filter((e) => e !== "accueil" && DICTIONNAIRES[langue][e]);
  const dictionnaireJs = Object.fromEntries(espacesJs.map((e) => [e, DICTIONNAIRES[langue][e]]));
  const absolue = (l) => url.origin + adresse(chemin, l);
  const tete = [
    `<link rel="canonical" href="${echapper(absolue(langue))}">`,
    ...LANGUES.map((l) => `<link rel="alternate" hreflang="${l}" href="${echapper(absolue(l))}">`),
    `<link rel="alternate" hreflang="x-default" href="${echapper(absolue(LANGUE_DEFAUT))}">`,
    ...LANGUES.filter((l) => l !== langue).map((l) => `<meta property="og:locale:alternate" content="${LOCALES_OG[l]}">`),
    indexable ? `<meta property="og:url" content="${echapper(absolue(langue))}">` : `<meta name="robots" content="noindex">`,
    `<script type="application/json" id="i18n">${jsonDansScript(dictionnaireJs)}</script>`,
  ].filter(Boolean).join("\n  ");

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        el.setAttribute("lang", langue);
        // In development only: the keys to provide, reported in the console by site.js
        if (espace === "accueil" && local(url)) el.setAttribute("data-contenu-manquant", clesVides(contenu).join(" "));
      },
    })
    .on("head", { element(el) { el.append(`  ${tete}\n`, { html: true }); } })
    .on('meta[property="og:locale"]', { element(el) { el.setAttribute("content", LOCALES_OG[langue]); } })
    .on("[data-t]", {
      element(el) {
        const chemin = el.getAttribute("data-t");
        el.removeAttribute("data-t");
        const h = html(contenu, chemin);
        if (h == null) { el.remove(); return; }
        el.setInnerContent(h, { html: true });
      },
    })
    .on("[data-t-html]", {
      element(el) {
        const v = lire(contenu, el.getAttribute("data-t-html"));
        el.removeAttribute("data-t-html");
        if (estVide(v)) { el.remove(); return; }
        // The inserted content is not reread by the other rules: its internal links move under /fr/ here.
        const h = langue === LANGUE_DEFAUT ? String(v) : String(v).replace(/(\shref=")([^"]*)"/g, (m, a, href) => `${a}${lienLocal(href, langue)}"`);
        el.setInnerContent(h, { html: true });
      },
    })
    .on("[data-t-attr]", {
      element(el) {
        for (const [attr, chemin] of lireAttributs(el.getAttribute("data-t-attr"))) {
          const t = texte(contenu, chemin);
          if (t == null) el.removeAttribute(attr); else el.setAttribute(attr, valeurAttribut(attr, t));
        }
        el.removeAttribute("data-t-attr");
      },
    })
    .on("[data-si]", {
      element(el) {
        const cles = el.getAttribute("data-si").split(/\s+/).filter(Boolean);
        el.removeAttribute("data-si");
        if (!cles.every((k) => condition(contenu.cles, k))) el.remove();
      },
    })
    .on("[data-si-un]", {
      element(el) {
        const cles = el.getAttribute("data-si-un").split(/\s+/).filter(Boolean);
        el.removeAttribute("data-si-un");
        if (!cles.some((k) => condition(contenu.cles, k))) el.remove();
      },
    })
    .on("[data-sinon]", {
      element(el) {
        const cles = el.getAttribute("data-sinon").split(/\s+/).filter(Boolean);
        el.removeAttribute("data-sinon");
        if (cles.some((k) => condition(contenu.cles, k))) el.remove();
      },
    })
    .on("[data-t-liste]", {
      element(el) {
        const chemin = el.getAttribute("data-t-liste");
        el.removeAttribute("data-t-liste");
        const v = lire(contenu, chemin);
        if (estVide(v)) { el.remove(); return; }
        el.setInnerContent(v.filter((x) => !estVide(x)).map((x) => `<li>${echapper(typographier(x, contenu.typo === false ? false : langue))}</li>`).join(""), { html: true });
      },
    })
    .on("script[data-t-json]", {
      element(el) {
        const chemin = el.getAttribute("data-t-json");
        el.removeAttribute("data-t-json");
        el.setInnerContent(jsonDansScript(pourJs(contenu, chemin)), { html: true });
      },
    })
    .on("a[data-langue]", {
      element(el) {
        const l = el.getAttribute("data-langue");
        el.setAttribute("href", adresse(chemin, l) + url.search);
        if (l === langue) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current");
      },
    });
  if (langue !== LANGUE_DEFAUT) {
    rewriter
      .on("a[href]:not([data-langue])", { element(el) { el.setAttribute("href", lienLocal(el.getAttribute("href"), langue)); } })
      .on("form[action]", { element(el) { el.setAttribute("action", lienLocal(el.getAttribute("action"), langue)); } });
  }

  const reponse = rewriter.transform(page);
  if (espace === "accueil" && local(url)) {
    const vides = clesVides(contenu);
    if (vides.length) console.warn(`Contenu de la page d'accueil à fournir : ${vides.join(", ")}`);
  }
  const entetes = new Headers(reponse.headers);
  entetes.set("cache-control", "public, max-age=0, must-revalidate");
  entetes.set("content-language", langue);
  entetes.delete("etag"); // the body differs from the original file
  return new Response(reponse.body, { status: statut, headers: entetes });
}

const estHtml = (r) => (r.headers.get("content-type") || "").includes("text/html");

/** Any GET/HEAD request outside the API: page in its language, static resource, redirect or translated 404. */
export async function routePage(request, env) {
  const url = new URL(request.url);
  const { langue, chemin } = decouper(url.pathname);
  // « /fr » → « /fr/ »
  if (langue !== LANGUE_DEFAUT && !url.pathname.startsWith(`${adresse("/", langue)}`)) return Response.redirect(new URL(adresse("/", langue) + url.search, url), 301);
  // Back to the home page from another site (or by typing the address): the language chosen with the switcher.
  if (chemin === "/" && langue === LANGUE_DEFAUT) {
    const choix = langueDuCookie(request);
    const origine = request.headers.get("referer");
    let interne = false;
    try { interne = Boolean(origine) && new URL(origine).origin === url.origin; } catch { /* invalid header */ }
    if (choix && choix !== langue && !interne) return new Response(null, { status: 302, headers: { location: adresse("/", choix) + url.search, vary: "cookie" } });
  }

  const cible = new URL(chemin + url.search, url);
  const brut = await env.ASSETS.fetch(new Request(cible, { method: request.method, headers: { accept: request.headers.get("accept") || "*/*" }, redirect: "manual" }));
  // Redirect of resources (/espace → /espace/, /cgu.html → /cgu): stay in the language
  if (brut.status >= 300 && brut.status < 400 && brut.headers.get("location")) {
    const vers = new URL(brut.headers.get("location"), cible);
    return new Response(null, { status: brut.status, headers: { location: lienLocal(vers.pathname, langue) + vers.search } });
  }
  if (brut.status === 404) {
    const page = await env.ASSETS.fetch(new Request(new URL("/404", url), { method: "GET" }));
    if (!page.ok) return new Response("Not found", { status: 404 });
    return rendrePage(page, { url, langue, chemin, espace: "erreur_404", statut: 404, indexable: false });
  }
  if (!brut.ok || !estHtml(brut)) {
    // Static resource requested under /fr/: same file
    return brut;
  }
  const espace = PAGES[chemin] || PAGES[chemin.replace(/\.html$/, "")];
  return rendrePage(brut, { url, langue, chemin, espace: espace || "commun", indexable: !chemin.startsWith("/espace/") });
}

/** robots.txt: everything is allowed except the API and the private space; address of the sitemap. */
export function routeRobots(request) {
  const url = new URL(request.url);
  const corps = ["User-agent: *", "Disallow: /api/", "Disallow: /espace/", ...LANGUES.filter((l) => l !== LANGUE_DEFAUT).map((l) => `Disallow: ${adresse("/espace/", l)}`), "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n");
  return new Response(corps, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

/** sitemap.xml: each public page in each language, with its alternate versions. */
export function routeSitemap(request) {
  const url = new URL(request.url);
  const abs = (chemin, l) => echapper(url.origin + adresse(chemin, l));
  const entrees = PAGES_PUBLIQUES.flatMap((chemin) => LANGUES.map((l) => [
    "  <url>",
    `    <loc>${abs(chemin, l)}</loc>`,
    ...LANGUES.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${abs(chemin, a)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(chemin, LANGUE_DEFAUT)}"/>`,
    "  </url>",
  ].join("\n")));
  const corps = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entrees.join("\n")}\n</urlset>\n`;
  return new Response(corps, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
