// Prepares the site's photos (to run locally: npm run images): converts each photo of public/img/source/
// into WebP 800/1600/2400 px, < 250 KB, in public/img/photos/.
import sharp from "sharp";
import { mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, parse, resolve } from "node:path";

const racine = resolve(import.meta.dirname, "..");
const sortie = join(racine, "public/img/photos");
mkdirSync(sortie, { recursive: true });
const LARGEURS = [800, 1600, 2400];
const MAX_OCTETS = 250 * 1024;

async function versWebp(entree, nom) {
  const { width } = await sharp(entree).metadata();
  // Never upscaled: only the useful widths are produced (at least the smallest).
  const largeurs = LARGEURS.filter((l, i) => i === 0 || l <= width);
  for (const l of largeurs) {
    let q = 90, info; // photos: high quality
    do {
      info = await sharp(entree).resize({ width: l, withoutEnlargement: true }).webp({ quality: q, effort: 6 })
        .toFile(join(sortie, `${nom}-${l}.webp`));
      q -= 6;
    } while (info.size > MAX_OCTETS && q > 30);
    console.log(`${nom}-${l}.webp  ${Math.round(info.size / 1024)} Ko  (qualité ${q + 6})`);
  }
}

// Photos placed in public/img/source/
const source = join(racine, "public/img/source");
if (existsSync(source)) {
  for (const f of readdirSync(source)) {
    if (!/\.(jpe?g|png|webp|tiff?)$/i.test(f) || !statSync(join(source, f)).isFile()) continue;
    await versWebp(join(source, f), parse(f).name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
  }
}
