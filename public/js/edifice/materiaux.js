// Matériaux de la maquette d'architecte : pierre de taille, plâtre, balsa, lichen, laiton, verre, papier.
// Une seule commande, uniforms.matiere (0 → 1), fait passer toute la maquette du carton blanc à la matière :
// couleur, reflets métalliques et relief apparaissent ensemble (injection dans les shaders de three.js).
// Les textures procédurales sont calculées dans un Web Worker (textures.js) ; le papier, la cote et la plaque sont
// dessinés sur des canvas (texte).
import * as THREE from "/vendor/three.module.min.js";
import { genererTout, normale as normalePixels } from "/js/edifice/textures.js";

const BLANC = "vec3(0.925, 0.912, 0.886)"; // carton plume, légèrement chaud
export const GRAPHITE = 0x34302a;

function toile(l, h) {
  const c = document.createElement("canvas");
  c.width = l; c.height = h;
  return c;
}
function texture(c, { srgb = true, repeat = [1, 1], aniso = 8, repetee = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repetee ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  return t;
}
/** Tableau RGBA → DataTexture répétable, avec mipmaps. */
function donnees(pixels, l, h, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.DataTexture(pixels, l, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Calcule les textures hors du fil principal (Worker) ; repli sur le fil principal si le Worker est indisponible. */
export function chargerTextures({ mobile = false } = {}) {
  return new Promise((ok) => {
    let w;
    try { w = new Worker("/js/edifice/textures-worker.js", { type: "module" }); } catch { w = null; }
    if (!w) { setTimeout(() => ok(genererTout(mobile)), 0); return; }
    const repli = () => { w.terminate(); ok(genererTout(mobile)); };
    w.onmessage = (e) => { w.terminate(); ok(e.data); };
    w.onerror = repli;
    w.postMessage({ mobile });
  });
}

/**
 * Passage carton blanc → matière, commandé par uniforms.matiere (partagé par tous les matériaux de la maquette).
 * triplanaire : la texture de pierre est posée selon la position dans la maquette (assises alignées d'un étage à
 * l'autre, blocs jamais étirés), et non selon les coordonnées de chaque boîte.
 */
export function matiereProgressive(mat, uniforms, { triplanaire = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMatiere = uniforms.matiere;
    let v = sh.vertexShader, f = sh.fragmentShader;
    f = "uniform float uMatiere;\n" + f
      .replace("#include <color_fragment>", `#include <color_fragment>\n\tdiffuseColor.rgb = mix(${BLANC}, diffuseColor.rgb, uMatiere);`)
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n\tmetalnessFactor *= uMatiere;\n\troughnessFactor = mix(0.84, roughnessFactor, uMatiere);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n\tnormal = normalize(mix(nonPerturbedNormal, normal, uMatiere));");
    if (triplanaire) {
      v = "varying vec3 vPosMur;\nvarying vec3 vNorMur;\n" + v.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n\tvPosMur = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvNorMur = normalize(mat3(modelMatrix) * objectNormal);");
      f = "varying vec3 vPosMur;\nvarying vec3 vNorMur;\n" + f.replace("#include <map_fragment>", `#ifdef USE_MAP
\tvec3 pm = vPosMur * 0.5;
\tvec3 an = abs(normalize(vNorMur));
\tvec2 uvMur = an.y > max(an.x, an.z) ? pm.xz : (an.x > an.z ? pm.zy : pm.xy);
\tdiffuseColor *= texture2D(map, uvMur);
#endif`);
    }
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => (triplanaire ? "matiere-mur" : "matiere");
  return mat;
}

export function creerMateriaux(t, { mobile = false } = {}) {
  const liberer = [];
  const g = (x) => { liberer.push(x); return x; };
  const tx = (cle, canal, opts) => g(donnees(t[cle][canal], t[cle].l, t[cle].h, opts));
  const uniforms = { matiere: { value: 0 } };
  const prog = (mat, opts) => matiereProgressive(g(mat), uniforms, opts);

  const mur = prog(new THREE.MeshStandardMaterial({ map: tx("pierre", "couleur"), roughness: 0.86 }), { triplanaire: true });
  const platreNormale = tx("platre", "normale", { srgb: false, repeat: [2, 2] });
  const platre = prog(new THREE.MeshStandardMaterial({
    map: tx("platre", "couleur", { repeat: [2, 2] }), normalMap: platreNormale, normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: tx("platre", "rugo", { srgb: false, repeat: [2, 2] }), roughness: 1,
  }));
  const allee = prog(new THREE.MeshStandardMaterial({ color: 0xc9bca5, roughness: 0.95 }));
  const balsa = prog(new THREE.MeshStandardMaterial({
    map: tx("balsa", "couleur"), normalMap: tx("balsa", "normale", { srgb: false }),
    normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.8,
  }));
  const lichen = prog(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, normalMap: tx("lichen", "normale", { srgb: false, repeat: [2, 2] }), normalScale: new THREE.Vector2(1, 1),
  }));
  const cuivre = prog(new THREE.MeshStandardMaterial({
    color: 0xc0784a, metalness: 1, roughness: 1, roughnessMap: tx("brosse", "rugo", { srgb: false }),
    normalMap: tx("brosse", "normale", { srgb: false }), normalScale: new THREE.Vector2(0.15, 0.15),
  }));
  const laiton = prog(new THREE.MeshStandardMaterial({ color: 0xb8904f, metalness: 1, roughness: 0.38 }));
  const pneu = prog(new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 }));
  const vitreEteinte = prog(new THREE.MeshPhysicalMaterial({ color: 0x4f4943, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.35 }));
  const vert = prog(new THREE.MeshStandardMaterial({ color: 0x2c4a3b, roughness: 0.75 }));
  // Personnages : toujours blancs (convention des maquettes d'architecte)
  const personnage = g(new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.85, normalMap: platreNormale, normalScale: new THREE.Vector2(0.15, 0.15) }));

  return {
    uniforms, mur, platre, allee, balsa, lichen, cuivre, laiton, pneu, vitreEteinte, vert, personnage,
    dispose: () => liberer.forEach((x) => x.dispose()),
  };
}

