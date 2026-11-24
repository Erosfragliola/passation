// Documents du dossier (le contrôle de propriété est fait par routeDossiers avant l'appel).
//   GET  /api/dossiers/:id/documents/datapack              datapack Excel (copie versionnée dans R2)
//   GET  /api/dossiers/:id/documents/teaser                dernier teaser (sections)
//   POST /api/dossiers/:id/documents/teaser                rédaction par Claude + contrôle d'anonymat (2 essais)
//   PUT  /api/dossiers/:id/documents/teaser/sections/:cle  modification par le dirigeant (contrôlée aussi)
//   GET  /api/dossiers/:id/documents/memo                  mémorandum (sections, site, tableau financier)
//   POST /api/dossiers/:id/documents/memo/site { url }     lecture du site → faits à valider, termes, logos
//   POST|GET /api/dossiers/:id/documents/memo/logo         logo (adresse ou fichier PNG/JPEG/WebP ≤ 1 Mo) / affichage
//   POST|PUT /api/dossiers/:id/documents/memo/sections/:cle  rédaction par Claude / modification
import { projet } from "../documents/nom-de-code.js";
import { json } from "../http.js";
import { maintenant } from "../lib/auth.js";
import { calculer, lireReponses, lireChiffres } from "./valorisation.js";
import { construireDatapack } from "../documents/datapack.js";
import { propositions } from "../documents/propositions.js";
import { claudeDisponible, redigerTeaser, extraireSite, redigerSectionMemo, rechercherMarche, analyserPhoto, relireMemo, erreurClaudeConnue } from "../lib/claude.js";
import { compterSecteur, structureSecteur } from "../sources/secteur.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { MARCHE, CLAUDE_QUOTAS, PHOTOS, EQUIPE } from "../config.js";
import { quotaClaude } from "../lib/ratelimit.js";
import { lireSite, adressePublique, fetchPublic } from "../documents/site.js";
import { SECTIONS_MEMO, PARTIES_MEMO, donneesSection, chiffresMemo, memoDeverrouille, profilMemo, titreValide } from "../documents/memo.js";
import { termesInterdits, verifierAnonymat, regionDe, SECTEURS_NAF } from "../documents/anonymat.js";
import { faitsTeaser, visuelsTeaser, montantsSensibles, enSections, SECTIONS_TEASER } from "../documents/teaser.js";
import { typeImage, MIME_IMAGE as MIME, dimensionsImage, empreinte } from "../documents/images.js";
import { appliquerCorrection } from "../documents/jugements.js";
import { contenuRespecteConcision } from "../documents/concision.js";
import { normaliserEquipe, idValide, nomsEquipe } from "../../public/js/equipe.js";
import { t as tr, locale } from "../../public/js/i18n.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Erreur de Claude : clé refusée ou crédit épuisé (message commun), sinon la réponse propre à l'appel. */
const erreurClaude = (e, autre) => { const c = erreurClaudeConnue(e); return c ? json({ erreur: c.erreur, message: c.message }, c.statut) : autre(); };
const slug = (s) => String(s || "entreprise").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entreprise";
const NOMS_DE_CODE = ["Cèdre", "Atlas", "Orme", "Saule", "Granit", "Boréal", "Héron", "Ancre", "Ivoire", "Rivage", "Mistral", "Sextant", "Tilleul", "Basalte", "Fanal", "Aubier"];

async function datapack(env, row, { stocker = false } = {}) {
  const { resultat, entree, hypotheses } = await calculer(env, row);
  if (resultat.statut === "hypotheses_invalides") {
    return json({ erreur: "hypotheses_invalides", message: tr("serveur.documents.corrigez_reglages", { alertes: resultat.alertes.join(" ") }) }, 409);
  }
  if (resultat.statut !== "ok") {
    return json({ erreur: "chiffres_absents", message: tr("serveur.documents.validez_abord_chiffres_moins") }, 409);
  }
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const octets = construireDatapack({ entreprise, entree, H: hypotheses, resultat, nomDeCode: row.code_name || (entreprise.naf ? projet(entreprise.naf) : null) }).octets({ titre: `Datapack ${entreprise.nom || ""}` });
  const version = await prochaineVersion(env, row.id, "datapack");
  const cle = `dossiers/${row.id}/documents/datapack-v${version}.xlsx`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: XLSX } });
  await env.DB.prepare("INSERT INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES (?, ?, 'datapack', ?, ?, ?)")
    .bind(crypto.randomUUID(), row.id, version, cle, maintenant()).run();
  if (stocker) return json({ ok: true, version });
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
  // Noms des dirigeants (page équipe du mémorandum) : jamais dans le teaser
  const interdits = termesInterdits(entreprise, montantsSensibles({ entreprise, resultat, entree }), [...(reponses.site?.termes || []), ...nomsEquipe(reponses.equipe)]);
  return { entreprise, resultat, entree, reponses, interdits };
}

