// L'histoire des clés (section #histoire).
// Ordinateur (≥ 1024 px, mouvement normal) : section haute, scène collante 1920 × 1080 mise à l'échelle pour couvrir
// l'écran ; l'allumage et la chute se jouent une fois, au temps, quand la section arrive en haut ; tout le reste suit
// le défilement (histoire-poses.js). Textes en HTML dans une colonne à gauche.
// Téléphone, tablette, et mouvement réduit partout : trois panneaux qui se jouent à l'apparition (état final direct
// en mouvement réduit).
import * as P from "/js/landing/histoire-poses.js";
import { creerDossier } from "/js/landing/dossier.js";

const IMG = "/img/landing/";
// Sprites (keys.json du kit) : taille CSS et trou de l'anneau (pivot, accroche de la ficelle)
const SPRITES = [
  { w: 104, h: 264, tx: 52, ty: 38 }, { w: 104, h: 264, tx: 52, ty: 46 }, { w: 104, h: 264, tx: 52, ty: 28 },
  { w: 81.12, h: 205.92, tx: 40.56, ty: 29.64 }, { w: 104, h: 264, tx: 52, ty: 34 }, { w: 81.12, h: 205.92, tx: 40.56, ty: 29.64 },
  { w: 104, h: 264, tx: 52, ty: 38 }, { w: 104, h: 264, tx: 52, ty: 46 }, { w: 104, h: 264, tx: 52, ty: 34 },
];
// Chapitre → sprite : bureau (yale), portail (ancienne clé de bronze), atelier (clé de fer), camion (clé de voiture),
// vestiaire (petite clé de laiton), coffre (clé à pastilles), vitrine (yale laiton), classeurs (petite), combien (pastilles)
const SPRITE_DU_CHAPITRE = [0, 7, 1, 2, 3, 4, 6, 5, 8];
const VAGUE = '<svg class="etiquette-trait" width="84" height="14" viewBox="0 0 84 14" aria-hidden="true"><path d="M2 9C20 3 40 11 60 6S78 7 82 4" stroke="#2A221B" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".7"/></svg>';

const el = (tag, classe) => { const e = document.createElement(tag); if (classe) e.className = classe; return e; };
const f2 = (x) => Math.round(x * 100) / 100;
/** Ombre portée brun chaud : grande, décalée et floue quand l'objet est en l'air (h), resserrée au contact. */
const ombre = (h, base, pente, etiquette = false) => etiquette
  ? `drop-shadow(${f2(2 + 13 * h)}px ${f2(4 + 20 * h)}px ${f2(3 + 18 * h)}px rgb(70 48 28 / ${f2(Math.max(0.1, base - pente * h))}))`
  : `drop-shadow(${f2(3 + 15 * h)}px ${f2(5 + 24 * h)}px ${f2(3 + 20 * h)}px rgb(70 48 28 / ${f2(Math.max(0.1, base - pente * h))}))`;

/** Étiquette recto (manuscrit) / verso (numéro, titre, détail). */
function creerEtiquette(c, i, derniere) {
  const carte = el("div", "etiquette-carte");
  const recto = el("div", "etiquette-face etiquette-recto");
  const main = el("span", "etiquette-main");
  main.textContent = c.recto;
  recto.append(main);
  recto.insertAdjacentHTML("beforeend", VAGUE);
  const verso = el("div", `etiquette-face etiquette-verso${derniere ? " etiquette-verte" : ""}`);
  const num = el("span", "etiquette-numero"); num.textContent = c.numero;
  const titre = el("span", "etiquette-titre"); titre.textContent = c.titre;
  const detail = el("span", "etiquette-detail"); detail.textContent = c.detail;
  verso.append(num, titre, el("span", "etiquette-filet"), detail);
  carte.append(recto, verso);
  return carte;
}
function imageCle(i) {
  const s = SPRITES[SPRITE_DU_CHAPITRE[i]];
  const img = el("img", "cle-image");
  img.alt = "";
  img.decoding = "async";
  img.dataset.src = `${IMG}cles/k${SPRITE_DU_CHAPITRE[i]}.webp`;
  img.width = Math.round(s.w); img.height = Math.round(s.h);
  img.style.cssText = `left:${-s.tx}px;top:${-s.ty}px;width:${s.w}px;height:${s.h}px`;
  return img;
}

/** Le texte manuscrit tient dans l'étiquette (104 px) : réduction de la taille si besoin, une fois les polices prêtes. */
function ajusterMains(racine) {
  racine.querySelectorAll(".etiquette-main").forEach((m) => {
    let t = 31;
    m.style.fontSize = `${t}px`;
    while (m.scrollWidth > 104 && t > 14) { t -= 1; m.style.fontSize = `${t}px`; }
  });
}

