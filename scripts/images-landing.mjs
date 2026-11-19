// Images de la landing tirées du kit de refonte (_refonte/assets, non versionné) : node scripts/images-landing.mjs
// Seules les images utiles sont copiées dans public/img/landing/ (plus d'établi en bois) ; le masque d'encre du
// tampon passe en WebP.
import sharp from "sharp";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const kit = (f) => fileURLToPath(new URL(`../_refonte/assets/${f}`, import.meta.url));
const site = (f) => fileURLToPath(new URL(`../public/img/landing/${f}`, import.meta.url));
mkdirSync(site("etiquettes"), { recursive: true });

for (const f of ["kraft-recto.webp", "papier-verso.webp", "vert-verso.webp"]) copyFileSync(kit(`tags/${f}`), site(`etiquettes/${f}`));
copyFileSync(kit("textures/paper.webp"), site("papier.webp"));
await sharp(kit("textures/grunge.png")).webp({ quality: 70, alphaQuality: 70 }).toFile(site("grunge.webp"));

for (const f of ["papier.webp", "grunge.webp"]) console.log(`${f} : ${(statSync(site(f)).size / 1024).toFixed(0)} Ko`);
