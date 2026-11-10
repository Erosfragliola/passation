// Documents du dossier (le contrôle de propriété est fait par routeDossiers avant l'appel).
//   GET  /api/dossiers/:id/documents/datapack              datapack Excel (copie versionnée dans R2)
//   GET  /api/dossiers/:id/documents/teaser                dernier teaser (sections)
//   POST /api/dossiers/:id/documents/teaser                rédaction par Claude + contrôle d'anonymat (2 essais)
//   PUT  /api/dossiers/:id/documents/teaser/sections/:cle  modification par le dirigeant (contrôlée aussi)
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { calculer, lireReponses } from "./valorisation.js";
import { construireDatapack } from "../documents/datapack.js";
import { claudeDisponible, redigerTeaser } from "../lib/claude.js";
import { termesInterdits, verifierAnonymat } from "../documents/anonymat.js";
import { faitsTeaser, montantsSensibles, enSections, SECTIONS_TEASER } from "../documents/teaser.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (s) => String(s || "entreprise").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entreprise";
const NOMS_DE_CODE = ["Cèdre", "Atlas", "Orme", "Saule", "Granit", "Boréal", "Héron", "Ancre", "Ivoire", "Rivage", "Mistral", "Sextant", "Tilleul", "Basalte", "Fanal", "Aubier"];

async function datapack(env, row) {
  const { resultat, entree, hypotheses } = await calculer(env, row);
  if (resultat.statut !== "ok") {
    return json({ erreur: "chiffres_absents", message: "Validez d'abord vos chiffres (au moins un exercice complet) pour générer le datapack." }, 409);
  }
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const octets = construireDatapack({ entreprise, entree, H: hypotheses, resultat }).octets({ titre: `Datapack ${entreprise.nom || ""}` });
  const version = await prochaineVersion(env, row.id, "datapack");
  const cle = `dossiers/${row.id}/documents/datapack-v${version}.xlsx`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: XLSX } });
  await env.DB.prepare("INSERT INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES (?, ?, 'datapack', ?, ?, ?)")
    .bind(crypto.randomUUID(), row.id, version, cle, maintenant()).run();
  const nom = `datapack-${slug(entreprise.nom)}-v${version}.xlsx`;
  return new Response(octets, {
    headers: { "content-type": XLSX, "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

async function prochaineVersion(env, dossierId, kind) {
  const p = await env.DB.prepare("SELECT MAX(version) AS v FROM documents WHERE dossier_id = ? AND kind = ?").bind(dossierId, kind).first();
  return (p?.v ?? 0) + 1;
}

/** Contexte commun : entreprise, valorisation, réponses, interdits d'anonymat. */
async function contexte(env, row) {
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const { resultat, entree } = await calculer(env, row);
  const reponses = await lireReponses(env, row.id);
  const interdits = termesInterdits(entreprise, montantsSensibles({ entreprise, resultat, entree }), reponses.site?.termes || []);
  return { entreprise, resultat, entree, reponses, interdits };
}

async function lireTeaser(env, row) {
  const doc = await env.DB.prepare("SELECT id, version, created_at FROM documents WHERE dossier_id = ? AND kind = 'teaser' ORDER BY version DESC LIMIT 1").bind(row.id).first();
  if (!doc) return { teaser: null, nom_de_code: row.code_name ?? null };
  const { results } = await env.DB.prepare("SELECT section_key, content_md, edited_by_user FROM document_sections WHERE document_id = ?").bind(doc.id).all();
  const parCle = Object.fromEntries(results.map((s) => [s.section_key, s]));
  return {
    nom_de_code: row.code_name,
    teaser: {
      id: doc.id, version: doc.version, cree_le: doc.created_at,
      sections: SECTIONS_TEASER.map(([cle, titre]) => ({ cle, titre, contenu: parCle[cle]?.content_md ?? "", modifie: parCle[cle]?.edited_by_user === 1 })),
    },
  };
}

async function genererTeaser(env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: "La rédaction automatique n'est pas encore activée." }, 503);
  const ctx = await contexte(env, row);
  if (!ctx.reponses.activite?.description?.trim()) {
    return json({ erreur: "questionnaire_incomplet", message: "Décrivez d'abord votre activité (questionnaire, écran « Votre activité »)." }, 409);
  }
  const faits = faitsTeaser(ctx);
  let sections, problemes = [];
  try {
    for (let essai = 0; essai < 2; essai++) {
      const r = await redigerTeaser(env, faits, problemes.map((p) => p.terme));
      sections = enSections(r);
      problemes = verifierAnonymat(sections.map(([, t]) => t).join("\n"), ctx.interdits);
      if (!problemes.length) break;
    }
  } catch (e) {
    console.log(`Rédaction du teaser impossible : ${e.message}`);
    return json({ erreur: "redaction_echouee", message: "La rédaction a échoué. Réessayez dans un instant." }, 502);
  }
  if (problemes.length) {
    return json({ erreur: "anonymat", message: "Le texte proposé contenait encore des éléments identifiants ; il n'a pas été enregistré. Vérifiez vos réponses (nom, ville, marques) puis réessayez.", problemes }, 422);
  }
  let code = row.code_name;
  if (!code) {
    code = `Projet ${NOMS_DE_CODE[crypto.getRandomValues(new Uint8Array(1))[0] % NOMS_DE_CODE.length]}`;
    await env.DB.prepare("UPDATE dossiers SET code_name = ? WHERE id = ?").bind(code, row.id).run();
  }
  const version = await prochaineVersion(env, row.id, "teaser");
  const id = crypto.randomUUID(), t = maintenant();
  const cle = `dossiers/${row.id}/documents/teaser-v${version}.json`;
  await env.FILES.put(cle, JSON.stringify({ nom_de_code: code, sections, faits }), { httpMetadata: { contentType: "application/json" } });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES (?, ?, 'teaser', ?, ?, ?)").bind(id, row.id, version, cle, t),
    ...sections.map(([k, c]) => env.DB.prepare("INSERT INTO document_sections (document_id, section_key, content_md, edited_by_user, updated_at) VALUES (?, ?, ?, 0, ?)").bind(id, k, c, t)),
  ]);
  return json(await lireTeaser(env, { ...row, code_name: code }));
}

