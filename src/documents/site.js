// Lecture du site internet de l'entreprise (pour le mémorandum) : adresse donnée par le dirigeant, même domaine,
// 8 pages au plus, robots.txt respecté, ni réseaux sociaux ni avis. Fonctions pures + lecture avec fetch injectable.
import { USER_AGENT, PHOTOS } from "../config.js";
import { dimensionsImage, empreinte, raisonEcartPhoto } from "./images.js";

export const PAGES_MAX = 8;
const TAILLE_MAX = 1_500_000;
const MOTS_UTILES = ["propos", "qui-sommes", "quisommes", "entreprise", "societe", "histoire", "savoir", "metier", "produit", "service", "prestation", "realisation", "reference", "equipe", "valeurs", "activite", "expertise", "atelier", "fabrication", "engagement", "certification", "qualite"];
const MOTS_EXCLUS = ["contact", "mentions", "legal", "cgv", "cgu", "confidentialite", "privacy", "cookie", "panier", "cart", "compte", "login", "connexion", "recrutement", "emploi", "blog/page", "tag/", "wp-admin", "feed"];

/** Hôte joignable sans risque : nom de domaine public en http(s), port standard (ni IP, ni nom local, ni port
 *  interne). Contrôle repris à chaque redirection (fetchPublic). */
export function hoteSur(u) {
  if (!["http:", "https:"].includes(u.protocol)) return false;
  if (u.username || u.password) return false;
  if (u.port && !["80", "443"].includes(u.port)) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || /^[\d.]+$/.test(h) || /^0x/i.test(h) || h.includes(":") || h.startsWith("[")) return false;
  if (h === "localhost" || /\.(local|internal|localhost|lan|home|intranet|corp)$/.test(h)) return false;
  return true;
}

/** Adresse http(s) publique uniquement (pas d'IP, pas de nom local). Renvoie un URL normalisé ou null. */
export function adressePublique(brut) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(String(brut).trim()) ? String(brut).trim() : `https://${String(brut).trim()}`); } catch { return null; }
  if (!hoteSur(u)) return null;
  const h = u.hostname.toLowerCase();
  if (/(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|google|societe|pappers|infogreffe)\.[a-z]+$/.test(h)) return null;
  u.hash = "";
  return u;
}

const domaine = (h) => h.replace(/^www\./, "");

/** Liens internes utiles, classés (pages « à propos », « savoir-faire », « produits »… d'abord). */
export function liensInternes(html, base) {
  const vus = new Set(), liste = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(m[1], base); } catch { continue; }
    if (!["http:", "https:"].includes(u.protocol) || domaine(u.hostname) !== domaine(base.hostname)) continue;
    u.hash = ""; u.search = "";
    const cle = u.href.replace(/\/$/, "");
    if (vus.has(cle) || cle === base.href.replace(/\/$/, "")) continue;
    const chemin = (u.pathname + " " + m[2].replace(/<[^>]+>/g, " ")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (MOTS_EXCLUS.some((x) => chemin.includes(x)) || /\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    vus.add(cle);
    liste.push({ url: u.href, score: MOTS_UTILES.filter((x) => chemin.includes(x)).length });
  }
  return liste.sort((a, b) => b.score - a.score).map((x) => x.url);
}

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç", ocirc: "ô", ucirc: "û", icirc: "î", rsquo: "’", laquo: "«", raquo: "»" };
/** Texte lisible d'une page (sans scripts, styles, menus ni pieds de page), 8 000 caractères au plus. */
export function texteDepuisHtml(html) {
  const titre = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").trim();
  const t = html
    .replace(/<(script|style|noscript|svg|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (_, e) => (e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : ENTITES[e.toLowerCase()] ?? " "))
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  return { titre, texte: t.slice(0, 8000) };
}

/** Candidats logo : image dont le nom, la classe ou le texte alternatif contient « logo », image de partage, icônes. */
export function candidatsLogo(html, base) {
  const res = [];
  const ajouter = (src, origine) => { try { const u = new URL(src, base); if (/^https?:$/.test(u.protocol) && !res.some((r) => r.url === u.href)) res.push({ url: u.href, origine }); } catch { /* ignoré */ } };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/logo/i.test(tag)) { const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]; if (src && !/^data:/i.test(src)) ajouter(src, "image « logo » de la page"); }
  }
  const og = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html) || /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i.exec(html);
  if (og) ajouter(og[1], "image de partage");
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*(apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    if (href && !/^data:/i.test(href)) ajouter(href, "icône du site");
  }
  return res.slice(0, 6);
}