async function lireTeaser(env, row) {
  const doc = await env.DB.prepare("SELECT id, version, created_at FROM documents WHERE dossier_id = ? AND kind = 'teaser' ORDER BY version DESC LIMIT 1").bind(row.id).first();
  if (!doc) return { teaser: null, nom_de_code: row.code_name ?? null };
  const { results } = await env.DB.prepare("SELECT section_key, content_md, edited_by_user FROM document_sections WHERE document_id = ?").bind(doc.id).all();
  const parCle = Object.fromEntries(results.map((s) => [s.section_key, s]));
  let visuels = null;
  try { visuels = visuelsTeaser(await contexte(env, row)); } catch (e) { console.log(`Visuels du teaser indisponibles : ${e.message}`); }
  return {
    nom_de_code: row.code_name,
    visuels,
    teaser: {
      id: doc.id, version: doc.version, cree_le: doc.created_at,
      sections: SECTIONS_TEASER.map(([cle, titre]) => ({ cle, titre, contenu: parCle[cle]?.content_md ?? "", modifie: parCle[cle]?.edited_by_user === 1 })),
    },
  };
}

async function genererTeaser(env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: tr("serveur.documents.redaction_automatique_encore_activee") }, 503);
  const ctx = await contexte(env, row);
  if (!ctx.reponses.activite?.description?.trim()) {
    return json({ erreur: "questionnaire_incomplet", message: tr("serveur.documents.decrivez_abord_activite_questionnaire") }, 409);
  }
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
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
    return erreurClaude(e, () => json({ erreur: "redaction_echouee", message: tr("serveur.documents.redaction_echoue_reessayez_dans") }, 502));
  }
  if (problemes.length) {
    return json({ erreur: "anonymat", message: tr("serveur.documents.texte_propose_contenait_encore"), problemes }, 422);
  }
  let code = row.code_name;
  if (!code) {
    // Même nom de code que celui montré sur la page d'accueil (tiré du code NAF) ; au hasard sans code NAF
    code = ctx.entreprise.naf ? projet(ctx.entreprise.naf) : `Projet ${NOMS_DE_CODE[crypto.getRandomValues(new Uint8Array(1))[0] % NOMS_DE_CODE.length]}`;
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
  if (!teaser) return json({ erreur: "introuvable", message: tr("serveur.documents.generez_abord_teaser") }, 404);
  const { interdits } = await contexte(env, row);
  const problemes = verifierAnonymat(contenu, interdits);
  if (problemes.length) return json({ erreur: "anonymat", message: tr("serveur.documents.texte_contient_elements_identifiants"), problemes }, 422);
  await env.DB.prepare("UPDATE document_sections SET content_md = ?, edited_by_user = 1, updated_at = ? WHERE document_id = ? AND section_key = ?")
    .bind(contenu, maintenant(), teaser.id, cle).run();
  return json(await lireTeaser(env, row));
}

// ---------------------------------------------------------------- Mémorandum

async function enregistrerSite(env, row, site) {
  await env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, 'site', ?, ?)
    ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(row.id, JSON.stringify(site), maintenant()).run();
}

/** Réponses proposées au dirigeant (registres, comptes, site validé, choix fréquents), à valider dans le parcours. */
async function propositionsDossier(env, row) {
  const reponses = await lireReponses(env, row.id);
  const entreprise = JSON.parse(row.company_json || "{}");
  let tcam = null;
  try { const { resultat, entree } = await calculer(env, row); tcam = chiffresMemo({ entreprise, entree, resultat, reponses, lignesChiffres: await lireChiffres(env, row.id) }).cr.tcam?.ca ?? null; } catch { /* sans comptes : pas de croissance proposée */ }
  return propositions({ entreprise, tcam, reponses });
}

