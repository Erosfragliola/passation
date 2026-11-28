// Security headers added to every response of the Worker: pages, API, files (audit SEC-04).
// Static resources served without the Worker (css, js, img, fonts, video) get theirs through public/_headers.
//
// Content security policy (CSP), based on what the site actually loads:
// - scripts: only the site's files (no inline script, no onclick="…" handler);
// - styles: the site's files + style="…" attributes (present in the pages and set by the JavaScript);
// - images: the site, data:/blob:, and https: (candidate logos and photos read on the company's website, shown to the
//   owner so that they choose);
// - fonts, videos, network calls: the site only; no frame, no plug-in; the site cannot be displayed in a frame of
//   another site (frame-ancestors).
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

/** Common headers; HSTS only over https (never in local development, over http). */
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

/**
 * Copy of the response with the security headers; a response that already sets its CSP (file served with
 * « default-src 'none' ») keeps its own, stricter one.
 */
export function avecEntetes(reponse, url) {
  const r = new Response(reponse.body, reponse);
  for (const [k, v] of Object.entries(entetesSecurite(url.protocol === "https:"))) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
}
