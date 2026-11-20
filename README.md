# Passation

[![Tests](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml/badge.svg)](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml)

Plateforme web qui accompagne le dirigeant de PME française dans la préparation de la cession de son entreprise :
de la première estimation à partir du SIREN jusqu'aux documents remis aux repreneurs (datapack Excel, teaser
anonymisé, mémorandum d'information).

Projet du cours « Programming and AI for Corporate Finance » (EDHEC Business School, 2026).

**En ligne :** https://passation.eros-fragliola-freedom.workers.dev

## Ce que fait l'application

| Fonction | État | Dépend de |
|---|---|---|
| Estimation express sans compte (SIREN ou nom) : fourchette de valeur d'entreprise par multiples d'EBE sourcés | Disponible | API publiques gratuites |
| Connexion par code à 6 chiffres reçu par e-mail ; espace dirigeant ; parcours guidé avec reprise | Disponible | Brevo (en local : code affiché dans le terminal) |
| Saisie des comptes et contrôles de cohérence (bilan équilibré, CA publié, unité, variation suspecte) | Disponible | — |
| Lecture automatique d'une liasse fiscale PDF (montants proposés, jamais validés d'office) | Disponible | API Claude (payante) |
| Valorisation approfondie : multiples d'EBE, DCF sur 5 ans, ANCC, retraitements, décotes, passage VE → titres, sensibilités | Disponible ; **le DCF demande une prime de taille** (aucune source publique gratuite : à régler par le dirigeant) | — |
| Datapack Excel (9 onglets, formules vivantes) | Disponible | — |
| Teaser anonymisé, avec contrôle d'anonymat automatique | Disponible | API Claude |
| Mémorandum d'information (9 chapitres, faits validés, étude de marché sourcée) | Disponible | API Claude (recherche web pour l'étude de marché) |
| Dépôt des pièces du dossier | Disponible | — |
| Export Word du mémorandum | Non développé (version imprimable en PDF) | — |
| Bibliothèque de ressources, chat « Expert cession » | Non développés | — |
| Suppression du compte depuis l'espace | Non développée (la suppression du dossier, elle, est disponible) | — |

**Sans clé Anthropic**, l'estimation, la saisie, les contrôles, la valorisation approfondie et le datapack fonctionnent ;
la lecture de liasse et les rédactions répondent « indisponible ».

## Principes

- **L'IA rédige, le code calcule.** Toutes les valeurs sont produites par du code déterministe et testé. Claude lit
  des documents (montants proposés au dirigeant) et rédige à partir des résultats ; il ne calcule aucune valeur.