async function lireMemo(env, row) {
  const reponses = await lireReponses(env, row.id);
  const doc = await env.DB.prepare("SELECT id, version, created_at FROM documents WHERE dossier_id = ? AND kind = 'memo' ORDER BY version DESC LIMIT 1").bind(row.id).first();
  let sections = [];
  if (doc) {
    const { results } = await env.DB.prepare("SELECT section_key, content_md, edited_by_user, updated_at FROM document_sections WHERE document_id = ?").bind(doc.id).all();
    sections = results;
  }
  const parCle = Object.fromEntries(sections.map((x) => [x.section_key, x]));
  const { resultat, entree } = await calculer(env, row);
  const entreprise = JSON.parse(row.company_json || "{}");
  const ch = chiffresMemo({ entreprise, entree, resultat, reponses, lignesChiffres: await lireChiffres(env, row.id) });
  const site = reponses.site || null;
  return {
    deverrouille: memoDeverrouille(reponses),
    entreprise: entreprise.nom ?? null,
    profil: profilMemo(entreprise, reponses, row.code_name),
    photos: (site?.photos || []).map((p, i) => ({ n: i, legende: p.legende || "", origine: p.origine || null, largeur: p.largeur ?? null, hauteur: p.hauteur ?? null,
      analyse: p.analyse || null, decision: p.decision || null, categorie: p.categorie || null, usage: p.usage || null })),
    photos_max: PHOTOS.max, analyse_photos: claudeDisponible(env),
    site: site ? { ...site, photos: undefined } : null, logo: Boolean(site?.logo),
    // Équipe dirigeante : réponses sans les chemins des photos (servies par leur route), parcours rédigés
    equipe: { personnes: (reponses.equipe?.personnes || []).map(({ photo, ...x }) => ({ ...x, a_photo: Boolean(photo) })) },
    relecture: reponses.relecture || null,
    marche: reponses.marche ? { ...reponses.marche, essais_restants: Math.max(0, MARCHE.etudesMaxParDossier - (reponses.marche.essais || 0)) } : { essais_restants: MARCHE.etudesMaxParDossier },
    // Chiffres calculés par le code : compte de résultat, EBE retraité, endettement, clients, périmètre, sources
    chiffres: { compte_resultat: ch.cr, ebe_retraite: ch.ebeR, endettement: ch.endet, clients: ch.clients, perimetre: ch.perimetre, sources: ch.sources },
    memo: doc ? { id: doc.id, version: doc.version, cree_le: doc.created_at } : null,
    parties: PARTIES_MEMO,
    sections: SECTIONS_MEMO.map(({ cle, titre, court, partie, point_fort }) => {
      const x = parCle[cle];
      let v = {};
      if (x) { try { v = JSON.parse(x.content_md); } catch { v = { contenu: x.content_md }; } }
      return { cle, titre, court, partie, point_fort, titre_affirme: v.titre || null, accroche: v.accroche || null, contenu: v.contenu || "", a_completer: v.a_completer || [], parcours: v.parcours || null, redigee: Boolean(x), modifie: x?.edited_by_user === 1 };
    }),
  };
}

/** Structure du secteur (annuaire public, cache 24 h) : jamais bloquante, null si indisponible. */
async function secteurDe(env, entreprise) {
  const region = regionDe(entreprise.code_postal), naf = entreprise.naf;
  if (!region || !naf) return null;
  const cle = `secteur:${naf}:${region}`;
  let comptes = await lireCache(env.DB, cle);
  if (!comptes) {
    try { comptes = await compterSecteur({ naf, region }); if (comptes) await ecrireCache(env.DB, cle, comptes); }
    catch (e) { console.log(`Structure du secteur indisponible : ${e.message}`); return null; }
  }
  const date = new Date().toLocaleDateString(locale());
  return structureSecteur(comptes, { naf, region, trancheEntreprise: entreprise.tranche_effectif?.code, date });
}

/** Étude de marché : structure du secteur (registres) + faits sourcés trouvés sur le web, à valider par le dirigeant. */
async function etudeMarche(env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: tr("serveur.documents.etude_marche_encore_activee") }, 503);
  const reponses = await lireReponses(env, row.id);
  const avant = reponses.marche || {};
  if ((avant.essais || 0) >= MARCHE.etudesMaxParDossier) return json({ erreur: "limite", message: tr("serveur.documents.marche_limite", { n: MARCHE.etudesMaxParDossier }) }, 429);
  // Une étude déjà en cours (page rechargée, deuxième onglet) n'est pas relancée : on répond « en cours », avant le
  // quota (qui décompte un traitement à chaque appel) pour qu'une demande en double ne consomme rien
  const t0 = maintenant();
  if (avant.en_cours && t0 - avant.en_cours < 180 && !(avant.date > avant.en_cours)) return json({ erreur: "en_cours", message: tr("serveur.documents.etude_marche_deja_cours") }, 409);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  const ecrire = (d) => env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, 'marche', ?, ?)
    ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(row.id, JSON.stringify(d), maintenant()).run();
  await ecrire({ ...avant, en_cours: t0 });
  const entreprise = JSON.parse(row.company_json || "{}");
  const secteur = await secteurDe(env, entreprise);
  const contexte = { secteur: SECTEURS_NAF[entreprise.section_naf] ?? null, code_naf: entreprise.naf ?? null, region: regionDe(entreprise.code_postal),
    activite_decrite_par_le_dirigeant: reponses.activite?.description ?? null, zone_commerciale: reponses.activite?.zone ?? null };
  let r;
  try { r = await rechercherMarche(env, contexte); }
  catch (e) {
    console.log(`Étude de marché impossible : ${e.message}`);
    // La structure du secteur (registres publics) est gardée même si la recherche web échoue ou dure trop
    await ecrire({ ...avant, secteur: secteur ?? avant.secteur ?? null, en_cours: null, essais: (avant.essais || 0) + 1 });
    return erreurClaude(e, () => json({ erreur: "recherche_echouee", message: tr("serveur.documents.recherche_chiffres_marche_abouti") }, 502));
  }
  const marche = { secteur, faits: r.faits.map((f, i) => ({ id: i + 1, ...f, valide: true })), date: maintenant(), essais: (avant.essais || 0) + 1, en_cours: null };
  await ecrire(marche);
  return json(await lireMemo(env, row));
}

