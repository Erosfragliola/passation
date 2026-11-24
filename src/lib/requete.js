// HTTP call to a public API, with spaced-out retries on a 429 (too many requests)
// or a 5xx error. Respects the Retry-After header when it is short. Total duration bounded (~3 s).
import { USER_AGENT } from "../config.js";

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export async function requeteJson(url, nomSource, { fetch: f = fetch, tentatives = 4, attenteMs = 350 } = {}) {
  let derniere;
  for (let i = 0; i < tentatives; i++) {
    const res = await f(url, { headers: { accept: "application/json", "user-agent": USER_AGENT } });
    if (res.ok) return res.json();
    derniere = res.status;
    if (res.status !== 429 && res.status < 500) break;
    if (i < tentatives - 1) {
      const retry = Number(res.headers.get("retry-after"));
      const ms = Number.isFinite(retry) && retry > 0 && retry <= 2 ? retry * 1000 : attenteMs * 2 ** i + Math.random() * 150;
      await attendre(ms);
    }
  }
  throw new Error(`${nomSource} : HTTP ${derniere}`);
}
