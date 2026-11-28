// Simulated Claude API, for local checks only (never in production): `npx wrangler dev --var ANTHROPIC_BASE_URL:http://127.0.0.1:8790`
// with any ANTHROPIC_API_KEY value in .dev.vars (or `--var ANTHROPIC_API_KEY:simule`). No network, no real key.
//   node scripts/claude-simule.mjs [port]          (default 8790)
// It answers POST …/v1/messages:
//   - structured outputs (output_config.format.schema): a JSON that follows the requested schema, every text marked
//     as fictitious ("simulated"); the tax-return schema gets coherent fictitious amounts for three fiscal years;
//   - the market research (web_search tool): one simulated search result and two facts citing it, marked fictitious.
// Nothing it writes is a real figure, source or fact: it exists to drive the interface end to end.
import { createServer } from "node:http";

const PORT = Number(process.argv[2]) || 8790;
let n = 0;

// Fictitious tax return (euros), three fiscal years, consistent: balance sheet balanced, EBITDA = revenue − expenses
const LIASSE = {
  2024: { chiffre_affaires: 1_200_000, autres_produits: 10_000, achats_consommes: 420_000, charges_externes: 230_000, impots_taxes: 20_000, charges_personnel: 390_000,
    dotations_amortissements: 40_000, resultat_exploitation: 110_000, resultat_net: 80_000, immobilisations_nettes: 180_000, stocks: 90_000, creances_clients: 210_000,
    autres_creances: 20_000, placements: 0, tresorerie: 160_000, capitaux_propres: 420_000, provisions_risques: 10_000, emprunts: 90_000, dettes_fournisseurs: 80_000, dettes_fiscales_sociales: 60_000, autres_dettes: 0 },
  2023: { chiffre_affaires: 1_100_000, autres_produits: 5_000, achats_consommes: 390_000, charges_externes: 220_000, impots_taxes: 20_000, charges_personnel: 370_000,
    dotations_amortissements: 38_000, resultat_exploitation: 67_000, resultat_net: 50_000, immobilisations_nettes: 190_000, stocks: 85_000, creances_clients: 195_000,
    autres_creances: 15_000, placements: 0, tresorerie: 120_000, capitaux_propres: 360_000, provisions_risques: 10_000, emprunts: 110_000, dettes_fournisseurs: 75_000, dettes_fiscales_sociales: 50_000, autres_dettes: 0 },
  2022: { chiffre_affaires: 1_000_000, autres_produits: 5_000, achats_consommes: 360_000, charges_externes: 210_000, impots_taxes: 18_000, charges_personnel: 350_000,
    dotations_amortissements: 36_000, resultat_exploitation: 31_000, resultat_net: 25_000, immobilisations_nettes: 200_000, stocks: 80_000, creances_clients: 180_000,
    autres_creances: 10_000, placements: 0, tresorerie: 90_000, capitaux_propres: 330_000, provisions_risques: 10_000, emprunts: 130_000, dettes_fournisseurs: 50_000, dettes_fiscales_sociales: 40_000, autres_dettes: 0 },
};

const TEXTES = {
  fr: { court: "Texte simulé", phrase: "Texte fictif produit par le simulateur local, pour vérifier la mise en page.", titre: "Une activité établie, texte fictif du simulateur", demande: "Demande fictive (simulateur)" },
  en: { court: "Simulated text", phrase: "Fictitious text produced by the local simulator, to check the layout.", titre: "An established business, fictitious simulator text", demande: "Fictitious request (simulator)" },
};

