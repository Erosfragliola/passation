// Matériaux de la cloche : noyer verni, cuivre brossé, feutre, plâtre de maquettiste, balsa, lichen, laiton.
// Les textures procédurales sont calculées dans un Web Worker (textures.js) puis transformées ici en DataTexture.
// La plaque gravée, elle, est dessinée sur un canvas (texte), lettre par lettre.
import * as THREE from "/vendor/three.module.min.js";
import { genererTout, normale as normalePixels } from "/js/cloche/textures.js";

function toile(l, h) {
  const c = document.createElement("canvas");
  c.width = l; c.height = h;
  return c;
}
function texture(c, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
    try { w = new Worker("/js/cloche/textures-worker.js", { type: "module" }); } catch { w = null; }
    if (!w) { setTimeout(() => ok(genererTout(mobile)), 0); return; }
    const repli = () => { w.terminate(); ok(genererTout(mobile)); };
    w.onmessage = (e) => { w.terminate(); ok(e.data); };
    w.onerror = repli;
    w.postMessage({ mobile });
  });
}

/** Fond de vitrine (dégradé espresso → noir, spot chaud derrière la cloche). */
export const fondVitrine = (t) => donnees(t.fond.couleur, t.fond.l, t.fond.h, { repeat: [1, 1] });

export function creerMateriaux(t, { mobile = false } = {}) {
  const liberer = [];
  const g = (x) => { liberer.push(x); return x; };
  const tx = (cle, canal, opts) => g(donnees(t[cle][canal], t[cle].l, t[cle].h, opts));

  const noyerMat = g(new THREE.MeshPhysicalMaterial({
    map: tx("noyer", "couleur", { repeat: [2, 1] }),
    normalMap: tx("noyer", "normale", { srgb: false, repeat: [2, 1] }),
    roughnessMap: tx("noyer", "rugo", { srgb: false, repeat: [2, 1] }),
    roughness: 1, normalScale: new THREE.Vector2(0.2, 0.2),
    clearcoat: 0.7, clearcoatRoughness: 0.16,
  }));

  const feutreMat = g(new THREE.MeshPhysicalMaterial({
    map: tx("feutre", "couleur", { repeat: [14, 14] }),
    normalMap: tx("feutre", "normale", { srgb: false, repeat: [14, 14] }),
    roughness: 0.97, sheen: 0.5, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x5a4230),
    normalScale: new THREE.Vector2(0.2, 0.2),
  }));

  const platreNormale = tx("platre", "normale", { srgb: false, repeat: [2, 2] });
  const platreMat = g(new THREE.MeshStandardMaterial({
    map: tx("platre", "couleur", { repeat: [2, 2] }), normalMap: platreNormale, normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: tx("platre", "rugo", { srgb: false, repeat: [2, 2] }), roughness: 1,
  }));
  const sol = platreMat.clone(); sol.color = new THREE.Color(0xcdc5b6); g(sol);
  const allee = platreMat.clone(); allee.color = new THREE.Color(0xc7bba6); g(allee);

  const balsaMat = g(new THREE.MeshStandardMaterial({
    map: tx("balsa", "couleur"), normalMap: tx("balsa", "normale", { srgb: false }),
    normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.8,
  }));

  const lichenMat = g(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1,
    normalMap: tx("lichen", "normale", { srgb: false, repeat: [2, 2] }),
    normalScale: new THREE.Vector2(1, 1),
  }));

  const cuivre = g(new THREE.MeshPhysicalMaterial({
    color: 0xc0784a, metalness: 1, roughness: 1, roughnessMap: tx("brosse", "rugo", { srgb: false }),
    normalMap: tx("brosse", "normale", { srgb: false }), normalScale: new THREE.Vector2(0.15, 0.15),
    anisotropy: 0.6, anisotropyRotation: 0,
  }));
  const laiton = g(new THREE.MeshStandardMaterial({ color: 0xb8904f, metalness: 1, roughness: 0.38 }));
  const vis = g(new THREE.MeshStandardMaterial({ color: 0x8c5a36, metalness: 1, roughness: 0.3 }));
  const personnage = g(new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.85, normalMap: platreNormale, normalScale: new THREE.Vector2(0.15, 0.15) }));
  const pneu = g(new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 }));
  const vitreEteinte = g(new THREE.MeshPhysicalMaterial({ color: 0x5b534b, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.4 }));
  const vert = g(new THREE.MeshStandardMaterial({ color: 0x2c4a3b, roughness: 0.75 }));

  return {
    noyer: noyerMat, feutre: feutreMat, platre: platreMat, sol, allee, balsa: balsaMat, lichen: lichenMat,
    cuivre, laiton, vis, personnage, pneu, vitreEteinte, vert,
    dispose: () => liberer.forEach((x) => x.dispose()),
  };
}

// ------------------------------------------------------------------ Plaque gravée (texte en creux)
/**
 * Prépare le canvas de la plaque. graver(n) dessine les n premiers caractères ; renvoie la position (0..1) du burin.
 * Gravure : couleur assombrie (patine) + relief en creux dans une normal map + rugosité plus forte dans le trait.
 */
