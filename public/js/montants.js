// Montants et nombres du parcours guidé : champ formaté en direct (séparateurs de milliers de la langue) et curseur
// synchronisé. La valeur enregistrée reste un nombre brut. Une valeur proposée (donnée publique, valeur neutre) est
// affichée comme telle et n'est jamais enregistrée sans action du dirigeant.
// Partie pure (formatage, lecture, bornes) testée dans test/montants.test.js ; partie DOM (champMontant) en bas.
import { t, langue, locale, lireNombreSaisi } from "./i18n.js";

/** Séparateur décimal de la langue (« , » en français, « . » en anglais). */
export const separateurDecimal = (l = langue()) => (l === "fr" ? "," : ".");

/**
 * Texte saisi → texte reformaté avec séparateurs de milliers, sans changer ce qui a été tapé : chiffres, signe moins
 * en tête, une partie décimale (au plus `decimales` chiffres) si la langue la permet. « 1234567 » → « 1 234 567 » en
 * français (espace fine insécable, comme Intl), « 1,234,567 » en anglais.
 */
export function formaterSaisie(texte, { decimales = 0, l = langue() } = {}) {
  const s = String(texte ?? "");
  const dec = separateurDecimal(l);
  const negatif = /^\s*[-−]/.test(s);
  const [entier, ...reste] = s.split(dec);
  const chiffres = entier.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const apres = decimales > 0 && reste.length ? reste.join("").replace(/\D/g, "").slice(0, decimales) : null;
  if (!chiffres && apres == null) return negatif ? "-" : "";
  const groupe = new Intl.NumberFormat(locale(l), { maximumFractionDigits: 0, useGrouping: true }).format(Number(chiffres || "0"));
  return `${negatif ? "-" : ""}${groupe}${apres != null ? dec + apres : ""}`;
}

