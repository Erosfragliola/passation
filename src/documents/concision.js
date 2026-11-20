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
