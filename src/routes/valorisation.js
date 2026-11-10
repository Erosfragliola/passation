// Parcours de valorisation d'un dossier (le contrôle de propriété est fait par routeDossiers avant l'appel).
//   GET    /api/dossiers/:id/financials                chiffres par exercice (pré-remplis avec les comptes publics)
//   PUT    /api/dossiers/:id/financials  { annee, valeurs, valider }   enregistre et valide une ou plusieurs lignes
//   DELETE /api/dossiers/:id/financials/:annee         retire un exercice
//   POST   /api/dossiers/:id/uploads   (PDF)            liasse → R2 → lecture par Claude → lignes « à valider »
//   GET    /api/dossiers/:id/answers                    réponses au questionnaire et réglages
//   PUT    /api/dossiers/:id/answers/:etape { data }    sauvegarde automatique d'une étape
//   POST   /api/dossiers/:id/valuation                  calcul des 3 méthodes (code testé), enregistré
//   GET    /api/dossiers/:id/valuation                  dernier calcul
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { LIASSE } from "../config.js";
import { CHAMPS, CLES_CHAMPS, EXERCICES_MAX, manquants } from "../../public/js/champs-financiers.js";
import { ETAPES } from "../../public/js/questionnaire.js";
import { claudeDisponible, lireLiasse } from "../lib/claude.js";
import { assemblerEntree } from "../valuation/entree.js";
import { valorisationApprofondie } from "../valuation/approfondie.js";
import HYPOTHESES from "../data/hypotheses.json";

const ETAPES_VALIDES = new Set([...ETAPES.map((e) => e.cle), "reglages"]);
const corpsJson = async (request) => { try { return await request.json(); } catch { return null; } };

// ---------------------------------------------------------------- Chiffres
export async function lireChiffres(env, dossierId) {
  const { results } = await env.DB.prepare("SELECT year, field, value, source, validated FROM financials WHERE dossier_id = ? ORDER BY year").bind(dossierId).all();
  const lignes = {};
  for (const r of results) (lignes[r.year] ??= {})[r.field] = { valeur: r.value, source: r.source, valide: r.validated === 1 };
  return lignes;
}

