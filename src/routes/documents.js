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
import { claudeDisponible, redigerTeaser, extraireSite, redigerSectionMemo, rechercherMarche, cleRefusee, MESSAGE_CLE_REFUSEE } from "../lib/claude.js";
import { compterSecteur, structureSecteur } from "../sources/secteur.js";
import { lireCache, ecrireCache } from "../lib/cache.js";
import { MARCHE, CLAUDE_QUOTAS } from "../config.js";
import { quotaClaude } from "../lib/ratelimit.js";
import { lireSite, adressePublique } from "../documents/site.js";
import { SECTIONS_MEMO, PARTIES_MEMO, donneesSection, chiffresMemo, memoDeverrouille, profilMemo, titreValide } from "../documents/memo.js";
import { termesInterdits, verifierAnonymat, regionDe, SECTEURS_NAF } from "../documents/anonymat.js";
import { faitsTeaser, montantsSensibles, enSections, SECTIONS_TEASER } from "../documents/teaser.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const slug = (s) => String(s || "entreprise").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entreprise";
const NOMS_DE_CODE = ["Cèdre", "Atlas", "Orme", "Saule", "Granit", "Boréal", "Héron", "Ancre", "Ivoire", "Rivage", "Mistral", "Sextant", "Tilleul", "Basalte", "Fanal", "Aubier"];

async function datapack(env, row, { stocker = false } = {}) {
  const { resultat, entree, hypotheses } = await calculer(env, row);
  if (resultat.statut === "hypotheses_invalides") {
    return json({ erreur: "hypotheses_invalides", message: `Corrigez d'abord vos réglages : ${resultat.alertes.join(" ")}` }, 409);
  }
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
    if (cleRefusee(e)) return json({ erreur: "cle_refusee", message: MESSAGE_CLE_REFUSEE }, 503);
    return json({ erreur: "redaction_echouee", message: "La rédaction a échoué. Réessayez dans un instant." }, 502);
  }
  if (problemes.length) {
    return json({ erreur: "anonymat", message: "Le texte proposé contenait encore des éléments identifiants ; il n'a pas été enregistré. Vérifiez vos réponses (nom, ville, marques) puis réessayez.", problemes }, 422);
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
  if (!teaser) return json({ erreur: "introuvable", message: "Générez d'abord le teaser." }, 404);
  const { interdits } = await contexte(env, row);
  const problemes = verifierAnonymat(contenu, interdits);
  if (problemes.length) return json({ erreur: "anonymat", message: "Ce texte contient des éléments identifiants : retirez-les avant d'enregistrer.", problemes }, 422);
  await env.DB.prepare("UPDATE document_sections SET content_md = ?, edited_by_user = 1, updated_at = ? WHERE document_id = ? AND section_key = ?")
    .bind(contenu, maintenant(), teaser.id, cle).run();
  return json(await lireTeaser(env, row));
}

// ---------------------------------------------------------------- Mémorandum
const IMAGES = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
const typeImage = (o) => Object.entries(IMAGES).find(([, sig]) => sig.every((b, i) => o[i] === b))?.[0] ?? null;
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

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
    photos: (site?.photos || []).map((p, i) => ({ n: i, legende: p.legende || "" })),
    site, logo: Boolean(site?.logo),
    marche: reponses.marche ? { ...reponses.marche, essais_restants: Math.max(0, MARCHE.etudesMaxParDossier - (reponses.marche.essais || 0)) } : { essais_restants: MARCHE.etudesMaxParDossier },
    // Chiffres calculés par le code : compte de résultat, EBE retraité, endettement, clients, périmètre, sources
    chiffres: { compte_resultat: ch.cr, ebe_retraite: ch.ebeR, endettement: ch.endet, clients: ch.clients, perimetre: ch.perimetre, sources: ch.sources },
    memo: doc ? { id: doc.id, version: doc.version, cree_le: doc.created_at } : null,
    parties: PARTIES_MEMO,
    sections: SECTIONS_MEMO.map(({ cle, titre, court, partie, point_fort }) => {
      const x = parCle[cle];
      let v = {};
      if (x) { try { v = JSON.parse(x.content_md); } catch { v = { contenu: x.content_md }; } }
      return { cle, titre, court, partie, point_fort, titre_affirme: v.titre || null, accroche: v.accroche || null, contenu: v.contenu || "", a_completer: v.a_completer || [], redigee: Boolean(x), modifie: x?.edited_by_user === 1 };
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
  const date = new Date().toLocaleDateString("fr-FR");
  return structureSecteur(comptes, { naf, region, trancheEntreprise: entreprise.tranche_effectif?.code, date });
}

/** Étude de marché : structure du secteur (registres) + faits sourcés trouvés sur le web, à valider par le dirigeant. */
async function etudeMarche(env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: "L'étude de marché n'est pas encore activée." }, 503);
  const reponses = await lireReponses(env, row.id);
  const avant = reponses.marche || {};
  if ((avant.essais || 0) >= MARCHE.etudesMaxParDossier) return json({ erreur: "limite", message: `L'étude de marché a déjà été lancée ${MARCHE.etudesMaxParDossier} fois pour ce dossier.` }, 429);
  // Une étude déjà en cours (page rechargée, deuxième onglet) n'est pas relancée : on répond « en cours », avant le
  // quota (qui décompte un traitement à chaque appel) pour qu'une demande en double ne consomme rien
  const t0 = maintenant();
  if (avant.en_cours && t0 - avant.en_cours < 180 && !(avant.date > avant.en_cours)) return json({ erreur: "en_cours", message: "L'étude de marché est déjà en cours." }, 409);
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
    if (cleRefusee(e)) return json({ erreur: "cle_refusee", message: MESSAGE_CLE_REFUSEE }, 503);
    return json({ erreur: "recherche_echouee", message: "La recherche de chiffres de marché n'a pas abouti : le chapitre s'appuiera sur les registres publics. Vous pourrez la relancer depuis la page du mémorandum." }, 502);
  }
  const marche = { secteur, faits: r.faits.map((f, i) => ({ id: i + 1, ...f, valide: true })), date: maintenant(), essais: (avant.essais || 0) + 1, en_cours: null };
  await ecrire(marche);
  return json(await lireMemo(env, row));
}

