// Estimation express : appels aux routes existantes (GET /api/maquette/:siren, POST /api/estimation) et mise en
// forme des montants. Aucun calcul ici : le moteur est côté serveur (src/valuation/express.js).

/** Données publiques et estimation d'une société : { ok: true, donnees } ou { ok: false, code }. */
export async function chargerEntreprise(siren) {
  let r;
  try { r = await fetch(`/api/maquette/${encodeURIComponent(siren)}`); } catch { return { ok: false, code: "reseau" }; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, code: d.erreur || (r.status >= 500 ? "source_indisponible" : "introuvable") };
  return { ok: true, donnees: d };
}

/** Comptes non publiés : estimation à partir du CA et de l'EBE saisis (en euros). Rien n'est enregistré. */
export async function estimationManuelle({ section_naf, ca, ebe }) {
  try {
    const r = await fetch("/api/estimation", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section_naf, ca, ebe }) });
    if (!r.ok) return null;
    return (await r.json()).estimation ?? null;
  } catch { return null; }
}

/** Recherche par nom (autocomplétion) : suggestions actives, ou null si le service ne répond pas. */
export async function rechercher(q) {
  try {
    const r = await fetch(`/api/company/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    return (await r.json()).suggestions ?? [];
  } catch { return null; }
}

const nombre = (v, decimales) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);

/**
 * Fourchette lisible, une seule unité : en M€ avec une décimale dès que le haut atteint 1 M€
 * (« 1,8 – 2,4 M€ »), sinon en k€ arrondis à la dizaine (« 150 – 230 k€ »). Espace insécable avant l'unité.
 */
export function fourchette(bas, haut) {
  if (haut >= 1e6) return `${nombre(bas / 1e6, 1)} – ${nombre(haut / 1e6, 1)} M€`;
  const k = (v) => nombre(Math.round(v / 1e4) * 10, 0);
  return `${k(bas)} – ${k(haut)} k€`;
}

/** Multiple affiché : « 5,6 » */
export const multiple = (v) => nombre(v, Number.isInteger(v) ? 0 : 1);

/** Remplace {cle} dans un modèle de texte. */
export const remplir = (modele, valeurs) => String(modele || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in valeurs ? String(valeurs[k]) : m));
