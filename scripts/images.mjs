// Prépare les images du site (à lancer en local : npm run images).
// 1. Génère les textures peintes originales (capture Chrome de scripts/art/texture-peinte.html).
// 2. Convertit chaque photo de public/img/source/ en WebP 800/1600/2400 px, < 250 Ko, dans public/img/photos/.
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join, parse, resolve } from "node:path";
import { tmpdir } from "node:os";

const racine = resolve(import.meta.dirname, "..");
const sortie = join(racine, "public/img/photos");
mkdirSync(sortie, { recursive: true });
const LARGEURS = [800, 1600, 2400];
const MAX_OCTETS = 250 * 1024;

async function versWebp(entree, nom) {
  const { width } = await sharp(entree).metadata();
  // Jamais d'agrandissement : on ne produit que les largeurs utiles (au moins la plus petite).
  const largeurs = LARGEURS.filter((l, i) => i === 0 || l <= width);
  for (const l of largeurs) {
    let q = 78, info;
    do {
      info = await sharp(entree).resize({ width: l, withoutEnlargement: true }).webp({ quality: q, effort: 6 })
        .toFile(join(sortie, `${nom}-${l}.webp`));
      q -= 6;
    } while (info.size > MAX_OCTETS && q > 30);
    console.log(`${nom}-${l}.webp  ${Math.round(info.size / 1024)} Ko  (qualité ${q + 6})`);
  }
}

// 1. Textures peintes
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(chrome)) {
  const profil = join(tmpdir(), "passation-chrome");
  for (const v of ["clair", "sombre"]) {
    const png = join(tmpdir(), `texture-${v}.png`);
    if (existsSync(png)) rmSync(png);
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profil}`,
      "--window-size=2400,1600", "--virtual-time-budget=4000", `--screenshot=${png}`,
      `file://${join(racine, "scripts/art/texture-peinte.html")}?v=${v}`], { stdio: "ignore" });
    await versWebp(png, `texture-${v}`);
  }
}

// 2. Photos déposées dans public/img/source/
const source = join(racine, "public/img/source");
if (existsSync(source)) {
  for (const f of readdirSync(source)) {
    if (!/\.(jpe?g|png|webp|tiff?)$/i.test(f) || !statSync(join(source, f)).isFile()) continue;
    await versWebp(join(source, f), parse(f).name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
  }
}
