// Calls to the Claude API (official SDK). Key: ANTHROPIC_API_KEY secret (wrangler secret put), never in the code.
// Tax-return reading: the PDF is sent as is (base64 "document" block); the response is JSON constrained by
// a schema. Claude calculates nothing: it copies figures, which the owner approves line by line.
import Anthropic from "@anthropic-ai/sdk";
import { contenuConcis } from "../documents/concision.js";
import { MODELS } from "../config.js";
import { CHAMPS } from "../../public/js/champs-financiers.js";
import { t as tr, langue } from "../../public/js/i18n.js";

/** Language of the text produced: instructions and data stay in French; in English, a final instruction asks for
 *  text written in English (the interface language at generation time). */
const langueDeSortie = () => (langue() === "en"
  ? "\n\nLANGUE DE SORTIE : rédige tout le texte que tu produis en anglais américain, sobre et professionnel, même si ces consignes et les données sont en français. Ne traduis pas les noms propres, les noms de code ni les marques ; « EBE » s'écrit « EBITDA »."
  : "");

export const claudeDisponible = (env) => Boolean(env.ANTHROPIC_API_KEY);
// ANTHROPIC_BASE_URL: development setting only (simulated server for local trials), absent in production.
const client = (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });

const SCHEMA_LIASSE = {
  type: "object",
  additionalProperties: false,
  required: ["exercices", "remarques"],
  properties: {
    exercices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["annee", "date_cloture", "champs"],
        properties: {
          annee: { type: "integer", description: "Année de clôture de l'exercice" },
          date_cloture: { type: ["string", "null"], description: "Date de clôture lue (AAAA-MM-JJ), ou null" },
          champs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["cle", "valeur", "page", "libelle_lu"],
              properties: {
                cle: { type: "string", enum: CHAMPS.map((c) => c.cle) },
                valeur: { type: ["number", "null"], description: "Montant en euros, tel qu'écrit dans le document ; null si absent" },
                page: { type: ["integer", "null"], description: "Numéro de page du PDF où le montant figure" },
                libelle_lu: { type: "string", description: "Libellé exact de la ligne dans le document" },
              },
            },
          },
        },
      },
    },
    remarques: { type: "string", description: "Points d'attention : pages illisibles, montants en milliers, colonnes ambiguës" },
  },
};

// Built at call time (dictionaries installed), always in French: the tax return is a French document.
const consigneLiasse = () => `Tu lis une liasse fiscale française (formulaires 2033 du régime simplifié ou 2050 à 2059 du régime normal), ou des comptes annuels.
Recopie les montants demandés, pour chaque exercice présent dans le document (exercice N et, s'il figure, exercice N-1).
Règles :
- Recopie uniquement ce qui est écrit. Ne calcule rien, n'estime rien. Si un montant n'apparaît pas, valeur = null.
- Montants en euros, sans séparateur. Si le document est en milliers d'euros, convertis en euros et signale-le dans « remarques ».
- Les montants négatifs (perte, variation négative) gardent leur signe.
- Pour chaque montant, indique la page du PDF et le libellé exact de la ligne.
Champs demandés (clé : définition) :
${CHAMPS.map((c) => `- ${c.cle} : ${tr(`champs.champs.${c.cle}.libelle`, {}, "fr")} (${tr(`champs.champs.${c.cle}.aide`, {}, "fr")})`).join("\n")}`;

/** @returns { exercices: [{annee, date_cloture, champs: [{cle, valeur, page, libelle_lu}]}], remarques, usage } */
export async function lireLiasse(env, pdfBase64) {
  const reponse = await client(env).messages.create({
    model: MODELS.fast,
    max_tokens: 16000,
    system: consigneLiasse(),
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "Extrais les montants de ce document selon les règles." },
      ],
    }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_LIASSE } },
  });
  if (reponse.stop_reason === "refusal") throw new Error("lecture_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  const texte = reponse.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const donnees = JSON.parse(texte);
  return { ...donnees, usage: { entree: reponse.usage.input_tokens, sortie: reponse.usage.output_tokens } };
}