/** Premier passage : comptes publics (INPI) des 3 derniers exercices, proposés « à valider ». */
async function preremplir(env, row) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM financials WHERE dossier_id = ?").bind(row.id).first();
  if (n?.n > 0) return;
  const e = JSON.parse(row.company_json || "{}");
  const annees = [...new Set((e.ca || []).filter((x) => Number.isFinite(x.valeur)).map((x) => x.annee))].sort().slice(-EXERCICES_MAX);
  const stmts = [];
  for (const a of annees) {
    const ca = e.ca.find((x) => x.annee === a)?.valeur;
    const ebe = (e.ebe || []).find((x) => x.annee === a)?.valeur;
    stmts.push(env.DB.prepare("INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, 'chiffre_affaires', ?, 'inpi', 0)").bind(row.id, a, ca));
    if (Number.isFinite(ebe)) stmts.push(env.DB.prepare("INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, 'ebe', ?, 'inpi', 0)").bind(row.id, a, ebe));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function vueChiffres(env, row) {
  const lignes = await lireChiffres(env, row.id);
  const lectures = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE dossier_id = ?").bind(row.id).first();
  return {
    champs: CHAMPS, exercices: lignes,
    manquants: Object.fromEntries(Object.entries(lignes).map(([a, l]) => [a, manquants(l)])),
    lecture_automatique: claudeDisponible(env),
    lectures_restantes: Math.max(0, LIASSE.lecturesMaxParDossier - (lectures?.n ?? 0)),
  };
}

async function enregistrerLignes(env, dossierId, annee, valeurs, { valider, source }) {
  const existantes = (await lireChiffres(env, dossierId))[annee] || {};
  const stmts = [];
  for (const [cle, brut] of Object.entries(valeurs)) {
    if (!CLES_CHAMPS.has(cle)) continue;
    const valeur = brut === null || brut === "" ? null : Number(brut);
    if (valeur !== null && !Number.isFinite(valeur)) continue;
    const avant = existantes[cle];
    // Une valeur validée par le dirigeant n'est jamais écrasée par une lecture automatique
    if (source === "liasse" && avant?.valide) continue;
    const src = source === "liasse" ? "liasse" : avant && avant.valeur === valeur ? avant.source : "dirigeant";
    stmts.push(env.DB.prepare(`INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(dossier_id, year, field) DO UPDATE SET value = excluded.value, source = excluded.source, validated = excluded.validated`)
      .bind(dossierId, annee, cle, valeur, src, valider && valeur !== null ? 1 : 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------------------------------------------------------------- Liasse PDF
const estPdf = (octets) => octets.length > 4 && octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46; // %PDF
function enBase64(octets) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

async function deposerLiasse(request, env, row) {
  if (!claudeDisponible(env)) {
    return json({ erreur: "lecture_indisponible", message: "La lecture automatique n'est pas encore activée. Saisissez vos chiffres à la main en attendant." }, 503);
  }
  const deja = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE dossier_id = ?").bind(row.id).first();
  if ((deja?.n ?? 0) >= LIASSE.lecturesMaxParDossier) {
    return json({ erreur: "plafond_atteint", message: `Vous avez atteint le nombre maximal de lectures (${LIASSE.lecturesMaxParDossier}) pour ce dossier. Complétez les chiffres à la main.` }, 429);
  }
  let form;
  try { form = await request.formData(); } catch { return json({ erreur: "requete_invalide", message: "Envoyez un fichier PDF." }, 400); }
  const fichier = form.get("fichier");
  if (!fichier || typeof fichier === "string") return json({ erreur: "fichier_absent", message: "Aucun fichier reçu." }, 400);
  if (fichier.size > LIASSE.tailleMax) return json({ erreur: "trop_lourd", message: "Le fichier dépasse 10 Mo." }, 413);
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (!estPdf(octets)) return json({ erreur: "pas_un_pdf", message: "Ce fichier n'est pas un PDF." }, 415);

  const id = crypto.randomUUID();
  const cle = `dossiers/${row.id}/liasses/${id}.pdf`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: "application/pdf" } });
  let lecture;
  try {
    lecture = await lireLiasse(env, enBase64(octets));
  } catch (e) {
    console.log(`Lecture de liasse impossible : ${e.message}`);
    await env.DB.prepare("INSERT INTO uploads (id, dossier_id, r2_key, filename, mime, size, extracted_json, created_at) VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)")
      .bind(id, row.id, cle, String(fichier.name || "liasse.pdf").slice(0, 200), octets.length, JSON.stringify({ erreur: e.message }), maintenant()).run();
    return json({ erreur: "lecture_echouee", message: "Nous n'avons pas pu lire ce document. Vérifiez qu'il s'agit bien d'une liasse fiscale lisible, ou saisissez vos chiffres à la main." }, 502);
  }
  await env.DB.prepare("INSERT INTO uploads (id, dossier_id, r2_key, filename, mime, size, extracted_json, created_at) VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)")
    .bind(id, row.id, cle, String(fichier.name || "liasse.pdf").slice(0, 200), octets.length, JSON.stringify(lecture), maintenant()).run();

  // Les montants lus deviennent des propositions « à valider » (jamais validées automatiquement)
  const proposes = [];
  for (const ex of (lecture.exercices || []).slice(0, EXERCICES_MAX + 1)) {
    if (!Number.isInteger(ex.annee) || ex.annee < 1990 || ex.annee > 2100) continue;
    const valeurs = {};
    for (const c of ex.champs || []) if (c.valeur !== null && Number.isFinite(c.valeur)) valeurs[c.cle] = c.valeur;
    await enregistrerLignes(env, row.id, ex.annee, valeurs, { valider: false, source: "liasse" });
    proposes.push({ annee: ex.annee, champs: (ex.champs || []).filter((c) => c.valeur !== null).map((c) => ({ cle: c.cle, valeur: c.valeur, page: c.page, libelle_lu: c.libelle_lu })) });
  }
  return json({ ok: true, proposes, remarques: lecture.remarques || "", ...(await vueChiffres(env, row)) });
}

// ---------------------------------------------------------------- Questionnaire
export async function lireReponses(env, dossierId) {
  const { results } = await env.DB.prepare("SELECT step, data_json FROM answers WHERE dossier_id = ?").bind(dossierId).all();
  return Object.fromEntries(results.map((r) => [r.step, JSON.parse(r.data_json)]));
}

// ---------------------------------------------------------------- Calcul
export async function calculer(env, row) {
  const entreprise = JSON.parse(row.company_json || "{}");
  const { entree, H } = assemblerEntree(entreprise, await lireChiffres(env, row.id), await lireReponses(env, row.id), HYPOTHESES);
  const resultat = valorisationApprofondie(entree, H);
  return { resultat, entree, hypotheses: H };
}

export async function routeValorisation(request, env, row, sous, item) {
  const m = request.method;
  const toucher = () => env.DB.prepare("UPDATE dossiers SET updated_at = ? WHERE id = ?").bind(maintenant(), row.id).run();

  if (sous === "financials") {
    if (m === "GET" && !item) { await preremplir(env, row); return json(await vueChiffres(env, row)); }
    if (m === "PUT" && !item) {
      const c = await corpsJson(request);
      const annee = Number(c?.annee);
      if (!Number.isInteger(annee) || annee < 1990 || annee > 2100 || typeof c?.valeurs !== "object") return json({ erreur: "requete_invalide", message: "Exercice ou valeurs invalides." }, 400);
      const lignes = await lireChiffres(env, row.id);
      if (!lignes[annee] && Object.keys(lignes).length >= EXERCICES_MAX + 1) return json({ erreur: "trop_d_exercices", message: "Trois exercices suffisent ; retirez-en un avant d'en ajouter." }, 400);
      await enregistrerLignes(env, row.id, annee, c.valeurs, { valider: Boolean(c.valider), source: "dirigeant" });
      await toucher();
      return json(await vueChiffres(env, row));
    }
    if (m === "DELETE" && /^\d{4}$/.test(item || "")) {
      await env.DB.prepare("DELETE FROM financials WHERE dossier_id = ? AND year = ?").bind(row.id, Number(item)).run();
      return json(await vueChiffres(env, row));
    }
  }
  if (sous === "uploads" && m === "POST" && !item) return deposerLiasse(request, env, row);

  if (sous === "answers") {
    if (m === "GET" && !item) return json({ etapes: ETAPES, reponses: await lireReponses(env, row.id) });
    if (m === "PUT" && ETAPES_VALIDES.has(item)) {
      const c = await corpsJson(request);
      const donnees = c?.data;
      if (!donnees || typeof donnees !== "object" || JSON.stringify(donnees).length > 20_000) return json({ erreur: "requete_invalide", message: "Réponses invalides." }, 400);
      await env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
        .bind(row.id, item, JSON.stringify(donnees), maintenant()).run();
      await toucher();
      return json({ ok: true });
    }
  }

  if (sous === "valuation" && !item) {
    if (m === "POST") {
      const { resultat, entree, hypotheses } = await calculer(env, row);
      await env.DB.prepare("INSERT INTO valuations (id, dossier_id, kind, inputs_json, result_json, created_at) VALUES (?, ?, 'approfondie', ?, ?, ?)")
        .bind(crypto.randomUUID(), row.id, JSON.stringify({ entree, hypotheses }), JSON.stringify(resultat), maintenant()).run();
      await toucher();
      return json({ resultat, entree, hypotheses });
    }
    if (m === "GET") {
      const v = await env.DB.prepare("SELECT inputs_json, result_json, created_at FROM valuations WHERE dossier_id = ? AND kind = 'approfondie' ORDER BY created_at DESC LIMIT 1").bind(row.id).first();
      if (!v) return json({ resultat: null });
      return json({ resultat: JSON.parse(v.result_json), ...JSON.parse(v.inputs_json), calcule_le: v.created_at });
    }
  }
  return json({ erreur: "route_inconnue" }, 404);
}
