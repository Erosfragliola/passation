// SIREN: cleanup, validation (9 digits and Luhn check digit), display. Shared by the page and the Worker
// (src/lib/siren.js re-exports it).

/** A valid SIREN: 9 digits and a correct Luhn check digit. */
export function sirenValide(s) {
  if (!/^\d{9}$/.test(s)) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let c = Number(s[8 - i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return somme % 10 === 0;
}

/** Removes spaces (including no-break ones): "552 081 317" → "552081317". */
export const nettoyerSiren = (s) => String(s || "").replace(/[\s  ]+/g, "");

/** Input that looks like a SIREN (digits and spaces only), valid or not. */
export const ressembleASiren = (s) => /^[\d\s  ]+$/.test(String(s || "").trim()) && nettoyerSiren(s).length > 0;

/** "552081317" → "552 081 317" (no-break spaces). */
export const formaterSiren = (s) => nettoyerSiren(s).replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
