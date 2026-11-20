// Plan B de la soutenance : vidéo du parcours complet, enregistrée en local, sans Brevo ni clé Claude, avec une
// entreprise et des chiffres entièrement fictifs (« Menuiserie Exemple », SIREN 000000018, chiffres de docs/DEMO.md).
//
// Usage : npm run demo:video -- [--langue fr|en] [--sortie chemin.webm] [--chrome chemin]
// Une fois par machine : npx playwright-core install ffmpeg (encodeur vidéo de Playwright, 1,4 Mo, dans son cache).
// Le script :
//   1. place l'entreprise fictive dans le cache de la base locale (aucun appel aux API publiques pour elle) ;
//   2. lance son propre « wrangler dev » (port 8798) et lit le code de connexion dans son terminal ;
//   3. filme en 1440 × 900 : accueil, recherche, connexion, dossier, valorisation, mémorandum, teaser ;
//   4. arrête le serveur et écrit la vidéo (.webm, lisible dans Chrome, VLC, QuickTime récent).
// Rien n'est envoyé en production ; le dossier créé reste dans la base locale (.wrangler/).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const arg = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > -1 ? process.argv[i + 1] : defaut; };
const LANGUE = arg("langue", "fr");
const SORTIE = resolve(arg("sortie", `passation-demo-${LANGUE}.webm`));
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const PORT = 8798, B = `http://127.0.0.1:${PORT}`, P = LANGUE === "fr" ? "/fr" : "";
const EMAIL = `demo-${Date.now()}@exemple.fr`;

// 1. Entreprise fictive dans le cache local (date lointaine : jamais périmée)
const FICTIVE = { siren: "000000018", nom: "MENUISERIE EXEMPLE", ville: "Exempleville", code_postal: "44000", ville_creation: "Exempleville", naf: "16.23Z", section_naf: "C", date_creation: "1998-03-01", tranche_effectif: { code: "12", annee: 2024 }, actif: true, ca: [{ annee: 2024, valeur: 2200000 }, { annee: 2025, valeur: 2400000 }], ebe: [{ annee: 2024, valeur: 320000 }, { annee: 2025, valeur: 380000 }], evenements: [], comptes_confidentiels: false, exercices_non_publies: [] };
const sql = `INSERT OR REPLACE INTO api_cache (key, payload_json, fetched_at) VALUES ('maquette:v2:000000018', '${JSON.stringify(FICTIVE).replace(/'/g, "''")}', 4102444800)`;
execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "passation", "--local"], { stdio: "ignore" });
execFileSync("npx", ["wrangler", "d1", "execute", "passation", "--local", "--command", sql], { stdio: "ignore" });

// 2. Serveur local ; le code de connexion s'affiche dans sa sortie (src/lib/email.js, mode développement)
let journal = "";
const serveur = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"], detached: true });
serveur.stdout.on("data", (d) => { journal += d; });
serveur.stderr.on("data", (d) => { journal += d; });
const arreter = () => { try { process.kill(-serveur.pid); } catch { /* déjà arrêté */ } };
process.on("exit", arreter);
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch { /* démarrage */ } await new Promise((r) => setTimeout(r, 1000)); }

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
  // Accueil et estimation express
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

  // Connexion par code (lu dans le terminal du serveur local)
  await page.evaluate(() => import("/js/connexion-code.js").then((m) => m.ouvrirConnexion({ siren: "000000018" })));
  await attendre(800);
  await page.locator("#dialog-connexion input[type=email]").pressSequentially(EMAIL, { delay: 45 });
  await page.locator("#dialog-connexion .cx-email button").click();
  await page.locator("#dialog-connexion .cx-code input").waitFor({ timeout: 15000 });
  await attendre(900);
  await page.locator("#dialog-connexion .cx-code input").pressSequentially(await code(), { delay: 180 });
  await page.waitForURL(/\/espace\//, { timeout: 15000 }).catch(async () => { await page.locator("#dialog-connexion .cx-code .btn").first().click(); await page.waitForURL(/\/espace\//, { timeout: 15000 }); });
  const id = new URL(page.url()).searchParams.get("dossier");
  const cookie = (await ctx.cookies()).find((c) => c.name === "passation_session").value;
  await attendre(2500);

  // Chiffres fictifs de docs/DEMO.md (saisis par l'API pour gagner du temps), puis valorisation
  const H = { origin: B, "content-type": "application/json", cookie: `passation_session=${cookie}` };
  const EX = {
    2024: { chiffre_affaires: 2200000, autres_produits: 0, achats_consommes: 880000, charges_externes: 320000, impots_taxes: 40000, charges_personnel: 640000, dotations_amortissements: 66000, stocks: 180000, creances_clients: 370000, placements: 50000, tresorerie: 210000, capitaux_propres: 590000, provisions_risques: 20000, emprunts: 340000, dettes_fournisseurs: 230000, dettes_fiscales_sociales: 140000 },
    2025: { chiffre_affaires: 2400000, autres_produits: 0, achats_consommes: 960000, charges_externes: 340000, impots_taxes: 40000, charges_personnel: 680000, dotations_amortissements: 72000, stocks: 200000, creances_clients: 400000, placements: 50000, tresorerie: 250000, capitaux_propres: 700000, provisions_risques: 20000, emprunts: 300000, dettes_fournisseurs: 250000, dettes_fiscales_sociales: 150000 },
  };
  for (const [annee, valeurs] of Object.entries(EX)) await fetch(`${B}/api/dossiers/${id}/financials`, { method: "PUT", headers: H, body: JSON.stringify({ annee: Number(annee), valeurs, valider: true }) });
  await fetch(`${B}/api/dossiers/${id}/valuation`, { method: "POST", headers: H });

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
  await ctx.close(); // écrit la vidéo
  await navigateur.close();
  arreter();
}
const fichier = readdirSync(dossierVideo).find((f) => f.endsWith(".webm"));
renameSync(join(dossierVideo, fichier), SORTIE);
rmSync(dossierVideo, { recursive: true, force: true });
console.log(`Vidéo écrite : ${SORTIE}`);
process.exit(0);