async function lireSiteRoute(request, env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: tr("serveur.documents.lecture_site_encore_activee") }, 503);
  let corps; try { corps = await request.json(); } catch { corps = null; }
  if (!adressePublique(corps?.url || "")) return json({ erreur: "adresse_invalide", message: tr("serveur.documents.adresse_site_invalide_exemple") }, 400);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  let lecture, faits;
  try {
    lecture = await lireSite(corps.url);
    faits = await extraireSite(env, lecture.pages);
  } catch (e) {
    const messages = { robots_refuse: tr("serveur.documents.site.robots"), site_injoignable: tr("serveur.documents.site.injoignable"), adresse_invalide: tr("serveur.documents.site.adresse") };
    console.log(`Lecture du site impossible : ${e.message}`);
    return erreurClaude(e, () => json({ erreur: e.message, message: messages[e.message] || tr("serveur.documents.site.impossible") }, 422));
  }
  const ancien = (await lireReponses(env, row.id)).site || {};
  const site = {
    url: lecture.url, lu_le: maintenant(), pages: lecture.pages.map((p) => p.url),
    faits: (faits.faits || []).slice(0, 40).map((f, i) => ({ id: i + 1, ...f, valide: false })),
    metiers: (faits.metiers || []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 10),
    termes: (faits.termes_identifiants || []).slice(0, 60),
    logos: lecture.logos, logo: ancien.logo ?? null,
    photos_candidates: lecture.photos || [], photos_ecartees: lecture.photos_ecartees || [], photos: ancien.photos || [],
  };
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}

async function deposerLogo(request, env, row) {
  let octets;
  const type = request.headers.get("content-type") || "";
  if (type.startsWith("multipart/form-data")) {
    const f = (await request.formData()).get("fichier");
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: tr("serveur.documents.aucun_fichier_recu") }, 400);
    if (f.size > 1_000_000) return json({ erreur: "trop_lourd", message: tr("serveur.documents.logo_depasse_1_mo") }, 413);
    octets = new Uint8Array(await f.arrayBuffer());
  } else {
    let corps; try { corps = await request.json(); } catch { corps = null; }
    const u = adressePublique(corps?.url || "");
    if (!u) return json({ erreur: "adresse_invalide", message: tr("serveur.documents.adresse_image_invalide") }, 400);
    try {
      const r = await fetchPublic(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok || Number(r.headers.get("content-length") || 0) > 1_000_000) throw new Error("image");
      octets = new Uint8Array(await r.arrayBuffer());
      if (octets.length > 1_000_000) throw new Error("image");
    } catch { return json({ erreur: "image_injoignable", message: tr("serveur.documents.image_introuvable_ou_trop") }, 422); }
  }
  const ext = typeImage(octets);
  if (!ext) return json({ erreur: "format", message: tr("serveur.documents.format_accepte_png_jpeg") }, 415);
  const cle = `dossiers/${row.id}/logo.${ext}`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: MIME[ext] } });
  const site = (await lireReponses(env, row.id)).site || {};
  site.logo = { cle, type: MIME[ext] };
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}

async function servirLogo(env, row) {
  const site = (await lireReponses(env, row.id)).site;
  return site?.logo ? servirImage(env, row, site.logo.cle, site.logo.type) : json({ erreur: "introuvable" }, 404);
}