// ------------------------------------------------------------------ Papier d'architecte
/**
 * Feuille de dessin : papier légèrement chaud, quadrillage fin, cadre et cartouche (nom, « depuis »).
 * Les dimensions de la texture suivent celles de la feuille (en unités de maquette).
 */
export function dessinerFeuille(largeur, profondeur, { nom, depuis, exemple }) {
  const echelle = 120; // pixels par unité
  const L = Math.min(4096, Math.round(largeur * echelle)), H = Math.min(4096, Math.round(profondeur * echelle));
  const k = L / largeur;
  const c = toile(L, H);
  const x = c.getContext("2d");
  x.fillStyle = "#f3eee3"; x.fillRect(0, 0, L, H);
  // Grain du papier : petites taches très claires, déterministes
  let s = 7;
  const alea = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (L * H) / 900; i++) {
    x.fillStyle = alea() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(120,100,70,0.05)";
    x.fillRect(alea() * L, alea() * H, 1 + alea() * 2, 1 + alea() * 2);
  }
  // Quadrillage : tous les 0,5 unité, renforcé toutes les 2,5 unités
  const marge = 0.45 * k;
  for (let u = 0, i = 0; u <= largeur; u += 0.5, i++) {
    x.strokeStyle = i % 5 === 0 ? "rgba(120,140,150,0.32)" : "rgba(120,140,150,0.16)";
    x.lineWidth = i % 5 === 0 ? 2 : 1;
    x.beginPath(); x.moveTo(u * k, marge); x.lineTo(u * k, H - marge); x.stroke();
  }
  for (let v = 0, i = 0; v <= profondeur; v += 0.5, i++) {
    x.strokeStyle = i % 5 === 0 ? "rgba(120,140,150,0.32)" : "rgba(120,140,150,0.16)";
    x.lineWidth = i % 5 === 0 ? 2 : 1;
    x.beginPath(); x.moveTo(marge, v * k); x.lineTo(L - marge, v * k); x.stroke();
  }
  // Cadre
  x.strokeStyle = "rgba(52,48,42,0.75)"; x.lineWidth = 4;
  x.strokeRect(marge, marge, L - 2 * marge, H - 2 * marge);
  // Cartouche (en bas à droite de la feuille, face au lecteur)
  const cl = 3.6 * k, ch = 1.05 * k;
  const cx = L - marge - cl, cy = H - marge - ch;
  x.fillStyle = "#f6f2e9"; x.fillRect(cx, cy, cl, ch);
  x.strokeRect(cx, cy, cl, ch);
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(cx, cy + ch * 0.36); x.lineTo(cx + cl, cy + ch * 0.36); x.stroke();
  x.fillStyle = "rgba(52,48,42,0.85)";
  x.textBaseline = "middle";
  if ("letterSpacing" in x) x.letterSpacing = `${Math.round(k * 0.025)}px`;
  let corpsTete = Math.round(k * 0.15);
  const tete = exemple ? "PASSATION · MAQUETTE D'EXEMPLE" : "PASSATION · MAQUETTE";
  x.font = `500 ${corpsTete}px "Geist Mono", monospace`;
  while (x.measureText(tete).width > cl - k * 0.32 && corpsTete > 8) { corpsTete -= 1; x.font = `500 ${corpsTete}px "Geist Mono", monospace`; }
  x.fillText(tete, cx + k * 0.16, cy + ch * 0.19);
  if ("letterSpacing" in x) x.letterSpacing = "0px";
  let corps = Math.round(k * 0.3);
  x.font = `500 ${corps}px "Geist", sans-serif`;
  const titre = nom || "";
  while (x.measureText(titre).width > cl - k * 0.32 && corps > k * 0.14) { corps -= 2; x.font = `500 ${corps}px "Geist", sans-serif`; }
  x.fillStyle = "#231e18";
  x.fillText(titre, cx + k * 0.16, cy + ch * (depuis ? 0.58 : 0.68));
  if (depuis) {
    x.font = `italic 400 ${Math.round(k * 0.17)}px "Geist", sans-serif`;
    x.fillStyle = "rgba(52,48,42,0.8)";
    x.fillText(`depuis ${depuis}`, cx + k * 0.16, cy + ch * 0.84);
  }
  const t = texture(c, { repetee: false });
  return t;
}

