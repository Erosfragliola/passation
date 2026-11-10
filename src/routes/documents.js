// Documents du dossier (le contrôle de propriété est fait par routeDossiers avant l'appel).
//   GET /api/dossiers/:id/documents/datapack   génère le datapack Excel, en garde une copie (R2), le renvoie
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { calculer } from "./valorisation.js";
import { construireDatapack } from "../documents/datapack.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (s) => String(s || "entreprise").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entreprise";

async function datapack(env, row) {
  const { resultat, entree, hypotheses } = await calculer(env, row);
  if (resultat.statut !== "ok") {
    return json({ erreur: "chiffres_absents", message: "Validez d'abord vos chiffres (au moins un exercice complet) pour générer le datapack." }, 409);
  }
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const octets = construireDatapack({ entreprise, entree, H: hypotheses, resultat }).octets({ titre: `Datapack ${entreprise.nom || ""}` });
  const precedent = await env.DB.prepare("SELECT MAX(version) AS v FROM documents WHERE dossier_id = ? AND kind = 'datapack'").bind(row.id).first();
  const version = (precedent?.v ?? 0) + 1;
  const cle = `dossiers/${row.id}/documents/datapack-v${version}.xlsx`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: XLSX } });
  await env.DB.prepare("INSERT INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES (?, ?, 'datapack', ?, ?, ?)")
    .bind(crypto.randomUUID(), row.id, version, cle, maintenant()).run();
  const nom = `datapack-${slug(entreprise.nom)}-v${version}.xlsx`;
  return new Response(octets, {
    headers: { "content-type": XLSX, "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function routeDocuments(request, env, row, type) {
  if (request.method === "GET" && type === "datapack") return datapack(env, row);
  return json({ erreur: "route_inconnue" }, 404);
}
