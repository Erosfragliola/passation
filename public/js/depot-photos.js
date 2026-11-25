// Guided upload of the logo and photos (part D, 24/11/2026), shared by the guided steps ("Photos and logo") and the
// memorandum page ("Sources of the memorandum"):
//   - the attestation sits above the upload; the button stays inactive until it is ticked; files dropped before are
//     kept and sent as soon as it is ticked (nothing to choose again);
//   - several files at once (button or drag and drop), up to the quota (12), one progress bar per file;
//   - a photo too heavy is reduced in the browser before being sent (JPEG), instead of being refused;
//   - every error says what to do (format, weight, quota, duplicate, analysis unavailable).
// The pure rules (planReduction, controleFichier, endroitPhoto, conseilErreur) are tested in test/depot-photos.test.js.
import { t } from "./i18n.js";
import { placementPhotos } from "./memo-format.js";

export const TYPES_ACCEPTES = ["image/jpeg", "image/png", "image/webp"];
/** Longest side kept for a photo of the memorandum: twice the width of a full page (1,200 px), enough for print. */
export const COTE_PHOTO_MAX = 2560;
export const COTE_LOGO_MAX = 800;

// ------------------------------------------------------------------ Pure rules (tested)
/**
 * Plan for an image before sending: unchanged when light enough and not oversized, otherwise reduced to `cote`
 * (never enlarged); `facteur` < 1 when a previous attempt was still too heavy.
 * @returns { reduire, largeur, hauteur }
 */
export function planReduction({ largeur, hauteur, poids, poidsMax, cote = COTE_PHOTO_MAX, facteur = 1 }) {
  const grand = Math.max(largeur, hauteur, 1);
  const k = Math.min(1, cote / grand) * facteur; // never enlarged; each new attempt smaller still
  const reduire = poids > poidsMax || grand > cote || facteur < 1;
  return { reduire, largeur: reduire ? Math.max(1, Math.round(largeur * k)) : largeur, hauteur: reduire ? Math.max(1, Math.round(hauteur * k)) : hauteur };
}

/** Checks a file before anything is done: "heic" (iPhone format), "format" or null. */
export function controleFichier(f) {
  const nom = String(f?.name || "").toLowerCase(), type = String(f?.type || "").toLowerCase();
  if (/image\/hei[cf]/.test(type) || /\.hei[cf]$/.test(nom)) return "heic";
  if (!TYPES_ACCEPTES.includes(type)) return "format";
  return null;
}

/** Where a photo will appear in the memorandum (same placement as the memorandum itself), or "non_placee". */
export function endroitPhoto(photos, n) {
  const p = placementPhotos(photos || []);
  if (p.couverture === n) return "couverture";
  if (p.equipe === n) return "equipe";
  if ((p.realisations || []).includes(n)) return "realisations";
  if ((p.activite || []).includes(n)) return "activite";
  if ((p.ouvertures || []).includes(n)) return "ouverture";
  return "non_placee";
}

/** What to do after an error, by error code of the server or of the browser. */
export const CONSEILS = new Set(["heic", "format", "trop_lourd", "trop_de_photos", "doublon", "attestation", "image_injoignable", "analyse_indisponible", "quota_atteint", "reduction", "reseau"]);
export const conseilErreur = (code, valeurs = {}) => (CONSEILS.has(code) ? t(`memo.js.depot.erreurs.${code}`, valeurs) : t("memo.js.depot.erreurs.autre"));

/**
 * Upload queue, without any page (tested): files are checked, reduced when heavier than allowed, then sent one at a
 * time; files received before the attestation wait and leave as soon as it is given (nothing to choose again).
 * @param o.max quota of photos; o.restantes places left; o.poidsMax weight allowed per photo
 * @param o.reduire(file) → file (reduced, or the same); o.envoyer(file, progres) → memorandum (photos)
 * @param o.surEtat(suivi) called on every change of a file's state { nom, taille, etat, progres, code, reduite, apres }
 */