// Photos de l'entreprise : 12 au plus (PHOTOS.max, src/config.js), 3 Mo chacune, PNG/JPEG/WebP, avec attestation du
// dirigeant. Dimensions et empreinte enregistrées : une même image n'est jamais ajoutée deux fois.
async function ajouterPhoto(request, env, row) {
  let octets, attestation = false, legende = "", origine = null;
  if ((request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const fd = await request.formData();
    const f = fd.get("fichier");
    attestation = fd.get("attestation") === "oui"; legende = String(fd.get("legende") || "").slice(0, 120);
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: tr("serveur.documents.aucun_fichier_recu") }, 400);
    if (f.size > PHOTOS.poidsMax) return json({ erreur: "trop_lourd", message: tr("serveur.documents.photo_depasse_3_mo") }, 413);
    octets = new Uint8Array(await f.arrayBuffer());
  } else {
    let corps; try { corps = await request.json(); } catch { corps = null; }
    attestation = corps?.attestation === true; legende = String(corps?.legende || "").slice(0, 120);
    const u = adressePublique(corps?.url || "");
    if (!u) return json({ erreur: "adresse_invalide", message: tr("serveur.documents.adresse_image_invalide") }, 400);
    origine = u.href; // photo choisie sur le site : son adresse, pour la retrouver dans la grille du parcours
    try {
      const r = await fetchPublic(u, { signal: AbortSignal.timeout(10_000) });
      octets = new Uint8Array(await r.arrayBuffer());
      if (!r.ok || octets.length > PHOTOS.poidsMax) throw new Error("image");
    } catch { return json({ erreur: "image_injoignable", message: tr("serveur.documents.image_introuvable_ou_trop_2") }, 422); }
  }
  if (!attestation) return json({ erreur: "attestation", message: tr("serveur.documents.confirmez_que_cette_photo") }, 400);
  const ext = typeImage(octets);
  if (!ext) return json({ erreur: "format", message: tr("serveur.documents.format_accepte_png_jpeg") }, 415);
  const site = (await lireReponses(env, row.id)).site || {};
  site.photos ||= [];
  if (site.photos.length >= PHOTOS.max) return json({ erreur: "trop_de_photos", message: tr("serveur.documents.photos_max", { n: PHOTOS.max }) }, 400);
  const dim = dimensionsImage(octets) || {}, signature = await empreinte(octets);
  if (site.photos.some((p) => p.empreinte === signature)) return json({ erreur: "doublon", message: tr("serveur.documents.photo_deja_ajoutee") }, 409);
  const cle = `dossiers/${row.id}/photos/${crypto.randomUUID()}.${ext}`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: MIME[ext] } });
  site.photos.push({ cle, type: MIME[ext], legende, attestee_le: maintenant(), largeur: dim.largeur ?? null, hauteur: dim.hauteur ?? null, empreinte: signature, ...(origine ? { origine } : {}) });
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}
/** Un fichier du stockage n'est servi ou supprimé que s'il appartient au dossier (jamais un chemin venu d'ailleurs). */
const aCeDossier = (row, cle) => typeof cle === "string" && cle.startsWith(`dossiers/${row.id}/`) && !cle.includes("..");
async function retirerPhoto(env, row, n) {
  const site = (await lireReponses(env, row.id)).site || {};
  const p = site.photos?.[Number(n)];
  if (!p) return json({ erreur: "introuvable" }, 404);
  if (aCeDossier(row, p.cle)) await env.FILES.delete(p.cle);
  site.photos.splice(Number(n), 1);
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}
const servirImage = async (env, row, cle, type) => {
  const obj = aCeDossier(row, cle) ? await env.FILES.get(cle) : null;
  if (!obj) return json({ erreur: "introuvable" }, 404);
  return new Response(obj.body, { headers: { "content-type": type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
};
async function servirPhoto(env, row, n) {
  const p = (await lireReponses(env, row.id)).site?.photos?.[Number(n)];
  return p ? servirImage(env, row, p.cle, p.type) : json({ erreur: "introuvable" }, 404);
}

/**
 * Jugement d'une photo par Claude (vision). Le navigateur envoie l'image réduite (plus grand côté ≤ 1 568 px) : le
 * serveur vérifie sa taille dans l'en-tête, puis l'envoie seule à Claude. Compté dans les quotas. Sans clé Claude :
 * 503, la photo reste utilisable sans analyse. Le jugement est enregistré à côté de la photo ; rien n'est appliqué
 * sans « Utiliser comme proposé ».
 */
async function analyserPhotoRoute(request, env, row, n) {
  if (!claudeDisponible(env)) return json({ erreur: "analyse_indisponible", message: tr("serveur.documents.analyse_photo_indisponible") }, 503);
  const site = (await lireReponses(env, row.id)).site || {};
  if (!site.photos?.[Number(n)]) return json({ erreur: "introuvable" }, 404);
  let f; try { f = (await request.formData()).get("image"); } catch { f = null; }
  if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: tr("serveur.documents.aucun_fichier_recu") }, 400);
  const octets = new Uint8Array(await f.arrayBuffer());
  const ext = typeImage(octets), dim = dimensionsImage(octets);
  if (!ext || !dim) return json({ erreur: "format", message: tr("serveur.documents.format_accepte_png_jpeg") }, 415);
  if (octets.length > PHOTOS.poidsAnalyseMax || Math.max(dim.largeur, dim.hauteur) > PHOTOS.coteAnalyseMax) return json({ erreur: "image_trop_grande", message: tr("serveur.documents.image_a_reduire") }, 413);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  let analyse;
  try { analyse = await analyserPhoto(env, enBase64(octets), MIME[ext]); }
  catch (e) { console.log(`Analyse de photo impossible : ${e.message}`); return erreurClaude(e, () => json({ erreur: "analyse_echouee", message: tr("serveur.documents.analyse_photo_echouee") }, 502)); }
  // Relu après l'appel : une photo retirée ou réordonnée entre-temps n'est pas confondue avec une autre
  const actuel = (await lireReponses(env, row.id)).site || {};
  const cible = actuel.photos?.find((p) => p.cle === site.photos[Number(n)].cle);
  if (!cible) return json({ erreur: "introuvable" }, 404);
  cible.analyse = { ...analyse, date: maintenant() };
  cible.decision = null;
  await enregistrerSite(env, row, actuel);
  return json(await lireMemo(env, row));
}
const enBase64 = (o) => { let s = ""; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000)); return btoa(s); };