// ---------------------------------------------------------------- Anonymized teaser
const SCHEMA_TEASER = {
  type: "object", additionalProperties: false,
  required: ["accroche", "activite", "chiffres", "atouts", "operation"],
  properties: {
    accroche: { type: "string", description: "Une phrase de titre, sans nom ni lieu précis" },
    activite: { type: "string", description: "Présentation de l'activité, 3 à 5 phrases" },
    chiffres: { type: "string", description: "Chiffres clés en fourchettes, 2 à 3 phrases" },
    atouts: { type: "array", items: { type: "string" }, description: "3 à 5 atouts, une phrase chacun" },
    operation: { type: "string", description: "L'opération recherchée, 2 à 3 phrases" },
  },
};
const CONSIGNE_TEASER = `Tu rédiges le teaser anonymisé d'une PME française à céder, en français, à la troisième personne, sur un ton sobre et factuel (pas de superlatifs).
Règles absolues :
- Utilise uniquement les faits fournis. N'invente aucun chiffre, aucun client, aucune certification, aucun projet.
- Si une information manque pour une partie, écris exactement « À compléter ».
- Anonymat : ne cite jamais de nom d'entreprise, de marque, de produit nommé, de personne, de ville ni de département ; seulement la région fournie.
- Chiffres : uniquement les fourchettes fournies, recopiées telles quelles. Jamais de montant précis.
- 250 à 350 mots au total.`;

