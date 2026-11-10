// Assemble public/vendor/rendu3d.js : postprocessing (pmndrs, Zlib), n8ao (ISC) et deux modules d'exemple de
// Three.js (MIT), en un seul module ES minifié. Three.js reste à part (public/vendor/three.module.min.js) et
// est partagé avec le reste du site. Usage : npm run vendor:3d
import { build } from "esbuild";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const versions = ["postprocessing", "n8ao", "three"].map((p) => `${p} ${JSON.parse(readFileSync(`node_modules/${p}/package.json`)).version}`);
await build({
  entryPoints: ["scripts/vendor/rendu3d-entree.js"],
  bundle: true, format: "esm", minify: true, target: "es2020", legalComments: "inline",
  outfile: "public/vendor/rendu3d.js",
  plugins: [{
    name: "three-partage",
    setup(b) {
      // Toute importation de « three » pointe vers la copie déjà servie par le site (une seule instance).
      b.onResolve({ filter: /^three$/ }, () => ({ path: "/vendor/three.module.min.js", external: true }));
      b.onResolve({ filter: /^three\/examples\/jsm\/postprocessing\/Pass\.js$/ }, () => ({ path: "./node_modules/three/examples/jsm/postprocessing/Pass.js".replace("./", process.cwd() + "/") }));
    },
  }],
  banner: { js: `/* rendu3d : ${versions.join(", ")}. Licences : public/vendor/LICENSE-postprocessing.md, LICENSE-n8ao.txt, LICENSE-three.txt */` },
});
copyFileSync("node_modules/postprocessing/LICENSE.md", "public/vendor/LICENSE-postprocessing.md");
copyFileSync("node_modules/n8ao/LICENSE", "public/vendor/LICENSE-n8ao.txt");
writeFileSync("public/vendor/VERSIONS.txt", versions.join("\n") + "\n");
console.log("public/vendor/rendu3d.js :", versions.join(", "));
