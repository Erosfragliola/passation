// Page d'un dossier (module pur, testé dans test/dossier-parcours.test.js) : à partir du détail du dossier
// (GET /api/dossiers/:id) et, s'il est rédigé, du mémorandum (GET …/documents/memo), on déduit :
//   - le fil du parcours en 5 étapes (fait, actuelle, à venir) ;
//   - l'action principale « Continuer : … » ;
//   - « À faire maintenant » : 3 tâches au plus, dans l'ordre chiffres, questions, rédaction, recommandations du
//     mémorandum, pièces ;
//   - l'état des 4 documents, la valeur affichée et la phrase qui dit sur quoi elle repose.
// Aucune donnée n'est inventée : tout vient des deux réponses de l'API.
import { CHECKLIST } from "./dossier-regles.js";

export const ETAPES_PARCOURS = [
  ["estimation", "Estimation"], ["chiffres", "Vos chiffres"], ["reponses", "Vos réponses"],
  ["redaction", "Rédaction"], ["relecture", "Relecture et envoi"],
];
export const NB_PIECES = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
/** Seuil du questionnaire (en %) à partir duquel la rédaction peut être lancée (déjà celui de l'ancienne page). */
export const SEUIL_REDACTION = 40;
export const MAX_TACHES = 3;

const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
/** Horodatage en secondes (format de la base) → « 18/11/2026 », heure de Paris. */
export function dateCourte(secondes) {
  if (!Number.isFinite(secondes)) return null;
  return new Date(secondes * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Points « À compléter » du mémorandum, un par élément signalé dans un chapitre : « Équipe : Nombre de salariés ».
 *  Seul décompte du travail restant, partagé par la page du dossier et l'écran final du parcours guidé. */
export function pointsACompleter(memo) {
  return (memo?.sections || []).flatMap((s) => (s.a_completer || []).map((t) => `${s.titre} : ${t}`));
}
/** « 1 point à compléter », « 4 points à compléter ». */
export const libellePoints = (n) => `${n} ${pluriel(n, "point", "points")} à compléter`;

/** Une partie du teaser compte comme rédigée si elle a un vrai texte (ni vide, ni « À compléter »). */
const partieRedigee = (contenu) => { const t = String(contenu ?? "").trim(); return t !== "" && !/^à compléter\.?$/i.test(t); };
/** Parties du teaser encore vides (GET …/documents/teaser). Toutes sont indispensables : la page est courte. */
export function partiesTeaserVides(teaser) {
  return (teaser?.teaser?.sections || []).filter((s) => !partieRedigee(s.contenu));
}

/** Lecture du mémorandum : chapitres non rédigés, éléments « À compléter », photos. null si non rédigé. */
export function lectureMemo(memo) {
  if (!memo) return null;
  const sections = memo.sections || [];
  const aCompleter = sections.filter((s) => (s.a_completer || []).length);
  return {
    nonRedigees: sections.filter((s) => !s.redigee),
    aCompleter,
    nbACompleter: pointsACompleter(memo).length,
    photos: (memo.photos || []).length,
  };
}

/**
 * @param d  détail du dossier (GET /api/dossiers/:id)
 * @param memo  réponse de GET …/documents/memo, ou null si le mémorandum n'est pas rédigé
 * @param teaser  réponse de GET …/documents/teaser, ou null si le teaser n'est pas rédigé
 */
export function etatParcours(d, memo = null, teaser = null) {
  const id = d.id, p = d.parcours || {}, docs = d.documents || {};
  const exo = p.exercices_complets || 0, exoMax = p.exercices_attendus || 3;
  const q = p.questionnaire || { faits: 0, total: 0, pct: 0 };
  const restantes = Math.max(0, (q.total || 0) - (q.faits || 0));
  const valo = p.valorisation?.central != null;
  const redige = valo && Boolean(docs.memo) && Boolean(docs.teaser);
  const m = docs.memo ? lectureMemo(memo) : null;
  const memoARelire = Boolean(m && (m.nonRedigees.length || m.nbACompleter));
  // Un document n'est « prêt » que s'il a du contenu : un teaser ou un mémorandum vide est « incomplet »
  const teaserVides = docs.teaser && teaser ? partiesTeaserVides(teaser) : [];
  const nbPartiesTeaser = teaser?.teaser?.sections?.length || 0;
  const fournies = new Set((d.checklist || []).filter((k) => CHECKLIST.some((g) => g.items.some(([c]) => c === k)))).size;
  const manquantes = NB_PIECES - fournies;

  const liens = {
    demarrer: `/espace/demarrer/?dossier=${id}`,
    valorisation: `/espace/valorisation/?dossier=${id}`,
    memo: `/espace/documents/memo/?dossier=${id}`,
    teaser: `/espace/documents/teaser/?dossier=${id}`,
    datapack: `/api/dossiers/${id}/documents/datapack`,
  };

  // ---------- Fil du parcours : une étape est faite d'après les données ; l'actuelle est la première non faite
  const fait = {
    estimation: true, // le dossier existe : l'estimation express a été tentée à sa création
    chiffres: exo > 0,
    reponses: restantes === 0 || redige, // une question facultative laissée de côté ne fait pas reculer le fil
    redaction: redige,
    relecture: false, // l'envoi se fait hors de la page : l'étape reste la dernière ouverte
  };
  const lienEtape = {
    estimation: `${liens.valorisation}#chiffres`, chiffres: `${liens.demarrer}&etape=chiffres`,
    reponses: `${liens.demarrer}&etape=questions`, redaction: liens.memo, relecture: liens.memo,
  };
  const actuelle = ETAPES_PARCOURS.find(([k]) => !fait[k])[0];
  const iActuelle = ETAPES_PARCOURS.findIndex(([k]) => k === actuelle);
  const etapes = ETAPES_PARCOURS.map(([cle, libelle], i) => ({
    cle, libelle, etat: i === iActuelle ? "actuelle" : fait[cle] ? "fait" : "a-venir",
    href: i !== iActuelle && fait[cle] ? lienEtape[cle] : null,
  }));

  // ---------- À faire maintenant
  const taches = [];
  if (exo < exoMax) {
    taches.push(exo === 0
      ? { cle: "chiffres", titre: `Confirmer vos ${exoMax} derniers exercices`, detail: "Aucun exercice confirmé pour l'instant", action: "Confirmer", href: liens.demarrer }
      : { cle: "chiffres", titre: `Confirmer ${exoMax - exo} ${pluriel(exoMax - exo, "exercice", "exercices")} de plus`, detail: `${exo} sur ${exoMax} confirmés`, action: "Compléter", href: `${liens.demarrer}&etape=chiffres` });
  }
  if (restantes > 0) {
    taches.push({
      cle: "questions",
      titre: q.faits ? (restantes === 1 ? "Répondre à la dernière question" : `Répondre aux ${restantes} dernières questions`) : `Répondre aux ${q.total} questions`,
      detail: q.faits ? `${q.faits} sur ${q.total} déjà faites` : "Des écrans courts, la plupart en un clic",
      action: q.faits ? "Reprendre" : "Commencer", href: `${liens.demarrer}&etape=questions`,
    });
  }
  if (!redige && !docs.memo && exo > 0 && (q.pct || 0) >= SEUIL_REDACTION) {
    taches.push({ cle: "redaction", titre: "Lancer la rédaction", detail: "Valorisation, teaser et mémorandum, d'un coup", action: "Rédiger", href: `${liens.demarrer}&etape=redaction` });
  }
  if (m?.nonRedigees.length) {
    const n = m.nonRedigees.length;
    taches.push({ cle: "chapitres", titre: `Rédiger ${n} ${pluriel(n, "chapitre", "chapitres")} du mémorandum`, detail: `${pluriel(n, "Chapitre", "Chapitres")} : ${m.nonRedigees.map((s) => s.court || s.titre).join(", ")}`, action: "Rédiger", href: liens.memo });
  }
  if (teaserVides.length) {
    const n = teaserVides.length;
    taches.push({ cle: "teaser", titre: `Rédiger ${n} ${pluriel(n, "partie", "parties")} du teaser`, detail: `${pluriel(n, "Partie vide", "Parties vides")} : ${teaserVides.map((x) => x.titre).join(", ")}`, action: "Rédiger", href: liens.teaser });
  }
  if (m && m.photos < 2) {
    taches.push(m.photos === 0
      ? { cle: "photo", titre: "Ajouter une photo de l'atelier ou des produits", detail: "Recommandation du mémorandum : elle rend la page « Savoir-faire » vivante", action: "Ajouter", href: `${liens.memo}#donnees` }
      : { cle: "photo", titre: "Ajouter une photo de l'équipe ou du site", detail: "Recommandation du mémorandum, page « Équipe »", action: "Ajouter", href: `${liens.memo}#donnees` });
  }
  if (m?.nbACompleter) {
    const n = m.nbACompleter, chap = m.aCompleter.map((s) => `« ${s.court || s.titre} »`);
    taches.push({ cle: "a-completer", titre: `Compléter ${n} ${pluriel(n, "point", "points")} du mémorandum`, detail: `Indiqués « À compléter » : ${chap.slice(0, 3).join(", ")}${chap.length > 3 ? "…" : ""}`, action: "Compléter", href: `${liens.memo}#section-${m.aCompleter[0].cle}` });
  }
  if (manquantes > 0) {
    taches.push({ cle: "pieces", titre: fournies === 0 ? "Déposer vos premières pièces" : `Déposer ${manquantes} ${pluriel(manquantes, "pièce manquante", "pièces manquantes")}`, detail: `${fournies} ${pluriel(fournies, "pièce", "pièces")} sur ${NB_PIECES}`, action: "Déposer", pieces: true });
  }

  // ---------- Action principale
  const action = {
    chiffres: { texte: "Continuer : confirmer vos chiffres", href: liens.demarrer },
    reponses: { texte: restantes === 1 ? "Continuer : la dernière question" : `Continuer : ${restantes} questions restantes`, href: `${liens.demarrer}&etape=questions` },
    redaction: { texte: "Continuer : lancer la rédaction", href: `${liens.demarrer}&etape=redaction` },
    relecture: memoARelire ? { texte: "Continuer : relire le mémorandum", href: liens.memo }
      : teaserVides.length ? { texte: "Continuer : compléter le teaser", href: liens.teaser }
      : { texte: "Continuer : relire et envoyer votre dossier", href: `${liens.demarrer}&etape=pret` },
  }[actuelle];

  // ---------- Documents
  const venir = (detail) => ({ etat: "a-venir", detail, actions: [] });
  const documents = [
    { cle: "valorisation", titre: "Valorisation", ...(valo
      ? { etat: "pret", detail: p.valorisation_le ? `Mise à jour le ${dateCourte(p.valorisation_le)}` : "Prête", actions: [{ libelle: "Ouvrir", href: `${liens.valorisation}#valorisation`, principal: true }, { libelle: "Télécharger l'Excel", href: liens.datapack, telecharger: true }] }
      : venir(exo ? "Calculée à l'étape Rédaction, avec vos réponses." : "Se débloque avec vos chiffres et vos réponses.")) },
    { cle: "datapack", titre: "Datapack Excel", ...(exo
      ? { etat: "pret", detail: docs.datapack ? `Mis à jour le ${dateCourte(docs.datapack.le)}${docs.datapack.version > 1 ? ` · version ${docs.datapack.version}` : ""}` : "Préparé à partir de vos chiffres confirmés", actions: [{ libelle: "Télécharger l'Excel", href: liens.datapack, principal: true, telecharger: true }] }
      : venir("Se débloque dès qu'un exercice est confirmé.")) },
    { cle: "teaser", titre: "Teaser anonyme", ...(docs.teaser
      ? teaserVides.length
        ? { etat: "incomplet", detail: `${teaserVides.length} ${pluriel(teaserVides.length, "partie", "parties")} sur ${nbPartiesTeaser} à rédiger`, actions: [{ libelle: "Rédiger", href: liens.teaser, principal: true }] }
        : { etat: "pret", detail: `Rédigé le ${dateCourte(docs.teaser.le)}`, actions: [{ libelle: "Ouvrir", href: liens.teaser, principal: true }, { libelle: "Télécharger en PDF", href: `${liens.teaser}&imprimer=1` }] }
      : venir("Rédigé à l'étape Rédaction, après vos réponses.")) },
    { cle: "memo", titre: "Mémorandum", ...(docs.memo
      ? m?.nonRedigees.length
        ? { etat: "incomplet", detail: `${m.nonRedigees.length} ${pluriel(m.nonRedigees.length, "chapitre", "chapitres")} sur ${(memo?.sections || []).length} à rédiger`, actions: [{ libelle: "Rédiger", href: liens.memo, principal: true }] }
        : { etat: memoARelire ? "a-relire" : "pret", detail: `Rédigé le ${dateCourte(docs.memo.le)}${m?.nbACompleter ? ` · ${libellePoints(m.nbACompleter)}` : ""}`, actions: [{ libelle: "Ouvrir", href: liens.memo, principal: true }, { libelle: "Télécharger en PDF", href: `${liens.memo}&imprimer=1` }] }
      : venir("Rédigé à l'étape Rédaction, après vos réponses.")) },
  ];

  // ---------- Valeur affichée et ce sur quoi elle repose
  const est = d.estimation;
  let valeur;
  if (valo) {
    const pd = Math.round(100 * (p.valorisation.ponderation?.dcf || 0)), pm = 100 - pd;
    valeur = { etiquette: "Valeur des titres", bas: p.valorisation.bas, haut: p.valorisation.haut,
      base: pd > 0 ? `Fondée sur les multiples (${pm} %) et le DCF (${pd} %).` : "Fondée sur les multiples ; DCF disponible en option.",
      lien: { texte: "Voir le détail", href: `${liens.valorisation}#valorisation` } };
  } else if (est?.statut === "ok") {
    valeur = { etiquette: `Valorisation express${est.exercice ? ` · comptes ${est.exercice}` : ""}`, bas: est.bas, haut: est.haut,
      base: "Estimée sur les derniers comptes publics et les multiples du secteur ; vos chiffres la préciseront.",
      lien: { texte: "Voir le calcul", href: `${liens.valorisation}#chiffres` } };
  } else {
    valeur = { etiquette: "Valorisation", bas: null, haut: null,
      base: "Les comptes publics ne suffisent pas pour une première estimation : vos chiffres permettront de la calculer.",
      lien: { texte: "Saisir vos chiffres", href: liens.demarrer } };
  }

  return {
    etapes, actuelle, action, taches: taches.slice(0, MAX_TACHES), documents, valeur,
    pieces: { fournies, total: NB_PIECES, ouvert: actuelle === "relecture" && manquantes > 0 && taches.every((t) => t.cle === "pieces") },
  };
}