/** Charge les images différées (data-src, data-fond) d'un conteneur. */
function charger(racine) {
  racine.querySelectorAll("img[data-src]").forEach((i) => { i.src = i.dataset.src; delete i.dataset.src; });
  racine.querySelectorAll("[data-fond]").forEach((d) => { d.style.backgroundImage = `url("${d.dataset.fond}")`; delete d.dataset.fond; });
}

// ---------------------------------------------------------------- Scène de l'établi (ordinateur, et panneau 1)
function creerEtabli({ chapitres, dossierTextes, avecDossier = true, fictif = "" }) {
  const stage = el("div", "etabli-stage");
  const cameraEl = el("div", "etabli-camera");
  // Fond sable uni, en CSS (dégradé et grain) : dans la caméra pour suivre son léger zoom
  cameraEl.append(el("div", "etabli-fond"));
  let dossier = null, dossierPorteur = null;
  if (avecDossier) {
    dossier = creerDossier({ textes: dossierTextes, chapitres });
    dossierPorteur = el("div", "etabli-dossier");
    dossierPorteur.append(dossier.element);
    if (fictif) { const f = el("p", "histoire-fictif"); f.textContent = fictif; dossierPorteur.append(f); }
    cameraEl.append(dossierPorteur);
  }
  const objets = el("div", "etabli-objets");
  const pieces = chapitres.map((c, i) => {
    const kw = el("div", "piece"), kr = el("div", "piece-rotation");
    kr.append(imageCle(i));
    kw.append(kr);
    const tw = el("div", "piece"), tr = el("div", "piece-rotation etiquette-perspective");
    const carte = creerEtiquette(c, i, i === chapitres.length - 1);
    tr.append(carte); tw.append(tr);
    objets.append(kw, tw);
    return { kw, kr, tw, tr, carte, cache: {} };
  });
  cameraEl.append(objets);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "etabli-ficelles");
  svg.setAttribute("width", "1920"); svg.setAttribute("height", "1080");
  const ficelles = chapitres.map(() => {
    const g = document.createElementNS(ns, "g");
    const mk = (cl) => { const p = document.createElementNS(ns, "path"); p.setAttribute("class", cl); g.append(p); return p; };
    const chemins = [mk("ficelle-fond"), mk("ficelle-coeur"), mk("ficelle-torsion")];
    const rond = (cl) => { const c = document.createElementNS(ns, "circle"); c.setAttribute("class", cl); c.setAttribute("r", "3.2"); g.append(c); return c; };
    const a = rond("ficelle-noeud"), b = rond("ficelle-noeud");
    svg.append(g);
    return { g, chemins, a, b };
  });
  cameraEl.append(svg);
  stage.append(cameraEl);

  const fixer = (x, cle, valeur, ecrire) => { if (x.cache[cle] !== valeur) { x.cache[cle] = valeur; ecrire(valeur); } };
  function poser(t, { reduit = false } = {}) {
    cameraEl.style.transform = `scale(${P.camera(t).toFixed(4)})`;
    pieces.forEach((x, i) => {
      const k = P.cle(i, t), e = P.etiquette(i, t, k.jit);
      fixer(x, "kvis", k.op > 0.001, (v) => { x.kw.style.display = v ? "" : "none"; });
      if (k.op > 0.001) {
        x.kw.style.opacity = k.op.toFixed(3);
        x.kw.style.transform = `translate(${f2(k.x)}px,${f2(k.y)}px) scale(${k.s.toFixed(4)})`;
        x.kr.style.transform = `rotate(${f2(k.rot)}deg)`;
        // Ombre sur le conteneur non tourné : elle tombe toujours du même côté, plus loin quand la clé est soulevée
        const h = Math.round(k.h * 50) / 50;
        fixer(x, "kombre", h, (v) => { x.kw.style.filter = reduit ? "" : ombre(v, 0.42, 0.12); });
        fixer(x, "kz", k.z, (v) => { x.kw.style.zIndex = v; });
      }
      fixer(x, "tvis", e.op > 0.001, (v) => { x.tw.style.display = v ? "" : "none"; });
      if (e.op > 0.001) {
        x.tw.style.opacity = e.op.toFixed(3);
        x.tw.style.transform = `translate(${f2(e.x)}px,${f2(e.y)}px) scale(${e.s.toFixed(4)})`;
        x.tr.style.transform = `rotate(${f2(e.rot)}deg)`;
        fixer(x, "flip", f2(e.flip), (v) => { x.carte.style.transform = `rotateY(${f2(180 * v)}deg)`; });
        const h = Math.round(e.h * 50) / 50;
        fixer(x, "tombre", h, (v) => { x.tw.style.filter = reduit ? "" : ombre(v, 0.36, 0.10, true); });
        fixer(x, "tz", e.z, (v) => { x.tw.style.zIndex = v; });
      }
      const f = P.ficelle(i, t, k, e), F = ficelles[i];
      F.g.style.display = f ? "" : "none";
      if (f) {
        F.g.style.opacity = f.op.toFixed(3);
        const d = `M${f2(f.x1)} ${f2(f.y1)}Q${f2(f.cx)} ${f2(f.cy)} ${f2(f.x2)} ${f2(f.y2)}`;
        F.chemins.forEach((p) => p.setAttribute("d", d));
        F.a.setAttribute("cx", f2(f.x1)); F.a.setAttribute("cy", f2(f.y1));
        F.b.setAttribute("cx", f2(f.x2)); F.b.setAttribute("cy", f2(f.y2));
      }
    });
    if (dossier) {
      const d = P.dossier(t);
      dossierPorteur.style.display = d.visible ? "" : "none";
      if (d.visible) dossierPorteur.style.transform = `translateY(${f2(d.y)}px) rotate(${f2(d.rot)}deg)`;
      dossier.definir({ onglets: pieces.map((_, i) => P.onglet(i, t)) });
    }
  }
  return { stage, poser, charger: () => charger(stage), ajuster: () => ajusterMains(stage) };
}

