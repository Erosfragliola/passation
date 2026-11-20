// Landing images taken from the redesign kit (_refonte/assets, not under version control): node scripts/images-landing.mjs
// Only the useful images are copied into public/img/landing/ (no more wooden workbench); the stamp's ink mask
// becomes WebP.
import sharp from "sharp";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const kit = (f) => fileURLToPath(new URL(`../_refonte/assets/${f}`, import.meta.url));
const site = (f) => fileURLToPath(new URL(`../public/img/landing/${f}`, import.meta.url));
mkdirSync(site("etiquettes"), { recursive: true });

copyFileSync(kit("tags/kraft-recto.webp"), site("etiquettes/kraft-recto.webp"));
await sharp(kit("textures/grunge.png")).webp({ quality: 70, alphaQuality: 70 }).toFile(site("grunge.webp"));

for (const f of ["etiquettes/kraft-recto.webp", "grunge.webp"]) console.log(`${f}: ${(statSync(site(f)).size / 1024).toFixed(0)} KB`);