async function lireSiteRoute(request, env, row) {
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: "La lecture du site n'est pas encore activée." }, 503);
  let corps; try { corps = await request.json(); } catch { corps = null; }
  if (!adressePublique(corps?.url || "")) return json({ erreur: "adresse_invalide", message: "Adresse de site invalide (exemple : www.mon-entreprise.fr)." }, 400);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  let lecture, faits;
  try {
    lecture = await lireSite(corps.url);
    faits = await extraireSite(env, lecture.pages);
  } catch (e) {
    const messages = { robots_refuse: "Ce site interdit la lecture automatique (robots.txt) : nous le respectons.", site_injoignable: "Le site ne répond pas ou ne renvoie pas de page lisible.", adresse_invalide: "Adresse de site invalide." };
    console.log(`Lecture du site impossible : ${e.message}`);
    if (cleRefusee(e)) return json({ erreur: "cle_refusee", message: MESSAGE_CLE_REFUSEE }, 503);
    return json({ erreur: e.message, message: messages[e.message] || "Lecture du site impossible. Réessayez plus tard." }, 422);
  }
  const ancien = (await lireReponses(env, row.id)).site || {};
  const site = {
    url: lecture.url, lu_le: maintenant(), pages: lecture.pages.map((p) => p.url),
    faits: (faits.faits || []).slice(0, 40).map((f, i) => ({ id: i + 1, ...f, valide: false })),
    termes: (faits.termes_identifiants || []).slice(0, 60),
    logos: lecture.logos, logo: ancien.logo ?? null,
    photos_candidates: lecture.photos || [], photos: ancien.photos || [],
  };
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}

async function deposerLogo(request, env, row) {
  let octets;
  const type = request.headers.get("content-type") || "";
  if (type.startsWith("multipart/form-data")) {
    const f = (await request.formData()).get("fichier");
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: "Aucun fichier reçu." }, 400);
    if (f.size > 1_000_000) return json({ erreur: "trop_lourd", message: "Le logo dépasse 1 Mo." }, 413);
    octets = new Uint8Array(await f.arrayBuffer());
  } else {
    let corps; try { corps = await request.json(); } catch { corps = null; }
    const u = adressePublique(corps?.url || "");
    if (!u) return json({ erreur: "adresse_invalide", message: "Adresse d'image invalide." }, 400);
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok || Number(r.headers.get("content-length") || 0) > 1_000_000) throw new Error("image");
      octets = new Uint8Array(await r.arrayBuffer());
      if (octets.length > 1_000_000) throw new Error("image");
    } catch { return json({ erreur: "image_injoignable", message: "Image introuvable ou trop lourde (1 Mo au plus)." }, 422); }
  }
  const ext = typeImage(octets);
  if (!ext) return json({ erreur: "format", message: "Format accepté : PNG, JPEG ou WebP." }, 415);
  const cle = `dossiers/${row.id}/logo.${ext}`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: MIME[ext] } });
  const site = (await lireReponses(env, row.id)).site || {};
  site.logo = { cle, type: MIME[ext] };
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}

