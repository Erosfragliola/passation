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
export const nettoyerSiren = (s) => String(s || "").replace(/\s+/g, "");