export function creerFileDepot({ max, restantes, poidsMax, reduire, envoyer, surEtat = () => {} }) {
  let atteste = false, reste = restantes, file = Promise.resolve();
  const attente = [], suivis = [];
  const traiter = (f) => {
    const suivi = { nom: f.name, taille: f.size, etat: "file", progres: 0 };
    suivis.push(suivi); surEtat(suivi);
    const maj = (o) => { Object.assign(suivi, o); surEtat(suivi); };
    file = file.then(async () => {
      const code = controleFichier(f);
      if (code) return maj({ etat: "erreur", code });
      if (reste <= 0) return maj({ etat: "erreur", code: "trop_de_photos" });
      if (f.size > poidsMax) maj({ etat: "reduction" });
      let envoi;
      try { envoi = await reduire(f); } catch (e) { return maj({ etat: "erreur", code: e.code || "reduction" }); }
      maj({ etat: "envoi", reduite: envoi !== f, apres: envoi.size });
      try {
        const m = await envoyer(envoi, (x) => maj({ progres: x }));
        reste = Math.max(0, max - (m?.photos || []).length);
        maj({ etat: "ok", progres: 1, memo: m });
      } catch (e) { maj({ etat: "erreur", code: e.code || "autre" }); }
    });
  };
  return {
    /** Files chosen or dropped: sent if the attestation is given, otherwise kept waiting. */
    recevoir(liste) { const l = [...liste]; if (!atteste) attente.push(...l); else l.forEach(traiter); },
    /** Attestation ticked (or unticked): the waiting files leave at once. */
    attester(oui) { atteste = Boolean(oui); if (atteste && attente.length) attente.splice(0).forEach(traiter); },
    /** Places left after a change made elsewhere (a photo removed, a photo of the website added). */
    ajuster(n) { reste = Math.max(0, n); },
    get atteste() { return atteste; }, get enAttente() { return attente.length; }, get restantes() { return reste; },
    suivis, fin: () => file,
  };
}

// ------------------------------------------------------------------ Browser
const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
const mo = (octets) => new Intl.NumberFormat(document.documentElement.lang || "fr", { maximumFractionDigits: 1 }).format(octets / 1e6);

/**
 * Image reduced in the browser until it fits `poidsMax` (JPEG; a PNG logo keeps PNG when it fits). Unchanged file
 * when it already fits and is not oversized. Throws "reduction" when it cannot be decoded.
 */
export async function reduireImage(fichier, { poidsMax, cote = COTE_PHOTO_MAX, garderPng = false } = {}) {
  let bitmap;
  try { bitmap = await createImageBitmap(fichier); } catch { throw Object.assign(new Error("reduction"), { code: "reduction" }); }
  try {
    if (!planReduction({ largeur: bitmap.width, hauteur: bitmap.height, poids: fichier.size, poidsMax, cote }).reduire) return fichier;
    for (const [facteur, qualite] of [[1, 0.88], [1, 0.78], [0.8, 0.78], [0.65, 0.72], [0.5, 0.7]]) {
      const p = planReduction({ largeur: bitmap.width, hauteur: bitmap.height, poids: fichier.size, poidsMax, cote, facteur });
      const toile = document.createElement("canvas");
      toile.width = p.largeur; toile.height = p.hauteur;
      const ctx = toile.getContext("2d");
      const type = garderPng && fichier.type === "image/png" ? "image/png" : "image/jpeg";
      if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, p.largeur, p.hauteur); } // transparency → white
      ctx.drawImage(bitmap, 0, 0, p.largeur, p.hauteur);
      const blob = await new Promise((ok) => toile.toBlob(ok, type, qualite));
      if (blob && blob.size <= poidsMax) return new File([blob], fichier.name.replace(/\.[a-z0-9]+$/i, "") + (type === "image/png" ? ".png" : ".jpg"), { type });
    }
    throw Object.assign(new Error("trop_lourd"), { code: "trop_lourd" });
  } finally { bitmap.close?.(); }
}

/** Sends a form with upload progress (fetch gives none). Resolves with the JSON answer, rejects with { code, message }. */
function envoyer(url, fd, surProgres) {
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.upload.onprogress = (e) => { if (e.lengthComputable) surProgres(e.loaded / e.total); };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch { /* vide */ }
      if (x.status >= 200 && x.status < 300) ok(d); else ko(Object.assign(new Error(d.message || ""), { code: d.erreur || "autre", statut: x.status }));
    };
    x.onerror = () => ko(Object.assign(new Error(""), { code: "reseau" }));
    x.send(fd);
  });
}

/**
 * Photo upload zone. Attestation above, drop zone and button below (inactive until ticked), one row per file.
 * @param o.memo answer of the memorandum API (photos, photos_max, photos_poids_max)
 * @param o.baseMemo "/api/dossiers/:id/documents/memo"; @param o.surAjout(memo) after each photo added
 * @param o.idBase prefix of the ids (two zones never share one)
 */
