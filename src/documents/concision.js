// Longueurs du mémorandum garanties par le code (les sorties structurées n'acceptent pas maxLength) : une page doit
// se lire en trente secondes. Introduction de deux phrases au plus, 6 points au plus, chaque point court.
export const LIMITES = { introPhrases: 2, introCaracteres: 320, points: 6, titrePoint: 60, textePhrases: 2, texteCaracteres: 240 };

const propre = (t) => String(t ?? "").replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
/** Phrases d'un texte (point, point d'exclamation ou d'interrogation suivi d'un espace et d'une majuscule). */
export const phrases = (t) => propre(t).split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"(0-9])/u).filter(Boolean);

/** Coupe à n phrases et à une longueur maximale, sur une fin de phrase ou, à défaut, de mot (avec « … »). */
export function couper(texte, nPhrases, max) {
  let t = phrases(texte).slice(0, nPhrases).join(" ");
  if (t.length <= max) return t;
  const ph = phrases(t);
  while (ph.length > 1 && ph.join(" ").length > max) ph.pop();
  t = ph.join(" ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}…`;
}

/** { introduction, points: [{ titre, texte }] } → texte du chapitre : introduction, puis « - **Titre** : texte ». */
export function contenuConcis({ introduction = "", points = [] } = {}) {
  const intro = couper(introduction, LIMITES.introPhrases, LIMITES.introCaracteres);
  const lignes = (Array.isArray(points) ? points : [])
    .map((p) => ({ titre: propre(p?.titre).replace(/[\s:.]+$/, "").slice(0, LIMITES.titrePoint), texte: couper(p?.texte, LIMITES.textePhrases, LIMITES.texteCaracteres) }))
    .filter((p) => p.titre && p.texte && !/^à compléter\.?$/i.test(p.texte))
    .slice(0, LIMITES.points)
    .map((p) => `- **${p.titre}** : ${p.texte.replace(/^./, (c) => c.toUpperCase())}`);
  return [intro, lignes.join("\n")].filter(Boolean).join("\n\n");
}
