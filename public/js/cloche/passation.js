// La passation : deux mains au trait cuivré (SVG original superposé au canvas) qui se dessinent au défilement.
// La main gauche soulève l'ensemble par le socle et le tend à la main droite : c'est l'entreprise qui passe de main
// en main. Le tracé utilise stroke-dashoffset (pathLength = 1) ; tout recule si l'on remonte.

// Main gauche, paume vers le haut, doigts allongés vers la droite, pouce relevé (vue de trois quarts).
// viewBox 0 0 300 140. Point d'appui (bout des doigts, sous le socle) : (232, 55).
const MAIN = [
  "M0 58 C 20 56 40 55 58 56",                                   // manche, dessus
  "M0 104 C 20 102 40 101 58 100",                                // manche, dessous
  "M58 52 C 62 70 62 88 58 104",                                  // poignet de la manche
  "M60 98 C 95 96 130 92 160 86 C 185 81 215 76 238 72 C 255 69 270 66 284 62 C 292 60 296 56 290 53", // tranche et bout des doigts
  "M60 62 C 80 63 96 64 108 64",                                  // talon de la paume
  "M150 64 C 190 58 235 52 287 53",                               // index
  "M156 70 C 195 66 240 62 282 62",                               // majeur
  "M160 76 C 200 73 236 70 268 70",                               // annulaire
  "M164 81 C 190 80 214 78 236 77",                               // auriculaire
  "M104 64 C 112 46 132 36 156 34 C 166 33 170 40 162 44 C 150 50 138 56 130 62", // pouce
];
const APPUI = { x: 232, y: 55 };
const NS = "http://www.w3.org/2000/svg";

export function creerPassation(conteneur) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "passation-mains");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const mains = ["gauche", "droite"].map((cote) => {
    const g = document.createElementNS(NS, "g");
    const traits = MAIN.map((d) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("pathLength", "1");
      p.setAttribute("stroke-dasharray", "1 1");
      p.setAttribute("stroke-dashoffset", "1");
      g.append(p);
      return p;
    });
    svg.append(g);
    return { cote, g, traits };
  });
  conteneur.append(svg);

  /**
   * @param {number} p avancement 0..1
   * @param {{x:number,y:number}} gauche point d'appui sous le socle, côté gauche (pixels du conteneur)
   * @param {{x:number,y:number}} droite idem côté droit
   * @param {number} echelle largeur d'une main en pixels
   */
  function maj(p, gauche, droite, echelle, entreeDroite = p) {
    svg.style.opacity = p > 0 ? "1" : "0";
    const k = echelle / 300;
    const [mg, md] = mains;
    const trace = (m, q) => m.traits.forEach((t, i) => t.setAttribute("stroke-dashoffset", String(1 - Math.min(1, Math.max(0, q * 1.3 - i * 0.06)))));
    // Main gauche : se dessine (0 → 0,25), reste sous le socle, se retire à la fin (0,85 → 1)
    const qg = Math.min(1, p / 0.25);
    const retrait = Math.max(0, (p - 0.85) / 0.15);
    trace(mg, qg * (1 - retrait * 0.999));
    const glisseG = (1 - Math.min(1, p / 0.25)) * 60 + retrait * 50;
    mg.g.setAttribute("transform", `translate(${gauche.x - APPUI.x * k - glisseG} ${gauche.y - APPUI.y * k}) scale(${k})`);
    // Main droite : entre plus tard (0,3 → 0,6), miroir horizontal
    const qd = Math.min(1, Math.max(0, (entreeDroite - 0.3) / 0.3));
    trace(md, qd);
    const glisseD = (1 - qd) * 70;
    md.g.setAttribute("transform", `translate(${droite.x + APPUI.x * k + glisseD} ${droite.y - APPUI.y * k}) scale(${-k} ${k})`);
  }
  return { maj, element: svg };
}
