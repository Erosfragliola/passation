// Memorandum lengths guaranteed by the code (structured outputs do not accept maxLength): a page must be
// readable in thirty seconds. Introduction of two sentences at most, 6 points at most, each point short.
export const LIMITES = { introPhrases: 2, introCaracteres: 320, points: 6, titrePoint: 60, textePhrases: 2, texteCaracteres: 240 };

const propre = (t) => String(t ?? "").replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
/** Sentences of a text (period, exclamation or question mark followed by a space and a capital letter). */
export const phrases = (t) => propre(t).split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"(0-9])/u).filter(Boolean);

/** Cuts to n sentences and a maximum length, at the end of a sentence or, failing that, of a word (with "…"). */
export function couper(texte, nPhrases, max) {
  let t = phrases(texte).slice(0, nPhrases).join(" ");
  if (t.length <= max) return t;
  const ph = phrases(t);
  while (ph.length > 1 && ph.join(" ").length > max) ph.pop();
  t = ph.join(" ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}…`;
}

/** { introduction, points: [{ titre, texte }] } → chapter text: introduction, then "- **Title**: text". */
export function contenuConcis({ introduction = "", points = [] } = {}) {
  const intro = couper(introduction, LIMITES.introPhrases, LIMITES.introCaracteres);
  const lignes = (Array.isArray(points) ? points : [])
    .map((p) => ({ titre: propre(p?.titre).replace(/[\s:.]+$/, "").slice(0, LIMITES.titrePoint), texte: couper(p?.texte, LIMITES.textePhrases, LIMITES.texteCaracteres) }))
    .filter((p) => p.titre && p.texte && !/^à compléter\.?$/i.test(p.texte))
    .slice(0, LIMITES.points)
    .map((p) => `- **${p.titre}** : ${p.texte.replace(/^./, (c) => c.toUpperCase())}`);
  return [intro, lignes.join("\n")].filter(Boolean).join("\n\n");
}

/**
 * Un texte de chapitre respecte-t-il encore les longueurs après une correction (« Oui, corriger ») ? Introduction de
 * deux phrases et 320 caractères au plus, 6 points au plus de deux phrases et 240 caractères chacun ; un texte libre
 * (modifié à la main par le dirigeant) ne doit pas s'allonger de plus d'un cinquième.
 */
export function contenuRespecteConcision(contenu, avant = null) {
  const blocs = String(contenu ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lignes = blocs.flatMap((b) => b.split("\n")).filter((l) => /^- \*\*.+?\*\* : /.test(l));
  const structure = lignes.length > 0 && blocs.every((b, i) => i === 0 || b.split("\n").every((l) => /^- \*\*.+?\*\* : /.test(l)));
  if (!structure) return avant == null || String(contenu).length <= String(avant).length * 1.2;
  const intro = /^- \*\*/.test(blocs[0]) ? "" : blocs[0];
  if (phrases(intro).length > LIMITES.introPhrases || propre(intro).length > LIMITES.introCaracteres) return false;
  if (lignes.length > LIMITES.points) return false;
  return lignes.every((l) => { const t = l.replace(/^- \*\*.+?\*\* : /, ""); return phrases(t).length <= LIMITES.textePhrases && propre(t).length <= LIMITES.texteCaracteres; });
}