async function servirLogo(env, row) {
  const site = (await lireReponses(env, row.id)).site;
  const obj = site?.logo ? await env.FILES.get(site.logo.cle) : null;
  if (!obj) return json({ erreur: "introuvable" }, 404);
  return new Response(obj.body, { headers: { "content-type": site.logo.type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
}

// Photos de l'entreprise : 6 au plus, 3 Mo chacune, PNG/JPEG/WebP, avec attestation du dirigeant.
const PHOTOS_MAX = 6;
async function ajouterPhoto(request, env, row) {
  let octets, attestation = false, legende = "";
  if ((request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const fd = await request.formData();
    const f = fd.get("fichier");
    attestation = fd.get("attestation") === "oui"; legende = String(fd.get("legende") || "").slice(0, 120);
    if (!f || typeof f === "string") return json({ erreur: "fichier_absent", message: "Aucun fichier reçu." }, 400);
    if (f.size > 3_000_000) return json({ erreur: "trop_lourd", message: "La photo dépasse 3 Mo." }, 413);
    octets = new Uint8Array(await f.arrayBuffer());
  } else {
    let corps; try { corps = await request.json(); } catch { corps = null; }
    attestation = corps?.attestation === true; legende = String(corps?.legende || "").slice(0, 120);
    const u = adressePublique(corps?.url || "");
    if (!u) return json({ erreur: "adresse_invalide", message: "Adresse d'image invalide." }, 400);
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      octets = new Uint8Array(await r.arrayBuffer());
      if (!r.ok || octets.length > 3_000_000) throw new Error("image");
    } catch { return json({ erreur: "image_injoignable", message: "Image introuvable ou trop lourde (3 Mo au plus)." }, 422); }
  }
  if (!attestation) return json({ erreur: "attestation", message: "Confirmez que cette photo appartient à l'entreprise (ou que vous avez le droit de l'utiliser)." }, 400);
  const ext = typeImage(octets);
  if (!ext) return json({ erreur: "format", message: "Format accepté : PNG, JPEG ou WebP." }, 415);
  const site = (await lireReponses(env, row.id)).site || {};
  site.photos ||= [];
  if (site.photos.length >= PHOTOS_MAX) return json({ erreur: "trop_de_photos", message: `${PHOTOS_MAX} photos au plus.` }, 400);
  const cle = `dossiers/${row.id}/photos/${crypto.randomUUID()}.${ext}`;
  await env.FILES.put(cle, octets, { httpMetadata: { contentType: MIME[ext] } });
  site.photos.push({ cle, type: MIME[ext], legende, attestee_le: maintenant() });
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}
async function retirerPhoto(env, row, n) {
  const site = (await lireReponses(env, row.id)).site || {};
  const p = site.photos?.[Number(n)];
  if (!p) return json({ erreur: "introuvable" }, 404);
  await env.FILES.delete(p.cle);
  site.photos.splice(Number(n), 1);
  await enregistrerSite(env, row, site);
  return json(await lireMemo(env, row));
}
async function servirPhoto(env, row, n) {
  const p = (await lireReponses(env, row.id)).site?.photos?.[Number(n)];
  const obj = p ? await env.FILES.get(p.cle) : null;
  if (!obj) return json({ erreur: "introuvable" }, 404);
  return new Response(obj.body, { headers: { "content-type": p.type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
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
  if (!claudeDisponible(env)) return json({ erreur: "redaction_indisponible", message: "La rédaction automatique n'est pas encore activée." }, 503);
  const entreprise = { ...JSON.parse(row.company_json || "{}"), siren: row.siren };
  const reponses = await lireReponses(env, row.id);
  const verrou = memoDeverrouille(reponses);
  if (!verrou.ok) return json({ erreur: "questionnaire_incomplet", message: `Avant le mémorandum : ${verrou.manque.join(" ; ")}.` }, 409);
  const quota = await quotaClaude(env, row.user_id, CLAUDE_QUOTAS.traitementsParJourParUtilisateur);
  if (quota) return json({ erreur: "quota_atteint", message: quota.message }, 429);
  const { resultat, entree } = await calculer(env, row);
  let r;
  try { r = await redigerSectionMemo(env, section, donneesSection(section, { entreprise, entree, resultat, reponses, lignesChiffres: await lireChiffres(env, row.id) })); }
  catch (e) { console.log(`Rédaction du mémorandum impossible : ${e.message}`); if (cleRefusee(e)) return json({ erreur: "cle_refusee", message: MESSAGE_CLE_REFUSEE }, 503); return json({ erreur: "redaction_echouee", message: "La rédaction a échoué. Réessayez dans un instant." }, 502); }
  await ecrireSection(env, await documentMemo(env, row), cle, { titre: titreValide(r.titre), accroche: titreValide(r.accroche, 200), contenu: String(r.contenu || ""), a_completer: r.a_completer || [] }, false);
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
  if (typeof corps.titre === "string" && corps.titre.trim() && !titre) return json({ erreur: "titre_invalide", message: "Le titre doit tenir en une ligne (110 caractères au plus)." }, 400);
  await ecrireSection(env, docId, cle, { titre, accroche: v.accroche ?? null, contenu: corps.contenu.slice(0, 8000), a_completer: [] }, true);
  return json(await lireMemo(env, row));
}

export async function routeDocuments(request, env, row, type, sous, cle) {
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
    if (sous === "photos" && !cle && m === "POST") return ajouterPhoto(request, env, row);
    if (sous === "photos" && /^\d$/.test(cle || "") && m === "GET") return servirPhoto(env, row, cle);
    if (sous === "photos" && /^\d$/.test(cle || "") && m === "DELETE") return retirerPhoto(env, row, cle);
    if (sous === "sections" && cle && m === "POST") return genererSection(env, row, cle);
    if (sous === "sections" && cle && m === "PUT") return modifierSectionMemo(request, env, row, cle);
  }
  return json({ erreur: "route_inconnue" }, 404);
}
