// « La cloche » : scène 3D de la section « Votre maquette ». Le diorama de l'entreprise sous une cloche de verre,
// sur un socle en noyer avec plaque de cuivre gravée. Chorégraphie d'environ 9 s (5 s sur mobile), interruptible.
// API utilisée par votre-maquette.js : respirer(oui), construire(params, { evenements, fin, depuisEtages }),
// terminer(), exporter({ nom, depuis }) → Blob PNG, temps (repères de la chorégraphie).
import * as THREE from "/vendor/three.module.min.js";
import { creerRendu } from "/js/cloche/rendu.js";
import { chargerTextures, creerMateriaux, fondVitrine, spriteDoux } from "/js/cloche/materiaux.js";
import { creerVitrine, SOL_Y, RAYON_INTERIEUR, HAUTEUR_UTILE } from "/js/cloche/vitrine.js";
import { creerDiorama } from "/js/cloche/diorama.js";
import { creerPassation } from "/js/cloche/passation.js";

const TEMPS_BUREAU = { demontage: [0, 1], gravure: [1, 2], construction: [2, 5], vie: [5, 6.5], travelling: [6.5, 8], valeur: 8, fin: 9 };
const TEMPS_MOBILE = { demontage: [0, 0.5], gravure: [0.5, 1], construction: [1, 3], vie: [3, 4], travelling: null, valeur: 4, fin: 5 };
const ROT_FACE = 0.4;          // angle de présentation : façade et plaque de trois quarts
const TOUR_REPOS = 60;         // secondes pour un tour complet au repos
const DRAG_MAX = THREE.MathUtils.degToRad(35);

