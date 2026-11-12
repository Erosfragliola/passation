// SIREN : nettoyage, validation (9 chiffres et clé de Luhn), affichage. Partagé par la page et le Worker
// (src/lib/siren.js le réexporte).

/** Un SIREN valide : 9 chiffres et clé de Luhn correcte. */
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

/** Retire espaces (y compris insécables) : « 552 081 317 » → « 552081317 ». */
export const nettoyerSiren = (s) => String(s || "").replace(/[\s  ]+/g, "");

/** Saisie qui ressemble à un SIREN (chiffres et espaces seulement), valide ou non. */
export const ressembleASiren = (s) => /^[\d\s  ]+$/.test(String(s || "").trim()) && nettoyerSiren(s).length > 0;

/** « 552081317 » → « 552 081 317 » (espaces insécables). */
export const formaterSiren = (s) => nettoyerSiren(s).replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
