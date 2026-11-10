// Lecture du site internet de l'entreprise (pour le mémorandum) : adresse donnée par le dirigeant, même domaine,
// 8 pages au plus, robots.txt respecté, ni réseaux sociaux ni avis. Fonctions pures + lecture avec fetch injectable.
import { USER_AGENT } from "../config.js";

export const PAGES_MAX = 8;
const TAILLE_MAX = 1_500_000;
const MOTS_UTILES = ["propos", "qui-sommes", "quisommes", "entreprise", "societe", "histoire", "savoir", "metier", "produit", "service", "prestation", "realisation", "reference", "equipe", "valeurs", "activite", "expertise", "atelier", "fabrication", "engagement", "certification", "qualite"];
const MOTS_EXCLUS = ["contact", "mentions", "legal", "cgv", "cgu", "confidentialite", "privacy", "cookie", "panier", "cart", "compte", "login", "connexion", "recrutement", "emploi", "blog/page", "tag/", "wp-admin", "feed"];

/** Adresse http(s) publique uniquement (pas d'IP, pas de nom local). Renvoie un URL normalisé ou null. */
export function adressePublique(brut) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(String(brut).trim()) ? String(brut).trim() : `https://${String(brut).trim()}`); } catch { return null; }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost") return null;
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

/** Photos candidates : grandes images de contenu (ni logo, ni icône, ni pictogramme). */
export function candidatsPhotos(html, base) {
  const res = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\s(?:data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || /^data:/i.test(src) || /logo|icon|picto|sprite|avatar|flag|badge/i.test(tag) || /\.svg(\?|$)/i.test(src)) continue;
    const l = Number(/\swidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || 0), h = Number(/\sheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || 0);
    if ((l && l < 300) || (h && h < 200)) continue;
    try { const u = new URL(src, base); if (/^https?:$/.test(u.protocol) && !res.includes(u.href)) res.push(u.href); } catch { /* ignoré */ }
  }
  return res;
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

async function lire(url, f) {
  const r = await f(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
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
  try { const r = await f(new URL("/robots.txt", base), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) }); if (r.ok) robots = (await r.text()).slice(0, 50_000); } catch { /* pas de robots.txt */ }
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
      if (html) { pages.push({ url, ...texteDepuisHtml(html) }); for (const p of candidatsPhotos(html, new URL(url))) if (!photos.includes(p)) photos.push(p); }
    } catch { /* page ignorée */ }
  }
  return { url: base.href, pages, logos, photos: photos.slice(0, 16) };
}
