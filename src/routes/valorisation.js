// Valuation flow of a file (the ownership check is done by routeDossiers before the call).
//   GET    /api/dossiers/:id/financials                figures per fiscal year (prefilled with the public accounts)
//   PUT    /api/dossiers/:id/financials  { annee, valeurs, valider }   saves and approves one or more lines
//   DELETE /api/dossiers/:id/financials/:annee         removes a fiscal year
//   POST   /api/dossiers/:id/uploads   (PDF)            tax return → R2 → reading by Claude → lines "to approve"
//   GET    /api/dossiers/:id/answers                    questionnaire answers and settings
//   PUT    /api/dossiers/:id/answers/:etape { data }    autosave of a step
//   POST   /api/dossiers/:id/valuation                  calculation (multiples, DCF if the size premium is set, ANCC), saved
//   GET    /api/dossiers/:id/valuation                  latest calculation
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { LIASSE, CLAUDE_QUOTAS } from "../config.js";
import { quotaClaude } from "../lib/ratelimit.js";
import { CHAMPS, CLES_CHAMPS, EXERCICES_MAX, manquants, anneesAReprendre } from "../../public/js/champs-financiers.js";
import { ETAPES } from "../../public/js/questionnaire.js";
import { claudeDisponible, lireLiasse, cleRefusee, MESSAGE_CLE_REFUSEE } from "../lib/claude.js";
import { assemblerEntree } from "../valuation/entree.js";
import { controlerExercice, lignesBloquees } from "../valuation/controles.js";
import { valorisationApprofondie } from "../valuation/approfondie.js";
import { erreursEtape } from "../valuation/validation.js";
import HYPOTHESES_FR from "../data/hypotheses.json";
import { t as tr, langue, valeur } from "../../public/js/i18n.js";

/** Assumptions with their labels in the request's language (values, sources and dates unchanged):
 *  translations in serveur.json ("hypotheses"). In French, the file as is. */
function hypotheses() {
  if (langue() === "fr") return HYPOTHESES_FR;
  const H = structuredClone(HYPOTHESES_FR), T = valeur("serveur.hypotheses");
  for (const [k, champs] of Object.entries(T || {})) {
    if (!H[k] || typeof champs !== "object") continue;
    for (const [x, v] of Object.entries(champs)) if (x !== "facteurs" && typeof v === "string") H[k][x] = v;
  }
  for (const f of H.decotes_primes?.facteurs || []) f.libelle = T?.decotes_primes?.facteurs?.[f.cle] ?? f.libelle;
  return H;
}

// "parcours": screens of the guided steps already seen ("Skip" counts as an answer), for an identical count everywhere
const ETAPES_VALIDES = new Set([...ETAPES.map((e) => e.cle), "reglages", "site", "marche", "parcours"]);
const corpsJson = async (request) => { try { return await request.json(); } catch { return null; } };

// ---------------------------------------------------------------- Figures
export async function lireChiffres(env, dossierId) {
  const { results } = await env.DB.prepare("SELECT year, field, value, source, validated FROM financials WHERE dossier_id = ? ORDER BY year").bind(dossierId).all();
  const lignes = {};
  for (const r of results) (lignes[r.year] ??= {})[r.field] = { valeur: r.value, source: r.source, valide: r.validated === 1 };
  return lignes;
}

/** First pass: public accounts (INPI) of the latest published fiscal year and of the two immediately before it
 *  (never an isolated older year), proposed "to approve". */