/** Maquette d'exemple affichée avant toute recherche. */
export const EXEMPLE = {
  archetype: "industrie", etages: 3, fenetresAllumees: 7, arbres: { nombre: 3, haie: false }, echafaudage: false,
  depuis: null, comptesManquants: false, personnages: 3, effectif: null, nom: "Votre entreprise",
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const doux = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const avancement = (t, [a, b]) => clamp01((t - a) / (b - a));
function graineDe(texte) { let h = 2166136261; for (const ch of String(texte)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

/** Crée la scène (asynchrone : textures calculées dans un Worker, shaders compilés en arrière-plan). */
export async function creerScene(conteneur) {
  const essai = document.createElement("canvas");
  if (!(essai.getContext("webgl2") || essai.getContext("webgl"))) return null;

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const debug = new URLSearchParams(location.search).has("debug");
  const T = mobile ? TEMPS_MOBILE : TEMPS_BUREAU;

  // ---------------------------------------------------------------- Scène, rendu, décor
  const textures = await chargerTextures({ mobile });
  const scene = new THREE.Scene();
  const fond = null; // pas de fond : la cloche est posée directement sur la section
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
  const rendu = creerRendu(conteneur, scene, camera, { mobile, debug });
  const m = creerMateriaux(textures, { mobile });
  const vitrine = creerVitrine(m, { mobile });
  scene.add(vitrine.fixe);
  const pivot = new THREE.Group();          // rotation (repos, présentation, glisser)
  const plateau = new THREE.Group();        // translation pendant la passation
  scene.add(plateau);
  plateau.add(pivot);
  pivot.add(vitrine.racine);
  const support = new THREE.Group();        // reçoit le diorama, posé sur le plateau de maquette
  support.position.y = SOL_Y;
  vitrine.racine.add(support);

  // Lumière de musée : spot chaud (2 700 K) en haut à gauche, contre-jour froid, remplissage très faible
  const SPOT = mobile ? 1150 : 1050;
  const spot = new THREE.SpotLight(0xffb978, SPOT, 0, 0.34, 0.85, 2);
  spot.position.set(-6.5, 14.5, 7.5);
  spot.target.position.set(0, 1.6, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  spot.shadow.radius = mobile ? 3 : 7;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.025;
  Object.assign(spot.shadow.camera, { near: 8, far: 32 });
  scene.add(spot, spot.target);
  rendu.ombres(spot);
  const contre = new THREE.DirectionalLight(0xaec4ff, 0.65);
  contre.position.set(5, 8, -11);
  scene.add(contre);
  const remplissage = new THREE.HemisphereLight(0xffe7c8, 0x22180f, 0.14);
  scene.add(remplissage);

  // Éclat du burin (gravure de la plaque)
  const texEclat = spriteDoux();
  const eclat = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEclat, color: 0xffd9a8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  eclat.scale.setScalar(0.32);
  eclat.visible = false;
  vitrine.racine.add(eclat);

  // ---------------------------------------------------------------- Cadrage
  const cible = new THREE.Vector3(0, 2.15, 0);
  let distance = 14;
  const ELEVATION = THREE.MathUtils.degToRad(14);
  function cadrer() {
    if (!rendu.dimensionner()) return;
    const v = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Marge : le canevas déborde de sa colonne et la cloche y bouge ; elle ne doit jamais toucher son bord.
    distance = Math.max(3.3 / v, 4.3 / (v * camera.aspect)) * 1.38;
    sale = true;
  }
  new ResizeObserver(cadrer).observe(rendu.renderer.domElement);

  // ---------------------------------------------------------------- État
  let actuel = null, ancien = null, params = EXEMPLE;
  let t = T.fin, enLecture = false, etat = "repos", respire = false, sale = true;
  let gravure = null, gravureN = -1;
  const auxTemps = [];
  let auFini = null;
  let rotation = ROT_FACE, rotDepart = ROT_FACE, rotCible = ROT_FACE;
  let dolly = 0, focus = null;

  function installer(p) {
    const d = creerDiorama(p, m, { mobile, T, graine: graineDe(p.nom || p.archetype) });
    const s = Math.min((RAYON_INTERIEUR * 0.95) / d.rayon, (HAUTEUR_UTILE * 0.92) / d.hauteur, 0.6);
    const porteur = new THREE.Group();
    porteur.scale.setScalar(s);
    d.groupe.position.set(-d.centre.x, 0, -d.centre.z);
    porteur.add(d.groupe);
    support.add(porteur);
    d.porteur = porteur;
    d.echelle = s;
    return d;
  }
  function liberer(d) { if (!d) return; d.porteur.removeFromParent(); d.dispose(); }

  /** Applique la chorégraphie au temps « temps » (déterministe : même temps, même image). */
  function appliquer(temps) {
    if (ancien) {
      const p = avancement(temps, T.demontage);
      ancien.demonter(p);
      if (p >= 1) { liberer(ancien); ancien = null; }
    }
    // La lumière de vitrine baisse pendant le démontage, remonte quand les fenêtres s'allument
    const baisse = temps < T.demontage[1] ? doux(temps / T.demontage[1]) : temps < T.vie[0] ? 1 : 1 - doux(avancement(temps, T.vie));
    spot.intensity = SPOT * (1 - 0.5 * baisse);
    // Gravure de la plaque, lettre par lettre, l'éclat suit le burin
    if (gravure) {
      const p = avancement(temps, T.gravure);
      const n = Math.round(p * gravure.longueur);
      if (n !== gravureN) {
        const b = gravure.graver(n);
        gravureN = n;
        eclat.position.copy(vitrine.pointPlaque(b.u, b.v));
      }
      eclat.visible = p > 0 && p < 1;
    }
    if (actuel) for (const a of actuel.pistes) {
      const p = temps <= a.debut ? 0 : temps >= a.fin ? 1 : (temps - a.debut) / (a.fin - a.debut);
      a.appliquer(p);
    }
    dolly = T.travelling ? Math.sin(Math.PI * avancement(temps, T.travelling)) : 0;
    sale = true;
  }

  function finir() {
    if (!enLecture && t >= T.fin) return;
    t = T.fin;
    appliquer(t);
    if (ancien) { liberer(ancien); ancien = null; }
    eclat.visible = false;
    while (auxTemps.length) auxTemps.shift().f();
    enLecture = false;
    etat = "pose";
    const f = auFini; auFini = null;
    if (f) f();
  }

  // État initial : la maquette d'exemple, déjà construite
  actuel = installer(EXEMPLE);
  gravure = vitrine.regraver({ nom: EXEMPLE.nom, depuis: null });
  gravure.graver(gravure.longueur);
  gravureN = gravure.longueur;
  appliquer(T.fin);
  cadrer();
  // Compilation des shaders sans bloquer la page (extension de compilation parallèle quand elle existe)
  await rendu.renderer.compileAsync(scene, camera).catch(() => {});
  conteneur.classList.add("scene-prete");

  // ---------------------------------------------------------------- Interactions : glisser, infobulles, interruption
  const glisser = { actif: false, angle: 0, vitesse: 0, x0: 0, a0: 0, dernierX: 0, dernierT: 0 };
  const toile = rendu.renderer.domElement;
  toile.addEventListener("pointerdown", (e) => {
    glisser.actif = true; glisser.x0 = e.clientX; glisser.a0 = glisser.angle; glisser.dernierX = e.clientX; glisser.dernierT = performance.now();
    toile.setPointerCapture?.(e.pointerId);
  });
  toile.addEventListener("pointermove", (e) => {
    if (glisser.actif) {
      glisser.angle = THREE.MathUtils.clamp(glisser.a0 + (e.clientX - glisser.x0) * 0.006, -DRAG_MAX, DRAG_MAX);
      const now = performance.now();
      glisser.vitesse = ((e.clientX - glisser.dernierX) * 0.006) / Math.max(0.016, (now - glisser.dernierT) / 1000);
      glisser.dernierX = e.clientX; glisser.dernierT = now;
      sale = true;
    } else if (!mobile) survol(e);
  });
  const relacher = () => { glisser.actif = false; };
  toile.addEventListener("pointerup", relacher);
  toile.addEventListener("pointercancel", relacher);
  toile.addEventListener("pointerleave", () => { infobulle.hidden = true; });

  const infobulle = document.createElement("div");
  infobulle.className = "infobulle-3d";
  infobulle.setAttribute("aria-hidden", "true"); // l'information existe aussi en HTML (frise, titre)
  infobulle.hidden = true;
  conteneur.append(infobulle);
  const rayon = new THREE.Raycaster();
  const souris = new THREE.Vector2();
  let dernierSurvol = 0;
  function survol(e) {
    const now = performance.now();
    if (now - dernierSurvol < 60) return;
    dernierSurvol = now;
    const r = conteneur.getBoundingClientRect(), rc = rendu.renderer.domElement.getBoundingClientRect();
    souris.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    rayon.setFromCamera(souris, camera);
    const cibles = [vitrine.plaque, ...(actuel?.fenetresAllumees.filter((f) => f.material !== m.vitreEteinte) ?? [])];
    const touche = rayon.intersectObjects(cibles, false)[0];
    if (!touche) { infobulle.hidden = true; return; }
    let texte;
    if (touche.object === vitrine.plaque) {
      const age = params.depuis ? new Date().getFullYear() - params.depuis : null;
      texte = params.depuis ? `Depuis ${params.depuis} · ${age} an${age > 1 ? "s" : ""}` : (params.nom || "Votre entreprise");
    } else {
      texte = params.effectif ? `${params.effectif[0].toUpperCase()}${params.effectif.slice(1)} travaillent ici` : "Ici, on travaille";
    }
    infobulle.textContent = texte;
    infobulle.style.left = `${e.clientX - r.left}px`;
    infobulle.style.top = `${e.clientY - r.top}px`;
    infobulle.hidden = false;
  }
  const interrompre = () => { if (enLecture) finir(); };
  ["wheel", "touchmove", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, interrompre, { passive: true }));

  // ---------------------------------------------------------------- Passation (au défilement)
  const passation = reduit() ? null : creerPassation(conteneur);
  let forcePassation = null;
  function progresPassation() {
    if (forcePassation != null) return forcePassation;
    const r = conteneur.getBoundingClientRect();
    return clamp01((window.innerHeight * 0.06 - r.top) / (r.height * 0.55));
  }
  const projeter = (v) => {
    const p = v.clone().project(camera), c = rendu.renderer.domElement;
    return { x: (p.x * 0.5 + 0.5) * c.clientWidth, y: (-p.y * 0.5 + 0.5) * c.clientHeight };
  };

  // ---------------------------------------------------------------- Boucle
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(conteneur);
  const horloge = new THREE.Clock();
  let tt = 0, prochainClignement = 4, clignote = null;
  function image(maintenant) {
    requestAnimationFrame(image);
    const dt = Math.min(0.1, horloge.getDelta());
    if (!visible && !enLecture) return;
    const calme = reduit();
    tt += dt;

    if (enLecture) {
      t = Math.min(T.fin, t + dt);
      appliquer(t);
      while (auxTemps.length && auxTemps[0].t <= t) auxTemps.shift().f();
      if (t >= T.fin) finir();
    }

    // Rotation : tour lent au repos, retour à la présentation pendant le démontage, léger balancement ensuite
    if (!calme) {
      if (etat === "repos") rotation += (dt * Math.PI * 2) / TOUR_REPOS;
      else if (enLecture && t < T.demontage[1]) rotation = rotDepart + (rotCible - rotDepart) * doux(t / T.demontage[1]);
      else rotation = rotCible + Math.sin(tt * 0.16) * 0.09;
      if (!glisser.actif) {
        glisser.angle += glisser.vitesse * dt;
        glisser.vitesse *= Math.pow(0.04, dt);
        glisser.vitesse -= glisser.angle * dt * 6;           // retour doux
        glisser.angle = THREE.MathUtils.clamp(glisser.angle, -DRAG_MAX, DRAG_MAX);
      }
      sale = true;
    }
    // Mouvement dans la section : en la traversant, la cloche pivote et s'élève légèrement
    const rs = conteneur.closest("section")?.getBoundingClientRect() ?? conteneur.getBoundingClientRect();
    const defil = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (rs.top + rs.height / 2)) / (rs.height / 2 + window.innerHeight / 2)));
    const scrollRot = calme ? 0 : defil * 0.9;
    pivot.rotation.y = rotation + glisser.angle + scrollRot;
    pivot.position.y = calme ? 0 : Math.sin(tt * 0.6) * 0.05 - defil * 0.25;

    if (respire) spot.intensity = SPOT * (0.78 + 0.22 * Math.sin(tt * 3));
    if (!calme) {
      actuel?.animer(dt, tt);
      vitrine.animerPoussiere(dt, tt);
      // Au repos, une fenêtre clignote parfois
      if (etat === "repos" && actuel?.fenetresAllumees.length) {
        if (clignote && tt > clignote.fin) { clignote.f.material = clignote.mat; clignote = null; }
        if (!clignote && tt > prochainClignement) {
          const f = actuel.fenetresAllumees[Math.floor(Math.random() * actuel.fenetresAllumees.length)];
          if (f.material !== m.vitreEteinte) { clignote = { f, mat: f.material, fin: tt + 0.22 }; f.material = m.vitreEteinte; }
          prochainClignement = tt + 5 + Math.random() * 6;
        }
      }
    }

    // Passation : l'ensemble se soulève, glisse vers la droite, la caméra suit
    const pp = passation ? progresPassation() : 0;
    const lever = doux((pp - 0.22) / 0.28), glisse = doux((pp - 0.45) / 0.4);
    plateau.position.set(glisse * 2.2, lever * 0.75, 0);
    vitrine.ombre.material.opacity = 0.75 * (1 - lever * 0.8);

    // Caméra : cadrage, travelling vers l'entrée, suivi de la passation
    const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    const c = cible.clone();
    c.x += plateau.position.x * 0.55; c.y += plateau.position.y * 0.6;
    let dist = distance;
    if (dolly > 0 && actuel?.porte) {
      const porte = actuel.porte.clone();
      actuel.groupe.localToWorld(porte);
      c.lerp(porte, dolly * 0.55);
      dist = distance * (1 - dolly * 0.42);
      focus = porte;
    } else focus = null;
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.lookAt(c);
    // Tilt-shift : la bande nette passe par la façade (ou par l'entrée pendant le travelling)
    const pointNet = focus ?? new THREE.Vector3(plateau.position.x, SOL_Y + 1.2 + plateau.position.y, 0);
    rendu.tilt.offset = pointNet.clone().project(camera).y;

    if (passation) {
      const g = projeter(new THREE.Vector3(plateau.position.x - 3.15, plateau.position.y + 0.02, 1.2));
      const d = projeter(new THREE.Vector3(plateau.position.x + 3.15, plateau.position.y + 0.02, 1.2));
      passation.maj(pp, g, d, Math.abs(d.x - g.x) * 0.62);
    }

    if (sale || enLecture) { rendu.rendre(maintenant, !enLecture); sale = calme ? false : sale; }
  }
  requestAnimationFrame(image);

  if (debug) {
    window.__cloche = {
      allerA(temps) { if (temps >= T.fin) { enLecture = true; finir(); return; } enLecture = false; t = temps; appliquer(temps); },
      passation(p) { forcePassation = p; sale = true; },
      get ips() { return rendu.ips; },
      get palier() { return rendu.palier; },
      scene, vitrine, rendu,
      /** Image PNG transparente du canevas (pour l'image d'attente détourée). */
      image() { rendu.composer.render(); return rendu.renderer.domElement.toDataURL("image/png"); },
    };
  }

  return {
    temps: T,
    /** Le socle « respire » (lumière qui pulse) pendant le chargement des données. */
    respirer(oui) {
      respire = oui;
      if (!oui) spot.intensity = SPOT;
      sale = true;
    },
    /**
     * Construit la maquette d'une entreprise. evenements : [{ t, f }] rappelés pendant la lecture.
     * depuisEtages : pas de démontage ni de gravure (saisie du CA), reprise à la construction.
     */
    construire(p, { evenements = [], fin = null, depuisEtages = false } = {}) {
      respire = false;
      if (enLecture) finir();
      params = p;
      if (ancien) { liberer(ancien); ancien = null; }
      if (depuisEtages) liberer(actuel); else ancien = actuel;
      actuel = installer(p);
      if (!depuisEtages) {
        gravure = vitrine.regraver({ nom: p.nom, depuis: p.depuis });
        gravureN = -1;
      }
      auxTemps.length = 0;
      auxTemps.push(...[...evenements].sort((a, b) => a.t - b.t));
      auFini = fin;
      etat = "construction";
      rotDepart = rotation;
      rotCible = ROT_FACE + Math.PI * 2 * Math.round((rotation - ROT_FACE) / (Math.PI * 2));
      if (reduit()) { rotation = rotCible; enLecture = true; finir(); sale = true; return; }
      t = depuisEtages ? T.construction[0] + 0.5 : 0;
      appliquer(t);
      enLecture = true;
    },
    terminer: finir,
    /** Image PNG 1600 × 900 : la cloche, le nom, « depuis », le logo et l'adresse du site. Aucune valeur. */
    async exporter({ nom, depuis }) {
      const L = 1600, H = 900;
      const taille = new THREE.Vector2();
      rendu.renderer.getSize(taille);
      const ratio = rendu.renderer.getPixelRatio();
      rendu.renderer.setPixelRatio(1);
      rendu.renderer.setSize(1000, 820, false);
      rendu.composer.setSize(1000, 820, false);
      camera.aspect = 1000 / 820; camera.updateProjectionMatrix();
      rendu.composer.render();
      const image = rendu.renderer.domElement.toDataURL("image/png");
      rendu.renderer.setPixelRatio(ratio);
      rendu.renderer.setSize(taille.x, taille.y, false);
      rendu.composer.setSize(taille.x, taille.y, false);
      cadrer();

      await document.fonts.ready;
      const t2 = document.createElement("canvas");
      t2.width = L; t2.height = H;
      const ctx = t2.getContext("2d");
      ctx.fillStyle = "#120e0b"; ctx.fillRect(0, 0, L, H);
      const img = new Image();
      img.src = image;
      await img.decode();
      ctx.drawImage(img, 560, 40, 1000, 820);
      const fondu = ctx.createLinearGradient(560, 0, 720, 0);
      fondu.addColorStop(0, "#120e0b"); fondu.addColorStop(1, "rgba(18,14,11,0)");
      ctx.fillStyle = fondu; ctx.fillRect(560, 0, 160, H);
      ctx.fillStyle = "#A39886";
      ctx.font = '500 20px "Geist Mono", monospace';
      ctx.fillText("M A Q U E T T E", 96, 300);
      ctx.fillStyle = "#FBF6EC";
      let corps = 92;
      ctx.font = `500 ${corps}px "Geist", sans-serif`;
      while (ctx.measureText(nom).width > 520 && corps > 44) { corps -= 4; ctx.font = `500 ${corps}px "Geist", sans-serif`; }
      const lignes = couper(ctx, nom, 520);
      lignes.slice(0, 3).forEach((l, i) => ctx.fillText(l, 96, 390 + i * corps * 1.02));
      if (depuis) {
        ctx.fillStyle = "#E9C9A4";
        ctx.font = 'italic 400 46px "Geist", sans-serif';
        ctx.fillText(`depuis ${depuis}`, 96, 390 + Math.min(3, lignes.length) * corps * 1.02 + 30);
      }
      ctx.save();
      ctx.translate(L - 330, H - 92);
      ctx.strokeStyle = "#FBF6EC"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(9, 27); ctx.lineTo(9, 15); ctx.arc(16, 15, 7, Math.PI, 0); ctx.lineTo(23, 27); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, 27); ctx.lineTo(27, 27); ctx.stroke();
      ctx.fillStyle = "#A8653A"; ctx.beginPath(); ctx.arc(16, 21, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FBF6EC"; ctx.font = '500 30px "Geist", sans-serif';
      ctx.fillText("Passation", 40, 28);
      ctx.fillStyle = "#A39886"; ctx.font = '400 18px "Geist Mono", monospace';
      ctx.fillText(location.host, 42, 58);
      ctx.restore();
      return new Promise((ok) => t2.toBlob(ok, "image/png"));
    },
  };
}

function couper(ctx, texte, largeur) {
  const mots = texte.split(/\s+/);
  const lignes = [];
  let ligne = "";
  for (const m of mots) {
    const essai = ligne ? `${ligne} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && ligne) { lignes.push(ligne); ligne = m; } else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}
