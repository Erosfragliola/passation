// Décor fixe de la cloche : table en feutre, socle en noyer tourné avec moulure, plaque de cuivre gravée et vissée,
// cloche de verre avec bouton de cuivre, liseré de lumière (fresnel), poussière dorée.
// Unités : 1 ≈ 1 cm de la vraie pièce. Le dessus du socle est à SOL_Y.
import * as THREE from "/vendor/three.module.min.js";
import { plaqueGravee, spriteDoux } from "/js/cloche/materiaux.js";

export const SOL_Y = 0.885;           // dessus du plateau de maquette
export const RAYON_INTERIEUR = 2.95;  // rayon utile sous la cloche
export const HAUTEUR_UTILE = 3.2;     // hauteur utile sous le dôme (au centre)
const R_SOCLE = 3.6;
const R_VERRE = 3.22;
const Y_EPAULE = 2.85, Y_SOMMET = 4.45;

/** Liseré de lumière sur le bord du verre : coquille additive, intensité selon l'angle (fresnel). */
function materiauFresnel(couleur = 0xffe3c0, intensite = 0.9, puissance = 3.2) {
  return new THREE.ShaderMaterial({
    uniforms: { couleur: { value: new THREE.Color(couleur) }, intensite: { value: intensite }, puissance: { value: puissance } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 couleur; uniform float intensite; uniform float puissance;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), puissance);
        gl_FragColor = vec4(couleur * f * intensite, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
}

function profilCloche(decalage = 0) {
  const pts = [new THREE.Vector2(R_VERRE + 0.05 + decalage, SOL_Y - 0.02), new THREE.Vector2(R_VERRE + 0.03 + decalage, SOL_Y + 0.05)];
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(R_VERRE + decalage, SOL_Y + 0.05 + (i / 10) * (Y_EPAULE - SOL_Y - 0.05)));
  for (let i = 1; i <= 32; i++) {
    const a = (i / 32) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, (R_VERRE + decalage) * Math.cos(a)), Y_EPAULE + (Y_SOMMET - Y_EPAULE + decalage) * Math.sin(a)));
  }
  return pts;
}