/** « Utiliser comme proposé » (catégorie, usage et légende du jugement) ou « Ignorer » (rien n'est imposé). */
async function deciderPhoto(request, env, row, n) {
  let corps; try { corps = await request.json(); } catch { corps = null; }
  const site = (await lireReponses(env, row.id)).site || {};
  const p = site.photos?.[Number(n)];
  if (!p) return json({ erreur: "introuvable" }, 404);
  if (corps?.decision === "utilise" && p.analyse) Object.assign(p, { decision: "utilise", categorie: p.analyse.categorie, usage: p.analyse.usage, legende: p.analyse.legende || p.legende });
  else if (corps?.decision === "ignore") Object.assign(p, { decision: "ignore", categorie: null, usage: null });
  else if (typeof corps?.legende === "string") p.legende = corps.legende.trim().slice(0, 120);
  else return json({ erreur: "requete_invalide" }, 400);
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}
/** Nouvel ordre des photos : une permutation complète des numéros actuels (à catégorie égale, l'ordre départage). */
async function ordonnerPhotos(request, env, row) {
  let corps; try { corps = await request.json(); } catch { corps = null; }
  const site = (await lireReponses(env, row.id)).site || {};
  const l = site.photos || [], ordre = corps?.ordre;
  const permutation = Array.isArray(ordre) && ordre.length === l.length && ordre.every((k) => Number.isInteger(k) && k >= 0 && k < l.length) && new Set(ordre).size === l.length;
  if (!permutation) return json({ erreur: "requete_invalide", message: tr("serveur.documents.ordre_invalide") }, 400);
  site.photos = ordre.map((k) => l[k]);
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}

