# Passation

Boîte à outils du dirigeant de PME qui prépare la cession de son entreprise.
Plan complet : [PLAN.md](PLAN.md). Règles de travail : [CLAUDE.md](CLAUDE.md).

## Lancer en local

```bash
npm install
cp .dev.vars.example .dev.vars        # puis remplir les valeurs vous-même (jamais commité)
npm run db:migrate:local              # crée la base D1 locale
npm run dev                           # http://127.0.0.1:8787
# Connexion en local : sans clé Brevo, le lien magique s'affiche dans ce terminal.
```

## Tests

```bash
npm test
```

## Arborescence

- `public/` : site statique (HTML, CSS, JS, polices, illustrations)
- `src/` : Worker Cloudflare (API `/api/*`), `src/config.js` pour les modèles et les limites
- `migrations/` : schéma de la base D1
- `content/` : fiches de ressources en Markdown (étape 7)
- `test/` : tests automatisés
