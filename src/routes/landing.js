// GET / : la page d'accueil (public/index.html) remplie avec src/contenu/landing.json.
// Le texte reste du vrai HTML (lisible sans JavaScript, indexable) ; une valeur vide retire l'élément.
//
// Attributs reconnus dans index.html :
//   data-t="chemin"                 contenu de l'élément (texte en ligne, ou paragraphes pour une liste) ;
//   data-t-attr="alt=chemin; …"     attributs ;
//   data-si="cle cle2"              élément retiré si l'une des clés (de « cles ») est vide ;
//   data-si-un="cle cle2"           élément retiré si toutes ces clés sont vides ;
//   data-t-json="chemin"            <script type="application/json"> : sous-arbre pour le JavaScript de la page ;
//   data-t-liste="cles.partenaires" une <li> par élément.
import contenu from "../contenu/landing.json";
import { html, texte, lire, estVide, lireAttributs, pourJs, jsonDansScript, clesVides, echapper, typographier } from "../contenu/rendu.js";

const local = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

export async function routeLanding(request, env) {
  const url = new URL(request.url);
  // Fichier d'origine demandé sans en-têtes conditionnels (le corps servi diffère du fichier)
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
  if (!page.ok || !(page.headers.get("content-type") || "").includes("text/html")) return page;

  const rewriter = new HTMLRewriter()
    .on("[data-t]", {
      element(el) {
        const chemin = el.getAttribute("data-t");
        el.removeAttribute("data-t");
        const h = html(contenu, chemin);
        if (h == null) { el.remove(); return; }
        el.setInnerContent(h, { html: true });
      },
    })
    .on("[data-t-attr]", {
      element(el) {
        for (const [attr, chemin] of lireAttributs(el.getAttribute("data-t-attr"))) {
          const t = texte(contenu, chemin);
          if (t == null) el.removeAttribute(attr); else el.setAttribute(attr, t.replace(/"/g, "”"));
        }
        el.removeAttribute("data-t-attr");
      },
    })
    .on("[data-si]", {
      element(el) {
        const cles = el.getAttribute("data-si").split(/\s+/).filter(Boolean);
        el.removeAttribute("data-si");
        if (cles.some((k) => estVide(contenu.cles[k]))) el.remove();
      },
    })
    .on("[data-si-un]", {
      element(el) {
        const cles = el.getAttribute("data-si-un").split(/\s+/).filter(Boolean);
        el.removeAttribute("data-si-un");
        if (cles.every((k) => estVide(contenu.cles[k]))) el.remove();
      },
    })
    .on("[data-t-liste]", {
      element(el) {
        const chemin = el.getAttribute("data-t-liste");
        el.removeAttribute("data-t-liste");
        const v = lire(contenu, chemin);
        if (estVide(v)) { el.remove(); return; }
        el.setInnerContent(v.filter((x) => !estVide(x)).map((x) => `<li>${echapper(typographier(x))}</li>`).join(""), { html: true });
      },
    })
    .on("script[data-t-json]", {
      element(el) {
        const chemin = el.getAttribute("data-t-json");
        el.removeAttribute("data-t-json");
        el.setInnerContent(jsonDansScript(pourJs(contenu, chemin)), { html: true });
      },
    })
    .on("html", {
      element(el) {
        // En développement seulement : les clés à fournir, signalées dans la console par site.js
        if (local(url)) el.setAttribute("data-contenu-manquant", clesVides(contenu).join(" "));
      },
    });

  const reponse = rewriter.transform(page);
  if (local(url)) {
    const vides = clesVides(contenu);
    if (vides.length) console.warn(`Contenu de la page d'accueil à fournir : ${vides.join(", ")}`);
  }
  const entetes = new Headers(reponse.headers);
  entetes.set("cache-control", "public, max-age=0, must-revalidate");
  entetes.delete("etag"); // le corps diffère du fichier d'origine
  return new Response(reponse.body, { status: reponse.status, headers: entetes });
}
