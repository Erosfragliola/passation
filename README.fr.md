[English](README.md) | **Français**

# Passation

[![Tests](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml/badge.svg)](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml)

Plateforme web qui accompagne le dirigeant de PME française dans la préparation de la cession de son entreprise :
de la première estimation à partir du SIREN jusqu'aux documents remis aux repreneurs (datapack Excel, teaser
anonymisé, mémorandum d'information).

Projet du cours « Programming and AI for Corporate Finance » (EDHEC Business School, 2026).

**En ligne :** https://passation.eros-fragliola-freedom.workers.dev (anglais sous `/`, français sous `/fr/`).

## Pour qui

Le dirigeant d'une PME française (identifiée par son SIREN) qui prépare la cession de son entreprise et veut, avant de
rencontrer un conseil ou un repreneur, une première valorisation sourcée et les documents habituels d'une cession. Son
expert-comptable ou son conseil en cession peut relire les chiffres et les documents avec lui.

## Ce que fait l'application

| Fonction | État | Dépend de |
|---|---|---|
| Fiche publique de l'entreprise sans compte (SIREN ou nom) ; estimation express (fourchette de valeur d'entreprise par multiples d'EBE sourcés) une fois l'accès créé | Disponible | API publiques gratuites |
| Compte obligatoire après le SIREN, créé et ouvert avec un code à 6 chiffres reçu par e-mail ; espace dirigeant ; parcours guidé avec reprise | Disponible | Brevo (en local : code affiché dans le terminal) |
| Interface bilingue, anglais (par défaut, sous `/`) et français (sous `/fr/`), avec un sélecteur « EN \| FR » | Disponible | — |
| Parcours guidé en deux temps : 1. Votre valorisation (trois exercices, retraitements, dette nette et périmètre, « Votre valeur » avec le pont de l'EBE à la valeur des titres, validée par le dirigeant), 2. Votre mémorandum (entreprise, photos et logo, équipe dirigeante, rédaction) ; le mémorandum seulement après la validation | Disponible | — |
| Saisie des comptes et contrôles de cohérence (bilan équilibré, CA publié, unité, variation suspecte, résultat net supérieur à l'EBE, capitaux propres négatifs, chiffre d'affaires en variation de plus de 30 %) | Disponible | — |
| Lecture automatique d'une liasse fiscale PDF (montants proposés, jamais validés d'office) | Disponible | API Claude (payante) |
| Valorisation approfondie : multiples d'EBE, DCF sur 5 ans, ANCC, retraitements, décotes, passage VE → titres, sensibilités | Disponible ; **le DCF demande une prime de taille** (aucune source publique gratuite : à régler par le dirigeant) | — |
| Datapack Excel (9 onglets, formules vivantes) | Disponible | — |
| Teaser anonymisé, avec contrôle d'anonymat automatique | Disponible | API Claude |
| Mémorandum d'information (9 chapitres, faits validés, étude de marché sourcée) | Disponible | API Claude (recherche web pour l'étude de marché) |
| Logo et photos : dépôt de plusieurs fichiers avec progression, réduits dans le navigateur s'ils sont lourds, attestation au-dessus, jugement de Claude et place dans le mémorandum pour chaque photo | Disponible | API Claude (jugement) |
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
- **Sécurité et RGPD** : aucun montant envoyé par le serveur sans session ; code de connexion haché (sel + secret
  serveur), usage unique, 10 minutes, 5 essais, même réponse que l'adresse ait un compte ou non ; cookie
  `HttpOnly; Secure; SameSite=Lax` ; contrôle d'origine (CSRF) ; chaque route privée vérifie la propriété du dossier ;
  limites de débit par empreinte d'IP ; quotas quotidiens des traitements par Claude ; suppression du dossier et de
  ses fichiers en un clic (le compte, lui, n'est pas supprimé : voir `public/confidentialite.html`).

## Données et API gratuites

Toutes les données sur l'entreprise viennent de sources publiques gratuites, sans clé. Les appels respectent les
conditions d'usage (`src/lib/requete.js`, `src/config.js`) : un User-Agent qui identifie l'application
(`Passation/0.1 (outil de preparation de cession de PME)`), des réponses mises en cache 24 h dans D1
(`DURATIONS.apiCache`, `src/lib/cache.js`), et jusqu'à 4 tentatives espacées de façon exponentielle en cas de réponse
429 (trop de requêtes) ou d'erreur 5xx, en suivant l'en-tête `Retry-After` quand il est court. Une panne d'API est
signalée comme telle (jamais comme une absence de comptes) et n'est pas mise en cache.

| Source | URL | Ce qu'on en tire | Accès |
|---|---|---|---|
| API Recherche d'entreprises (État) | https://recherche-entreprises.api.gouv.fr | Identité, code NAF, tranche d'effectif, siège ; nombre d'entreprises par secteur et région (chapitre Marché) | Gratuit, sans clé |
| Jeu `ratios_inpi_bce` (data.economie.gouv.fr) | https://data.economie.gouv.fr/explore/dataset/ratios_inpi_bce/ | CA, EBE, résultat d'exploitation et résultat net publiés, par exercice | Gratuit, sans clé |
| BODACC (Bulletin officiel des annonces civiles et commerciales) | https://bodacc-datadila.opendatasoft.com | Événements : création, transferts, reprises de fonds | Gratuit, sans clé |
| Multiples d'EBE par secteur | `src/data/multiples-sources.json` (URL et date de chaque source) | Croisement Argos Index Q2 2026, Dealsuite/Fusac (via Capital Stack), barème Captain 2026, Damodaran Europe 01/2026, calcul `npm run multiples` | Publications gratuites |
| Hypothèses de valorisation | `src/data/hypotheses.json` (URL et date de chaque valeur) | Taux sans risque, coût de la dette, prime de risque, bêtas, IS, croissance à l'infini (BCE, Banque de France, Damodaran, service-public.fr) | Publications gratuites |
| Intitulés anglais des secteurs | `src/data/naf-divisions-en.json` | Eurostat, intitulés des divisions de la NACE Rév. 2 (mêmes divisions que la NAF rév. 2) | Publication gratuite |

**API Claude (Anthropic), seul service payant, à l'usage** (modèles `claude-sonnet-5-5` et `claude-haiku-5-5`,
`src/config.js`). Elle sert seulement à **lire** (liasses, site de l'entreprise, photos) et à **rédiger** (teaser,
mémorandum, étude de marché). Elle ne calcule aucune valeur : la valorisation et le datapack Excel fonctionnent sans
elle. Avec le Claude simulé (voir « Vérification locale sans l'API Claude » plus bas), tout le parcours tourne sans
clé. Autres services : Brevo pour les e-mails de connexion (offre gratuite limitée) et Cloudflare Workers, D1 et R2
(offre gratuite).

## Hypothèses

| Hypothèse | Où elle est écrite |
|---|---|
| Montants en euros (EUR), tels que publiés dans les comptes français | [docs/valorisation-calculs.md](docs/valorisation-calculs.md) (cas de test), [PLAN.md § 1](PLAN.md#1-what-the-public-apis-really-return-tested-on-10112026-siren-434436622) |
| Entreprises françaises uniquement, identifiées par leur SIREN (numéro à 9 chiffres du registre français) | [PLAN.md § 4](PLAN.md#4-pages-and-api-routes) (`/api/company/:siren`) et [§ 11](PLAN.md#11-flow-after-the-siren-and-deliverables-decisions-of-10112026) |
| Un exercice est un exercice comptable clos (date de clôture des comptes déposés) | [PLAN.md § 1](PLAN.md#1-what-the-public-apis-really-return-tested-on-10112026-siren-434436622) et [§ 5.1](PLAN.md#51-quick-valuation) |
| Au plus 3 exercices ; le dernier retenu est complet, les précédents sont retenus pour leur compte de résultat | [PLAN.md § 5.2](PLAN.md#52-detailed-valuation) (moyenne des 3 derniers exercices retraités) et § 10, entrée du 25/11/2026 |
| Multiples sectoriels datés et sourcés ; un secteur sans multiple sourcé n'affiche aucun chiffre | [PLAN.md § 5.1 et § 5.4](PLAN.md#54-industry-multiples-to-be-completed-by-you), `src/data/multiples.json` |
| Conventions de valorisation (décotes sur la valeur d'entreprise, crédit-bail dans la dette nette) | [docs/decisions-methode.md](docs/decisions-methode.md) |

**Ce que le MVP ne fait pas :** pas de paiement en ligne ; pas de mise en relation avec des repreneurs ; pas de conseil
juridique ou fiscal (le site l'indique : « Ne constitue pas un conseil juridique, fiscal ou financier ») ; pas
d'entreprises étrangères (seuls les registres français sont interrogés).

## Données synthétiques

- Tous les chiffres de démonstration et de test sont **fictifs (synthétiques)** : [docs/DEMO.md](docs/DEMO.md), la
  liasse `test/fixtures/liasse-fictive.pdf` / `.html` (« Atelier Exemple »), le dossier d'exemple « Menuiserie
  Exemple » / nom de code « Projet Chêne » (`scripts/dossier-exemple.mjs`, SIREN 000000018, qui n'existe pas).
- Exception : `test/fixtures/*.json` sont de **vraies réponses des API publiques gratuites**, enregistrées le
  10/11/2026 pour tester la normalisation (`test/sources.test.js`, `test/rapprochement-sources.test.js`). Elles ne
  contiennent que des données publiées.
- En usage, l'application lit les vraies données publiques de l'entreprise saisie par le dirigeant.

## Installation locale

Prérequis : **Node.js 22.13 ou plus récent** (les tests utilisent `node:sqlite`, absent de Node 20 et de Node 22.12),
npm. Aucun compte Cloudflare n'est nécessaire en local.

```bash
git clone https://github.com/Erosfragliola/passation.git && cd passation
npm ci
npm test                       # suite Vitest, sans réseau ni clé
npm run i18n:check             # fichiers de traduction : mêmes clés dans les deux langues, aucune valeur vide
cp .dev.vars.example .dev.vars # puis remplir les valeurs vous-même (fichier jamais commité ; .env.example liste les mêmes noms)
npm run db:migrate:local       # crée la base D1 locale (.wrangler/)
npm run dev                    # http://127.0.0.1:8787 (anglais) et http://127.0.0.1:8787/fr/ (français)
```

Variables (`.dev.vars` en local, `npx wrangler secret put NOM` en production) :

| Variable | Rôle | Sans elle |
|---|---|---|
| `SESSION_SECRET` | Secret des empreintes (codes de vérification, IP, compteurs d'échecs de connexion) | En local : fonctionne (secret de développement). **Hors local : l'API refuse de fonctionner (503).** |
| `ANTHROPIC_API_KEY` | Lecture de liasse, rédactions | Ces fonctions répondent « indisponible » |
| `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` | Envoi des codes et notifications | En local : code affiché dans le terminal ; en production : connexion impossible |

## Démonstration

Scénario reproductible, avec une liasse **entièrement fictive** et les résultats attendus : [docs/DEMO.md](docs/DEMO.md).
En local : `npm run dev`, saisir un SIREN, demander un code (il s'affiche dans le terminal), déposer
`test/fixtures/liasse-fictive.pdf` (avec une clé Anthropic) ou saisir les montants du tableau de `docs/DEMO.md`.

## Vérification locale sans l'API Claude (Claude simulé)

Pour parcourir tout le parcours en local (lecture de liasse, rédaction, jugement des photos, étude de marché) sans clé
ni appel à Anthropic, lancez le Claude simulé dans un second terminal, puis le Worker branché dessus :

```bash
node scripts/claude-simule.mjs 8790
npx wrangler dev --var ANTHROPIC_BASE_URL:http://127.0.0.1:8790 --var ANTHROPIC_API_KEY:simule
```

`scripts/claude-simule.mjs` répond à chaque appel par un JSON conforme au schéma demandé
(`output_config.format.schema`), avec des textes marqués comme fictifs ; la liasse donne trois exercices de montants
fictifs cohérents. `ANTHROPIC_BASE_URL` est un réglage de développement : jamais en production. Les codes de
connexion s'affichent dans le terminal de `wrangler dev`. La demande de code est limitée à 10 par heure et par IP ; en
local, les compteurs se remettent à zéro avec `npx wrangler d1 execute passation --local --command "DELETE FROM rate_limits"`.

## Langues

Le site est bilingue : **anglais** (langue par défaut, adresses d'origine) et **français** (sous `/fr/`). Sélecteur
« EN | FR » en haut à droite de chaque page. Pour modifier un texte : `src/contenu/en/<page>.json` et
`src/contenu/fr/<page>.json` (mêmes clés), en suivant [docs/glossaire-traduction.md](docs/glossaire-traduction.md).
Contrôle : `npm run i18n:check` (mêmes clés, aucune valeur vide, valeurs identiques, textes restés en dur).

**Note pour les lecteurs anglophones :** la documentation et les commentaires du code sont en anglais, mais le code
lui-même (noms de fichiers, de dossiers, de fonctions et de variables) est en français, tel qu'écrit par l'équipe.

## Tests

```bash
npm test
```

**695 tests Vitest** (50 fichiers), relancés par GitHub Actions (Node 22, Ubuntu 24.04) à chaque envoi. D1 est
simulée par SQLite en mémoire avec les vraies migrations ; R2, Claude et les API publiques sont simulés.

- **Valorisation** : trois méthodes, passage VE → titres, cas limites (EBE négatif, comptes absents, un seul
  exercice, trésorerie nette, CMPC ≤ g, exercices incomplets écartés, réglages hors bornes). Deux cas de référence
  calculés indépendamment en Python : `scripts/reference-valorisation.py` (détail dans
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md)) et le scénario de [docs/DEMO.md](docs/DEMO.md).
- **Datapack** : un évaluateur de formules recalcule le classeur et le compare au moteur (il ne remplace pas une
  ouverture dans Excel).
- **Connexion et droits d'accès** : codes, sessions, accès refusé au dossier d'un autre, secret serveur exigé.
- **Sources publiques** : normalisation sur réponses réelles enregistrées (`test/fixtures/`), pannes 429 et 500 ;
  rapprochement des chiffres retenus avec les comptes publiés (`test/rapprochement-sources.test.js`).
- **Quotas** des traitements par Claude, anonymat du teaser, parcours guidé, contenus de la page d'accueil.
- **Accès et parcours** (24-25/11/2026) : aucun montant sans session, compte créé et ouvert par code, parcours en
  deux temps, pont de l'EBE à la valeur des titres (valeurs calculées à la main), validation et « à revalider »,
  file de dépôt des photos (`test/acces-par-code.test.js`, `test/valeur-pont.test.js`,
  `test/parcours-v2.test.js`, `test/depot-photos.test.js`, `test/dossier-exemple.test.js`).
- **Site bilingue** : mêmes clés dans les deux langues, aucune clé citée dans le code sans texte français, langue
  des requêtes, adresses `/fr/`, pluriels, lecture des montants saisis (`test/i18n.test.js`, `npm run i18n:check`).

Une part importante des tests porte sur la page d'accueil et son illustration (environ 140). Le nombre de tests ne
prouve pas à lui seul la justesse d'une méthode financière : voir [docs/decisions-methode.md](docs/decisions-methode.md).

## Contrôle des chiffres

Chaque preuve que les chiffres clés sont justes, avec la commande pour la lancer :

| Contrôle | Ce qu'il prouve | Commande |
|---|---|---|
| [scripts/reference-valorisation.py](scripts/reference-valorisation.py) | Référence Python indépendante du cas de test sur 3 ans (n'importe pas le code du site) ; valeurs attendues dans [docs/valorisation-calculs.md](docs/valorisation-calculs.md) | `python3 scripts/reference-valorisation.py` |
| [docs/DEMO.md](docs/DEMO.md) et [test/demo.test.js](test/demo.test.js) | Le moteur redonne les valeurs attendues de la démonstration (multiples, DCF, synthèse) et les formules du datapack redonnent le moteur | `npx vitest run test/demo.test.js` |
| [docs/verification-calcul.md](docs/verification-calcul.md) | Recalcul pas à pas de la ligne « EBITDA multiples » de DEMO.md, de la liasse à la valeur des titres : écart de 0 € | lire le document, puis `npx vitest run test/demo.test.js` |
| [test/rapprochement-sources.test.js](test/rapprochement-sources.test.js) | Rapprochement avec les comptes publiés : sur six vraies réponses enregistrées, le CA, l'EBE et le résultat net retenus par l'application sont exactement ceux publiés (même année, en euros) | `npx vitest run test/rapprochement-sources.test.js` |
| Évaluateur de formules du datapack ([src/documents/formules.js](src/documents/formules.js), testé dans [test/datapack.test.js](test/datapack.test.js)) | Le classeur Excel recalculé cellule par cellule redonne les résultats du moteur | `npx vitest run test/datapack.test.js` |
| [src/valuation/controles.js](src/valuation/controles.js) (testé dans [test/controles.test.js](test/controles.test.js)) | Contrôles de cohérence de la saisie : bilan équilibré, CA publié, unités, variations suspectes | `npx vitest run test/controles.test.js` |

## Équipe

Rôles décrits par les contributions visibles (pull requests fusionnées, revues). Chaque membre a des commits et des
pull requests sous son propre compte GitHub (`git shortlog -sne main` ; `gh pr list --state merged`). Les 42 pull
requests fusionnées ont toutes été relues et approuvées par un autre membre avant la fusion (47 revues d'approbation sur ces 42 pull
requests, au 27/11/2026).

| Membre | GitHub | Contributions (PR fusionnées) | Revues (PR fusionnées) |
|---|---|---|---|
| Eros Fragliola | [@Erosfragliola](https://github.com/Erosfragliola) | Propriétaire du dépôt et mise en ligne ; page d'accueil (#2, #4, #9, #11) ; une seule police sur le site (#34) ; corrections de cohérence du parcours (#36) ; finitions du mémorandum après avoir testé le site (#38, #41) ; fichier du modèle financier sur 36 mois (commit 8fd50bb, dans #42) | 23 |
| Maxime Parrinello | [@maximeparrinello-creator](https://github.com/maximeparrinello-creator) | Parcours avec une seule valeur et une seule liste d'étapes (#15) ; nettoyage du code mort (#17, #26) ; site bilingue, anglais par défaut (#27) ; partie modèle économique et prévisions à 3 ans du business plan (#42) | 1 |
| Victoire Jacob | [@Victoirejacob](https://github.com/Victoirejacob) | Correctifs d'audit et préparation du rendu EDHEC (#1) ; teaser anonyme (#12) ; direction artistique de l'espace (#13, #20) ; réparations de main après des fusions (#16, #24) ; mise en page du datapack (#25) ; en-têtes de sécurité et pages légales (#28) ; parcours d'analyse guidé (#29, #30) ; suite du site bilingue (#31) | 20 |
| Ethan Barris | [@eltigre13om](https://github.com/eltigre13om) | Mémorandum (#5, #35, #37) ; étapes illustrées de l'accueil (#7) ; page du dossier et parcours en 5 étapes (#8, #10) ; noms de code et correctifs d'audit (#14) ; réparations de main (#19, #23) ; dépôt des pièces (#21) ; une seule police dans les livrables (#33) ; parcours allégé (#43) | 3 |
| Mohamed Reda Aboualam | [@raboualam22](https://github.com/raboualam22) | Parcours v2 : compte sécurisé, valorisation d'abord, photos guidées, traduction anglaise (#39) ; connexion par code seul (#40) | 0 |

## Livrables (où les trouver)

| Exigence EDHEC | Où |
|---|---|
| Site en ligne | https://passation.eros-fragliola-freedom.workers.dev |
| Code | ce dépôt (`src/`, `public/`, `migrations/`) |
| Business plan | [docs/livrables/business-plan.pdf](docs/livrables/business-plan.pdf) (source : `business-plan.html`) |
| Modèle financier | [docs/livrables/business-plan-model.xlsx](docs/livrables/business-plan-model.xlsx) |
| Présentation | `docs/livrables/presentation.pptx` et `presentation.pdf` (ajoutés dans une PR séparée) |
| Usage de l'IA | [AI-USAGE.md](AI-USAGE.md) |
| Tests et contrôle des chiffres | [Tests](#tests) et [Contrôle des chiffres](#contrôle-des-chiffres) ci-dessus ; `npm test` |
| Variables d'environnement sans secret | [.env.example](.env.example) (mêmes noms que `.dev.vars.example`) |
| Scénario de démonstration | [docs/DEMO.md](docs/DEMO.md) |

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
| `docs/` | Démonstration, décisions de méthode, calculs de référence, livrables, maquettes en attente de choix, captures des audits passés (interface française) |

## Limites connues

- Le DCF n'est calculé qu'une fois la prime de taille renseignée (aucune source publique gratuite).
- Conventions à arbitrer : décotes appliquées à la valeur d'entreprise, crédit-bail compté dans la dette nette sans
  retraitement de l'EBE ([docs/decisions-methode.md](docs/decisions-methode.md)).
- Le datapack est vérifié par un évaluateur de formules interne, pas par Excel.
- Pages légales en brouillon (éditeur, contact et hébergement pas encore renseignés) ; suppression du compte non disponible.

## Mise en ligne (propriétaire du compte Cloudflare)

```bash
npx wrangler secret list                    # vérifier SESSION_SECRET (obligatoire), ANTHROPIC_API_KEY, BREVO_API_KEY…
npx wrangler secret put SESSION_SECRET      # idem pour les autres secrets manquants
npx wrangler d1 migrations apply passation --remote
npm run deploy
```

## Documentation et livrables

- [AI-USAGE.md](AI-USAGE.md) : usage de l'IA, contrôles humains, erreurs détectées.
- [docs/livrables/](docs/livrables/) : business plan, modèle financier sur 36 mois (`business-plan-model.xlsx`, trois
  scénarios) et état des livrables.
- [docs/verification-calcul.md](docs/verification-calcul.md) : recalcul pas à pas de la valorisation de démonstration.
- [docs/DEMO.md](docs/DEMO.md) : scénario de démonstration.
- [docs/decisions-methode.md](docs/decisions-methode.md) : conventions de valorisation à arbitrer.
- [docs/valorisation-calculs.md](docs/valorisation-calculs.md) : calculs de référence.
- [docs/glossaire-traduction.md](docs/glossaire-traduction.md) : glossaire de traduction du site (français → anglais).
- [PLAN.md](PLAN.md) : plan initial et journal de développement daté.
- [CLAUDE.md](CLAUDE.md) : règles données à l'assistant de code (Claude Code).
- [public/img/CREDITS.md](public/img/CREDITS.md) : crédits et licences des images et bibliothèques.

Les branches autres que `main` sont des étapes déjà fusionnées ou des archives (`archive/…`), conservées pour mémoire.
