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
