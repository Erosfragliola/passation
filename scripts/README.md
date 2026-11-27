# Scripts

Run from the repository root. None of them is needed to run the site or the tests; each one regenerates a file that is
committed.

| Script | What it does | Command |
|---|---|---|
| `reference-valorisation.py` | Reference calculation of the « Atelier Exemple » test case, written separately from the JavaScript engine (see [Number checks](../README.md#number-checks)) | `python3 scripts/reference-valorisation.py` |
| `claude-simule.mjs` | Simulated Claude API for local checks without a key (never used in production) | `node scripts/claude-simule.mjs 8790` |
| `dossier-exemple.mjs` | Fictitious demonstration file « Menuiserie Exemple » / « Projet Chêne » (SIREN 000000018), used by the tests and [docs/DEMO.md](../docs/DEMO.md) | imported by the tests |
| `video-demo.mjs` | Records a video of the whole flow on the local site with the fictitious file (backup for the oral) | `npm run demo:video -- --langue en` |
| `i18n-check.mjs` | Checks that both languages have the same keys, no empty value and no hard-coded French text | `npm run i18n:check` |
| `fixtures.mjs` | Records real responses of the three public APIs into `test/fixtures/` | `npm run fixtures` |
| `multiples.mjs` | Calculates `src/data/multiples.json` from the sources of `src/data/multiples-sources.json` | `npm run multiples` |
| `images.mjs` | Converts the site's photos into WebP (800 / 1600 / 2400 px) in `public/img/photos/` | `npm run images` |
| `image-partage.mjs` | Share image (og:image, 1200 × 630) taken from the home page poster | `node scripts/image-partage.mjs` |
| `images-landing.mjs` | Records how the two home page textures were taken from the design kit (kit not under version control) | `node scripts/images-landing.mjs` |
| `carte-france.mjs` | Converts the outlines of the 13 metropolitan regions (IGN Admin Express, Etalab license) into the SVG paths of `public/js/carte-france.js` | `node scripts/carte-france.mjs <regions.geojson>` |
| `logo-datapack.mjs` | Renders the Passation logo of the Excel datapack into `src/documents/logo-datapack.js` | `node scripts/logo-datapack.mjs` |
