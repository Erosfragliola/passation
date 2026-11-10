// Écriture d'un classeur Excel (.xlsx = archive zip de XML, norme Office Open XML) sans dépendance lourde :
// fflate pour le zip. Formules vivantes : chaque cellule calculée porte sa formule ET sa valeur en cache
// (évaluée par formules.js), et le classeur demande à Excel de tout recalculer à l'ouverture.
import { zipSync, strToU8 } from "fflate";
import { evaluer, lettres } from "./formules.js";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Styles (index dans cellXfs)
export const S = { normal: 0, titre: 1, entete: 2, euros: 3, eurosGras: 4, pct: 5, saisieEuros: 6, saisiePct: 7, petit: 8, pct2: 9, nombre: 10, gras: 11, saisieNombre: 12, sousTitre: 13, eurosTotal: 14, saisieTexte: 15, confidentiel: 16 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0\\ &quot;€&quot;;\\-#,##0\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="0.00%"/><numFmt numFmtId="167" formatCode="#,##0.000"/></numFmts>
<fonts count="6">
<font><sz val="10"/><color rgb="FF231E18"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF231E18"/><name val="Arial"/></font>
<font><b/><sz val="16"/><color rgb="FF231E18"/><name val="Arial"/></font>
<font><i/><sz val="9"/><color rgb="FF696155"/><name val="Arial"/></font>
<font><b/><sz val="12"/><color rgb="FF1E3A2E"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFA8653A"/><name val="Arial"/></font>
</fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEADFCB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3EBE6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF231E18"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="167" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function creerClasseur() {
  const feuilles = [];
  const parNom = new Map();

  function feuille(nom, { largeurs = [] } = {}) {
    const cellules = new Map(); // "r,c" → { v, f, s }
    const f = {
      nom, largeurs, cellules,
      /** Écrit une cellule. contenu : nombre, texte, null, ou { f: "formule sans =", s } ; s = style. */
      ecrire(r, c, contenu, s = S.normal) {
        if (contenu && typeof contenu === "object") cellules.set(`${r},${c}`, { f: contenu.f, s: contenu.s ?? s });
        else cellules.set(`${r},${c}`, { v: contenu, s });
        return `${lettres(c)}${r + 1}`;
      },
      ref: (r, c, absolue = false) => (absolue ? `$${lettres(c)}$${r + 1}` : `${lettres(c)}${r + 1}`),
      /** Référence depuis une autre feuille. */
      ext: (r, c) => `'${nom}'!${lettres(c)}${r + 1}`,
    };
    feuilles.push(f);
    parNom.set(nom, f);
    return f;
  }

  /** Calcule toutes les formules (valeurs en cache), avec détection des références circulaires. */
  function calculer() {
    const cache = new Map(), enCours = new Set();
    const lire = (nomF, r, c) => {
      const fe = parNom.get(nomF);
      if (!fe) throw new Error(`Feuille inconnue : ${nomF}`);
      const cle = `${nomF}|${r},${c}`;
      if (cache.has(cle)) return cache.get(cle);
      const cel = fe.cellules.get(`${r},${c}`);
      if (!cel) return null;
      if (cel.f == null) return cel.v ?? null;
      if (enCours.has(cle)) throw new Error(`Référence circulaire : ${cle}`);
      enCours.add(cle);
      let v;
      try { v = evaluer(cel.f, nomF, lire); } catch (e) { if (e.excel) v = { erreur: e.excel }; else throw e; }
      enCours.delete(cle);
      cache.set(cle, v);
      return v;
    };
    for (const fe of feuilles) for (const k of fe.cellules.keys()) { const [r, c] = k.split(",").map(Number); lire(fe.nom, r, c); }
    return { lire, valeur: (nomF, ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return lire(nomF, Number(m[2]) - 1, c - 1); } };
  }

  function xmlFeuille(fe, calc) {
    const lignes = new Map();
    for (const [k, cel] of fe.cellules) { const [r, c] = k.split(",").map(Number); if (!lignes.has(r)) lignes.set(r, []); lignes.get(r).push([c, cel]); }
    const corps = [...lignes.keys()].sort((a, b) => a - b).map((r) => {
      const cells = lignes.get(r).sort((a, b) => a[0] - b[0]).map(([c, cel]) => {
        const ref = `${lettres(c)}${r + 1}`;
        if (cel.f != null) {
          const v = calc.lire(fe.nom, r, c);
          const val = typeof v === "number" && Number.isFinite(v) ? `<v>${v}</v>` : typeof v === "boolean" ? `<v>${v ? 1 : 0}</v>` : v && v.erreur ? `<v>${xml(v.erreur)}</v>` : typeof v === "string" ? `<v>${xml(v)}</v>` : "";
          const t = typeof v === "string" ? ' t="str"' : typeof v === "boolean" ? ' t="b"' : v && v.erreur ? ' t="e"' : "";
          return `<c r="${ref}" s="${cel.s}"${t}><f>${xml(cel.f)}</f>${val}</c>`;
        }
        if (cel.v == null || cel.v === "") return `<c r="${ref}" s="${cel.s}"/>`;
        if (typeof cel.v === "number") return `<c r="${ref}" s="${cel.s}"><v>${cel.v}</v></c>`;
        return `<c r="${ref}" s="${cel.s}" t="inlineStr"><is><t xml:space="preserve">${xml(cel.v)}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    }).join("");
    const cols = fe.largeurs.length ? `<cols>${fe.largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>${cols}<sheetData>${corps}</sheetData><pageMargins left="0.6" right="0.6" top="0.7" bottom="0.7" header="0.3" footer="0.3"/></worksheet>`;
  }

  /** @returns Uint8Array du fichier .xlsx */
  function octets({ titre = "Datapack", auteur = "Passation" } = {}) {
    const calc = calculer();
    const fichiers = {
      "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
      "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
      "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(titre)}</dc:title><dc:creator>${xml(auteur)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
      "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${feuilles.map((f, i) => `<sheet name="${xml(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      "xl/styles.xml": strToU8(STYLES),
    };
    feuilles.forEach((f, i) => { fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlFeuille(f, calc)); });
    return zipSync(fichiers, { level: 6 });
  }

  return { feuille, calculer, octets, feuilles };
}