- **Aucune donnée inventée.** Multiples sectoriels et hypothèses sont stockés avec leur source et leur date dans
  `src/data/`. Une valeur sans source reste « À compléter » (exemple : la prime de taille, d'où le DCF optionnel).
- **Le dirigeant valide.** Seuls les exercices complets et validés entrent dans le calcul ; un exercice incomplet est
  écarté et signalé, jamais complété par des zéros. Les réglages hors bornes sont refusés avec un message.
- **Sécurité et RGPD** : code de connexion haché (sel + secret serveur), usage unique, 10 minutes, 5 essais ; cookie
  `HttpOnly; Secure; SameSite=Lax` ; contrôle d'origine (CSRF) ; chaque route privée vérifie la propriété du dossier ;
  limites de débit par empreinte d'IP ; quotas quotidiens des traitements par Claude ; suppression du dossier et de
  ses fichiers en un clic (le compte, lui, n'est pas supprimé : voir `public/confidentialite.html`).

## Sources de données

| Donnée | Source | Accès |
|---|---|---|
| Identité, NAF, effectif, siège | API Recherche d'entreprises (`recherche-entreprises.api.gouv.fr`) | Gratuit, sans clé |
| CA, EBE, résultat publiés | Jeu `ratios_inpi_bce` (`data.economie.gouv.fr`) | Gratuit, sans clé |
| Événements (création, transferts, reprises de fonds) | BODACC (`bodacc-datadila.opendatasoft.com`) | Gratuit, sans clé |
| Multiples d'EBE par secteur | Croisement Argos Index Q2 2026, Dealsuite/Fusac (via Capital Stack), barème Captain 2026, Damodaran Europe 01/2026 : `src/data/multiples-sources.json`, calcul `npm run multiples` | Publications gratuites |
| Taux sans risque, coût de la dette, prime de risque, bêtas, IS, croissance à l'infini | BCE, Banque de France, Damodaran, service-public.fr : `src/data/hypotheses.json` | Gratuit |

Réponses mises en cache 24 h (D1). Une panne d'API est signalée comme telle (jamais comme une absence de comptes) et
n'est pas mise en cache.

**Services externes payants ou à compte** : API Claude d'Anthropic (payante à l'usage, modèles `claude-sonnet-5-5` et
`claude-haiku-5-5`, `src/config.js`) ; Brevo (offre gratuite limitée) ; Cloudflare Workers, D1 et R2 (offre gratuite).
L'usage d'une API payante est à faire valider au regard de la consigne « sources gratuites » du cours.

## Installation locale

Prérequis : **Node.js 22.13 ou plus récent** (les tests utilisent `node:sqlite`, absent de Node 20 et de Node 22.12),
npm. Aucun compte Cloudflare n'est nécessaire en local.

```bash
git clone https://github.com/Erosfragliola/passation.git && cd passation
npm ci
npm test                       # suite Vitest, sans réseau ni clé
cp .dev.vars.example .dev.vars # puis remplir les valeurs vous-même (fichier jamais commité)
npm run db:migrate:local       # crée la base D1 locale (.wrangler/)
npm run dev                    # http://127.0.0.1:8787
```

Variables (`.dev.vars` en local, `npx wrangler secret put NOM` en production) :

| Variable | Rôle | Sans elle |
|---|---|---|
| `SESSION_SECRET` | Secret des empreintes (codes de connexion, IP) | En local : fonctionne (secret de développement). **Hors local : l'API refuse de fonctionner (503).** |
| `ANTHROPIC_API_KEY` | Lecture de liasse, rédactions | Ces fonctions répondent « indisponible » |
| `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` | Envoi des codes et notifications | En local : code affiché dans le terminal ; en production : connexion impossible |

## Démonstration

Scénario reproductible, avec une liasse **entièrement fictive** et les résultats attendus : [docs/DEMO.md](docs/DEMO.md).
En local : `npm run dev`, saisir un SIREN, demander un code (il s'affiche dans le terminal), déposer
`test/fixtures/liasse-fictive.pdf` (avec une clé Anthropic) ou saisir les montants du tableau de `docs/DEMO.md`.

## Langues

Le site est bilingue : **anglais** (langue par défaut, adresses d'origine) et **français** (sous `/fr/`). Sélecteur
« EN | FR » en haut à droite de chaque page. Pour modifier un texte : `src/contenu/en/<page>.json` et
`src/contenu/fr/<page>.json` (mêmes clés), en suivant [docs/glossaire-traduction.md](docs/glossaire-traduction.md).
Contrôle : `npm run i18n:check` (mêmes clés, aucune valeur vide, valeurs identiques, textes restés en dur).

## Tests

```bash
npm test
```

**485 tests Vitest** (35 fichiers), relancés par GitHub Actions (Node 22, Ubuntu 24.04) à chaque envoi. D1 est
simulée par SQLite en mémoire avec les vraies migrations ; R2, Claude et les API publiques sont simulés.

- **Valorisation** : trois méthodes, passage VE → titres, cas limites (EBE négatif, comptes absents, un seul
  exercice, trésorerie nette, CMPC ≤ g, exercices incomplets écartés, réglages hors bornes). Deux cas de référence
  calculés indépendamment en Python : `scripts/reference-valorisation.py` (détail dans
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md)) et le scénario de [docs/DEMO.md](docs/DEMO.md).
- **Datapack** : un évaluateur de formules recalcule le classeur et le compare au moteur (il ne remplace pas une
  ouverture dans Excel).
- **Connexion et droits d'accès** : codes, sessions, accès refusé au dossier d'un autre, secret serveur exigé.
- **Sources publiques** : normalisation sur réponses réelles enregistrées (`test/fixtures/`), pannes 429 et 500.
- **Quotas** des traitements par Claude, anonymat du teaser, parcours guidé, contenus de la page d'accueil.
- **Site bilingue** : mêmes clés dans les deux langues, aucune clé citée dans le code sans texte français, langue
  des requêtes, adresses `/fr/`, pluriels, lecture des montants saisis (`test/i18n.test.js`, `npm run i18n:check`).

Une part importante des tests porte sur la page d'accueil et son illustration (environ 140). Le nombre de tests ne
prouve pas à lui seul la justesse d'une méthode financière : voir [docs/decisions-methode.md](docs/decisions-methode.md).

## Architecture

```
Navigateur (HTML, CSS, JavaScript sans framework : public/)
        │  fetch /api/*
        ▼
Cloudflare Worker (src/)
   ├── D1 « passation »           utilisateurs, sessions, dossiers, chiffres, valorisations, cache, limites
   ├── R2 « passation-fichiers »  liasses, pièces, documents générés, logos, photos (préfixe dossiers/<id>/)
   ├── API Claude                 lecture des liasses et des sites, rédaction, étude de marché
   ├── Brevo                      e-mails de connexion et de suivi
   └── API publiques              Recherche d'entreprises, ratios INPI/BCE, BODACC (cache 24 h)
```

| Dossier | Contenu |
|---|---|
| `src/index.js` | Routeur du Worker, garde de configuration, erreurs, tâche planifiée quotidienne |
| `src/contenu/` | Textes du site, un dossier par langue (`en/`, `fr/`, mêmes clés) ; réglages communs dans `cles.json` |
| `src/i18n.js`, `public/js/i18n.js` | Langue de la requête, adresses `/fr/`, `t()` partagé par le navigateur et le Worker |
| `src/routes/` | Routes de l'API : connexion, recherche, estimation, dossiers, valorisation, documents, pièces, suivi |
| `src/valuation/` | Moteurs express et approfondi, assemblage et validation des entrées, contrôles de cohérence |
| `src/documents/` | Datapack Excel, teaser, contrôle d'anonymat, mémorandum, lecture du site de l'entreprise |
| `src/sources/` | Normalisation des réponses des API publiques |
| `src/lib/` | Authentification, cache, client Claude, e-mails, limites de débit et quotas |
| `src/data/` | Multiples, hypothèses (et leurs bornes de saisie), nomenclatures : sourcés et datés |
| `src/config.js` | Constantes uniques : modèles, limites, quotas, durées |
| `public/` | Pages, styles, scripts du navigateur, polices, images |
| `migrations/` | Schéma de la base D1 |
| `test/` | Tests automatisés et jeux de données enregistrés |
| `scripts/` | Génération des images, polices, multiples, jeux de test ; calcul de référence Python |
| `docs/` | Démonstration, décisions de méthode, calculs de référence, livrables, maquettes en attente de choix |

## Limites connues

- Le DCF n'est calculé qu'une fois la prime de taille renseignée (aucune source publique gratuite).
- Conventions à arbitrer : décotes appliquées à la valeur d'entreprise, crédit-bail compté dans la dette nette sans
  retraitement de l'EBE ([docs/decisions-methode.md](docs/decisions-methode.md)).
- Le datapack est vérifié par un évaluateur de formules interne, pas par Excel.
- Pages légales en brouillon (éditeur, contact, hébergement « À compléter ») ; suppression du compte non disponible.
- Pas d'en-têtes CSP ni `frame-ancestors` sur les pages.

## Mise en ligne (propriétaire du compte Cloudflare)

```bash
npx wrangler secret list                    # vérifier SESSION_SECRET (obligatoire), ANTHROPIC_API_KEY, BREVO_API_KEY…
npx wrangler secret put SESSION_SECRET      # idem pour les autres secrets manquants
npx wrangler d1 migrations apply passation --remote
npm run deploy
```

## Documentation et livrables

- [AI-USAGE.md](AI-USAGE.md) : usage de l'IA, contrôles humains, erreurs détectées.
- [docs/livrables/](docs/livrables/) : brouillons du business plan et de la présentation.
- [docs/DEMO.md](docs/DEMO.md) : scénario de démonstration.
- [docs/decisions-methode.md](docs/decisions-methode.md) : conventions de valorisation à arbitrer.
- [docs/valorisation-calculs.md](docs/valorisation-calculs.md) : calculs de référence.
- [PLAN.md](PLAN.md) : plan initial et journal de développement daté.
- [CLAUDE.md](CLAUDE.md) : règles données à l'assistant de code (Claude Code).
- [public/img/CREDITS.md](public/img/CREDITS.md) : crédits et licences des images et bibliothèques.

Les branches autres que `main` sont des étapes déjà fusionnées ou des archives (`archive/…`), conservées pour mémoire.
