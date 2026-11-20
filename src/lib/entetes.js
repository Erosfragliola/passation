// En-têtes de sécurité ajoutés à toutes les réponses du Worker : pages, API, fichiers (audit SEC-04).
// Les ressources statiques servies sans le Worker (css, js, img, fonts, video) reçoivent les leurs via public/_headers.
//
// Politique de sécurité du contenu (CSP), établie d'après ce que le site charge réellement :
// - scripts : uniquement les fichiers du site (aucun script en ligne, aucun gestionnaire onclick="…") ;
// - styles : fichiers du site + attributs style="…" (présents dans les pages et posés par le JavaScript) ;
// - images : le site, data:/blob:, et https: (logos et photos candidats lus sur le site de l'entreprise, affichés au
//   dirigeant pour qu'il choisisse) ;
// - polices, vidéos, appels réseau : le site seulement ; aucun cadre, aucun plug-in ; le site ne peut pas être
//   affiché dans un cadre d'un autre site (frame-ancestors).
export function politiqueContenu(https) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "media-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** En-têtes communs ; HSTS seulement en https (jamais en développement local, en http). */
export function entetesSecurite(https) {
  return {
    "content-security-policy": politiqueContenu(https),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "cross-origin-opener-policy": "same-origin",
    ...(https ? { "strict-transport-security": "max-age=31536000" } : {}),
  };
}

/** Copie de la réponse avec les en-têtes de sécurité ; une réponse qui fixe déjà sa CSP (fichier servi avec
 *  « default-src 'none' ») garde la sienne, plus stricte. */
export function avecEntetes(reponse, url) {
  const r = new Response(reponse.body, reponse);
  for (const [k, v] of Object.entries(entetesSecurite(url.protocol === "https:"))) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
}
