// Passation logo of the Excel datapack (navigation-bar symbol + the word "Passation" in Geist), rendered by
// Chrome as a transparent PNG then written in base64 into src/documents/logo-datapack.js.
// Usage: node scripts/logo-datapack.mjs [path to Chrome]
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const chrome = process.argv[2] || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const police = readFileSync(fileURLToPath(new URL("../public/fonts/geist-var.woff2", import.meta.url))).toString("base64");
const html = `<!doctype html><html><head><style>
@font-face { font-family: Geist; src: url(data:font/woff2;base64,${police}) format("woff2"); font-weight: 100 900; }
html, body { margin: 0; background: transparent; }
.logo { display: inline-flex; align-items: center; gap: 16px; padding: 4px 6px; font: 500 62px/1 Geist; letter-spacing: -0.035em; color: #231E18; }
svg { width: 60px; height: 60px; }
</style></head><body><span class="logo"><svg viewBox="0 0 32 32"><path d="M9 27V15a7 7 0 0 1 14 0v12" fill="none" stroke="#231E18" stroke-width="2.2"/><path d="M5 27h22" stroke="#231E18" stroke-width="2.2"/><circle cx="16" cy="21" r="2.6" fill="#A8653A"/></svg>Passation</span></body></html>`;

const b = await chromium.launch({ executablePath: chrome });
const p = await b.newPage({ deviceScaleFactor: 2 }); // 2×: sharp on screen, displayed at the CSS size
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
const el = p.locator(".logo");
const { width, height } = await el.boundingBox();
const png = await el.screenshot({ omitBackground: true });
await b.close();
const sortie = fileURLToPath(new URL("../src/documents/logo-datapack.js", import.meta.url));
writeFileSync(sortie, `// Fichier généré par scripts/logo-datapack.mjs : ne pas modifier à la main.
export const LOGO_PNG = "${png.toString("base64")}";
export const LOGO_TAILLE = { largeur: ${Math.round(width)}, hauteur: ${Math.round(height)} };
`);
console.log(`written: ${sortie} (${png.length} bytes, ${Math.round(width)} × ${Math.round(height)} px)`);
