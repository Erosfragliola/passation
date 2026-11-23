// Reading of the company's website (for the memorandum): address given by the owner, same domain,
// 8 pages at most, robots.txt respected, no social networks or reviews. Pure functions + reading with an injectable fetch.
import { USER_AGENT } from "../config.js";

export const PAGES_MAX = 8;
const TAILLE_MAX = 1_500_000;
const MOTS_UTILES = ["propos", "qui-sommes", "quisommes", "entreprise", "societe", "histoire", "savoir", "metier", "produit", "service", "prestation", "realisation", "reference", "equipe", "valeurs", "activite", "expertise", "atelier", "fabrication", "engagement", "certification", "qualite"];
const MOTS_EXCLUS = ["contact", "mentions", "legal", "cgv", "cgu", "confidentialite", "privacy", "cookie", "panier", "cart", "compte", "login", "connexion", "recrutement", "emploi", "blog/page", "tag/", "wp-admin", "feed"];

/** Public http(s) address only (no IP, no local name). Returns a normalized URL or null. */
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

/** Useful internal links, ranked ("about", "know-how", "products"… pages first). */
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
/** Readable text of a page (without scripts, styles, menus or footers), 8,000 characters at most. */
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

/** Logo candidates: image whose name, class or alt text contains "logo", share image, icons. */
export function candidatsLogo(html, base) {
  const res = [];
  const ajouter = (src, origine) => { try { const u = new URL(src, base); if (/^https?:$/.test(u.protocol) && !res.some((r) => r.url === u.href)) res.push({ url: u.href, origine }); } catch { /* ignored */ } };
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

/** Candidate photos: large content images (no logo, icon or pictogram). */
function candidatsPhotos(html, base) {
  const res = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\s(?:data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || /^data:/i.test(src) || /logo|icon|picto|sprite|avatar|flag|badge/i.test(tag) || /\.svg(\?|$)/i.test(src)) continue;
    const l = Number(/\swidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || 0), h = Number(/\sheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || 0);
    if ((l && l < 300) || (h && h < 200)) continue;
    try { const u = new URL(src, base); if (/^https?:$/.test(u.protocol) && !res.includes(u.href)) res.push(u.href); } catch { /* ignored */ }
  }
  return [...vues.values()].sort((a, b) => b.score - a.score || a.rang - b.rang).map((x) => x.url);
}

/** robots.txt: is the path allowed for all robots ("User-agent: *")? */
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

/** Reads the home page then the most useful internal pages. @returns { pages: [{url, titre, texte}], logos, photos } */
export async function lireSite(adresse, { fetch: f = fetch } = {}) {
  const base = adressePublique(adresse);
  if (!base) throw new Error("adresse_invalide");
  let robots = "";
  try { const r = await f(new URL("/robots.txt", base), { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) }); if (r.ok) robots = (await r.text()).slice(0, 50_000); } catch { /* no robots.txt */ }
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
    } catch { /* page ignored */ }
  }
  return { url: base.href, pages, logos, photos: photos.slice(0, 16) };
}
