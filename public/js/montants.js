// Amounts and numbers of the guided flow: field formatted as the owner types (the language's thousands
// separators) and a synchronized slider. The value saved stays a raw number. A proposed value (public data, neutral
// value) is shown as such and is never saved without an action of the owner.
// Pure part (formatting, reading, bounds) tested in test/montants.test.js; DOM part (champMontant) at the bottom.
import { t, langue, locale, lireNombreSaisi } from "./i18n.js";

/** Decimal separator of the language (« , » in French, « . » in English). */
export const separateurDecimal = (l = langue()) => (l === "fr" ? "," : ".");

/**
 * Text typed → text reformatted with thousands separators, without changing what was typed: digits, leading minus
 * sign, a decimal part (at most `decimales` digits) if the language allows it. « 1234567 » → « 1 234 567 » in French
 * (narrow no-break space, as Intl does), « 1,234,567 » in English.
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

/** Amount shown, unit included: « 1 234 567 € »; « €1,234,567 »; « 12 % »; « 12% ». */
export function texteMontant(n, unite = "€", l = langue()) {
  if (n == null || !Number.isFinite(n)) return "";
  const decimales = unite === "%" && !Number.isInteger(n) ? 1 : 0;
  const x = new Intl.NumberFormat(locale(l), { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);
  if (unite === "%") return l === "fr" ? `${x} %` : `${x}%`;
  return l === "fr" ? `${x} €` : `€${x}`;
}

/** Entry → number (null if empty, NaN if unreadable), following the language's rules (i18n.lireNombreSaisi). */
export const lireMontant = (texte, l = langue()) => lireNombreSaisi(String(texte ?? "").replace(/−/g, "-"), l);

/** Bounds and step of the slider: a « round » step of about 1/200 of the range, the value always included. */
export function bornesCurseur({ min = 0, max, valeur = null }) {
  let haut = Number.isFinite(max) && max > min ? max : min + 100;
  if (Number.isFinite(valeur) && valeur > haut) haut = valeur;
  const brut = (haut - min) / 200;
  const puissance = 10 ** Math.floor(Math.log10(Math.max(brut, 1e-9)));
  const pas = [1, 2, 5, 10].map((k) => k * puissance).find((p) => p >= brut) || puissance;
  // « Round » bounds on both sides (a negative lower bound such as −557,927 € confused the owner)
  const bas = min < 0 ? Math.floor(min / pas) * pas : min;
  return { min: bas, max: Math.ceil(haut / pas) * pas, pas: pas >= 1 ? Math.round(pas) : pas };
}

// ------------------------------------------------------------------ Composant (navigateur)
/**
 * Formatted field + synchronized slider.
 * @param o.id identifier of the field; o.libelle label of the slider (screen readers); o.unite « € » or « % »
 * @param o.valeur saved value (or null); o.proposition proposed value, shown but not saved
 * @param o.min, o.max bounds of the slider; o.decimales digits allowed after the decimal point
 * @returns root element; .lire() → { valeur, confirmee } (valeur null if nothing typed or confirmed)
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
  // Nothing typed or proposed: the slider sits on 0 (or the nearest bound) and stays faded, so as not to suggest a
  // value; it becomes active as soon as the owner types or drags
  curseur.value = String(depart ?? Math.min(Math.max(0, b.min), b.max));
  if (depart == null) racine.classList.add("vide");
  curseur.setAttribute("aria-label", o.libelle || "");
  const bornes = document.createElement("div");
  bornes.className = "bornes-curseur"; bornes.setAttribute("aria-hidden", "true");
  bornes.append(Object.assign(document.createElement("span"), { textContent: texteMontant(b.min, unite) }), Object.assign(document.createElement("span"), { textContent: texteMontant(b.max, unite) }));
  const zoneCurseur = document.createElement("div");
  zoneCurseur.className = "curseur-montant";
  zoneCurseur.append(curseur, bornes);
  // No slider on an amount in euros (audit of 25/11/2026): the field alone; sliders stay for percentages
  if (unite === "€") racine.classList.add("sans-curseur");
  racine.append(boite, ...(unite === "€" ? [] : [zoneCurseur]));

  const peindre = () => {
    const v = Number(curseur.value), p = ((v - b.min) / (b.max - b.min)) * 100;
    curseur.style.setProperty("--p", `${Math.max(0, Math.min(100, p))}%`);
    const lu = lireMontant(champ.value);
    curseur.setAttribute("aria-valuetext", lu == null || Number.isNaN(lu) ? t("demarrer.js.montants.non_renseigne") : `${texteMontant(lu, unite)}${proposee ? ` (${t("demarrer.js.montants.propose_court")})` : ""}`);
  };
  const confirmer = () => { confirmee = true; proposee = false; boite.classList.remove("propose"); racine.classList.remove("vide"); racine.dispatchEvent(new CustomEvent("confirme")); };
  champ.addEventListener("input", () => {
    const fin = champ.value.length - (champ.selectionStart ?? champ.value.length);
    champ.value = formaterSaisie(champ.value, { decimales });
    const pos = Math.max(0, champ.value.length - fin);
    try { champ.setSelectionRange(pos, pos); } catch { /* hidden field */ }
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
  /** New proposal (for example: follows another amount of the screen), as long as nothing is confirmed. */
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