export const PHOTO_LARGEUR_MIN = 600;
const PHOTO_ALLONGEMENT_MAX = 3; // largeur / hauteur au-delà : bandeau
const MOTS_PHOTO = /atelier|workshop|realisation|réalisation|chantier|projet|project|equipe|équipe|team|production|fabrication|usine|factory|savoir|metier|métier|travaux|portfolio|galerie|gallery/i;
/** Clé de doublon d'une image : même fichier en plusieurs tailles (« photo-300x200.jpg », « photo@2x.jpg »,
 *  « photo.jpg?w=800 ») → même clé. */
export function cleImage(u) {
  const p = new URL(u).pathname.toLowerCase();
  return p.replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w+$)/, "").replace(/@\d(\.\d)?x(?=\.\w+$)/, "").replace(/[-_](scaled|large|medium|small|thumb|thumbnail)(?=\.\w+$)/, "");
}
/** Plus grande image d'un srcset : « a.jpg 300w, b.jpg 1200w » → { url: "b.jpg", largeur: 1200 }. */
function plusGrandSrcset(srcset) {
  let mieux = null;
  for (const part of String(srcset).split(",")) {
    const [url, d] = part.trim().split(/\s+/);
    const l = /^(\d+)w$/.exec(d || "")?.[1];
    if (url && (!mieux || Number(l || 0) > mieux.largeur)) mieux = { url, largeur: Number(l || 0) };
  }
  return mieux;
}
/**
 * Photos candidates : vraies photos de contenu (atelier, réalisations, équipe). Écartées : SVG et images en data:,
 * logos, icônes, pictogrammes ; largeur connue < 600 px ; bandeaux (largeur / hauteur > 3) ; doublons (même fichier
 * en plusieurs tailles : on garde la plus grande). Classées : nom, texte alternatif ou classe évoquant l'atelier, les
 * réalisations ou l'équipe d'abord, puis l'ordre de la page.
 */
