// Pièces du dossier, dépôt type Drive (18/11/2026).
//   GET    /api/dossiers/:id/pieces             liste des fichiers déposés
//   POST   /api/dossiers/:id/pieces             (multipart : fichier, item) dépôt, coche l'élément de la liste
//   GET    /api/dossiers/:id/pieces/:piece      téléchargement (le propriétaire du dossier seulement)
//   DELETE /api/dossiers/:id/pieces/:piece      suppression ; l'élément est décoché s'il ne reste aucun fichier
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { CLES_CHECKLIST } from "../../public/js/dossier-regles.js";

export const PIECES = { tailleMax: 20 * 1024 * 1024, parDossier: 80 };
/** Types acceptés : PDF, images, bureautique (Word, Excel, OpenDocument), texte. */
export const TYPES_PIECES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", txt: "text/plain", csv: "text/csv",
};
/** Nom de fichier nettoyé (affichage et téléchargement), extension conservée. */
export function nomPropre(nom) {
  const n = String(nom || "fichier").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(-120);
  return n || "fichier";
}
export const extension = (nom) => (/\.([a-z0-9]{2,5})$/i.exec(nom || "")?.[1] || "").toLowerCase();

const liste = async (env, id) => (await env.DB.prepare("SELECT id, item_key AS item, filename, mime, size, created_at FROM pieces WHERE dossier_id = ? ORDER BY created_at DESC").bind(id).all()).results;
const cocher = (env, id, item, done) => env.DB.prepare("INSERT INTO checklist (dossier_id, item_key, done, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(dossier_id, item_key) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at").bind(id, item, done ? 1 : 0, maintenant()).run();

export async function routePieces(request, env, row, pieceId) {
  const m = request.method, id = row.id;
  if (!pieceId && m === "GET") return json({ pieces: await liste(env, id) });
  if (!pieceId && m === "POST") {
    let form; try { form = await request.formData(); } catch { return json({ erreur: "requete_invalide", message: "Envoyez un fichier." }, 400); }
    const f = form.get("fichier"), item = String(form.get("item") || "");
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: "Aucun fichier reçu." }, 400);
    if (!CLES_CHECKLIST.has(item)) return json({ erreur: "element_inconnu", message: "Choisissez la pièce correspondante." }, 400);
    const ext = extension(f.name), mime = TYPES_PIECES[ext];
    if (!mime) return json({ erreur: "type_refuse", message: "Formats acceptés : PDF, images, Word, Excel, OpenDocument, texte." }, 415);
    if (f.size > PIECES.tailleMax) return json({ erreur: "trop_lourd", message: "20 Mo au plus par fichier." }, 413);
    if (!f.size) return json({ erreur: "fichier_vide", message: "Le fichier est vide." }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM pieces WHERE dossier_id = ?").bind(id).first();
    if ((n?.n ?? 0) >= PIECES.parDossier) return json({ erreur: "limite", message: `${PIECES.parDossier} fichiers au plus par dossier.` }, 429);
    const pid = crypto.randomUUID(), cle = `dossiers/${id}/pieces/${pid}.${ext}`;
    await env.FILES.put(cle, await f.arrayBuffer(), { httpMetadata: { contentType: mime } });
    await env.DB.prepare("INSERT INTO pieces (id, dossier_id, item_key, r2_key, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(pid, id, item, cle, nomPropre(f.name), mime, f.size, maintenant()).run();
    await cocher(env, id, item, true);
    return json({ pieces: await liste(env, id) }, 201);
  }
  if (!pieceId) return json({ erreur: "methode" }, 405);
  if (!/^[0-9a-f-]{36}$/.test(pieceId)) return json({ erreur: "introuvable" }, 404);
  const p = await env.DB.prepare("SELECT * FROM pieces WHERE id = ? AND dossier_id = ?").bind(pieceId, id).first();
  if (!p) return json({ erreur: "introuvable" }, 404);
  if (m === "GET") {
    const o = await env.FILES.get(p.r2_key);
    if (!o) return json({ erreur: "introuvable" }, 404);
    return new Response(o.body, { headers: { "content-type": p.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(p.filename)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }
  if (m === "DELETE") {
    await env.FILES.delete(p.r2_key);
    await env.DB.prepare("DELETE FROM pieces WHERE id = ?").bind(p.id).run();
    const reste = await env.DB.prepare("SELECT COUNT(*) AS n FROM pieces WHERE dossier_id = ? AND item_key = ?").bind(id, p.item_key).first();
    if (!(reste?.n > 0)) await cocher(env, id, p.item_key, false);
    return json({ pieces: await liste(env, id) });
  }
  return json({ erreur: "methode" }, 405);
}
