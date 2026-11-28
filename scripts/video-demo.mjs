// Plan B for the oral: video of the full flow, recorded locally, without Brevo or a Claude key, with a company and
// figures that are entirely fictitious (« Menuiserie Exemple », SIREN 000000018, figures of docs/DEMO.md).
//
// Usage: npm run demo:video -- [--langue fr|en] [--sortie path.webm] [--chrome path]
// Once per machine: npx playwright-core install ffmpeg (Playwright's video encoder, 1.4 MB, in its cache).
// The script:
//   1. puts the fictitious company in the cache of the local database (no call to the public APIs for it);
//   2. starts its own « wrangler dev » (port 8798) and reads the sign-in code in its terminal;
//   3. films at 1440 × 900: home page, search, sign-in, file, valuation, memorandum, teaser;
//   4. stops the server and writes the video (.webm, playable in Chrome, VLC, recent QuickTime).
// Nothing is sent to production; the file created stays in the local database (.wrangler/).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { ENTREPRISE_EXEMPLE as FICTIVE, remplirDossierExemple } from "./dossier-exemple.mjs";

const arg = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > -1 ? process.argv[i + 1] : defaut; };
const LANGUE = arg("langue", "fr");
const SORTIE = resolve(arg("sortie", `passation-demo-${LANGUE}.webm`));
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const PORT = 8798, B = `http://127.0.0.1:${PORT}`, P = LANGUE === "fr" ? "/fr" : "";
const EMAIL = `demo-${Date.now()}@exemple.fr`;

// 1. Fictitious company in the local cache (date far in the future: never expires)
const sql = `INSERT OR REPLACE INTO api_cache (key, payload_json, fetched_at) VALUES ('maquette:v2:000000018', '${JSON.stringify(FICTIVE).replace(/'/g, "''")}', 4102444800)`;
execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "passation", "--local"], { stdio: "ignore" });
execFileSync("npx", ["wrangler", "d1", "execute", "passation", "--local", "--command", sql], { stdio: "ignore" });
// Local rate limits reset (10 code requests per hour and per IP: repeated recordings would hit them)
execFileSync("npx", ["wrangler", "d1", "execute", "passation", "--local", "--command", "DELETE FROM rate_limits"], { stdio: "ignore" });

// 2. Local server; the sign-in code appears in its output (src/lib/email.js, development mode)
let journal = "";
const serveur = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"], detached: true });
serveur.stdout.on("data", (d) => { journal += d; });
serveur.stderr.on("data", (d) => { journal += d; });
const arreter = () => { try { process.kill(-serveur.pid); } catch { /* already stopped */ } };
process.on("exit", arreter);
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function code() {
  for (let i = 0; i < 30; i++) {
    const m = [...journal.matchAll(new RegExp(`${EMAIL.replace(/\./g, "\\.")} : (\\d{6})`, "g"))].at(-1);
    if (m) return m[1];
    await attendre(300);
  }
  throw new Error("code de connexion introuvable dans la sortie de wrangler dev");
}
async function defiler(page, pas = 500, pause = 450) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y <= h; y += pas) { await page.evaluate((yy) => scrollTo({ top: yy, behavior: "smooth" }), y); await attendre(pause); }
  await attendre(600);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
  await attendre(700);
}

// 3. Enregistrement
const dossierVideo = mkdtempSync(join(tmpdir(), "passation-video-"));
const navigateur = await chromium.launch({ executablePath: CHROME });
const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: dossierVideo, size: { width: 1440, height: 900 } } });
const page = await ctx.newPage();
try {
  // Home page and quick estimate
  await page.goto(`${B}${P}/`, { waitUntil: "networkidle" });
  await attendre(3500); // animation d'ouverture
  await defiler(page, 600, 500);
  const champ = page.locator('form[data-champ-siren="accueil"] input').first();
  await champ.click();
  await champ.pressSequentially("000000018", { delay: 120 });
  await champ.press("Enter");
  await page.waitForFunction(() => { const r = document.querySelector("#resultat"); return r && !r.hidden && r.innerText.trim().length > 40; }, null, { timeout: 20000 });
  await attendre(1200);
  await page.locator("#resultat").scrollIntoViewIfNeeded();
  await attendre(4000);

  // Account creation: email, then the code read in the terminal of the local server
  await page.evaluate(() => import("/js/connexion-code.js").then((m) => m.ouvrirConnexion({ siren: "000000018", mode: "creer" })));
  await attendre(800);
  await page.locator("#dialog-connexion .cx-email input[type=email]").pressSequentially(EMAIL, { delay: 45 });
  await page.locator("#dialog-connexion .cx-email button[type=submit]").click();
  await page.locator("#dialog-connexion .cx-code input").waitFor({ timeout: 15000 });
  await attendre(900);
  await page.locator("#dialog-connexion .cx-code input").pressSequentially(await code(), { delay: 180 });
  await page.waitForURL(/\/espace\//, { timeout: 15000 }).catch(async () => { await page.locator("#dialog-connexion .cx-code .btn").first().click(); await page.waitForURL(/\/espace\//, { timeout: 15000 }); });
  const id = new URL(page.url()).searchParams.get("dossier");
  const cookie = (await ctx.cookies()).find((c) => c.name === "passation_session").value;
  await attendre(2500);

  // Fictitious figures and answers of docs/DEMO.md (through the API to save time), figures approved
  const H = { origin: B, "content-type": "application/json", cookie: `passation_session=${cookie}` };
  const appel = (chemin, { methode = "GET", corps } = {}) => fetch(B + chemin, { method: methode, headers: H, body: corps ? JSON.stringify(corps) : undefined });
  await remplirDossierExemple(appel, id);

  const etapes = [
    [`${P}/espace/?dossier=${id}`, 4000],
    [`${P}/espace/valorisation/?dossier=${id}#chiffres`, 3500],
    [`${P}/espace/valorisation/?dossier=${id}#valorisation`, 5000],
    [`${P}/espace/documents/memo/?dossier=${id}`, 3500],
    [`${P}/espace/documents/teaser/?dossier=${id}`, 3500],
  ];
  for (const [url, pause] of etapes) {
    await page.goto(B + url, { waitUntil: "networkidle" });
    await attendre(pause);
    await defiler(page, 450, 650);
  }
} finally {
  await ctx.close(); // writes the video
  await navigateur.close();
  arreter();
}
const fichier = readdirSync(dossierVideo).find((f) => f.endsWith(".webm"));
renameSync(join(dossierVideo, fichier), SORTIE);
rmSync(dossierVideo, { recursive: true, force: true });
console.log(`Vidéo écrite : ${SORTIE}`);
process.exit(0);