/** Value following a JSON schema: first enum value, minimum, at least one item (four "points"), texts by key name. */
function exemple(s, cle, T, contexte) {
  if (!s || typeof s !== "object") return null;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum)) return s.enum[0];
  const alt = s.anyOf || s.oneOf;
  if (alt) return exemple(alt.find((x) => x.type !== "null") || alt[0], cle, T, contexte);
  const type = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  if (type === "object") {
    const o = {};
    for (const [k, p] of Object.entries(s.properties || {})) o[k] = exemple(p, k, T, contexte);
    return o;
  }
  if (type === "array") {
    if (cle === "parcours_equipe") return (contexte.equipe || []).map((p) => ({ id: p.id, texte: T.phrase }));
    if (cle === "remarques" || cle === "signalements" || cle === "termes_identifiants") return [];
    const nb = cle === "points" ? 4 : cle === "atouts" ? 3 : Math.max(1, s.minItems || 0);
    return Array.from({ length: nb }, () => exemple(s.items, cle === "points" ? "point" : cle, T, contexte));
  }
  if (type === "integer" || type === "number") return Number.isFinite(s.minimum) ? Math.max(s.minimum, 3) : 3;
  if (type === "boolean") return true;
  if (type === "string") {
    if (/url|source/i.test(cle || "")) return "https://simulateur.invalid/texte-fictif";
    if (cle === "titre") return T.titre;
    if (["accroche", "legende", "metiers"].includes(cle)) return T.court;
    if (cle === "a_completer") return T.demande;
    return T.phrase;
  }
  return null;
}

function liasse() {
  return { exercices: Object.entries(LIASSE).map(([annee, v]) => ({ annee: Number(annee), date_cloture: `${annee}-12-31`,
    champs: Object.entries(v).map(([cle, valeur], i) => ({ cle, valeur, page: 1 + (i % 4), libelle_lu: `${cle} (fictif)` })) })),
    remarques: "Liasse fictive renvoyée par le simulateur local : aucun montant réel." };
}

function reponse(corps) {
  const systeme = typeof corps.system === "string" ? corps.system : JSON.stringify(corps.system || "");
  const T = /LANGUE DE SORTIE/.test(systeme) ? TEXTES.en : TEXTES.fr;
  const message = corps.messages?.at(-1)?.content;
  const texteUtilisateur = typeof message === "string" ? message : (Array.isArray(message) ? message.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "");
  let contexte = {};
  try { contexte = { equipe: JSON.parse(texteUtilisateur.slice(texteUtilisateur.indexOf("{"))).equipe_dirigeante || [] }; } catch { /* no JSON */ }
  const base = { id: `msg_simule_${++n}`, type: "message", role: "assistant", model: corps.model, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } };
  const schema = corps.output_config?.format?.schema;
  if (schema) {
    const valeur = schema.properties?.exercices && schema.properties?.remarques ? liasse() : exemple(schema, null, T, contexte);
    return { ...base, content: [{ type: "text", text: JSON.stringify(valeur) }] };
  }
  if ((corps.tools || []).some((t) => t.name === "web_search")) {
    const url = "https://simulateur.invalid/etude-de-marche-fictive";
    const faits = [
      { theme: "taille", fait: `${T.phrase} (1)`, chiffre: null, annee: null, source: "Simulateur (fictif)", url },
      { theme: "tendance", fait: `${T.phrase} (2)`, chiffre: null, annee: null, source: "Simulateur (fictif)", url },
    ];
    return { ...base, content: [
      { type: "server_tool_use", id: "srvtoolu_simule", name: "web_search", input: { query: "simulation" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_simule", content: [{ type: "web_search_result", url, title: "Page fictive (simulateur)", encrypted_content: "", page_age: null }] },
      { type: "text", text: `\`\`\`json\n${JSON.stringify({ faits })}\n\`\`\`` },
    ] };
  }
  return { ...base, content: [{ type: "text", text: T.phrase }] };
}

createServer((req, res) => {
  if (req.method !== "POST" || !/\/v1\/messages(\?|$)/.test(req.url)) { res.writeHead(404, { "content-type": "application/json" }); res.end('{"type":"error","error":{"type":"not_found_error","message":"simulateur : route inconnue"}}'); return; }
  let brut = "";
  req.on("data", (c) => { brut += c; });
  req.on("end", () => {
    let corps;
    try { corps = JSON.parse(brut); } catch { res.writeHead(400); res.end(); return; }
    const r = reponse(corps);
    console.log(`simulateur : ${corps.model} → ${r.content.map((b) => b.type).join(", ")}`);
    res.writeHead(200, { "content-type": "application/json", "request-id": r.id });
    res.end(JSON.stringify(r));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Claude simulé sur http://127.0.0.1:${PORT} (aucune donnée réelle)`));