/** @param faits object of anonymous facts; @param corrections terms to remove (second attempt) */
export async function redigerTeaser(env, faits, corrections = []) {
  const consigne = corrections.length
    ? `${CONSIGNE_TEASER}\nUne première version contenait des éléments identifiants à supprimer absolument : ${corrections.join(", ")}.`
    : CONSIGNE_TEASER;
  const consigneLangue = consigne + langueDeSortie();
  const reponse = await client(env).beta.messages.create({
    model: MODELS.deep,
    max_tokens: 16000,
    system: consigneLangue,
    messages: [{ role: "user", content: `Faits disponibles (JSON) :\n${JSON.stringify(faits, null, 2)}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_TEASER } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// ---------------------------------------------------------------- Website → sourced facts
const SCHEMA_SITE = {
  type: "object", additionalProperties: false, required: ["faits", "termes_identifiants"],
  properties: {
    faits: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["categorie", "fait", "source"],
        properties: {
          categorie: { type: "string", enum: ["activite", "produits", "clients", "marche", "histoire", "equipe", "implantation", "qualite", "autre"] },
          fait: { type: "string", description: "Une phrase factuelle, telle que le site l'affirme" },
          source: { type: "string", description: "Adresse de la page où le fait figure" },
        },
      },
    },
    termes_identifiants: { type: "array", items: { type: "string" }, description: "Marques, noms de produits, noms de personnes, lieux précis cités sur le site" },
  },
};
const CONSIGNE_SITE = `Tu lis les pages du site internet d'une PME française, pour préparer son mémorandum de cession.
Relève au plus 25 faits utiles à un repreneur (activité, produits, clients, marché, histoire, équipe, implantation, qualité), un par phrase.
Règles : uniquement ce que les pages affirment ; aucune déduction, aucune exagération ; indique pour chaque fait l'adresse exacte de la page.
N'inclus aucune donnée personnelle (téléphone, adresse électronique, nom de salarié). Ignore les mentions légales et les cookies.
Liste aussi les termes identifiants (marques, noms de produits, noms propres, lieux précis) : ils seront exclus du teaser anonyme.`;

export async function extraireSite(env, pages) {
  const contenu = pages.map((p) => `=== Page : ${p.url}\nTitre : ${p.titre}\n${p.texte}`).join("\n\n");
  const reponse = await client(env).messages.create({
    model: MODELS.fast, max_tokens: 16000, system: CONSIGNE_SITE + langueDeSortie(),
    messages: [{ role: "user", content: contenu }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_SITE } },
  });
  if (reponse.stop_reason === "refusal") throw new Error("lecture_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// ---------------------------------------------------------------- Memorandum: one section
// The title states the chapter's conclusion (investment-bank convention); the hook sums it up in one sentence
// for the list of strengths in the summary. Lengths checked by the code (src/documents/memo.js, titreValide):
// structured outputs do not accept maxLength.
const SCHEMA_SECTION = {
  type: "object", additionalProperties: false, required: ["titre", "accroche", "introduction", "points", "a_completer"],
  properties: {
    titre: { type: "string", description: "Titre affirmatif du chapitre : la conclusion qu'un repreneur doit retenir, appuyée si possible sur un chiffre fourni. Une ligne, 90 caractères au plus, sans point final." },
    accroche: { type: "string", description: "Une phrase de 160 caractères au plus qui résume le chapitre pour la synthèse." },
    introduction: { type: "string", description: "Le constat du chapitre en deux phrases au plus (40 mots au plus), sans liste ni énumération." },
    points: { type: "array", description: "4 à 6 points, du plus important au moins important", items: { type: "object", additionalProperties: false, required: ["titre", "texte"], properties: {
      titre: { type: "string", description: "Le fait clé en 2 à 6 mots, sans verbe conjugué si possible (ex. « Production intégrée »)." },
      texte: { type: "string", description: "Une ou deux phrases (35 mots au plus) : le fait avec son chiffre, puis ce qu'il signifie pour un repreneur." },
    } } },
    a_completer: { type: "array", items: { type: "string" }, description: "Informations manquantes que le dirigeant devrait apporter, formulées comme des demandes précises" },
  },
};
const CONSIGNE_MEMO = `Tu es associé d'une banque d'affaires française spécialisée dans la transmission de PME. Tu rédiges un chapitre du mémorandum d'information d'une entreprise à céder. Il sera lu par des repreneurs sérieux (dirigeants, fonds, industriels) qui ont signé un engagement de confidentialité et qui comparent plusieurs dossiers : chaque phrase doit leur apprendre quelque chose.

Style
- Français, troisième personne, présent. Ton d'un professionnel de la cession : précis, factuel, affirmatif quand les faits le permettent. Aucune formule publicitaire, aucun superlatif non démontré (« leader », « unique », « incontournable », « exceptionnel » sont interdits, sauf s'ils figurent tels quels dans un fait fourni).
- Titre : la conclusion du chapitre, pas son sujet. Exemple de forme : « Une clientèle fidèle : les cinq premiers clients pèsent 38 % du chiffre d'affaires ». Pas d'exemple de chiffre inventé : n'utilise que ceux fournis.
- Une page de mémorandum se lit en trente secondes : introduction de deux phrases au plus, puis 4 à 6 points. Chaque point : un titre de 2 à 6 mots et une ou deux phrases courtes (35 mots au plus). Pas d'énumération à rallonge, pas de liste dans une phrase, pas de copie du site : choisis et synthétise les 2 ou 3 éléments qui comptent pour un repreneur.
- Les informations manquantes ne figurent pas dans le texte : elles vont dans a_completer (le document les signale à part).
- Chiffres : recopie exactement les montants et pourcentages fournis, dans leur forme (« 1,2 M€ », « 8,4 % », « +4,1 % par an »). Ne calcule aucun nouveau chiffre, ratio, moyenne ou évolution : utilise ceux qui sont fournis dans « indicateurs_calcules » et les tableaux.
- Les estimations du dirigeant sont présentées comme telles (« le dirigeant anticipe… »). Les faits issus du site internet sont présentés comme des affirmations de l'entreprise.

Règles absolues
- Utilise uniquement les données fournies : réponses du dirigeant, faits de son site qu'il a validés, données publiques, chiffres validés et indicateurs calculés. N'invente rien : ni chiffre, ni client, ni nom, ni projet, ni certification, ni concurrent, ni tendance de marché.
- Ne mentionne aucun prix, aucune valeur d'entreprise, aucune fourchette de valorisation.
- Quand une information attendue manque, écris « À compléter » à l'endroit voulu et ajoute une demande précise dans a_completer (par exemple « Préciser la part du chiffre d'affaires réalisée sous contrat pluriannuel »).
- Mieux vaut quatre points nets que six points délayés : si les faits manquent, le chapitre est plus court et a_completer dit ce qu'il faut apporter.`;

export async function redigerSectionMemo(env, { titre, consigne }, donnees) {
  const reponse = await client(env).beta.messages.create({
    model: MODELS.deep, max_tokens: 16000,
    system: `${CONSIGNE_MEMO}\n\nChapitre à rédiger : « ${titre} ».\n${consigne}${langueDeSortie()}`,
    messages: [{ role: "user", content: `Données du dossier (JSON) :\n${JSON.stringify(donnees, null, 2)}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_SECTION } },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
  });
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  const r = JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  return { titre: r.titre, accroche: r.accroche, contenu: contenuConcis(r), a_completer: r.a_completer || [] };
}

// ---------------------------------------------------------------- Memorandum: market research (web search)
// Claude searches the web for sourced market facts (size, trends, regulation, demand, competition) for the
// company's industry and region. Safeguard: a fact is kept only if its address is among the pages actually
// returned by the search (faitsSourcesVerifies); the owner then approves each fact.
const THEMES_MARCHE = ["taille", "tendance", "demande", "reglementation", "concurrence"];
const CONSIGNE_MARCHE = `Tu es analyste dans une banque d'affaires française. Tu prépares la partie « Marché » du mémorandum de cession d'une PME.
Cherche sur le web des faits récents (moins de 4 ans) et chiffrés sur le marché de l'entreprise, en France et dans sa région : taille du marché ou de l'activité (chiffre d'affaires, volumes, nombre d'entreprises), évolution, tendances et moteurs de la demande, réglementation qui s'impose au secteur, structure concurrentielle.
Sources à privilégier : INSEE, ministères et administrations, Banque de France, fédérations et organisations professionnelles, chambres de métiers et de commerce, observatoires sectoriels, études publiques. Évite les blogs commerciaux et les contenus sans auteur.
Règles absolues :
- Chaque fait doit venir d'une page que tu as réellement consultée par la recherche ; recopie son adresse exacte.
- Recopie les chiffres tels qu'ils figurent dans la source, avec leur année. Ne calcule rien, n'extrapole rien.
- Aucune information sur l'entreprise elle-même ni sur un concurrent nommé.
- 4 à 8 faits, en français, une phrase chacun.
Réponds en terminant par un bloc \`\`\`json contenant exactement : {"faits":[{"theme":"taille|tendance|demande|reglementation|concurrence","fait":"phrase","chiffre":"le chiffre clé tel qu'écrit, ou null","annee":"année du chiffre, ou null","source":"nom de l'organisme","url":"adresse exacte"}]}`;

/** Safeguard: keeps only well-formed facts whose address was actually returned by the search. */
export function faitsSourcesVerifies(faits, urlsConsultees) {
  const norm = (u) => String(u || "").trim().replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
  const connues = new Set([...urlsConsultees].map(norm));
  return (Array.isArray(faits) ? faits : [])
    .filter((f) => f && typeof f.fait === "string" && f.fait.trim() && THEMES_MARCHE.includes(f.theme) && connues.has(norm(f.url)) && /^https?:\/\//.test(f.url))
    .slice(0, 8)
    .map((f) => ({ theme: f.theme, fait: f.fait.trim().slice(0, 400), chiffre: typeof f.chiffre === "string" && f.chiffre.trim() ? f.chiffre.trim().slice(0, 60) : null,
      annee: f.annee == null ? null : String(f.annee).slice(0, 9), source: String(f.source || "").trim().slice(0, 120) || null, url: String(f.url).trim() }));
}

/** Last JSON object in a text (```json block or final braces). */
export function dernierJson(texte) {
  const blocs = [...String(texte).matchAll(/\`\`\`json\s*([\s\S]*?)\`\`\`/g)].map((m) => m[1]);
  const candidats = blocs.length ? blocs.reverse() : [String(texte).slice(String(texte).indexOf("{"))];
  for (const c of candidats) { try { return JSON.parse(c); } catch { /* next candidate */ } }
  return null;
}

/** @param contexte { secteur, activite_naf, region, description } (no company name); @returns { faits, urls, usage } */
export const MARCHE_DUREE_MAX_MS = 110000;
export async function rechercherMarche(env, contexte) {
  const messages = [{ role: "user", content: `Entreprise à présenter (anonyme) :\n${JSON.stringify(contexte, null, 2)}` }];
  const urls = new Set();
  let texte = "", reponse;
  // Budget: 4 searches per round, 2 rounds at most, 75 s per call and 110 s in total (the research must not keep
  // the owner waiting more than two minutes; beyond that, the Market chapter relies on the public registries)
  const fin = Date.now() + MARCHE_DUREE_MAX_MS;
  for (let tour = 0; tour < 2; tour++) {
    const reste = fin - Date.now();
    if (reste < 15000) throw new Error("recherche_trop_longue");
    reponse = await client(env).beta.messages.create({
      model: MODELS.deep, max_tokens: 8000, system: CONSIGNE_MARCHE + langueDeSortie(), messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "FR" } }],
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    }, { timeout: Math.min(75000, reste), maxRetries: 0 });
    for (const b of reponse.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.url) urls.add(r.url);
      if (b.type === "text") { texte += b.text; for (const c of b.citations || []) if (c?.url) urls.add(c.url); }
    }
    if (reponse.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: reponse.content });
  }
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "pause_turn") throw new Error("recherche_inachevee");
  const brut = dernierJson(texte);
  return { faits: faitsSourcesVerifies(brut?.faits, urls), urls: [...urls] };
}

/** Claude API authentication error (key missing, badly copied or of another type): explicit message. */
export const cleRefusee = (e) => e?.status === 401 || e?.status === 403;
/** Message for a refused key, in the language of the request (read at each use). */
export const MESSAGE_CLE_REFUSEE = { toString: () => tr("serveur.claude.cle_refusee"), toJSON: () => tr("serveur.claude.cle_refusee") };
