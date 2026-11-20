// Writing of an Excel workbook (.xlsx = zip archive of XML, Office Open XML standard) without a heavy dependency:
// fflate for the zip. Live formulas: each calculated cell carries its formula AND its cached value
// (evaluated by formules.js), and the workbook asks Excel to recalculate everything on opening.
import { zipSync, strToU8 } from "fflate";
import { evaluer, lettres } from "./formules.js";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Styles (index in cellXfs). Passation branding, conventions of a bank datapack: amounts without a symbol (unit
// "in €" at the top of the tab), negatives in parentheses, zero shown as "–"; editable inputs in copper on a framed
// cream background, formulas in ink; subtotals in bold, totals on a pale green background; green section bands.
// Indexes 0 to 16 are stable (the tests reread the XML); new styles are added at the end.
export const S = { normal: 0, titre: 1, entete: 2, euros: 3, eurosGras: 4, pct: 5, saisieEuros: 6, saisiePct: 7, petit: 8, pct2: 9, nombre: 10, gras: 11, saisieNombre: 12, sousTitre: 13, eurosTotal: 14, saisieTexte: 15, confidentiel: 16, section: 17, lien: 18, titreCouverture: 19, unite: 20, sectionNumero: 21, enteteDroite: 22, controle: 23, note: 24 };
export const COULEURS = { creme: "FBF6EC", espresso: "231E18", sable: "EADFCB", vert: "1E3A2E", cuivre: "A8653A", cuivreTexte: "8E5530", pierreTexte: "696155", vertPale: "E3EBE6" };
const C = (h) => `FF${h}`;
const ZERO = "&quot;–&quot;";
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0;\\(#,##0\\);${ZERO}"/><numFmt numFmtId="165" formatCode="0.0%;\\(0.0%\\);${ZERO}"/><numFmt numFmtId="166" formatCode="0.00%;\\(0.00%\\);${ZERO}"/><numFmt numFmtId="167" formatCode="#,##0.000;\\(#,##0.000\\);${ZERO}"/></numFmts>
<fonts count="10">
<font><sz val="10"/><color rgb="${C(COULEURS.espresso)}"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="${C(COULEURS.espresso)}"/><name val="Arial"/></font>
<font><b/><sz val="16"/><color rgb="${C(COULEURS.vert)}"/><name val="Arial"/></font>
<font><i/><sz val="9"/><color rgb="${C(COULEURS.pierreTexte)}"/><name val="Arial"/></font>
<font><b/><sz val="12"/><color rgb="${C(COULEURS.vert)}"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="${C(COULEURS.cuivreTexte)}"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="${C(COULEURS.cuivreTexte)}"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="${C(COULEURS.creme)}"/><name val="Arial"/></font>
<font><u/><sz val="10"/><color rgb="${C(COULEURS.cuivreTexte)}"/><name val="Arial"/></font>
<font><b/><sz val="22"/><color rgb="${C(COULEURS.espresso)}"/><name val="Arial"/></font>
</fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${C(COULEURS.sable)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${C(COULEURS.creme)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${C(COULEURS.vertPale)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${C(COULEURS.vert)}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${C(COULEURS.espresso)}"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="${C(COULEURS.espresso)}"/></top><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${C(COULEURS.vert)}"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="${C(COULEURS.sable)}"/></left><right style="thin"><color rgb="${C(COULEURS.sable)}"/></right><top style="thin"><color rgb="${C(COULEURS.sable)}"/></top><bottom style="thin"><color rgb="${C(COULEURS.sable)}"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="25">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="167" fontId="6" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="3" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="7" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="7" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const base64EnOctets = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const EMU = 9525; // 1 px (96 dpi) in EMU

export function creerClasseur() {
  const feuilles = [];
  const parNom = new Map();

  function feuille(nom, { largeurs = [], onglet = null, paysage = false } = {}) {
    const cellules = new Map(); // "r,c" → { v, f, s }
    const hauteurs = new Map(), fusions = [], liens = [], images = [];
    const f = {
      nom, largeurs, cellules, onglet, paysage, hauteurs, fusions, liens, images,
      /** Writes a cell. contenu: number, text, null, or { f: "formula without =", s }; s = style. */
      ecrire(r, c, contenu, s = S.normal) {
        if (contenu && typeof contenu === "object") cellules.set(`${r},${c}`, { f: contenu.f, s: contenu.s ?? s });
        else cellules.set(`${r},${c}`, { v: contenu, s });
        return `${lettres(c)}${r + 1}`;
      },
      ref: (r, c, absolue = false) => (absolue ? `$${lettres(c)}$${r + 1}` : `${lettres(c)}${r + 1}`),
      /** Row height in points. */
      hauteur(r, pt) { hauteurs.set(r, pt); },
      /** Merges a range, e.g. "B30:D30". */
      fusionner(plage) { fusions.push(plage); },
      /** Internal link to cell A1 of another tab (text underlined in copper). */
      lien(r, c, texte, cible, s = S.lien) { this.ecrire(r, c, texte, s); liens.push({ ref: `${lettres(c)}${r + 1}`, cible }); },
      /** PNG image (base64) anchored at the top left of cell (r, c), display size in pixels. */
      image({ png, r = 0, c = 0, largeur, hauteur, nom: nomImage = "Image", decalageX = 0, decalageY = 0 }) { images.push({ png, r, c, largeur, hauteur, nomImage, decalageX, decalageY }); },
      /** Reference from another sheet. */
      ext: (r, c) => `'${nom}'!${lettres(c)}${r + 1}`,
    };
    feuilles.push(f);
    parNom.set(nom, f);
    return f;
  }

  /** Calculates all the formulas (cached values), with detection of circular references. */
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
    for (const r of fe.hauteurs.keys()) if (!lignes.has(r)) lignes.set(r, []);
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
      const ht = fe.hauteurs.get(r);
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");
    const cols = fe.largeurs.length ? `<cols>${fe.largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const sheetPr = `<sheetPr>${fe.onglet ? `<tabColor rgb="FF${fe.onglet}"/>` : ""}<pageSetUpPr fitToPage="1"/></sheetPr>`;
    const fusions = fe.fusions.length ? `<mergeCells count="${fe.fusions.length}">${fe.fusions.map((p) => `<mergeCell ref="${p}"/>`).join("")}</mergeCells>` : "";
    const liens = fe.liens.length ? `<hyperlinks>${fe.liens.map((l) => `<hyperlink ref="${l.ref}" location="${xml(`'${l.cible}'!A1`)}" display="${xml(l.cible)}"/>`).join("")}</hyperlinks>` : "";
    const mise = `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${fe.paysage ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>`;
    const dessin = fe.images.length ? `<drawing r:id="rId1"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sheetPr}<sheetViews><sheetView workbookViewId="0" showGridLines="0"${fe === feuilles[0] ? ' tabSelected="1"' : ""}/></sheetViews><sheetFormatPr defaultRowHeight="13.2"/>${cols}<sheetData>${corps}</sheetData>${fusions}${liens}${mise}${dessin}</worksheet>`;
  }

  /** Drawing (images) of a sheet: anchored on a cell, fixed size. */
  function xmlDessin(fe, premierId) {
    const pics = fe.images.map((im, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.c}</xdr:col><xdr:colOff>${Math.round(im.decalageX * EMU)}</xdr:colOff><xdr:row>${im.r}</xdr:row><xdr:rowOff>${Math.round(im.decalageY * EMU)}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(im.largeur * EMU)}" cy="${Math.round(im.hauteur * EMU)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="${xml(im.nomImage)}" descr="${xml(im.nomImage)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(im.largeur * EMU)}" cy="${Math.round(im.hauteur * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join("");
    const rels = fe.images.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${premierId + i}.png"/>`).join("");
    return {
      dessin: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pics}</xdr:wsDr>`,
      rels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    };
  }

  /** @returns Uint8Array of the .xlsx file */
  function octets({ titre = "Datapack", auteur = "Passation" } = {}) {
    const calc = calculer();
    const avecImages = feuilles.filter((f) => f.images.length);
    const fichiers = {
      "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}${avecImages.map((_, k) => `<Override PartName="/xl/drawings/drawing${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
      "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
      "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(titre)}</dc:title><dc:creator>${xml(auteur)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
      "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${feuilles.map((f, i) => `<sheet name="${xml(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      "xl/styles.xml": strToU8(STYLES),
    };
    feuilles.forEach((f, i) => { fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlFeuille(f, calc)); });
    let image = 1;
    avecImages.forEach((f, k) => {
      const { dessin, rels } = xmlDessin(f, image);
      f.images.forEach((im) => { fichiers[`xl/media/image${image++}.png`] = base64EnOctets(im.png); });
      fichiers[`xl/drawings/drawing${k + 1}.xml`] = strToU8(dessin);
      fichiers[`xl/drawings/_rels/drawing${k + 1}.xml.rels`] = strToU8(rels);
      fichiers[`xl/worksheets/_rels/sheet${feuilles.indexOf(f) + 1}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${k + 1}.xml"/></Relationships>`);
    });
    return zipSync(fichiers, { level: 6 });
  }

  return { feuille, calculer, octets, feuilles };
}
