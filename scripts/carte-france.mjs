// Converts the simplified outlines of the 13 metropolitan regions (GeoJSON) into light SVG paths:
// public/js/carte-france.js. Source: IGN Admin Express, Etalab Open License, via
// https://github.com/gregoiredavid/france-geojson (regions-version-simplifiee.geojson).
// Usage: node scripts/carte-france.mjs <path/regions-version-simplifiee.geojson>
import { readFileSync, writeFileSync } from "node:fs";

const geo = JSON.parse(readFileSync(process.argv[2], "utf8"));
const K = Math.cos((46.5 * Math.PI) / 180);
const proj = ([lon, lat]) => [lon * K, -lat];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const f of geo.features) for (const poly of (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const ring of poly) for (const p of ring) {
  const [x, y] = proj(p); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const L = 1000, ech = L / (maxX - minX), H = Math.round((maxY - minY) * ech);
const pt = (p) => { const [x, y] = proj(p); return [Math.round((x - minX) * ech * 10) / 10, Math.round((y - minY) * ech * 10) / 10]; };
const regions = {};
for (const f of geo.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "", sx = 0, sy = 0, n = 0, aireMax = 0, centre = [0, 0];
  for (const poly of polys) {
    const ring = poly[0].map(pt);
    const garde = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 1.2 || i === ring.length - 1);
    if (garde.length < 4) continue;
    d += `M${garde.map((p) => p.join(",")).join("L")}Z`;
    let aire = 0; for (let i = 0; i < garde.length - 1; i++) aire += garde[i][0] * garde[i + 1][1] - garde[i + 1][0] * garde[i][1];
    if (Math.abs(aire) > aireMax) { aireMax = Math.abs(aire); sx = 0; sy = 0; n = 0; for (const p of garde) { sx += p[0]; sy += p[1]; n++; } centre = [Math.round(sx / n), Math.round(sy / n)]; }
  }
  regions[f.properties.nom] = { d, centre };
}
writeFileSync("public/js/carte-france.js", `// Régions de France métropolitaine (13), tracés SVG simplifiés.
// Source : IGN Admin Express, Licence ouverte Etalab (via github.com/gregoiredavid/france-geojson). Généré par scripts/carte-france.mjs.
export const CARTE = ${JSON.stringify({ largeur: L, hauteur: H, regions })};
`);
console.log("map:", Object.keys(regions).length, "regions,", L, "×", H, ",", Math.round(readFileSync("public/js/carte-france.js").length / 1024), "KB");
