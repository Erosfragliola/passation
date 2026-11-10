// Envoi du lien de connexion. Brevo en production ; en local (127.0.0.1 / localhost) sans clé Brevo,
// le lien est affiché dans le terminal de développement. En production sans clé : refus explicite.
const LOCAL = new Set(["127.0.0.1", "localhost"]);

export async function envoyerLienConnexion(env, email, lien, { fetch: f = fetch } = {}) {
  const hote = new URL(lien).hostname;
  if (!env.BREVO_API_KEY) {
    if (LOCAL.has(hote)) {
      console.log(`\n[Passation, développement] Lien de connexion pour ${email} :\n${lien}\n`);
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
      subject: "Votre lien de connexion à Passation",
      htmlContent: `<p>Bonjour,</p><p>Voici votre lien pour ouvrir votre dossier Passation. Il est valable 15 minutes et ne fonctionne qu'une fois.</p><p><a href="${lien}">Ouvrir mon dossier</a></p><p>Si vous n'avez rien demandé, ignorez ce message.</p>`,
      textContent: `Votre lien de connexion à Passation (valable 15 minutes, usage unique) : ${lien}`,
    }),
  });
  return res.ok ? { envoye: true, mode: "brevo" } : { envoye: false, raison: `brevo_${res.status}` };
}
