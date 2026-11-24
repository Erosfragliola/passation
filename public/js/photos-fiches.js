// Liste des photos choisies, partagée par le parcours guidé (« Votre logo et vos photos ») et la page du mémorandum :
// une fiche de jugement sous chaque photo (catégorie, note, description, usage et légende proposés, « Pas pour le
// teaser »), « Utiliser comme proposé » et « Ignorer », ordre modifiable (flèches au clavier, glisser à la souris).
// Rien n'est appliqué sans un clic du dirigeant. Les analyses manquantes sont lancées une par une, en arrière-plan.
import { t } from "./i18n.js";
import { analyserPhoto } from "./photo-analyse.js";
import { endroitPhoto } from "./depot-photos.js";

const el = (tag, attrs = {}, ...enfants) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  e.append(...enfants.flat().filter((x) => x != null && x !== false));
  return e;
};
const enCours = new Set(); // analyses demandées
let file = Promise.resolve(); // une analyse à la fois : chacune réécrit les photos du dossier
const echouees = new Map(); // photo (adresse) → message d'indisponibilité

async function appel(url, options = {}) {
  const enJson = options.body && !(options.body instanceof FormData);
  const r = await fetch(url, { ...options, headers: enJson ? { "content-type": "application/json" } : {} });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || t("teaser.js.erreur"));
  return d;
}

/**
 * @param memo réponse de l'API du mémorandum (photos, photos_max, analyse_photos)
 * @param baseMemo « /api/dossiers/:id/documents/memo » ; @param maj(memo) redessine après un changement
 * @param message(texte, erreur) zone de message de la page ; @param focus identifiant d'élément à refocaliser
 */
