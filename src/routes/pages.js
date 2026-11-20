// Pages HTML du site, dans chaque langue : le fichier de public/ rempli avec src/contenu/<langue>/*.json.
// Anglais aux adresses d'origine (/cgu), français sous /fr/ (/fr/cgu). Le texte reste du vrai HTML (lisible sans
// JavaScript, indexable) ; une valeur vide retire l'élément.
//
// Attributs reconnus dans les pages :
//   data-t="chemin"                 contenu de l'élément (texte en ligne, ou paragraphes pour une liste) ;
//   data-t-html="chemin"            contenu HTML recopié tel quel (liens, <strong>… dans le texte) ;
//   data-t-attr="alt=chemin; …"     attributs ;
//   data-si="cle cle2"              élément retiré si l'une des conditions manque (« cle », « legal.rcs »,
//                                   « guides:3 » = au moins 3 entrées) ;
//   data-si-un="cle cle2"           élément retiré si toutes ces conditions manquent ;
//   data-sinon="cle"                élément retiré dès qu'une de ces conditions est remplie (contenu de repli) ;
//   data-t-json="chemin"            <script type="application/json"> : sous-arbre pour le JavaScript de la page ;
//   data-t-liste="cles.partenaires" une <li> par élément ;
//   data-langue="en"                lien du sélecteur de langue : même page dans cette langue.
// Les chemins se lisent dans l'espace de noms de la page (accueil.json pour « / »…) ; « commun.… » dans commun.json.
// La page reçoit aussi <html lang>, les balises hreflang, canonical et og:locale, et, pour son JavaScript, le
// dictionnaire <script id="i18n"> ; en français, les liens internes passent sous /fr/.
import { html, texte, lire, estVide, condition, lireAttributs, pourJs, jsonDansScript, clesVides, echapper, typographier, valeurAttribut, completer } from "../contenu/rendu.js";
import { DICTIONNAIRES, CLES, LANGUES, LANGUE_DEFAUT, decouper, adresse, langueDuCookie } from "../i18n.js";

const local = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

/** Espace de noms de chaque page (chemin sans préfixe de langue). */
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
/** Pages publiques indexables (sitemap.xml). */
export const PAGES_PUBLIQUES = ["/", "/connexion", "/cgu", "/confidentialite", "/mentions-legales"];
/** Espaces de noms dont le JavaScript du navigateur a besoin (t() de public/js/i18n.js), en plus de celui de la page.
 *  Les modules partagés de l'espace (règles, champs, questionnaire, parcours, dossier) servent à toutes ses pages. */
const POUR_JS_ESPACE = ["commun", "regles", "champs", "questionnaire", "parcours", "dossier"];
const POUR_JS = {
  accueil: ["commun", "regles", "connexion_code"],
  connexion: ["commun", "connexion_code"],
  espace: POUR_JS_ESPACE, demarrer: POUR_JS_ESPACE, valorisation: POUR_JS_ESPACE, memo: POUR_JS_ESPACE, teaser: POUR_JS_ESPACE,
};

const LOCALES_OG = { en: "en_US", fr: "fr_FR" };
const RESSOURCE = /^\/(css|js|img|fonts|video)\/|\.(?!html?$)[a-z0-9]{2,5}$/i;

/** Contenu d'une page : son espace de noms, « commun » et les réglages (« cles »). */
export function contenuDePage(espace, langue) {
  const d = DICTIONNAIRES[langue];
  if (espace === "accueil") return completer({ ...d.accueil, cles: { ...CLES, ...d.accueil.cles }, commun: d.commun, langue });
  return { ...(d[espace] || {}), commun: d.commun, cles: CLES, langue, typo: false };
}

