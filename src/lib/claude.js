// Appels à l'API Claude (SDK officiel). Clé : secret ANTHROPIC_API_KEY (wrangler secret put), jamais dans le code.
// Lecture de liasse : le PDF est envoyé tel quel (bloc « document » base64) ; la réponse est un JSON contraint par
// un schéma. Claude ne calcule rien : il recopie des chiffres, que le dirigeant valide ligne par ligne.
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../config.js";
import { CHAMPS } from "../../public/js/champs-financiers.js";

export const claudeDisponible = (env) => Boolean(env.ANTHROPIC_API_KEY);
const client = (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });

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
const SCHEMA_SECTION = {
  type: "object", additionalProperties: false, required: ["contenu", "a_completer"],
  properties: {
    contenu: { type: "string", description: "Texte de la section : paragraphes séparés par une ligne vide ; listes avec « - »" },
    a_completer: { type: "array", items: { type: "string" }, description: "Informations manquantes que le dirigeant devrait apporter" },
  },
};
const CONSIGNE_MEMO = `Tu rédiges une section du mémorandum d'information d'une PME française à céder, destiné à des repreneurs sérieux ayant signé un engagement de confidentialité.
Français, troisième personne, ton professionnel et sobre, sans superlatifs ni formules publicitaires.
Règles absolues :
- Utilise uniquement les données fournies (réponses du dirigeant, faits du site validés par lui, données publiques, chiffres validés). N'invente rien : ni chiffre, ni client, ni projet, ni certification.
- Quand une information attendue manque, écris « À compléter » à l'endroit voulu et ajoute-la à la liste a_completer.
- Recopie les chiffres tels quels ; ne calcule pas de nouveaux ratios.
- 120 à 300 mots.`;

export async function redigerSectionMemo(env, { titre, consigne }, donnees) {
  const reponse = await client(env).beta.messages.create({
    model: MODELS.deep, max_tokens: 16000,
    system: `${CONSIGNE_MEMO}\nSection à rédiger : « ${titre} ». ${consigne}`,
    messages: [{ role: "user", content: `Données du dossier (JSON) :\n${JSON.stringify(donnees, null, 2)}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA_SECTION } },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
  });
  if (reponse.stop_reason === "refusal") throw new Error("redaction_refusee");
  if (reponse.stop_reason === "max_tokens") throw new Error("reponse_tronquee");
  return JSON.parse(reponse.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}
