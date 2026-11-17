# Passation

[![Tests](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml/badge.svg)](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml)

Plateforme web qui accompagne le dirigeant de PME française dans la préparation de la cession de son entreprise :
de la première estimation à partir du SIREN jusqu'aux documents remis aux repreneurs (datapack Excel, teaser
anonymisé, mémorandum d'information).

**En ligne :** https://passation.eros-fragliola-freedom.workers.dev

## Ce que fait l'application

1. **Estimation express, sans compte.** Le dirigeant saisit son SIREN ou le nom de sa société. Passation interroge
   les données publiques (API Recherche d'entreprises, comptes INPI, annonces BODACC), applique des multiples
   sectoriels sourcés et affiche une fourchette de valeur. Si le secteur n'a pas de référence sourcée, aucun chiffre
   n'est affiché.
2. **Espace dirigeant.** Connexion par un code à 6 chiffres reçu par e-mail, puis un parcours guidé : une question
   par écran, reprise automatique, rappel unique par e-mail au bout de 3 jours.
3. **Valorisation approfondie.** Claude lit la liasse fiscale en PDF et propose les chiffres, que le dirigeant
   valide ; des contrôles de cohérence vérifient chaque exercice. Le moteur applique ensuite trois méthodes
   (multiples, DCF sur 5 ans, actif net comptable corrigé), les décotes, le passage de la valeur d'entreprise à la
   valeur des titres, une synthèse « football field » et des sensibilités.
4. **Datapack Excel.** Un classeur de 9 onglets à formules vivantes, écrit directement en XML zippé (`fflate`), sans
   bibliothèque lourde. Les tests vérifient qu'il redonne au centime les chiffres du moteur.
5. **Teaser anonymisé.** Claude le rédige à partir de faits anonymes calculés par le code. Un contrôle d'anonymat
   refuse toute version qui contient le nom, la ville, le SIREN, un montant exact ou une marque de l'entreprise.
6. **Mémorandum d'information.** Huit sections rédigées à partir des seules données validées par le dirigeant
   (« À compléter » sinon), enrichies des faits tirés du site de l'entreprise après validation, en version
   imprimable.

## Principes

- **L'IA rédige, le code calcule.** Toutes les valorisations sont du code déterministe et testé ; Claude commente et
  rédige à partir des résultats.
- **Aucune donnée inventée.** Multiples sectoriels et hypothèses (taux sans risque, prime de risque, coût de la
  dette, IS) sont stockés avec leur source et leur date dans `src/data/`.
- **Sécurité et RGPD.**
  - Code de connexion stocké haché, à usage unique, valable 10 minutes, 5 essais.
  - Cookie de session `HttpOnly; Secure; SameSite=Lax`.
  - Chaque route privée vérifie que le dossier appartient à l'utilisateur connecté.
  - Protection CSRF par l'origine des requêtes.
  - Limite de débit par adresse IP hachée.
  - Suppression complète du dossier et de ses fichiers en un clic.
  - Les données du dirigeant ne sont envoyées qu'à l'API Claude, pour le traitement demandé.

## Architecture

```
Navigateur (HTML, CSS, JavaScript sans framework : public/)
        │  fetch /api/*
        ▼
Cloudflare Worker (src/)
   ├── D1 « passation »           utilisateurs, sessions, dossiers, chiffres, valorisations, cache, limites
   ├── R2 « passation-fichiers »  liasses importées, documents générés, logos
   ├── API Claude                 lecture des liasses, commentaires, rédaction (Sonnet 5.5 et Haiku 5.5)
   ├── Brevo                      e-mails de connexion et de suivi
   └── API publiques              Recherche d'entreprises, INPI, BODACC (cache 24 h)
```

| Dossier | Contenu |
|---|---|
| `src/index.js` | Routeur du Worker et tâche planifiée quotidienne |
| `src/routes/` | Routes de l'API : connexion, recherche, estimation, dossiers, valorisation, documents |
| `src/valuation/` | Moteurs de valorisation express et approfondie, contrôles de cohérence |
| `src/documents/` | Datapack Excel, teaser, contrôle d'anonymat, mémorandum, lecture du site de l'entreprise |
| `src/sources/` | Normalisation des réponses des API publiques |
| `src/lib/` | Authentification, cache, client Claude, e-mails, limite de débit |
| `src/data/` | Multiples sectoriels, hypothèses, nomenclatures, tous sourcés et datés |
| `src/config.js` | Constantes uniques : modèles, limites d'usage, durées |
| `public/` | Pages, styles, scripts du navigateur, polices, images |
| `migrations/` | Schéma de la base D1 |
| `test/` | Tests automatisés |
| `scripts/` | Génération des images, des polices, des multiples et des jeux de test |
| `docs/` | Méthode de valorisation et rapport de la refonte de l'accueil |

## Lancer en local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .dev.vars.example .dev.vars        # puis remplir les valeurs vous-même (jamais commité)
npm run db:migrate:local              # crée la base D1 locale
npm run dev                           # http://127.0.0.1:8787
```

Sans clé Brevo, le code de connexion s'affiche dans le terminal. Sans clé Anthropic, tout fonctionne sauf la
lecture des liasses et la rédaction.

## Tests

```bash
npm test
```

265 tests (Vitest), relancés par GitHub Actions à chaque envoi :

- **Valorisation** : les trois méthodes, le passage valeur d'entreprise → valeur des titres et les cas limites
  (EBE négatif, comptes absents, un seul exercice, trésorerie nette, CMPC ≤ g). Les valeurs attendues sont
  calculées indépendamment en Python (`scripts/reference-valorisation.py`, détail dans
  `docs/valorisation-calculs.md`).
- **Datapack** : un évaluateur de formules recalcule le classeur et le compare au moteur.
- **Connexion et droits d'accès** : codes, sessions, accès refusé au dossier d'un autre utilisateur.
- **Anonymat du teaser**, normalisation des sources publiques, parcours guidé, contenus de la page d'accueil.

## Mise en ligne

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # idem pour BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, SESSION_SECRET
npx wrangler d1 migrations apply passation --remote
npm run deploy
```

## État d'avancement

Livré : estimation express, comptes et espace dirigeant, valorisation approfondie, datapack Excel, teaser
anonymisé, mémorandum d'information, parcours guidé.

Pas encore fait :

- export Word du mémorandum (la version imprimable sert de PDF) ;
- bibliothèque de ressources et chat « Expert cession » ;
- contenus réels de la page d'accueil (témoignages, tarifs, identité légale), aujourd'hui masqués ou marqués
  « À compléter ».

## Branches

| Branche | Contenu |
|---|---|
| `main` | Version de référence. |
| `refonte-landing` | Suite de la refonte de l'accueil (13/11/2026) : hero, étapes en onglets, section « Pourquoi », champ SIREN, confidentialité, équipe, performance et accessibilité. Testée, pas encore fusionnée ni mise en ligne. |
| `archive/3d-cloche` | Dernier état de `main` avec la maquette 3D « La cloche » (Three.js). Retirée de `main` le 17/11/2026 : la refonte de l'accueil ne la charge plus. Documentation : `docs/3D-V2.md` sur cette branche. |
| `archive/3d-esquisse-edifice` | Variante 3D « De l'esquisse à l'édifice » (12/11/2026), non retenue. |

Les branches `archive/` sont conservées pour mémoire et ne sont pas destinées à être fusionnées.

## Documentation

- [PLAN.md](PLAN.md) : plan initial du projet et journal de développement daté.
- [docs/valorisation-calculs.md](docs/valorisation-calculs.md) : calculs de référence de la valorisation.
- [docs/REFONTE-LANDING.md](docs/REFONTE-LANDING.md) : refonte de la page d'accueil, mesures et captures.
- [CLAUDE.md](CLAUDE.md) : règles données à l'assistant de code (Claude Code) utilisé pendant le développement.
- [public/img/CREDITS.md](public/img/CREDITS.md) : crédits et licences des images et bibliothèques.