export function plaqueGravee({ nom, depuis }) {
  const L = 1024, H = 256;
  const masque = toile(L, H);
  const mc = masque.getContext("2d");
  const ligne1 = (nom || "Votre entreprise").toUpperCase();
  const ligne2 = depuis ? `DEPUIS ${depuis}` : "";
  const texteComplet = ligne1 + ligne2;

  const couleur = toile(L, H), normale = toile(L, H), rugo = toile(L, H);
  const tCouleur = texture(couleur), tNormale = texture(normale, { srgb: false }), tRugo = texture(rugo, { srgb: false });
  for (const t of [tCouleur, tNormale, tRugo]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1, 1); }

  function taille(ctx, texte, max, corps) {
    let c = corps;
    ctx.font = `500 ${c}px "Geist", sans-serif`;
    while (ctx.measureText(texte).width > max && c > 28) { c -= 4; ctx.font = `500 ${c}px "Geist", sans-serif`; }
    return c;
  }

  function dessiner(n) {
    mc.fillStyle = "#000"; mc.fillRect(0, 0, L, H);
    mc.fillStyle = "#fff"; mc.textAlign = "center"; mc.textBaseline = "middle";
    // Filets gravés en bordure
    mc.strokeStyle = "#fff"; mc.lineWidth = 3; mc.strokeRect(26, 26, L - 52, H - 52);
    if ("letterSpacing" in mc) mc.letterSpacing = "10px";
    taille(mc, ligne1, L - 150, ligne2 ? 78 : 92);
    const vis1 = ligne1.slice(0, Math.min(n, ligne1.length));
    // Aligné comme le texte final : on mesure la ligne complète et on part de sa gauche
    mc.textAlign = "left";
    const larg1 = mc.measureText(ligne1).width;
    const x1 = (L - larg1) / 2, y1 = ligne2 ? H * 0.43 : H * 0.52;
    mc.fillText(vis1, x1, y1);
    let burin = { u: (x1 + mc.measureText(vis1).width) / L, v: y1 / H };
    if (ligne2) {
      if ("letterSpacing" in mc) mc.letterSpacing = "12px";
      mc.font = '500 40px "Geist Mono", monospace';
      const larg2 = mc.measureText(ligne2).width;
      const x2 = (L - larg2) / 2, y2 = H * 0.75;
      const vis2 = ligne2.slice(0, Math.max(0, n - ligne1.length));
      mc.fillText(vis2, x2, y2);
      if (n > ligne1.length) burin = { u: (x2 + mc.measureText(vis2).width) / L, v: y2 / H };
    }
    // Couleur : cuivre clair, trait gravé plus sombre (patine)
    const cc = couleur.getContext("2d");
    cc.fillStyle = "#e7b48c"; cc.fillRect(0, 0, L, H);
    cc.globalAlpha = 0.85; cc.drawImage(trait("#4a2414"), 0, 0); cc.globalAlpha = 1;
    // Relief : creux = hauteur basse
    const d = mc.getImageData(0, 0, L, H).data;
    const hauteur = new Float32Array(L * H);
    for (let i = 0; i < L * H; i++) hauteur[i] = 1 - d[i * 4] / 255;
    const flou = new Float32Array(L * H); // léger flou : bords de gravure arrondis
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      flou[i] = (hauteur[i] * 4 + hauteur[i - 1] + hauteur[i + 1] + hauteur[i - L] + hauteur[i + L]) / 8;
    }
    normale.getContext("2d").putImageData(new ImageData(normalePixels(flou, L, H, 1.6), L, H), 0, 0);
    const rc = rugo.getContext("2d");
    rc.fillStyle = "#4a4a4a"; rc.fillRect(0, 0, L, H);
    rc.drawImage(trait("#b0b0b0"), 0, 0);
    tCouleur.needsUpdate = tNormale.needsUpdate = tRugo.needsUpdate = true;
    return burin;
  }
  /** Le trait gravé seul, dans une couleur donnée (alpha = masque). */
  function trait(couleurTrait) {
    const c = toile(L, H);
    const x = c.getContext("2d");
    x.fillStyle = couleurTrait; x.fillRect(0, 0, L, H);
    const img = x.getImageData(0, 0, L, H), m = mc.getImageData(0, 0, L, H).data;
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = m[i];
    x.putImageData(img, 0, 0);
    return c;
  }

  return {
    longueur: texteComplet.length,
    graver: dessiner,
    textures: { map: tCouleur, normalMap: tNormale, roughnessMap: tRugo },
    dispose: () => [tCouleur, tNormale, tRugo].forEach((t) => t.dispose()),
  };
}

/** Sprite rond et doux (poussière, fumée, éclat du burin). */
export function spriteDoux(taille = 64) {
  const c = toile(taille, taille);
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(taille / 2, taille / 2, 0, taille / 2, taille / 2, taille / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr; x.fillRect(0, 0, taille, taille);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

