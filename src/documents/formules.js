// Mini-évaluateur des formules du datapack (sous-ensemble d'Excel : + − × / ^, comparaisons, &, références
// « Feuille!A1 » et plages, SUM, AVERAGE, IF, AND, OR, MIN, MAX, ISNUMBER, COUNT, ROUND). Sert à écrire les
// valeurs en cache dans le fichier et, dans les tests, à vérifier que les formules redonnent les chiffres du moteur.

const FONCTIONS = {
  SUM: (a) => a.flat(Infinity).filter((x) => typeof x === "number").reduce((s, x) => s + x, 0),
  AVERAGE: (a) => { const l = a.flat(Infinity).filter((x) => typeof x === "number"); return l.length ? l.reduce((s, x) => s + x, 0) / l.length : erreur("#DIV/0!"); },
  COUNT: (a) => a.flat(Infinity).filter((x) => typeof x === "number").length,
  MIN: (a) => Math.min(...a.flat(Infinity).filter((x) => typeof x === "number")),
  MAX: (a) => Math.max(...a.flat(Infinity).filter((x) => typeof x === "number")),
  AND: (a) => a.flat(Infinity).every(Boolean),
  OR: (a) => a.flat(Infinity).some(Boolean),
  ISNUMBER: (a) => typeof a[0] === "number" && Number.isFinite(a[0]),
  ROUND: (a) => { const k = 10 ** (a[1] ?? 0); return Math.round(a[0] * k) / k; },
};
function erreur(code) { const e = new Error(code); e.excel = code; throw e; }

function lexer(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if (c === '"') { const j = src.indexOf('"', i + 1); t.push({ k: "str", v: src.slice(i + 1, j) }); i = j + 1; continue; }
    const ref = /^(?:'([^']+)'|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/.exec(src.slice(i))
      || /^()()(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?(?![\w(])/.exec(src.slice(i));
    if (ref && !(ref[1] === "" && ref[2] === "" && /^[A-Z]+\(/.test(src.slice(i)))) {
      t.push({ k: "ref", feuille: ref[1] || ref[2] || null, de: ref[3].replace(/\$/g, ""), a: ref[4]?.replace(/\$/g, "") ?? null });
      i += ref[0].length; continue;
    }
    const nb = /^\d+(\.\d+)?(E[+-]?\d+)?/i.exec(src.slice(i));
    if (nb) { t.push({ k: "num", v: Number(nb[0]) }); i += nb[0].length; continue; }
    const fn = /^([A-Z]+)\(/.exec(src.slice(i));
    if (fn) { t.push({ k: "fn", v: fn[1] }); i += fn[1].length; continue; }
    const op = /^(<=|>=|<>|[-+*/^(),=<>&])/.exec(src.slice(i));
    if (op) { t.push({ k: "op", v: op[1] }); i += op[1].length; continue; }
    throw new Error(`Formule illisible près de « ${src.slice(i, i + 12)} »`);
  }
  return t;
}

export function colonne(lettres) { let n = 0; for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
export function lettres(n) { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
const decoupe = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { c: colonne(m[1]), r: Number(m[2]) - 1 }; };

/** Évalue une formule (sans « = ») ; lire(feuille, r, c) renvoie la valeur d'une cellule. */
export function evaluer(src, feuilleCourante, lire) {
  const t = lexer(src);
  let p = 0;
  const voir = () => t[p], prendre = () => t[p++];
  const attendre = (v) => { const x = prendre(); if (!x || x.v !== v) throw new Error(`« ${v} » attendu dans ${src}`); };
  function primaire() {
    const x = prendre();
    if (!x) throw new Error(`Formule incomplète : ${src}`);
    if (x.k === "num" || x.k === "str") return x.v;
    if (x.k === "op" && x.v === "(") { const v = comparaison(); attendre(")"); return v; }
    if (x.k === "op" && x.v === "-") return -puissance();
    if (x.k === "op" && x.v === "+") return puissance();
    if (x.k === "ref") {
      const f = x.feuille ?? feuilleCourante;
      const d = decoupe(x.de);
      if (!x.a) return lire(f, d.r, d.c);
      const a = decoupe(x.a), plage = [];
      for (let r = d.r; r <= a.r; r++) for (let c = d.c; c <= a.c; c++) plage.push(lire(f, r, c));
      return plage;
    }
    if (x.k === "fn") {
      attendre("(");
      const args = [];
      // IF n'utilise que la branche retenue : une erreur dans l'autre branche ne compte pas (comme dans Excel)
      const sauter = () => { // avance jusqu'à la fin de l'argument courant (virgule ou parenthèse de même niveau)
        let n = 0;
        while (p < t.length) {
          const v = t[p].v;
          if (n === 0 && (v === "," || v === ")")) return;
          if (v === "(") n++; else if (v === ")") n--;
          p++;
        }
      };
      const arg = () => {
        if (x.v !== "IF") return comparaison();
        const debut = p;
        try { return comparaison(); } catch (e) { if (!e.excel) throw e; p = debut; sauter(); return { erreurDiff: e.excel }; }
      };
      if (voir()?.v !== ")") { args.push(arg()); while (voir()?.v === ",") { prendre(); args.push(arg()); } }
      attendre(")");
      if (x.v === "IF") {
        if (args[0]?.erreurDiff) erreur(args[0].erreurDiff);
        const r = args[0] ? args[1] : (args[2] ?? false);
        if (r?.erreurDiff) erreur(r.erreurDiff);
        return r;
      }
      if (!FONCTIONS[x.v]) throw new Error(`Fonction non prise en charge : ${x.v}`);
      return FONCTIONS[x.v](args);
    }
    throw new Error(`Jeton inattendu dans ${src}`);
  }
  const nombre = (v) => (v === null || v === "" ? 0 : typeof v === "number" ? v : typeof v === "boolean" ? Number(v) : erreur("#VALUE!"));
  function puissance() { let v = primaire(); while (voir()?.v === "^") { prendre(); v = nombre(v) ** nombre(primaire()); } return v; }
  function produit() { let v = puissance(); while (["*", "/"].includes(voir()?.v)) { const o = prendre().v; const d = puissance(); v = o === "*" ? nombre(v) * nombre(d) : nombre(d) === 0 ? erreur("#DIV/0!") : nombre(v) / nombre(d); } return v; }
  function somme() { let v = produit(); while (["+", "-"].includes(voir()?.v)) { const o = prendre().v; const d = produit(); v = o === "+" ? nombre(v) + nombre(d) : nombre(v) - nombre(d); } return v; }
  function concat() { let v = somme(); while (voir()?.v === "&") { prendre(); v = `${v ?? ""}${somme() ?? ""}`; } return v; }
  function comparaison() {
    let v = concat();
    while (["=", "<>", "<", ">", "<=", ">="].includes(voir()?.v)) {
      const o = prendre().v, d = concat();
      const a = v ?? 0, b = d ?? 0;
      v = { "=": a === b, "<>": a !== b, "<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b }[o];
    }
    return v;
  }
  const v = comparaison();
  if (p < t.length) throw new Error(`Fin de formule inattendue : ${src}`);
  return v;
}