// ---------------------------------------------------------------- Section
export function lancerHistoire(section, { chapitres, dossierTextes, fictif }) {
  if (!section || !chapitres?.length) return;
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)");
  const large = window.matchMedia("(min-width: 1024px)");
  const modeScene = () => large.matches && !reduit.matches;
  let scene = null, panneaux = null;

  const appliquerMode = () => {
    section.classList.toggle("histoire-scene", modeScene());
    section.classList.toggle("histoire-panneaux", !modeScene());
    if (modeScene()) (scene ??= monterScene(section, { chapitres, dossierTextes, fictif })).demarrer();
    else { scene?.arreter(); panneaux ??= monterPanneaux(section, { chapitres, dossierTextes, fictif, reduit }); }
  };
  appliquerMode();
  large.addEventListener("change", appliquerMode);
  reduit.addEventListener("change", appliquerMode);
}

function monterScene(section, { chapitres, dossierTextes, fictif }) {
  const collant = section.querySelector(".histoire-collant");
  const cadre = el("div", "histoire-cadre");
  cadre.setAttribute("aria-hidden", "true");
  const etabli = creerEtabli({ chapitres, dossierTextes, fictif });
  cadre.append(etabli.stage);
  collant.prepend(cadre);
  const blocs = [...section.querySelectorAll(".histoire-temps")].map((b) => [...b.querySelectorAll(".histoire-texte > *")]);
  const barre = section.querySelector(".histoire-progression span");

  const etat = { chute: null, jouee: false, raf: 0, visible: false, dernier: null, charge: false };
  const dimensionner = () => {
    const W = cadre.clientWidth, H = cadre.clientHeight;
    const k = Math.max(W / 1920, H / 1080);
    etabli.stage.style.transform = `translate(${f2((W - 1920 * k) / 2)}px,${f2((H - 1080 * k) / 2)}px) scale(${k.toFixed(5)})`;
  };
  // La carte colle sous l'en-tête : la progression va de son arrivée en place à la fin de la section
  const progression = () => {
    const r = section.getBoundingClientRect();
    const haut = parseFloat(getComputedStyle(collant).top) || 0, pad = parseFloat(getComputedStyle(section).paddingTop) || 0;
    return P.clamp01((haut - (r.top + pad)) / Math.max(1, r.height - pad - collant.offsetHeight));
  };
  const enPlace = () => {
    const r = section.getBoundingClientRect();
    return r.top + (parseFloat(getComputedStyle(section).paddingTop) || 0) <= (parseFloat(getComputedStyle(collant).top) || 0) + 4;
  };
  function image(now) {
    etat.raf = 0;
    // L'arrivée du trousseau se joue une seule fois, au temps, quand la carte Histoire arrive en place
    if (!etat.jouee && etat.chute == null && enPlace()) etat.chute = now;
    let t, anime = false;
    if (etat.chute != null && !etat.jouee) {
      t = P.T_DEBUT + (now - etat.chute) / 1000;
      if (t >= P.T_POSE) { etat.jouee = true; t = P.tempsDefilement(progression()); } else anime = true;
    } else t = etat.jouee ? P.tempsDefilement(progression()) : P.T_DEBUT;
    if (t !== etat.dernier) {
      etat.dernier = t;
      etabli.poser(t);
      P.TEMPS.forEach(([a, b], j) => {
        const bl = P.bloc(t, a, b, blocs[j].length);
        blocs[j].forEach((e, c) => { e.style.opacity = bl.enfants[c].op.toFixed(3); e.style.transform = `translateY(${f2(bl.enfants[c].dy)}px)`; });
        blocs[j][0]?.parentElement.parentElement.classList.toggle("histoire-temps-actif", bl.visible);
      });
      if (barre) barre.style.transform = `scaleX(${progression().toFixed(4)})`;
    }
    if (anime) demander();
  }
  const demander = () => { if (!etat.raf && etat.visible) etat.raf = requestAnimationFrame(image); };
  const surDefilement = () => demander();

  // Images : chargées quand la section est à moins de 1 500 px
  const pres = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || etat.charge) return;
    etat.charge = true;
    section.classList.add("histoire-pret");
    etabli.charger();
    document.fonts?.ready.then(() => { etabli.ajuster(); etat.dernier = null; demander(); });
    pres.disconnect();
  }, { rootMargin: "1500px 0px" });
  const vue = new IntersectionObserver(([e]) => { etat.visible = e.isIntersecting; if (etat.visible) demander(); });
  let actif = false;
  return {
    demarrer() {
      if (actif) return;
      actif = true;
      dimensionner();
      pres.observe(section);
      vue.observe(section);
      addEventListener("scroll", surDefilement, { passive: true });
      addEventListener("resize", () => { dimensionner(); etat.dernier = null; demander(); }, { passive: true });
      etabli.poser(P.T_DEBUT);
      demander();
    },
    arreter() {
      actif = false;
      vue.disconnect();
      removeEventListener("scroll", surDefilement);
      cancelAnimationFrame(etat.raf); etat.raf = 0;
    },
  };
}

