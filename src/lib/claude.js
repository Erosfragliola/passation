// Appels à l'API Claude (SDK officiel). Clé : secret ANTHROPIC_API_KEY (wrangler secret put), jamais dans le code.
// Lecture de liasse : le PDF est envoyé tel quel (bloc « document » base64) ; la réponse est un JSON contraint par
// un schéma. Claude ne calcule rien : il recopie des chiffres, que le dirigeant valide ligne par ligne.
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../config.js";
import { CHAMPS } from "../../public/js/champs-financiers.js";

export const claudeDisponible = (env) => Boolean(env.ANTHROPIC_API_KEY);
// ANTHROPIC_BASE_URL : réglage de développement uniquement (serveur simulé pour les essais locaux), absent en production.
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

const CONSIGNE = `Tu lis une liasse fiscale française (formulaires 2033 du régime simplifié ou 2050 à 2059 du régime normal), ou des comptes annuels.
Recopie les montants demandés, pour chaque exercice présent dans le document (exercice N et, s'il figure, exercice N-1).
Règles :
- Recopie uniquement ce qui est écrit. Ne calcule rien, n'estime rien. Si un montant n'apparaît pas, valeur = null.
- Montants en euros, sans séparateur. Si le document est en milliers d'euros, convertis en euros et signale-le dans « remarques ».
- Les montants négatifs (perte, variation négative) gardent leur signe.
- Pour chaque montant, indique la page du PDF et le libellé exact de la ligne.
Champs demandés (clé : définition) :
${CHAMPS.map((c) => `- ${c.cle} : ${c.libelle} (${c.aide})`).join("\n")}`;