// ---------------------------------------------------------------- Équipe dirigeante : photos (consentement obligatoire)
async function photoEquipe(request, env, row, pid) {
  if (!idValide(pid)) return json({ erreur: "introuvable" }, 404);
  const reponses = await lireReponses(env, row.id);
  const equipe = normaliserEquipe(reponses.equipe, reponses.equipe);
  const p = equipe.personnes.find((x) => x.id === pid);
  if (!p) return json({ erreur: "introuvable", message: tr("serveur.documents.personne_introuvable") }, 404);
  const m = request.method;
  if (m === "GET") return p.photo ? servirImage(env, row, p.photo.cle, p.photo.type) : json({ erreur: "introuvable" }, 404);
  if (m === "DELETE") { if (p.photo && aCeDossier(row, p.photo.cle)) await env.FILES.delete(p.photo.cle); delete p.photo; }
  else if (m === "POST") {
    let fd; try { fd = await request.formData(); } catch { fd = null; }
    // RGPD : sans le consentement de la personne, la photo n'est ni enregistrée ni affichée
    if (fd?.get("consentement") !== "oui") return json({ erreur: "consentement", message: tr("serveur.documents.consentement_photo") }, 400);
    const f = fd.get("fichier");
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: tr("serveur.documents.aucun_fichier_recu") }, 400);
    if (f.size > EQUIPE.photoPoidsMax) return json({ erreur: "trop_lourd", message: tr("serveur.documents.photo_depasse_3_mo") }, 413);
    const octets = new Uint8Array(await f.arrayBuffer()), ext = typeImage(octets);
    if (!ext) return json({ erreur: "format", message: tr("serveur.documents.format_accepte_png_jpeg") }, 415);
    if (p.photo && aCeDossier(row, p.photo.cle)) await env.FILES.delete(p.photo.cle);
    const cle = `dossiers/${row.id}/equipe/${pid}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await env.FILES.put(cle, octets, { httpMetadata: { contentType: MIME[ext] } });
    p.photo = { cle, type: MIME[ext], consentement_le: maintenant() };
  } else return json({ erreur: "route_inconnue" }, 404);
  await env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, 'equipe', ?, ?)
    ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(row.id, JSON.stringify(equipe), maintenant()).run();
  return json(await lireMemo(env, row));
}

async function documentMemo(env, row) {
  const doc = await env.DB.prepare("SELECT id FROM documents WHERE dossier_id = ? AND kind = 'memo' ORDER BY version DESC LIMIT 1").bind(row.id).first();
  if (doc) return doc.id;
  // Identifiant fixe par dossier + INSERT OR IGNORE : des rédactions lancées en parallèle partagent le même document
  const id = `memo-${row.id}`;
  await env.DB.prepare("INSERT OR IGNORE INTO documents (id, dossier_id, kind, version, r2_key, created_at) VALUES (?, ?, 'memo', 1, '', ?)").bind(id, row.id, maintenant()).run();
  return id;
}
async function ecrireSection(env, docId, cle, valeur, parDirigeant) {
  await env.DB.prepare(`INSERT INTO document_sections (document_id, section_key, content_md, edited_by_user, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(document_id, section_key) DO UPDATE SET content_md = excluded.content_md, edited_by_user = excluded.edited_by_user, updated_at = excluded.updated_at`)
    .bind(docId, cle, JSON.stringify(valeur), parDirigeant ? 1 : 0, maintenant()).run();
}

async function genererSection(env, row, cle) {
  const section = SECTIONS_MEMO.find((x) => x.cle === cle);
  if (!section) return json({ erreur: "section_inconnue" }, 404);
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: tr("serveur.documents.redaction_automatique_encore_activee") }, 503);
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const reponses = await lireReponses(env, row.id);
  const verrou = memoDeverrouille(reponses);
  if (!verrou.ok) return json({ erreur: "questionnaire_incomplet", message: tr("serveur.documents.avant_memo", { liste: verrou.manque.join(" ; ") }) }, 409);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  const { resultat, entree } = await calculer(env, row);
  let r;
  try { r = await redigerSectionMemo(env, section, donneesSection(section, { entreprise, entree, resultat, reponses, lignesChiffres: await lireChiffres(env, row.id) })); }
  catch (e) { console.log(`Rédaction du mémorandum impossible : ${e.message}`); return erreurClaude(e, () => json({ erreur: "redaction_echouee", message: tr("serveur.documents.redaction_echoue_reessayez_dans") }, 502)); }
  await ecrireSection(env, await documentMemo(env, row), cle, { titre: titreValide(r.titre), accroche: titreValide(r.accroche, 200), contenu: String(r.contenu || ""), a_completer: r.a_completer || [], ...(r.parcours ? { parcours: r.parcours } : {}) }, false);
  return json(await lireMemo(env, row));
}

async function modifierSectionMemo(request, env, row, cle) {
  if (!SECTIONS_MEMO.some((x) => x.cle === cle)) return json({ erreur: "section_inconnue" }, 404);
  let corps; try { corps = await request.json(); } catch { corps = null; }
  if (typeof corps?.contenu !== "string") return json({ erreur: "requete_invalide" }, 400);
  // Le titre et l'accroche rédigés sont conservés, sauf si le dirigeant fournit un nouveau titre
  const docId = await documentMemo(env, row);
  const avant = await env.DB.prepare("SELECT content_md FROM document_sections WHERE document_id = ? AND section_key = ?").bind(docId, cle).first();
  let v = {}; try { v = avant ? JSON.parse(avant.content_md) : {}; } catch { v = {}; }
  const titre = typeof corps.titre === "string" ? titreValide(corps.titre) : v.titre ?? null;
  if (typeof corps.titre === "string" && corps.titre.trim() && !titre) return json({ erreur: "titre_invalide", message: tr("serveur.documents.titre_doit_tenir_ligne") }, 400);
  await ecrireSection(env, docId, cle, { titre, accroche: v.accroche ?? null, contenu: corps.contenu.slice(0, 8000), a_completer: [], ...(v.parcours ? { parcours: v.parcours } : {}) }, true);
  return json(await lireMemo(env, row));
}

// ---------------------------------------------------------------- Relecture critique (« l'œil du banquier »)
const ecrireReponse = (env, row, etape, donnees) => env.DB.prepare(`INSERT INTO answers (dossier_id, step, data_json, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(dossier_id, step) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(row.id, etape, JSON.stringify(donnees), maintenant()).run();

/** Claude relit les chapitres rédigés comme un repreneur exigeant : 10 remarques au plus, enregistrées, à accepter
 *  (« Oui, corriger ») ou écarter une par une. Une remarque sur un chiffre n'a jamais de correction. */
async function relectureRoute(env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: tr("serveur.documents.redaction_automatique_encore_activee") }, 503);
  const memo = await lireMemo(env, row);
  const chapitres = memo.sections.filter((x) => x.redigee && x.contenu).map((x) => ({ cle: x.cle, titre: x.titre_affirme || x.titre, contenu: x.contenu }));
  if (!chapitres.length) return json({ erreur: "rien_a_relire", message: tr("serveur.documents.rien_a_relire") }, 409);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  const q = memo.profil || {};
  const contexte = {
    registres_publics: { secteur: q.secteur ?? null, creation: q.creation ?? null, effectif: q.effectif ?? null, region: q.region ?? null },
    photos: memo.photos.map((x) => ({ numero: x.n + 1, legende: x.legende || null, categorie: x.categorie || x.analyse?.categorie || null, usage_valide: x.usage || null })),
    equipe_presentee: memo.equipe.personnes.length,
  };
  let remarques;
  try { remarques = await relireMemo(env, chapitres, contexte); }
  catch (e) { console.log(`Relecture impossible : ${e.message}`); return erreurClaude(e, () => json({ erreur: "relecture_echouee", message: tr("serveur.documents.relecture_echouee") }, 502)); }
  await ecrireReponse(env, row, "relecture", { date: maintenant(), remarques });
  return json(await lireMemo(env, row));
}

