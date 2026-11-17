# Passation

Boîte à outils du dirigeant de PME qui prépare la cession de son entreprise.
Plan complet : [PLAN.md](PLAN.md). Règles de travail : [CLAUDE.md](CLAUDE.md).

## Lancer en local

```bash
npm install
cp .dev.vars.example .dev.vars        # puis remplir les valeurs vous-même (jamais commité)
npm run db:migrate:local              # crée la base D1 locale
npm run dev                           # http://127.0.0.1:8787
# Connexion en local : sans clé Brevo, le code de connexion s'affiche dans ce terminal.
```

## Tests

```bash
npm test
```

## Arborescence

- `public/` : site statique (HTML, CSS, JS, polices, illustrations)
- `src/` : Worker Cloudflare (API `/api/*`), `src/config.js` pour les modèles et les limites
- `migrations/` : schéma de la base D1
- `scripts/` : génération des images, des polices, des multiples et des jeux de test
- `test/` : tests automatisés
- `docs/` : méthode de valorisation (`valorisation-calculs.md`) et rapport de la refonte de l'accueil
  (`REFONTE-LANDING.md`, captures dans `docs/refonte/`)

## Branches

| Branche | Contenu |
|---|---|
| `main` | Version de référence, celle qui est en ligne. |
| `refonte-landing` | Suite de la refonte de l'accueil (13/11/2026) : hero, étapes en onglets, section « Pourquoi », champ SIREN, confidentialité, équipe, performance et accessibilité. Testée, pas encore fusionnée ni mise en ligne. |
| `archive/3d-cloche` | Dernier état de `main` avec la maquette 3D « La cloche » (Three.js). Retirée de `main` le 17/11/2026 : la refonte de l'accueil ne la charge plus. Documentation : `docs/3D-V2.md` sur cette branche. |
| `archive/3d-esquisse-edifice` | Variante 3D « De l'esquisse à l'édifice » (12/11/2026), non retenue. |

Les branches `archive/` sont conservées pour mémoire et ne sont pas destinées à être fusionnées.