/** Cote de plan : ligne de cote avec traits d'attache et flèches, la valeur au-dessus, la légende dessous. */
export function dessinerCote(texte, legende) {
  const L = 1600, H = 300;
  const c = toile(L, H);
  const x = c.getContext("2d");
  x.strokeStyle = "rgba(52,48,42,0.9)"; x.fillStyle = "rgba(52,48,42,0.9)";
  x.lineWidth = 4;
  const y = H * 0.56, g = 40, d = L - 40;
  x.beginPath(); x.moveTo(g, y); x.lineTo(d, y); x.stroke();
  for (const bx of [g, d]) { x.beginPath(); x.moveTo(bx, y - 46); x.lineTo(bx, y + 46); x.stroke(); }
  // Flèches fines (traits obliques, à la manière d'une cote d'architecte)
  x.lineWidth = 5;
  for (const [bx, s] of [[g, 1], [d, -1]]) { x.beginPath(); x.moveTo(bx - 16 * s, y + 16); x.lineTo(bx + 16 * s, y - 16); x.stroke(); }
  x.textAlign = "center"; x.textBaseline = "alphabetic";
  let corps = 112;
  x.font = `500 ${corps}px "Geist", sans-serif`;
  while (x.measureText(texte).width > L - 200 && corps > 50) { corps -= 4; x.font = `500 ${corps}px "Geist", sans-serif`; }
  x.fillStyle = "#231e18";
  x.fillText(texte, L / 2, y - 26);
  if (legende) {
    if ("letterSpacing" in x) x.letterSpacing = "6px";
    x.font = '500 40px "Geist Mono", monospace';
    x.fillStyle = "rgba(52,48,42,0.8)";
    x.fillText(legende.toUpperCase(), L / 2, y + 74);
  }
  return texture(c, { repetee: false });
}