/** « Oui, corriger » : le passage est remplacé dans le chapitre, sans toucher à aucun chiffre, et la concision est
 *  recontrôlée ; « Non » : la remarque est écartée, rien ne change. */
async function repondreRemarque(request, env, row, rid) {
  let corps; try { corps = await request.json(); } catch { corps = null; }
  const reponses = await lireReponses(env, row.id);
  const rel = reponses.relecture, r = rel?.remarques?.find((x) => x.id === rid);
  if (!r) return json({ erreur: "introuvable" }, 404);
  if (r.statut) return json(await lireMemo(env, row));
  if (corps?.decision === "non") r.statut = "ecartee";
  else if (corps?.decision === "oui") {
    if (!r.correction) return json({ erreur: "sans_correction", message: tr("serveur.documents.remarque_sans_correction") }, 400);
    const docId = await documentMemo(env, row);
    const avant = await env.DB.prepare("SELECT content_md FROM document_sections WHERE document_id = ? AND section_key = ?").bind(docId, r.section).first();
    let v = {}; try { v = avant ? JSON.parse(avant.content_md) : {}; } catch { v = {}; }
    const nouveau = appliquerCorrection(v.contenu, r.correction);
    if (nouveau == null) return json({ erreur: "passage_modifie", message: tr("serveur.documents.passage_modifie") }, 409);
    if (!contenuRespecteConcision(nouveau, v.contenu)) return json({ erreur: "trop_long", message: tr("serveur.documents.correction_trop_longue") }, 422);
    await ecrireSection(env, docId, r.section, { ...v, contenu: nouveau }, false);
    r.statut = "corrigee";
  } else return json({ erreur: "requete_invalide" }, 400);
  await ecrireReponse(env, row, "relecture", rel);
  return json(await lireMemo(env, row));
}

export async function routeDocuments(request, env, row, type, sous, cle, action) {
  const m = request.method;
  if (type === "datapack" && m === "GET" && !sous) return datapack(env, row);
  if (type === "datapack" && m === "POST" && !sous) return datapack(env, row, { stocker: true });
  if (type === "teaser" && !sous) {
    if (m === "GET") return json(await lireTeaser(env, row));
    if (m === "POST") return genererTeaser(env, row);
  }
  if (type === "teaser" && sous === "sections" && cle && m === "PUT") return modifierSection(request, env, row, cle);
  if (type === "memo") {
    if (!sous && m === "GET") return json(await lireMemo(env, row));
    if (sous === "site" && !cle && m === "POST") return lireSiteRoute(request, env, row);
    if (sous === "marche" && !cle && m === "POST") return etudeMarche(env, row);
    if (sous === "propositions" && !cle && m === "GET") return json({ propositions: await propositionsDossier(env, row) });
    if (sous === "logo" && !cle && m === "POST") return deposerLogo(request, env, row);
    if (sous === "logo" && !cle && m === "GET") return servirLogo(env, row);
    if (action) {
      if (sous === "photos" && /^\d{1,2}$/.test(cle || "") && action === "analyse" && m === "POST") return analyserPhotoRoute(request, env, row, cle);
      if (sous === "equipe" && action === "photo") return photoEquipe(request, env, row, cle);
      return json({ erreur: "route_inconnue" }, 404);
    }
    if (sous === "photos" && !cle && m === "POST") return ajouterPhoto(request, env, row);
    if (sous === "photos" && cle === "ordre" && m === "PUT") return ordonnerPhotos(request, env, row);
    if (sous === "photos" && /^\d{1,2}$/.test(cle || "") && m === "GET") return servirPhoto(env, row, cle);
    if (sous === "photos" && /^\d{1,2}$/.test(cle || "") && m === "PUT") return deciderPhoto(request, env, row, cle);
    if (sous === "photos" && /^\d{1,2}$/.test(cle || "") && m === "DELETE") return retirerPhoto(env, row, cle);
    if (sous === "relecture" && !cle && m === "POST") return relectureRoute(env, row);
    if (sous === "relecture" && /^r\d{1,2}$/.test(cle || "") && m === "POST") return repondreRemarque(request, env, row, cle);
    if (sous === "sections" && cle && m === "POST") return genererSection(env, row, cle);
    if (sous === "sections" && cle && m === "PUT") return modifierSectionMemo(request, env, row, cle);
  }
  return json({ erreur: "route_inconnue" }, 404);
}