export function creerVitrine(m, { mobile = false } = {}) {
  const geos = [];
  const geo = (g) => { geos.push(g); return g; };
  const liberer = [];

  const racine = new THREE.Group();   // tout ce qui tourne (socle, maquette, cloche)
  const fixe = new THREE.Group();     // la table, l'ombre de contact

  // ---------------------------------------------------------------- Table en feutre
  const table = new THREE.Mesh(geo(new THREE.CircleGeometry(60, 64)), m.feutre);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  fixe.add(table);
  // Ombre de contact très douce (dégradé radial)
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(128, 128, 60, 128, 128, 128);
  gr.addColorStop(0, "rgba(0,0,0,0.85)"); gr.addColorStop(0.55, "rgba(0,0,0,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const texOmbre = new THREE.CanvasTexture(c); liberer.push(texOmbre);
  const matOmbre = new THREE.MeshBasicMaterial({ map: texOmbre, transparent: true, depthWrite: false, opacity: 0.75 }); liberer.push(matOmbre);
  const ombre = new THREE.Mesh(geo(new THREE.PlaneGeometry(10.5, 10.5)), matOmbre);
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.004;
  fixe.add(ombre);

  // ---------------------------------------------------------------- Socle en noyer tourné (chanfreins, moulure, gorge)
  const profil = [
    [R_SOCLE - 0.12, 0], [R_SOCLE - 0.04, 0.025], [R_SOCLE, 0.08], [R_SOCLE, 0.6], [R_SOCLE - 0.03, 0.65], [R_SOCLE - 0.1, 0.67],
    [R_SOCLE - 0.17, 0.69], [R_SOCLE - 0.21, 0.72], [R_SOCLE - 0.22, 0.755],                // gorge
    [R_SOCLE - 0.17, 0.775], [R_SOCLE - 0.15, 0.805], [R_SOCLE - 0.17, 0.835],              // tore
    [R_SOCLE - 0.22, 0.855], [R_SOCLE - 0.3, 0.866], [R_VERRE + 0.09, 0.868],
    [R_VERRE + 0.09, 0.85], [R_VERRE - 0.04, 0.85], [R_VERRE - 0.04, 0.868],               // rainure de la cloche
    [3.1, 0.868], [0.001, 0.868],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const socle = new THREE.Mesh(geo(new THREE.LatheGeometry(profil, mobile ? 96 : 160)), m.noyer);
  socle.castShadow = true; socle.receiveShadow = true;
  racine.add(socle);

  // Plateau de maquette (carton gris clair)
  const plateau = new THREE.Mesh(geo(new THREE.CylinderGeometry(3.08, 3.08, 0.03, 128)), m.sol);
  plateau.position.y = SOL_Y - 0.015;
  plateau.receiveShadow = true;
  racine.add(plateau);

  // ---------------------------------------------------------------- Plaque de cuivre gravée, quatre vis
  const LARG = 1.75, HAUT = 0.44, Y_PLAQUE = 0.34;
  const theta = LARG / R_SOCLE;
  const matPlaque = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.8, roughness: 1,
    normalScale: new THREE.Vector2(1.2, 1.2), anisotropy: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 1.8,
  });
  liberer.push(matPlaque);
  const plaque = new THREE.Mesh(geo(new THREE.CylinderGeometry(R_SOCLE + 0.012, R_SOCLE + 0.012, HAUT, 48, 1, true, -theta / 2, theta)), matPlaque);
  plaque.position.y = Y_PLAQUE;
  plaque.name = "plaque";
  racine.add(plaque);
  // Tranche de la plaque (épaisseur visible)
  const tranche = new THREE.Mesh(geo(new THREE.CylinderGeometry(R_SOCLE + 0.012, R_SOCLE + 0.012, HAUT, 48, 1, true, -theta / 2, theta)), m.cuivre);
  tranche.scale.set(0.9985, 1.02, 0.9985); tranche.position.y = Y_PLAQUE;
  racine.add(tranche);
  const teteVis = geo(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  for (const [du, dy] of [[0.06, 0.15], [0.94, 0.15], [0.06, -0.15], [0.94, -0.15]]) {
    const a = -theta / 2 + du * theta;
    const v = new THREE.Mesh(teteVis, m.vis);
    v.position.set((R_SOCLE + 0.014) * Math.sin(a), Y_PLAQUE + dy, (R_SOCLE + 0.014) * Math.cos(a));
    v.lookAt(v.position.x * 2, v.position.y, v.position.z * 2);
    v.rotateX(Math.PI / 2);
    racine.add(v);
  }
  /** Position monde (dans racine) d'un point (u, v) de la plaque, pour l'éclat du burin et les infobulles. */
  const pointPlaque = (u, v) => {
    const a = -theta / 2 + u * theta;
    return new THREE.Vector3((R_SOCLE + 0.03) * Math.sin(a), Y_PLAQUE + (0.5 - v) * HAUT, (R_SOCLE + 0.03) * Math.cos(a));
  };

  // ---------------------------------------------------------------- Cloche de verre
  const dome = new THREE.Group();
  racine.add(dome);
  const verre = mobile
    ? new THREE.MeshPhysicalMaterial({ color: 0xfffaf2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.03, envMapIntensity: 0.12, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({
      color: 0xfff6ea, transmission: 1, thickness: 0.4, ior: 1.5, roughness: 0.05, metalness: 0,
      attenuationColor: new THREE.Color(0xffe0b0), attenuationDistance: 14, specularIntensity: 1, envMapIntensity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false, // l'occlusion ambiante se calcule sur le diorama, pas sur le verre
    });
  liberer.push(verre);
  const cloche = new THREE.Mesh(geo(new THREE.LatheGeometry(profilCloche(), mobile ? 96 : 160)), verre);
  cloche.name = "cloche";
  dome.add(cloche);
  const matFresnel = materiauFresnel(0xffe2bd, mobile ? 0.55 : 0.75, mobile ? 4.5 : 3.4);
  liberer.push(matFresnel);
  const liseré = new THREE.Mesh(geo(new THREE.LatheGeometry(profilCloche(0.004), mobile ? 96 : 160)), matFresnel);
  liseré.renderOrder = 2;
  dome.add(liseré);
  // Bouton de préhension en cuivre
  const col = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.11, 0.16, 0.12, 32)), m.cuivre);
  col.position.y = Y_SOMMET + 0.04;
  const bague = new THREE.Mesh(geo(new THREE.TorusGeometry(0.13, 0.025, 12, 40)), m.cuivre);
  bague.rotation.x = Math.PI / 2; bague.position.y = Y_SOMMET + 0.11;
  const bouton = new THREE.Mesh(geo(new THREE.SphereGeometry(0.21, 40, 24)), m.cuivre);
  bouton.position.y = Y_SOMMET + 0.3; bouton.scale.y = 0.88;
  for (const o of [col, bague, bouton]) { o.castShadow = true; dome.add(o); }

  // ---------------------------------------------------------------- Poussière dorée (sous la cloche)
  const sprite = spriteDoux(); liberer.push(sprite);
  const poussieres = [];
  const total = mobile ? 120 : 300;
  for (const [part, taille] of [[0.55, 0.035], [0.32, 0.055], [0.13, 0.085]]) {
    const n = Math.round(total * part);
    const pos = new Float32Array(n * 3), graine = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * (RAYON_INTERIEUR - 0.2), a = Math.random() * Math.PI * 2;
      pos[i * 3] = r * Math.cos(a); pos[i * 3 + 1] = SOL_Y + 0.3 + Math.random() * 3.0; pos[i * 3 + 2] = r * Math.sin(a);
      graine[i] = Math.random() * 100;
    }
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: sprite, color: 0xf2cf96, size: taille, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    liberer.push(mat);
    const pts = new THREE.Points(g, mat);
    pts.userData.graine = graine;
    dome.add(pts);
    poussieres.push(pts);
  }
  function animerPoussiere(dt, t) {
    for (const pts of poussieres) {
      const p = pts.geometry.attributes.position, g = pts.userData.graine;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * (0.03 + 0.02 * Math.sin(g[i]));
        // Reste sous le verre : au-dessus de l'épaule, le rayon permis suit l'ellipse du dôme
        const rMax = y < Y_EPAULE ? RAYON_INTERIEUR - 0.15 : (RAYON_INTERIEUR - 0.25) * Math.sqrt(Math.max(0, 1 - ((y - Y_EPAULE) / (Y_SOMMET - Y_EPAULE - 0.2)) ** 2));
        if (y > Y_SOMMET - 0.3 || Math.hypot(p.getX(i), p.getZ(i)) > rMax) { y = SOL_Y + 0.25; p.setX(i, p.getX(i) * 0.6); p.setZ(i, p.getZ(i) * 0.6); }
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.21 + g[i]) * dt * 0.03);
        p.setZ(i, p.getZ(i) + Math.cos(t * 0.17 + g[i] * 1.3) * dt * 0.03);
      }
      p.needsUpdate = true;
    }
  }

  // Gravure : refaite pour chaque entreprise
  let gravure = null;
  function regraver(info) {
    gravure?.dispose();
    gravure = plaqueGravee(info);
    Object.assign(matPlaque, gravure.textures);
    matPlaque.needsUpdate = true;
    return gravure;
  }

  return {
    racine, fixe, ombre, dome, plaque, regraver, pointPlaque, poussieres, animerPoussiere,
    sommet: new THREE.Vector3(0, Y_SOMMET + 0.3, 0),
    dispose() {
      geos.forEach((g) => g.dispose());
      liberer.forEach((x) => x.dispose());
      gravure?.dispose();
    },
  };
}