export function candidatsPhotos(html, base) {
  const vues = new Map();
  let rang = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (nom) => new RegExp(`\\s${nom}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];
    const srcset = attr("data-srcset") || attr("srcset");
    const grand = srcset ? plusGrandSrcset(srcset) : null;
    const src = grand?.url || attr("data-src") || attr("src");
    if (!src || /^data:/i.test(src) || /logo|icon|picto|sprite|avatar|flag|badge|emoji|spinner|loader|placeholder/i.test(tag) || /\.svg(\?|#|$)/i.test(src)) continue;
    const l = Number(attr("width") || 0) || grand?.largeur || 0, h = Number(attr("height") || 0);
    if (l && l < PHOTO_LARGEUR_MIN) continue;
    if (l && h && l / h > PHOTO_ALLONGEMENT_MAX) continue;
    let u;
    try { u = new URL(src, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const cle = cleImage(u.href);
    const score = MOTS_PHOTO.test(`${u.pathname} ${attr("alt") || ""} ${attr("class") || ""} ${attr("title") || ""}`) ? 1 : 0;
    const avant = vues.get(cle);
    if (avant) { if (l > avant.largeur) Object.assign(avant, { url: u.href, largeur: l }); avant.score = Math.max(avant.score, score); continue; }
    vues.set(cle, { url: u.href, largeur: l, score, rang: rang++ });
  }
  return [...vues.values()].sort((a, b) => b.score - a.score || a.rang - b.rang).map((x) => x.url);
}

/** robots.txt : le chemin est-il autorisé pour tous les robots (« User-agent: * ») ? */
export function robotsAutorise(robots, chemin) {
  if (!robots) return true;
  let actif = false;
  const interdits = [], autorises = [];
  for (const brut of robots.split(/\r?\n/)) {
    const l = brut.replace(/#.*/, "").trim();
    const [k, ...v] = l.split(":");
    const cle = k?.trim().toLowerCase(), val = v.join(":").trim();
    if (cle === "user-agent") actif = val === "*";
    else if (actif && cle === "disallow" && val) interdits.push(val);
    else if (actif && cle === "allow" && val) autorises.push(val);
  }
  const plusLong = (l) => Math.max(-1, ...l.filter((p) => chemin.startsWith(p)).map((p) => p.length));
  return plusLong(autorises) >= plusLong(interdits);
}

export const REDIRECTIONS_MAX = 5;
/** fetch d'une adresse fournie par l'utilisateur (audit SEC-05) : les redirections sont suivies ici, une à une, et
 *  chaque nouvelle adresse doit passer hoteSur ; sinon erreur « adresse_refusee ». Le moteur Workers ne joint pas le
 *  réseau privé de Cloudflare ; ce contrôle empêche en plus qu'une redirection vise une IP ou un nom interne. */
export async function fetchPublic(url, options = {}, f = fetch) {
  let u = new URL(url);
  for (let i = 0; i <= REDIRECTIONS_MAX; i++) {
    if (!hoteSur(u)) throw new Error("adresse_refusee");
    const r = await f(u.href, { ...options, redirect: "manual" });
    const vers = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!vers) return r;
    u = new URL(vers, u);
  }
  throw new Error("trop_de_redirections");
}

async function lire(url, f) {
  const r = await fetchPublic(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(10_000) }, f);
  if (!r.ok) return null;
  if (!/text\/html|application\/xhtml/i.test(r.headers.get("content-type") || "")) return null;
  const texte = await r.text();
  return texte.length > TAILLE_MAX ? texte.slice(0, TAILLE_MAX) : texte;
}

/** Lit l'accueil puis les pages internes les plus utiles. @returns { pages: [{url, titre, texte}], logos, photos } */
export async function lireSite(adresse, { fetch: f = fetch } = {}) {
  const base = adressePublique(adresse);
  if (!base) throw new Error("adresse_invalide");
  let robots = "";
  try { const r = await fetchPublic(new URL("/robots.txt", base), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) }, f); if (r.ok) robots = (await r.text()).slice(0, 50_000); } catch { /* pas de robots.txt */ }
  if (!robotsAutorise(robots, base.pathname || "/")) throw new Error("robots_refuse");
  const accueil = await lire(base.href, f);
  if (!accueil) throw new Error("site_injoignable");
  const pages = [{ url: base.href, ...texteDepuisHtml(accueil) }];
  const logos = candidatsLogo(accueil, base);
  const photos = candidatsPhotos(accueil, base);
  for (const url of liensInternes(accueil, base)) {
    if (pages.length >= PAGES_MAX) break;
    if (!robotsAutorise(robots, new URL(url).pathname)) continue;
    try {
      const html = await lire(url, f);
      if (html) { pages.push({ url, ...texteDepuisHtml(html) }); for (const p of candidatsPhotos(html, new URL(url))) if (!photos.some((x) => cleImage(x) === cleImage(p))) photos.push(p); }
    } catch { /* page ignorée */ }
  }
  const mesure = await mesurerPhotos(photos.slice(0, PHOTOS.site.mesureesMax), f);
  return { url: base.href, pages, logos, photos: mesure.photos, photos_ecartees: mesure.ecartees };
}

/**
 * Filtre des photos du site par leurs vraies dimensions, même quand la page ne les donne pas : chaque candidate est
 * téléchargée (3 Mo et 6 secondes au plus), sa taille lue dans l'en-tête, son empreinte calculée. Écartées : format
 * non reconnu (SVG, GIF…), petite image (pictogramme), bandeau allongé, doublon (même fichier sous deux adresses).
 * Une image injoignable est écartée aussi : elle ne pourrait pas être ajoutée au mémorandum.
 * @returns { photos: [url], ecartees: [{ url, raison }] }
 */
export async function mesurerPhotos(urls, f = fetch) {
  const lues = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetchPublic(url, { headers: { "user-agent": USER_AGENT, accept: "image/*" }, signal: AbortSignal.timeout(6000) }, f);
      if (!r.ok || Number(r.headers.get("content-length") || 0) > PHOTOS.poidsMax) return { url, raison: "injoignable" };
      const octets = new Uint8Array(await r.arrayBuffer());
      if (octets.length > PHOTOS.poidsMax) return { url, raison: "injoignable" };
      const raison = raisonEcartPhoto(dimensionsImage(octets), PHOTOS.site);
      return raison ? { url, raison } : { url, cle: await empreinte(octets) };
    } catch { return { url, raison: "injoignable" }; }
  }));
  const vues = new Set(), photos = [], ecartees = [];
  for (const x of lues) {
    if (x.raison) { ecartees.push({ url: x.url, raison: x.raison }); continue; }
    if (vues.has(x.cle)) { ecartees.push({ url: x.url, raison: "doublon" }); continue; }
    vues.add(x.cle); photos.push(x.url);
  }
  return { photos: photos.slice(0, PHOTOS.site.retenuesMax), ecartees };
}