/** Lien interne vers la même page dans la langue de la page (ressources et API inchangées). */
function lienLocal(href, langue) {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/") || RESSOURCE.test(href.split(/[?#]/)[0])) return href;
  const [chemin, reste = ""] = href.split(/(?=[?#])/);
  return adresse(decouper(chemin).chemin, langue) + reste;
}

/** Remplit une page HTML (Response) dans une langue. chemin : chemin sans préfixe ; espace : espace de noms. */
export function rendrePage(page, { url, langue, chemin, espace, statut = page.status, indexable = true }) {
  const contenu = contenuDePage(espace, langue);
  // Dictionnaire du JavaScript : sans l'espace « accueil », déjà posé dans la page (data-t-json)
  const espacesJs = [...(POUR_JS[espace] || ["commun"]), espace].filter((e) => e !== "accueil" && DICTIONNAIRES[langue][e]);
  const dictionnaireJs = Object.fromEntries(espacesJs.map((e) => [e, DICTIONNAIRES[langue][e]]));
  const absolue = (l) => url.origin + adresse(chemin, l);
  const tete = [
    `<link rel="canonical" href="${echapper(absolue(langue))}">`,
    ...LANGUES.map((l) => `<link rel="alternate" hreflang="${l}" href="${echapper(absolue(l))}">`),
    `<link rel="alternate" hreflang="x-default" href="${echapper(absolue(LANGUE_DEFAUT))}">`,
    ...LANGUES.filter((l) => l !== langue).map((l) => `<meta property="og:locale:alternate" content="${LOCALES_OG[l]}">`),
    indexable ? "" : `<meta name="robots" content="noindex">`,
    `<script type="application/json" id="i18n">${jsonDansScript(dictionnaireJs)}</script>`,
  ].filter(Boolean).join("\n  ");

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        el.setAttribute("lang", langue);
        // En développement seulement : les clés à fournir, signalées dans la console par site.js
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
        // Le contenu inséré n'est pas relu par les autres règles : ses liens internes passent ici sous /fr/.
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
  entetes.delete("etag"); // le corps diffère du fichier d'origine
  return new Response(reponse.body, { status: statut, headers: entetes });
}

const estHtml = (r) => (r.headers.get("content-type") || "").includes("text/html");

/** Toute requête GET/HEAD hors API : page dans sa langue, ressource statique, redirection ou 404 traduite. */
export async function routePage(request, env) {
  const url = new URL(request.url);
  const { langue, chemin } = decouper(url.pathname);
  // « /fr » → « /fr/ »
  if (langue !== LANGUE_DEFAUT && !url.pathname.startsWith(`${adresse("/", langue)}`)) return Response.redirect(new URL(adresse("/", langue) + url.search, url), 301);
  // Retour sur l'accueil depuis un autre site (ou en tapant l'adresse) : la langue choisie avec le sélecteur.
  if (chemin === "/" && langue === LANGUE_DEFAUT) {
    const choix = langueDuCookie(request);
    const origine = request.headers.get("referer");
    let interne = false;
    try { interne = Boolean(origine) && new URL(origine).origin === url.origin; } catch { /* en-tête invalide */ }
    if (choix && choix !== langue && !interne) return new Response(null, { status: 302, headers: { location: adresse("/", choix) + url.search, vary: "cookie" } });
  }

  const cible = new URL(chemin + url.search, url);
  const brut = await env.ASSETS.fetch(new Request(cible, { method: request.method, headers: { accept: request.headers.get("accept") || "*/*" }, redirect: "manual" }));
  // Redirection des ressources (/espace → /espace/, /cgu.html → /cgu) : rester dans la langue
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
    // Ressource statique demandée sous /fr/ : même fichier
    return brut;
  }
  const espace = PAGES[chemin] || PAGES[chemin.replace(/\.html$/, "")];
  return rendrePage(brut, { url, langue, chemin, espace: espace || "commun", indexable: !chemin.startsWith("/espace/") });
}

/** robots.txt : tout est permis sauf l'API et l'espace privé ; adresse du sitemap. */
export function routeRobots(request) {
  const url = new URL(request.url);
  const corps = ["User-agent: *", "Disallow: /api/", "Disallow: /espace/", ...LANGUES.filter((l) => l !== LANGUE_DEFAUT).map((l) => `Disallow: ${adresse("/espace/", l)}`), "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n");
  return new Response(corps, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

/** sitemap.xml : chaque page publique dans chaque langue, avec ses versions alternatives. */
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
