// Hero video: playlist of trade clips (src/contenu/cles.json, videos_metiers:
// [{ mp4, webm, poster, metier, mp4_720?, webm_720? }]), 1.5 to 2 s each, chained with a 400 ms crossfade by two
// alternating <video> elements (the second player is created only at that point), looping. Empty list: the current video,
// looping, in 1080p; 2160p only from 1,600 px wide, on a fast connection.
// Never with "reduce motion" or in data saver mode (the poster stays). On phones: only
// if 720p versions are provided. Paused off screen and when the tab is hidden; pause/play button (WCAG 2.2.2).

const FONDU = 400; // ms

/** 2160p: screen at least 1,600 px wide (CSS) and fast connection; 1080p otherwise. */
export const uhd = (largeur, rapide = true) => largeur >= 1600 && rapide;

export function lancerVideo({ hero, textes = {} }) {
  const zone = hero?.querySelector(".hero-videos");
  if (!zone) return;
  const a = zone.querySelector("video");
  if (!a) return;
  const bouton = hero.querySelector(".hero-pause");
  const libelle = bouton?.querySelector(".visuellement-cache");
  const legende = hero.querySelector(".hero-metier");
  const connexion = navigator.connection || {};
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const telephone = window.matchMedia("(max-width: 768px)").matches;
  if (reduit || connexion.saveData) return;

  let clips = [];
  try { clips = JSON.parse(document.getElementById("videos-metiers")?.textContent || "[]"); } catch { clips = []; }
  clips = (Array.isArray(clips) ? clips : []).filter((c) => c && (c.mp4 || c.webm));
  if (telephone) clips = clips.filter((c) => c.mp4_720 || c.webm_720).map((c) => ({ ...c, mp4: c.mp4_720, webm: c.webm_720 }));
  if (telephone && !clips.length) return; // no light version: the poster is enough

  // Second player, for the crossfade between two clips: only if there are several clips
  const b = clips.length > 1 ? zone.appendChild(a.cloneNode(false)) : null;
  const etat = { arretParVous: false, visible: true, courant: a, suivant: b, index: 0, bascule: false };

  const sources = (video, liste) => {
    video.replaceChildren(...liste.filter(([src]) => src).map(([src, type]) => Object.assign(document.createElement("source"), { src, type })));
    video.load();
  };
  const sourcesClip = (video, c) => {
    if (c.poster) video.poster = c.poster;
    sources(video, [[c.webm, "video/webm"], [c.mp4, "video/mp4"]]);
  };

  if (clips.length) {
    a.preload = "auto";
    sourcesClip(a, clips[0]);
    if (b) { b.preload = "auto"; sourcesClip(b, clips[1]); }
    else a.loop = true;
    const surTemps = (v) => () => {
      if (v !== etat.courant || etat.bascule || clips.length < 2 || !v.duration) return;
      if (v.duration - v.currentTime > FONDU / 1000) return;
      basculer();
    };
    a.addEventListener("timeupdate", surTemps(a));
    b?.addEventListener("timeupdate", surTemps(b));
  } else {
    // Current video: 1080p; 2160p only on a screen at least 1,600 px wide, with a fast connection
    // (data saver has already stopped the video above)
    const rapide = !connexion.effectiveType || connexion.effectiveType === "4g";
    sources(a, JSON.parse(uhd(window.innerWidth, rapide) ? zone.dataset.sourcesUhd : zone.dataset.sourcesHd));
    a.loop = true;
  }

  function basculer() {
    etat.bascule = true;
    const sortant = etat.courant, entrant = etat.suivant;
    etat.index = (etat.index + 1) % clips.length;
    entrant.currentTime = 0;
    entrant.hidden = false;
    entrant.play().catch(() => {});
    entrant.classList.add("lue");
    sortant.classList.remove("lue");
    montrerMetier(clips[etat.index]);
    setTimeout(() => {
      sortant.pause();
      sortant.hidden = true;
      sourcesClip(sortant, clips[(etat.index + 1) % clips.length]); // the next one loads meanwhile
      etat.courant = entrant; etat.suivant = sortant; etat.bascule = false;
    }, FONDU);
  }
  function montrerMetier(c) {
    if (!legende) return;
    legende.textContent = c?.metier || "";
    legende.hidden = !c?.metier;
  }

  const jouer = () => {
    if (etat.arretParVous || !etat.visible || document.hidden) return;
    etat.courant.hidden = false;
    etat.courant.play().then(() => {
      etat.courant.classList.add("lue");
      if (bouton) bouton.hidden = false;
    }).catch(() => {});
  };
  const suspendre = () => { a.pause(); b?.pause(); };
  const majBouton = () => {
    if (!bouton) return;
    bouton.classList.toggle("en-pause", etat.arretParVous);
    libelle.textContent = etat.arretParVous ? textes.lecture : textes.pause;
  };

  bouton?.addEventListener("click", () => {
    etat.arretParVous = !etat.arretParVous;
    if (etat.arretParVous) suspendre(); else jouer();
    majBouton();
  });
  new IntersectionObserver(([e]) => {
    etat.visible = e.isIntersecting;
    if (etat.visible) jouer(); else suspendre();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? suspendre() : jouer()));
  if (clips.length) montrerMetier(clips[0]);
  majBouton();
  jouer();
}