/** Ombre douce rectangulaire (sous la feuille de papier). */
export function ombreRectangle() {
  const L = 256;
  const c = toile(L, L);
  const x = c.getContext("2d");
  x.filter = "blur(18px)";
  x.fillStyle = "rgba(0,0,0,0.55)";
  x.fillRect(40, 40, L - 80, L - 80);
  return texture(c, { repetee: false });
}

// ------------------------------------------------------------------ Plaque de laiton gravée (texte en creux)
/** Plaque de laiton : nom en capitales, « DEPUIS 1980 » dessous. Rien si texte vide (enseigne effacée). */
export function plaqueGravee({ nom, depuis }) {
  const L = 1024, H = 256;
  const masque = toile(L, H);
  const mc = masque.getContext("2d");
  const ligne1 = (nom || "").toUpperCase();
  const ligne2 = depuis ? `DEPUIS ${depuis}` : "";
  mc.fillStyle = "#000"; mc.fillRect(0, 0, L, H);
  mc.fillStyle = "#fff"; mc.strokeStyle = "#fff"; mc.lineWidth = 3; mc.strokeRect(26, 26, L - 52, H - 52);
  mc.textAlign = "center"; mc.textBaseline = "middle";
  if ("letterSpacing" in mc) mc.letterSpacing = "10px";
  let corps = ligne2 ? 78 : 92;
  mc.font = `500 ${corps}px "Geist", sans-serif`;
  while (mc.measureText(ligne1).width > L - 150 && corps > 28) { corps -= 4; mc.font = `500 ${corps}px "Geist", sans-serif`; }
  mc.fillText(ligne1, L / 2, ligne2 ? H * 0.43 : H * 0.52);
  if (ligne2) {
    if ("letterSpacing" in mc) mc.letterSpacing = "12px";
    mc.font = '500 40px "Geist Mono", monospace';
    mc.fillText(ligne2, L / 2, H * 0.75);
  }
  const trait = (couleurTrait) => {
    const c = toile(L, H);
    const x = c.getContext("2d");
    x.fillStyle = couleurTrait; x.fillRect(0, 0, L, H);
    const img = x.getImageData(0, 0, L, H), m = mc.getImageData(0, 0, L, H).data;
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = m[i];
    x.putImageData(img, 0, 0);
    return c;
  };
  const couleur = toile(L, H), normale = toile(L, H), rugo = toile(L, H);
  const cc = couleur.getContext("2d");
  cc.fillStyle = "#d8b47a"; cc.fillRect(0, 0, L, H);
  cc.globalAlpha = 0.85; cc.drawImage(trait("#3c2a14"), 0, 0); cc.globalAlpha = 1;
  const d = mc.getImageData(0, 0, L, H).data;
  const hauteur = new Float32Array(L * H);
  for (let i = 0; i < L * H; i++) hauteur[i] = 1 - d[i * 4] / 255;
  normale.getContext("2d").putImageData(new ImageData(normalePixels(hauteur, L, H, 1.2), L, H), 0, 0);
  const rc = rugo.getContext("2d");
  rc.fillStyle = "#555"; rc.fillRect(0, 0, L, H);
  rc.drawImage(trait("#b8b8b8"), 0, 0);
  return {
    map: texture(couleur, { repetee: false }),
    normalMap: texture(normale, { srgb: false, repetee: false }),
    roughnessMap: texture(rugo, { srgb: false, repetee: false }),
  };
}