/** @returns { exercices: [{annee, date_cloture, champs: [{cle, valeur, page, libelle_lu}]}], remarques, usage } */
export async function lireLiasse(env, pdfBase64) {
  const reponse = await client(env).messages.create({
    model: MODELS.fast,
    max_tokens: 16000,
    system: CONSIGNE,
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

// ---------------------------------------------------------------- Teaser anonymisé
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

/** @param faits objet de faits anonymes ; @param corrections termes à retirer (seconde tentative) */
export async function redigerTeaser(env, faits, corrections = []) {
  const consigne = corrections.length
    ? `${CONSIGNE_TEASER}\nUne première version contenait des éléments identifiants à supprimer absolument : ${corrections.join(", ")}.`
    : CONSIGNE_TEASER;
  const reponse = await client(env).beta.messages.create({
    model: MODELS.deep,
    max_tokens: 16000,
    system: consigne,
    messages: [{ role: "user", content: `Faits disponibles (JSON) :\n${JSON.stringify(faits, null, 2)}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_TEASER } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// ---------------------------------------------------------------- Site internet → faits sourcés
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
    model: MODELS.fast, max_tokens: 16000, system: CONSIGNE_SITE,
    messages: [{ role: "user", content: contenu }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_SITE } },
  });
  if (reponse.stop_reason === "refusal") throw new Error("lecture_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// ---------------------------------------------------------------- Mémorandum : une section
// Le titre affirme la conclusion du chapitre (convention des banques d'affaires) ; l'accroche le résume en une phrase
// pour la liste des points forts de la synthèse. Longueurs contrôlées par le code (src/documents/memo.js, titreValide) :
// les sorties structurées n'acceptent pas maxLength.
const SCHEMA_SECTION = {
  type: "object", additionalProperties: false, required: ["titre", "accroche", "contenu", "a_completer"],
  properties: {
    titre: { type: "string", description: "Titre affirmatif du chapitre : la conclusion qu'un repreneur doit retenir, appuyée si possible sur un chiffre fourni. Une ligne, 90 caractères au plus, sans point final." },
    accroche: { type: "string", description: "Une phrase de 160 caractères au plus qui résume le chapitre pour la synthèse." },
    contenu: { type: "string", description: "Corps du chapitre : un court paragraphe d'introduction, puis des puces commençant par « - » ; **gras** pour le fait clé de chaque puce ; paragraphes séparés par une ligne vide" },
    a_completer: { type: "array", items: { type: "string" }, description: "Informations manquantes que le dirigeant devrait apporter, formulées comme des demandes précises" },
  },
};
const CONSIGNE_MEMO = `Tu es associé d'une banque d'affaires française spécialisée dans la transmission de PME. Tu rédiges un chapitre du mémorandum d'information d'une entreprise à céder. Il sera lu par des repreneurs sérieux (dirigeants, fonds, industriels) qui ont signé un engagement de confidentialité et qui comparent plusieurs dossiers : chaque phrase doit leur apprendre quelque chose.

Style
- Français, troisième personne, présent. Ton d'un professionnel de la cession : précis, factuel, affirmatif quand les faits le permettent. Aucune formule publicitaire, aucun superlatif non démontré (« leader », « unique », « incontournable », « exceptionnel » sont interdits, sauf s'ils figurent tels quels dans un fait fourni).
- Titre : la conclusion du chapitre, pas son sujet. Exemple de forme : « Une clientèle fidèle : les cinq premiers clients pèsent 38 % du chiffre d'affaires ». Pas d'exemple de chiffre inventé : n'utilise que ceux fournis.
- Corps : 280 à 450 mots, aussi dense qu'une page de mémorandum de banque d'affaires. Un paragraphe d'introduction de deux ou trois phrases qui pose le constat, puis 5 à 8 puces. Chaque puce commence par le fait clé en **gras** (3 à 8 mots), suivi de « : », puis l'explique en deux ou trois phrases : le fait et son chiffre, ce qui l'explique, et ce qu'il signifie pour un repreneur (risque, levier, continuité). Pas de phrase creuse : chaque phrase apporte un fait, un chiffre ou une conséquence.
- Les éléments à compléter restent dans la puce concernée (« **Certifications** : À compléter. »), sans délayer.
- Chiffres : recopie exactement les montants et pourcentages fournis, dans leur forme (« 1,2 M€ », « 8,4 % », « +4,1 % par an »). Ne calcule aucun nouveau chiffre, ratio, moyenne ou évolution : utilise ceux qui sont fournis dans « indicateurs_calcules » et les tableaux.
- Les estimations du dirigeant sont présentées comme telles (« le dirigeant anticipe… »). Les faits issus du site internet sont présentés comme des affirmations de l'entreprise.

Règles absolues
- Utilise uniquement les données fournies : réponses du dirigeant, faits de son site qu'il a validés, données publiques, chiffres validés et indicateurs calculés. N'invente rien : ni chiffre, ni client, ni nom, ni projet, ni certification, ni concurrent, ni tendance de marché.
- Ne mentionne aucun prix, aucune valeur d'entreprise, aucune fourchette de valorisation.
- Quand une information attendue manque, écris « À compléter » à l'endroit voulu et ajoute une demande précise dans a_completer (par exemple « Préciser la part du chiffre d'affaires réalisée sous contrat pluriannuel »).
- La densité vient des faits fournis, jamais de l'invention : s'ils manquent, le chapitre est plus court et a_completer dit ce qu'il faut apporter.`;

export async function redigerSectionMemo(env, { titre, consigne }, donnees) {
  const reponse = await client(env).beta.messages.create({
    model: MODELS.deep, max_tokens: 16000,
    system: `${CONSIGNE_MEMO}\n\nChapitre à rédiger : « ${titre} ».\n${consigne}`,
    messages: [{ role: "user", content: `Données du dossier (JSON) :\n${JSON.stringify(donnees, null, 2)}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_SECTION } },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
  });
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// ---------------------------------------------------------------- Mémorandum : étude de marché (recherche web)
// Claude cherche sur le web des faits de marché sourcés (taille, tendances, réglementation, demande, concurrence) pour
// le secteur et la région de l'entreprise. Garde-fou : un fait n'est retenu que si son adresse figure parmi les pages
// réellement renvoyées par la recherche (faitsSourcesVerifies) ; le dirigeant valide ensuite chaque fait.
export const THEMES_MARCHE = ["taille", "tendance", "demande", "reglementation", "concurrence"];
const CONSIGNE_MARCHE = `Tu es analyste dans une banque d'affaires française. Tu prépares la partie « Marché » du mémorandum de cession d'une PME.
Cherche sur le web des faits récents (moins de 4 ans) et chiffrés sur le marché de l'entreprise, en France et dans sa région : taille du marché ou de l'activité (chiffre d'affaires, volumes, nombre d'entreprises), évolution, tendances et moteurs de la demande, réglementation qui s'impose au secteur, structure concurrentielle.
Sources à privilégier : INSEE, ministères et administrations, Banque de France, fédérations et organisations professionnelles, chambres de métiers et de commerce, observatoires sectoriels, études publiques. Évite les blogs commerciaux et les contenus sans auteur.
Règles absolues :
- Chaque fait doit venir d'une page que tu as réellement consultée par la recherche ; recopie son adresse exacte.
- Recopie les chiffres tels qu'ils figurent dans la source, avec leur année. Ne calcule rien, n'extrapole rien.
- Aucune information sur l'entreprise elle-même ni sur un concurrent nommé.
- 4 à 8 faits, en français, une phrase chacun.
Réponds en terminant par un bloc \`\`\`json contenant exactement : {"faits":[{"theme":"taille|tendance|demande|reglementation|concurrence","fait":"phrase","chiffre":"le chiffre clé tel qu'écrit, ou null","annee":"année du chiffre, ou null","source":"nom de l'organisme","url":"adresse exacte"}]}`;

/** Garde-fou : ne garde que les faits bien formés dont l'adresse a réellement été renvoyée par la recherche. */
export function faitsSourcesVerifies(faits, urlsConsultees) {
  const norm = (u) => String(u || "").trim().replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
  const connues = new Set([...urlsConsultees].map(norm));
  return (Array.isArray(faits) ? faits : [])
    .filter((f) => f && typeof f.fait === "string" && f.fait.trim() && THEMES_MARCHE.includes(f.theme) && connues.has(norm(f.url)) && /^https?:\/\//.test(f.url))
    .slice(0, 8)
    .map((f) => ({ theme: f.theme, fait: f.fait.trim().slice(0, 400), chiffre: typeof f.chiffre === "string" && f.chiffre.trim() ? f.chiffre.trim().slice(0, 60) : null,
      annee: f.annee == null ? null : String(f.annee).slice(0, 9), source: String(f.source || "").trim().slice(0, 120) || null, url: String(f.url).trim() }));
}

/** Dernier objet JSON d'un texte (bloc \`\`\`json ou accolades finales). */
export function dernierJson(texte) {
  const blocs = [...String(texte).matchAll(/\`\`\`json\s*([\s\S]*?)\`\`\`/g)].map((m) => m[1]);
  const candidats = blocs.length ? blocs.reverse() : [String(texte).slice(String(texte).indexOf("{"))];
  for (const c of candidats) { try { return JSON.parse(c); } catch { /* candidat suivant */ } }
  return null;
}

/** @param contexte { secteur, activite_naf, region, description } (aucun nom d'entreprise) ; @returns { faits, urls, usage } */
export async function rechercherMarche(env, contexte) {
  const messages = [{ role: "user", content: `Entreprise à présenter (anonyme) :\n${JSON.stringify(contexte, null, 2)}` }];
  const urls = new Set();
  let texte = "", reponse;
  for (let tour = 0; tour < 4; tour++) {
    reponse = await client(env).beta.messages.create({
      model: MODELS.deep, max_tokens: 16000, system: CONSIGNE_MARCHE, messages,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "FR" } }],
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
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

/** Erreur d'authentification de l'API Claude (clé absente, mal copiée ou d'un autre type) : message explicite. */
export const cleRefusee = (e) => e?.status === 401 || e?.status === 403;
export const MESSAGE_CLE_REFUSEE = "La lecture et la rédaction automatiques sont momentanément indisponibles : la clé de l'API Claude du site est refusée. L'administrateur du site doit la remplacer.";