/** Montant affiché, unité comprise : « 1 234 567 € » ; « €1,234,567 » ; « 12 % » ; « 12% ». */
export function texteMontant(n, unite = "€", l = langue()) {
  if (n == null || !Number.isFinite(n)) return "";
  const decimales = unite === "%" && !Number.isInteger(n) ? 1 : 0;
  const x = new Intl.NumberFormat(locale(l), { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);
  if (unite === "%") return l === "fr" ? `${x} %` : `${x}%`;
  return l === "fr" ? `${x} €` : `€${x}`;
}

/** Saisie → nombre (null si vide, NaN si illisible), selon les règles de la langue (i18n.lireNombreSaisi). */
export const lireMontant = (texte, l = langue()) => lireNombreSaisi(String(texte ?? "").replace(/−/g, "-"), l);

/** Bornes et pas du curseur : un pas « rond » d'environ 1/200 de l'écart, la valeur toujours incluse. */
export function bornesCurseur({ min = 0, max, valeur = null }) {
  let haut = Number.isFinite(max) && max > min ? max : min + 100;
  if (Number.isFinite(valeur) && valeur > haut) haut = valeur;
  const brut = (haut - min) / 200;
  const puissance = 10 ** Math.floor(Math.log10(Math.max(brut, 1e-9)));
  const pas = [1, 2, 5, 10].map((k) => k * puissance).find((p) => p >= brut) || puissance;
  return { min, max: Math.ceil(haut / pas) * pas, pas: pas >= 1 ? Math.round(pas) : pas };
}

// ------------------------------------------------------------------ Composant (navigateur)
/**
 * Champ formaté + curseur synchronisés.
 * @param o.id identifiant du champ ; o.libelle libellé du curseur (lecteurs d'écran) ; o.unite « € » ou « % »
 * @param o.valeur valeur enregistrée (ou null) ; o.proposition valeur proposée, montrée mais non enregistrée
 * @param o.min, o.max bornes du curseur ; o.decimales chiffres après la virgule autorisés
 * @returns élément racine ; .lire() → { valeur, confirmee } (valeur null si rien saisi ni confirmé)
 */
export function champMontant(o) {
  const unite = o.unite || "€", decimales = o.decimales ?? (unite === "%" ? 1 : 0);
  const b = bornesCurseur({ min: o.min ?? 0, max: o.max, valeur: o.valeur ?? o.proposition });
  let confirmee = o.valeur != null;
  let proposee = !confirmee && o.proposition != null;
  const depart = o.valeur ?? o.proposition ?? null;
  const racine = document.createElement("div");
  racine.className = "montant";
  const boite = document.createElement("div");
  boite.className = `champ-montant${proposee ? " propose" : ""}`;
  const champ = document.createElement("input");
  Object.assign(champ, { type: "text", id: o.id, autocomplete: "off", inputMode: decimales ? "decimal" : "numeric" });
  champ.value = depart != null ? formaterSaisie(String(depart).replace(".", separateurDecimal()), { decimales }) : "";
  if (o.etiquette) champ.setAttribute("aria-labelledby", o.etiquette);
  const u = document.createElement("span");
  u.className = "unite-montant"; u.textContent = unite; u.setAttribute("aria-hidden", "true");
  if (unite === "€" && langue() === "en") boite.append(u, champ); else boite.append(champ, u);
  const curseur = document.createElement("input");
  Object.assign(curseur, { type: "range", min: String(b.min), max: String(b.max), step: String(b.pas) });
  curseur.value = String(depart ?? b.min);
  curseur.setAttribute("aria-label", o.libelle || "");
  const bornes = document.createElement("div");
  bornes.className = "bornes-curseur"; bornes.setAttribute("aria-hidden", "true");
  bornes.append(Object.assign(document.createElement("span"), { textContent: texteMontant(b.min, unite) }), Object.assign(document.createElement("span"), { textContent: texteMontant(b.max, unite) }));
  const zoneCurseur = document.createElement("div");
  zoneCurseur.className = "curseur-montant";
  zoneCurseur.append(curseur, bornes);
  racine.append(boite, zoneCurseur);

  const peindre = () => {
    const v = Number(curseur.value), p = ((v - b.min) / (b.max - b.min)) * 100;
    curseur.style.setProperty("--p", `${Math.max(0, Math.min(100, p))}%`);
    const lu = lireMontant(champ.value);
    curseur.setAttribute("aria-valuetext", lu == null || Number.isNaN(lu) ? t("demarrer.js.montants.non_renseigne") : `${texteMontant(lu, unite)}${proposee ? ` (${t("demarrer.js.montants.propose_court")})` : ""}`);
  };
  const confirmer = () => { confirmee = true; proposee = false; boite.classList.remove("propose"); racine.dispatchEvent(new CustomEvent("confirme")); };
  champ.addEventListener("input", () => {
    const fin = champ.value.length - (champ.selectionStart ?? champ.value.length);
    champ.value = formaterSaisie(champ.value, { decimales });
    const pos = Math.max(0, champ.value.length - fin);
    try { champ.setSelectionRange(pos, pos); } catch { /* champ masqué */ }
    const n = lireMontant(champ.value);
    if (n != null && !Number.isNaN(n)) curseur.value = String(Math.min(Math.max(n, b.min), b.max));
    confirmer(); peindre();
  });
  curseur.addEventListener("input", () => {
    champ.value = formaterSaisie(String(Number(curseur.value)).replace(".", separateurDecimal()), { decimales });
    confirmer(); peindre();
  });
  peindre();
  racine.confirmer = () => { confirmer(); peindre(); };
  /** Nouvelle proposition (par exemple : suit un autre montant de l'écran), tant que rien n'est confirmé. */
  racine.proposer = (v) => {
    if (confirmee) return false;
    proposee = v != null && Number.isFinite(v);
    boite.classList.toggle("propose", proposee);
    champ.value = proposee ? formaterSaisie(String(v).replace(".", separateurDecimal()), { decimales }) : "";
    if (proposee) curseur.value = String(Math.min(Math.max(v, b.min), b.max));
    peindre();
    return proposee;
  };
  racine.lire = () => {
    const n = lireMontant(champ.value);
    return { valeur: confirmee ? n : null, confirmee, illisible: Number.isNaN(n) };
  };
  racine.champ = champ;
  return racine;
}