export function listePhotos({ memo, baseMemo, maj, message, version = Date.now(), focus = null }) {
  const photos = memo?.photos || [];
  if (!photos.length) return null;
  const changer = async (promesse, cible) => {
    try { const m = await promesse; maj(m, cible); } catch (e) { message(e.message, true); }
  };
  const ordre = (de, vers) => {
    const o = photos.map((p) => p.n);
    const [x] = o.splice(de, 1); o.splice(vers, 0, x);
    changer(appel(`${baseMemo}/photos/ordre`, { method: "PUT", body: JSON.stringify({ ordre: o }) }), `photo-${vers}-${vers < de ? "haut" : "bas"}`);
  };
  const liste = el("ol", { class: "ph-liste", "aria-label": t("memo.js.photos.liste") });
  let glisse = null;
  photos.forEach((p, k) => {
    const a = p.analyse, cle = `${baseMemo}/${p.n}`;
    const notes = a ? el("span", { class: "ph-note", role: "img", "aria-label": t("memo.js.photos.note", { n: a.note }) }, ...[1, 2, 3, 4, 5].map((i) => el("i", { class: i <= a.note ? "on" : null }))) : null;
    const etat = p.decision === "utilise" ? el("p", { class: "ph-applique", text: t("memo.js.photos.utilisee") })
      : p.decision === "ignore" ? el("p", { class: "petit", text: t("memo.js.photos.ignoree") })
      : a ? el("div", { class: "ph-actions" },
        el("button", { type: "button", class: "btn btn-noir btn-mini", onclick: () => changer(appel(`${baseMemo}/photos/${p.n}`, { method: "PUT", body: JSON.stringify({ decision: "utilise" }) }), `photo-${k}-titre`) }, t("memo.js.photos.utiliser")),
        el("button", { type: "button", class: "btn btn-contour btn-mini", onclick: () => changer(appel(`${baseMemo}/photos/${p.n}`, { method: "PUT", body: JSON.stringify({ decision: "ignore" }) }), `photo-${k}-titre`) }, t("memo.js.photos.ignorer"))) : null;
    const fiche = a
      ? el("div", { class: "ph-jugement" },
        el("p", { class: "ph-ligne1" }, el("span", { class: "pastille-etat ok", text: t(`memo.js.photos.categories.${a.categorie}`) }), notes, el("span", { class: "petit", text: a.raison })),
        el("p", { class: "ph-decrit", text: a.description }),
        el("p", { class: "petit" }, t("memo.js.photos.propose"), " ", el("strong", { text: t(`memo.js.photos.usages.${a.usage}`) }), a.legende ? ` · ${t("memo.js.photos.legende", { legende: a.legende })}` : ""),
        a.signalements?.length ? el("p", { class: "ph-alertes" }, ...a.signalements.map((s) => el("span", { class: `pastille-etat ${s === "identifiante" ? "a-faire" : "alerte"}`, text: t(`memo.js.photos.signalements.${s}`) }))) : null,
        etat)
      : el("div", { class: "ph-jugement" }, el("p", { class: "petit", text: echouees.get(cle) || (memo.analyse_photos ? t("memo.js.photos.analyse_en_cours") : t("memo.js.photos.sans_analyse")) }));
    // Where it will appear in the memorandum (same placement as the document itself)
    const endroit = endroitPhoto(photos, p.n);
    const ou = el("p", { class: `ph-endroit${endroit === "non_placee" ? " non-placee" : ""}` }, t("memo.js.photos.endroit"), " ", el("strong", { text: t(`memo.js.photos.endroits.${endroit}`) }));
    const li = el("li", { class: `ph${p.decision === "ignore" ? " ignoree" : ""}`, draggable: "true", "data-n": String(k),
      ondragstart: (e) => { glisse = k; e.dataTransfer.effectAllowed = "move"; li.classList.add("glisse"); },
      ondragend: () => li.classList.remove("glisse"),
      ondragover: (e) => { if (glisse != null && glisse !== k) { e.preventDefault(); li.classList.add("cible"); } },
      ondragleave: () => li.classList.remove("cible"),
      ondrop: (e) => { e.preventDefault(); li.classList.remove("cible"); if (glisse != null && glisse !== k) ordre(glisse, k); glisse = null; } },
      el("div", { class: "ph-ordre" },
        el("span", { class: "ph-rang", id: `photo-${k}-titre`, tabindex: "-1", text: String(k + 1) }),
        el("button", { type: "button", class: "ph-fleche", id: `photo-${k}-haut`, disabled: k === 0, "aria-label": t("memo.js.photos.monter", { n: k + 1 }), onclick: () => ordre(k, k - 1) }, "↑"),
        el("button", { type: "button", class: "ph-fleche", id: `photo-${k}-bas`, disabled: k === photos.length - 1, "aria-label": t("memo.js.photos.descendre", { n: k + 1 }), onclick: () => ordre(k, k + 1) }, "↓")),
      el("figure", { class: "ph-vignette" }, el("img", { src: `${baseMemo}/photos/${p.n}?v=${version}`, alt: p.legende || t("memo.js.photos.photo_n", { n: k + 1 }) }),
        el("button", { type: "button", class: "lien-simple", onclick: () => changer(appel(`${baseMemo}/photos/${p.n}`, { method: "DELETE" })) }, t("espace.js.retirer"))),
      el("div", { class: "ph-texte" }, fiche, ou));
    liste.append(li);
    // Analyse manquante : lancée en arrière-plan, une photo à la fois
    if (!a && memo.analyse_photos && !enCours.has(cle) && !echouees.has(cle)) {
      enCours.add(cle);
      file = file.then(() => analyserPhoto(baseMemo, p.n, version)
        .then((m) => { enCours.delete(cle); maj(m); })
        .catch((e) => { enCours.delete(cle); echouees.set(cle, e.message || t("memo.js.photos.sans_analyse")); maj(null); }));
    }
  });
  if (focus) setTimeout(() => { const f = document.getElementById(focus); (f && !f.disabled ? f : document.getElementById(focus.replace(/-(haut|bas)$/, "-titre")))?.focus(); }, 0);
  return liste;
}