async function preremplir(env, row) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM financials WHERE dossier_id = ?").bind(row.id).first();
  if (n?.n > 0) return;
  const e = JSON.parse(row.company_json || "{}");
  const annees = anneesAReprendre((e.ca || []).filter((x) => Number.isFinite(x.valeur)).map((x) => x.annee));
  const stmts = [];
  for (const a of annees) {
    const ca = e.ca.find((x) => x.annee === a)?.valeur;
    const ebe = (e.ebe || []).find((x) => x.annee === a)?.valeur;
    stmts.push(env.DB.prepare("INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, 'chiffre_affaires', ?, 'inpi', 0)").bind(row.id, a, ca));
    if (Number.isFinite(ebe)) stmts.push(env.DB.prepare("INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, 'ebe', ?, 'inpi', 0)").bind(row.id, a, ebe));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

function controles(row, lignes) {
  const e = JSON.parse(row.company_json || "{}");
  return Object.fromEntries(Object.entries(lignes).map(([a, l]) => [a, controlerExercice(l, {
    caPublic: (e.ca || []).find((x) => x.annee === Number(a))?.valeur ?? null,
    precedent: lignes[Number(a) - 1] ?? null,
  })]));
}

async function vueChiffres(env, row) {
  const lignes = await lireChiffres(env, row.id);
  const lectures = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE dossier_id = ?").bind(row.id).first();
  return {
    champs: CHAMPS, exercices: lignes,
    manquants: Object.fromEntries(Object.entries(lignes).map(([a, l]) => [a, manquants(l)])),
    controles: controles(row, lignes),
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
    // A value approved by the owner is never overwritten by an automatic reading
    if (source === "liasse" && avant?.valide) continue;
    const src = source === "liasse" ? "liasse" : avant && avant.valeur === valeur ? avant.source : "dirigeant";
    stmts.push(env.DB.prepare(`INSERT INTO financials (dossier_id, year, field, value, source, validated) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(dossier_id, year, field) DO UPDATE SET value = excluded.value, source = excluded.source, validated = excluded.validated`)
      .bind(dossierId, annee, cle, valeur, src, valider && valeur !== null ? 1 : 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------------------------------------------------------------- PDF tax return
const estPdf = (octets) => octets.length > 4 && octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46; // %PDF
function enBase64(octets) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

async function deposerLiasse(request, env, row) {
  if (!claudeDisponible(env)) {
    return json({ erreur: "lecture_indisponible", message: tr("serveur.valorisation.lecture_automatique_encore_activee") }, 503);
  }
  const deja = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE dossier_id = ?").bind(row.id).first();
  if ((deja?.n ?? 0) >= LIASSE.lecturesMaxParDossier) {
    return json({ erreur: "plafond_atteint", message: tr("serveur.valorisation.lectures_max", { n: LIASSE.lecturesMaxParDossier }) }, 429);
  }
  let form;
  try { form = await request.formData(); } catch { return json({ erreur: "requete_invalide", message: tr("serveur.valorisation.envoyez_fichier_pdf") }, 400); }
  const fichier = form.get("fichier");
  if (!fichier || typeof fichier === "string") return json({ erreur: "fichier_absent", message: tr("serveur.valorisation.aucun_fichier_recu") }, 400);
  if (fichier.size > LIASSE.tailleMax) return json({ erreur: "trop_lourd", message: tr("serveur.valorisation.fichier_depasse_10_mo") }, 413);
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (!estPdf(octets)) return json({ erreur: "pas_un_pdf", message: tr("serveur.valorisation.fichier_pdf") }, 415);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);

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
    if (cleRefusee(e)) return json({ erreur: "cle_refusee", message: MESSAGE_CLE_REFUSEE }, 503);
    return json({ erreur: "lecture_echouee", message: tr("serveur.valorisation.nous_avons_pu_lire") }, 502);
  }
  await env.DB.prepare("INSERT INTO uploads (id, dossier_id, r2_key, filename, mime, size, extracted_json, created_at) VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?)")
    .bind(id, row.id, cle, String(fichier.name || "liasse.pdf").slice(0, 200), octets.length, JSON.stringify(lecture), maintenant()).run();

  // The amounts read become proposals "to approve" (never approved automatically)
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

// ---------------------------------------------------------------- Calculation
export async function calculer(env, row) {
  const entreprise = JSON.parse(row.company_json || "{}");
  const { entree, H } = assemblerEntree(entreprise, await lireChiffres(env, row.id), await lireReponses(env, row.id), hypotheses());
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
      if (!Number.isInteger(annee) || annee < 1990 || annee > 2100 || typeof c?.valeurs !== "object") return json({ erreur: "requete_invalide", message: tr("serveur.valorisation.exercice_ou_valeurs_invalides") }, 400);
      const lignes = await lireChiffres(env, row.id);
      if (!lignes[annee] && Object.keys(lignes).length >= EXERCICES_MAX + 1) return json({ erreur: "trop_d_exercices", message: tr("serveur.valorisation.trois_exercices_suffisent_retirez") }, 400);
      await enregistrerLignes(env, row.id, annee, c.valeurs, { valider: Boolean(c.valider), source: "dirigeant" });
      await toucher();
      return json(await vueChiffres(env, row));
    }
    if (m === "POST" && /^\d{4}\/valider$/.test(item || "")) {
      // Approval of the fiscal year as a block: all filled lines, except those with an alert (to approve one by one)
      const annee = Number(item.slice(0, 4));
      const lignes = await lireChiffres(env, row.id);
      if (!lignes[annee]) return json({ erreur: "introuvable", message: tr("serveur.valorisation.exercice_introuvable") }, 404);
      const bloquees = lignesBloquees(controles(row, lignes)[annee]);
      const stmts = Object.entries(lignes[annee]).filter(([k, x]) => x.valeur !== null && !bloquees.has(k))
        .map(([k]) => env.DB.prepare("UPDATE financials SET validated = 1 WHERE dossier_id = ? AND year = ? AND field = ?").bind(row.id, annee, k));
      if (stmts.length) await env.DB.batch(stmts);
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
      if (!donnees || typeof donnees !== "object" || JSON.stringify(donnees).length > 60_000) return json({ erreur: "requete_invalide", message: tr("serveur.valorisation.reponses_invalides") }, 400);
      const erreurs = erreursEtape(item, donnees, hypotheses());
      if (erreurs.length) return json({ erreur: "hypothese_invalide", message: erreurs.map((x) => x.message).join(" "), erreurs }, 400);
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
