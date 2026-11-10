// Envoi du code de connexion. Brevo en production ; en local (127.0.0.1 / localhost) sans clé Brevo,
// le code est affiché dans le terminal de développement. En production sans clé : refus explicite.
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
      subject: `${code} : votre code de connexion Passation`,
      htmlContent: `<p>Bonjour,</p><p>Voici votre code pour ouvrir votre dossier Passation :</p>`
        + `<p style="font-size:30px;font-weight:600;letter-spacing:6px;font-family:monospace">${code}</p>`
        + `<p>Il est valable 10 minutes et ne sert qu'une fois. Tapez-le dans la fenêtre de connexion restée ouverte.</p>`
        + `<p>Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans ce code.</p>`,
      textContent: `Votre code de connexion Passation : ${code} (valable 10 minutes, usage unique). Si vous n'avez rien demandé, ignorez ce message.`,
    }),
  });
  return res.ok ? { envoye: true, mode: "brevo" } : { envoye: false, raison: `brevo_${res.status}` };
}