async function modifierSection(request, env, row, cle) {
  if (!SECTIONS_TEASER.some(([k]) => k === cle)) return json({ erreur: "section_inconnue" }, 404);
  let corps; try { corps = await request.json(); } catch { corps = null; }
  const contenu = typeof corps?.contenu === "string" ? corps.contenu.slice(0, 4000) : null;
  if (contenu === null) return json({ erreur: "requete_invalide" }, 400);
  const { teaser } = await lireTeaser(env, row);
  if (!teaser) return json({ erreur: "introuvable", message: "Générez d'abord le teaser." }, 404);
  const { interdits } = await contexte(env, row);
  const problemes = verifierAnonymat(contenu, interdits);
  if (problemes.length) return json({ erreur: "anonymat", message: "Ce texte contient des éléments identifiants : retirez-les avant d'enregistrer.", problemes }, 422);
  await env.DB.prepare("UPDATE document_sections SET content_md = ?, edited_by_user = 1, updated_at = ? WHERE document_id = ? AND section_key = ?")
    .bind(contenu, maintenant(), teaser.id, cle).run();
  return json(await lireTeaser(env, row));
}

export async function routeDocuments(request, env, row, type, sous, cle) {
  const m = request.method;
  if (type === "datapack" && m === "GET" && !sous) return datapack(env, row);
  if (type === "teaser" && !sous) {
    if (m === "GET") return json(await lireTeaser(env, row));
    if (m === "POST") return genererTeaser(env, row);
  }
  if (type === "teaser" && sous === "sections" && cle && m === "PUT") return modifierSection(request, env, row, cle);
  return json({ erreur: "route_inconnue" }, 404);
}