export function zoneDepotPhotos({ memo, baseMemo, surAjout, surCandidate, idBase = "depot" }) {
  const max = memo?.photos_max || 12, poidsMax = memo?.photos_poids_max || 3_000_000;
  let restantes = Math.max(0, max - (memo?.photos || []).length);
  const atteste = el("input", { type: "checkbox", id: `${idBase}-attestation` });
  const fichier = el("input", { type: "file", accept: TYPES_ACCEPTES.join(","), id: `${idBase}-fichier`, class: "visuellement-cache", multiple: true });
  const bouton = el("label", { class: "btn btn-noir btn-mini", for: `${idBase}-fichier`, tabindex: "0", role: "button", "aria-disabled": "true" }, t("memo.js.depot.choisir"));
  const lignes = el("ul", { class: "depot-fichiers", "aria-live": "polite" });
  const etatAttente = el("p", { class: "depot-attente", role: "status", hidden: true });
  const zone = el("div", { class: "depot-zone inactive" },
    el("p", { class: "depot-zone-texte" }, el("strong", { text: t("memo.js.depot.glisser") }), " ", el("span", { class: "petit", text: t("memo.js.depot.formats", { max: restantes }) })),
    bouton, fichier);
  const maj = () => {
    const ok = atteste.checked && restantes > 0;
    zone.classList.toggle("inactive", !ok);
    bouton.setAttribute("aria-disabled", String(!ok));
    fichier.disabled = !ok;
    const n = q?.enAttente || 0;
    etatAttente.hidden = !n;
    etatAttente.textContent = n ? t("memo.js.depot.en_attente", { n }) : "";
    zone.querySelector(".depot-zone-texte .petit").textContent = restantes > 0 ? t("memo.js.depot.formats", { max: restantes }) : t("memo.js.depot.plus_de_place", { max });
  };
  bouton.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !fichier.disabled) { e.preventDefault(); fichier.click(); } });
  bouton.addEventListener("click", (e) => { if (fichier.disabled) { e.preventDefault(); atteste.focus(); etatAttente.hidden = false; etatAttente.textContent = t("memo.js.depot.cochez_d_abord"); } });

  // One row per file, drawn from the state given by the queue
  const rangs = new Map();
  const dessinerSuivi = (x) => {
    let r = rangs.get(x);
    if (!r) {
      const barre = el("span", { class: "depot-barre" }, el("span"));
      const statut = el("span", { class: "depot-statut" });
      const li = el("li", { class: "depot-fichier" }, el("span", { class: "depot-nom", text: x.nom }), el("span", { class: "petit", text: t("memo.js.depot.taille", { poids: mo(x.taille) }) }), barre, statut);
      lignes.append(li); r = { li, barre, statut }; rangs.set(x, r);
    }
    r.barre.firstChild.style.width = `${Math.round((x.progres || 0) * 100)}%`;
    r.li.className = `depot-fichier${x.etat === "ok" ? " ok" : x.etat === "erreur" ? " erreur" : ""}`;
    r.statut.textContent = x.etat === "file" ? t("memo.js.depot.en_file")
      : x.etat === "reduction" ? t("memo.js.depot.reduction", { poids: mo(x.taille) })
      : x.etat === "envoi" ? (x.reduite ? t("memo.js.depot.envoi_reduite", { avant: mo(x.taille), apres: mo(x.apres) }) : t("memo.js.depot.envoi"))
      : x.etat === "ok" ? (x.reduite ? t("memo.js.depot.ajoutee_reduite", { apres: mo(x.apres) }) : t("memo.js.depot.ajoutee"))
      : conseilErreur(x.code, { max, poids: mo(poidsMax) });
    if (x.etat === "ok") { restantes = q.restantes; maj(); surAjout?.(x.memo); }
    if (x.etat === "erreur") maj();
  };
  const q = creerFileDepot({ max, restantes, poidsMax, surEtat: dessinerSuivi,
    reduire: (f) => reduireImage(f, { poidsMax }),
    envoyer: (f, progres) => { const fd = new FormData(); fd.append("fichier", f, f.name); fd.append("attestation", "oui"); return envoyer(`${baseMemo}/photos`, fd, progres); } });
  const recevoir = (liste) => { q.recevoir(liste); maj(); if (!atteste.checked) atteste.focus(); };
  atteste.addEventListener("change", () => { q.attester(atteste.checked); maj(); }); // the waiting files leave, nothing to choose again
  fichier.addEventListener("change", () => { recevoir(fichier.files); fichier.value = ""; });
  for (const ev of ["dragenter", "dragover"]) zone.addEventListener(ev, (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); zone.classList.add("survol"); } });
  zone.addEventListener("dragleave", () => zone.classList.remove("survol"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("survol"); recevoir(e.dataTransfer.files); });

  const racine = el("div", { class: "depot-photos" },
    el("label", { class: "depot-attestation", for: atteste.id }, atteste, el("span", { text: t("memo.js.depot.attestation") })),
    etatAttente, zone, lignes);
  // Photos of the website: clicked, they are added with the same attestation (inactive until ticked)
  racine.ajouterSite = (url, surFin) => {
    if (!atteste.checked) { atteste.focus(); etatAttente.hidden = false; etatAttente.textContent = t("memo.js.depot.cochez_d_abord"); return Promise.resolve(false); }
    return fetch(`${baseMemo}/photos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, attestation: true }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.message || ""), { code: d.erreur }); racine.majMemo(d); surCandidate?.(d); return true; })
      .catch((e) => { surFin?.(conseilErreur(e.code, { max })); return false; });
  };
  // The list changed elsewhere (photo removed, website photo added): places left recounted, upload reopened if needed
  racine.majMemo = (m) => { restantes = Math.max(0, max - (m?.photos || []).length); q.ajuster(restantes); maj(); };
  racine.atteste = () => atteste.checked;
  racine.recevoir = recevoir; // tests and drop from elsewhere
  maj();
  return racine;
}

/**
 * Logo: preview next to the buttons (the logo kept, or "no logo yet"), choice among those of the website, upload
 * (reduced in the browser when heavier than allowed). Saved at once, preview updated.
 */
export function zoneLogo({ memo, baseMemo, logos = [], surChange, idBase = "logo" }) {
  const poidsMax = memo?.logo_poids_max || 1_000_000;
  const statut = el("p", { class: "petit logo-statut", role: "status" });
  const apercu = el("span", { class: "logo-apercu" });
  const peindre = (present) => apercu.replaceChildren(present
    ? el("img", { src: `${baseMemo}/logo?v=${Date.now()}`, alt: t("demarrer.js.site.votre_logo") })
    : el("span", { class: "petit", text: t("demarrer.js.photos.aucun_logo") }));
  peindre(Boolean(memo?.logo));
  const enregistrer = async (corps, enJson) => {
    statut.textContent = t("memo.js.depot.envoi");
    try {
      const r = await fetch(`${baseMemo}/logo`, { method: "POST", ...(enJson ? { headers: { "content-type": "application/json" } } : {}), body: corps });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.message || ""), { code: d.erreur });
      peindre(true); statut.textContent = t("memo.js.site.logo_enregistre");
      surChange?.(d);
    } catch (e) { statut.textContent = conseilErreur(e.code, { poids: mo(poidsMax) }); statut.classList.add("erreur"); }
  };
  const fichier = el("input", { type: "file", accept: TYPES_ACCEPTES.join(","), id: `${idBase}-fichier`, class: "visuellement-cache" });
  fichier.addEventListener("change", async () => {
    const f = fichier.files[0]; fichier.value = ""; if (!f) return;
    statut.classList.remove("erreur");
    const code = controleFichier(f);
    if (code) { statut.textContent = conseilErreur(code); statut.classList.add("erreur"); return; }
    let envoi;
    try { envoi = await reduireImage(f, { poidsMax, cote: COTE_LOGO_MAX, garderPng: true }); }
    catch (e) { statut.textContent = conseilErreur(e.code || "reduction", { poids: mo(poidsMax) }); statut.classList.add("erreur"); return; }
    const fd = new FormData(); fd.append("fichier", envoi, envoi.name);
    enregistrer(fd, false);
  });
  return el("div", { class: "logo-zone" },
    apercu,
    el("div", { class: "logo-texte" },
      el("strong", { text: t("demarrer.js.site.votre_logo") }),
      el("span", { class: "petit", text: t("memo.js.depot.logo_aide") }),
      logos.length ? el("div", { class: "logos-liste", role: "group", "aria-label": t("demarrer.js.site.choix_logo") },
        ...logos.map((l) => el("button", { type: "button", class: "logo-choix", title: l.origine || "", onclick: () => enregistrer(JSON.stringify({ url: l.url }), true) },
          el("img", { src: l.url, alt: t("memo.js.site.candidat", { origine: l.origine || "" }), loading: "lazy", referrerpolicy: "no-referrer" })))) : null,
      el("span", { class: "logo-boutons" }, el("label", { class: "btn btn-contour btn-mini", for: fichier.id, tabindex: "0", onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fichier.click(); } } }, t("memo.js.site.deposer_logo")), fichier),
      statut));
}
