// Envoi du code de connexion. Brevo en production ; en local (127.0.0.1 / localhost) sans clé Brevo,
// le code est affiché dans le terminal de développement. En production sans clé : refus explicite.
import { t as tr } from "../../public/js/i18n.js";
const LOCAL = new Set(["127.0.0.1", "localhost"]);

/**
 * @param {string} code  six chiffres
 * @param {string} urlSite  adresse de la requête (sert à reconnaître le mode local)
 */
export async function envoyerCodeConnexion(env, email, code, urlSite, { fetch: f = fetch } = {}) {
  const hote = new URL(urlSite).hostname;
  if (!env.BREVO_API_KEY) {
    if (LOCAL.has(hote)) {
      console.log(`\n[Passation, développement] Code de connexion pour ${email} : ${code}\n`);
      return { envoye: true, mode: "console" };
    }
    return { envoye: false, raison: "envoi_non_configure" };
  }
  const res = await f("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env.SENDER_EMAIL, name: env.SENDER_NAME || "Passation" },
      to: [{ email }],
      subject: tr("serveur.email.code.sujet", { code }),
      htmlContent: `<p>${tr("serveur.email.bonjour")}</p><p>${tr("serveur.email.code.intro")}</p>`
        + `<p style="font-size:30px;font-weight:600;letter-spacing:6px;font-family:monospace">${code}</p>`
        + `<p>${tr("serveur.email.code.validite")}</p>`
        + `<p>${tr("serveur.email.code.ignorer")}</p>`,
      textContent: tr("serveur.email.code.texte", { code }),
    }),
  });
  return res.ok ? { envoye: true, mode: "brevo" } : { envoye: false, raison: `brevo_${res.status}` };
}

/** Message de suivi du dossier (dossier prêt, rappel). Même règle : Brevo, ou terminal en local, sinon refus. */
export async function envoyerMessage(env, email, { sujet, titre, texte, lien, bouton }, urlSite, { fetch: f = fetch } = {}) {
  const local = LOCAL.has(new URL(urlSite).hostname);
  if (!env.BREVO_API_KEY) {
    if (local) { console.log(`\n[Passation, développement] E-mail « ${sujet} » pour ${email} : ${lien}\n`); return { envoye: true, mode: "console" }; }
    return { envoye: false, raison: "envoi_non_configure" };
  }
  const echappe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const res = await f("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env.SENDER_EMAIL, name: env.SENDER_NAME || "Passation" },
      to: [{ email }],
      subject: sujet,
      htmlContent: `<p>${tr("serveur.email.bonjour")}</p><p><strong>${echappe(titre)}</strong></p><p>${echappe(texte)}</p><p><a href="${echappe(lien)}">${echappe(bouton)}</a></p><p style="color:#696155;font-size:13px">${tr("serveur.email.pourquoi")}</p>`,
      textContent: `${titre}\n\n${texte}\n\n${tr("serveur.email.lien_texte", { bouton, lien })}`,
    }),
  });
  return res.ok ? { envoye: true, mode: "brevo" } : { envoye: false, raison: `brevo_${res.status}` };
}