// ---------------------------------------------------------------- Panneaux (téléphone, tablette, mouvement réduit)
function monterPanneaux(section, { chapitres, dossierTextes, fictif, reduit }) {
  const [v1, v2, v3] = [...section.querySelectorAll(".histoire-visuel")];
  // 1. Le trousseau en vrac sur l'établi (même scène, cadrée sur la pile)
  const etabli = creerEtabli({ chapitres, dossierTextes, avecDossier: false });
  const cadre1 = el("div", "panneau-etabli");
  cadre1.append(etabli.stage);
  v1.append(cadre1);
  const cadrer = () => {
    const W = cadre1.clientWidth, H = cadre1.clientHeight;
    const k = Math.max(W / 760, H / 560);                      // zone de la pile : x 740 → 1500, y 380 → 940
    etabli.stage.style.transform = `translate(${f2(W / 2 - 1120 * k)}px,${f2(H / 2 - 660 * k)}px) scale(${k.toFixed(5)})`;
  };
  // 2. Grille de 3 × 3 : chaque clé sous son étiquette, qui se retourne
  const grille = el("ol", "panneau-grille");
  chapitres.forEach((c, i) => {
    const li = el("li", "panneau-cle");
    li.style.setProperty("--i", i);
    const carte = creerEtiquette(c, i, i === chapitres.length - 1);
    const porte = el("div", "panneau-etiquette etiquette-perspective");
    porte.append(carte);
    const cle = el("div", "panneau-sprite");
    cle.append(imageCle(i));
    li.append(porte, el("span", "panneau-ficelle"), cle);
    grille.append(li);
  });
  v2.append(grille);
  // 3. Le dossier et ses onglets
  const dossier = creerDossier({ textes: dossierTextes, chapitres });
  dossier.definir({ onglets: chapitres.map(() => ({ op: 1, dx: 0 })) });
  const porteDossier = el("div", "panneau-dossier");
  porteDossier.append(dossier.element);
  if (fictif) { const f = el("p", "histoire-fictif"); f.textContent = fictif; porteDossier.append(f); }
  v3.append(porteDossier);

  const final = () => { etabli.poser(P.T_POSE, { reduit: true }); grille.classList.add("retournees"); section.classList.add("histoire-jouee"); };
  const pres = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    pres.disconnect();
    section.classList.add("histoire-pret");
    charger(v1); charger(v2);
    document.fonts?.ready.then(() => { ajusterMains(section); cadrer(); });
  }, { rootMargin: "1500px 0px" });
  pres.observe(section);
  addEventListener("resize", cadrer, { passive: true });
  cadrer();

  if (reduit.matches) { final(); return { final }; }
  etabli.poser(P.T_DEBUT);
  // Chaque panneau se joue à son apparition, une seule fois
  const jouer = (v, f) => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); f(); } }, { threshold: 0.45 });
    o.observe(v);
  };
  jouer(v1, () => {
    const t0 = performance.now();
    const pas = (now) => {
      const t = Math.min(P.T_POSE, P.T_DEBUT + (now - t0) / 1000);
      etabli.poser(t);
      if (t < P.T_POSE) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  });
  jouer(v2, () => grille.classList.add("retournees"));
  jouer(v3, () => porteDossier.classList.add("arrive"));
  return { final };
}
