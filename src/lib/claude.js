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
