# Usage de l'intelligence artificielle dans Passation

Ce document distingue ce qui est **vérifiable dans le dépôt** (historique Git, fichiers, tests) de ce que l'équipe doit
confirmer elle-même, marqué **« À valider par l'équipe »**. Il a été préparé le 18/11/2026 avec l'aide de Claude Code et
doit être relu et complété par chaque membre du groupe avant la remise.

## 1. Outils d'IA utilisés

| Outil | Usage | Preuve dans le dépôt |
|---|---|---|
| **Claude Code** (Anthropic, modèle Claude Opus 5.5), assistant de programmation en terminal et dans VS Code | Écriture du code, des tests, de la documentation, audits | 77 des 78 commits de `main` au 18/11/2026 portent la mention `Co-Authored-By: Claude Opus 5.5` ; règles données à l'assistant dans [CLAUDE.md](CLAUDE.md) ; journal daté dans [PLAN.md](PLAN.md) |
| **API Claude** dans l'application : `claude-haiku-5-5` (lecture des liasses PDF et des sites), `claude-sonnet-5-5` (teaser, mémorandum, étude de marché par recherche web) | Fonctions du produit | `src/config.js`, `src/lib/claude.js` |
| Autres outils (ChatGPT, Copilot, outils de traduction, de visuels…) | À valider par l'équipe | — |

## 2. Méthode de travail avec Claude Code

- **Règles écrites** ([CLAUDE.md](CLAUDE.md)) : une étape de [PLAN.md](PLAN.md) à la fois, démonstration et accord avant
  l'étape suivante ; aucune donnée financière, aucun multiple ni aucune source inventés (« À compléter » sinon) ; les
  calculs sont du code testé et Claude ne calcule pas les valeurs ; secrets uniquement via `wrangler secret put`.
- **Plan puis étapes** : PLAN.md fixe l'architecture, le schéma, la méthode de valorisation et 8 étapes de
  livraison ; la section « Journal d'avancement » date chaque livraison et ses vérifications.
- **Décisions consignées** : la section « Décisions de l'utilisateur » de PLAN.md (sources des multiples, affichage des
  hypothèses, palette, nom) enregistre les choix faits par l'humain.
- **Audit puis correction** : le 18/11/2026, une session Claude Code a audité le dépôt (sans rien modifier), puis une
  seconde session a corrigé les anomalies démontrées sur une branche dédiée, soumise par Pull Request.
- Qui a piloté les sessions, relu les propositions et pris les décisions : **À valider par l'équipe** (le dépôt
  montre deux comptes GitHub : `Erosfragliola`, auteur des commits jusqu'au 18/11/2026, et `Victoirejacob`, auteur de
  la branche de correction `fix/rendu-edhec`).

## 3. L'IA dans le code, les tests et la documentation

- **Code** : Worker Cloudflare (`src/`), front sans framework (`public/`), schéma D1 (`migrations/`), écrits avec Claude
  Code (mention de co-auteur dans les commits).
- **Tests** : 356 tests Vitest au 18/11/2026, écrits avec Claude Code. Les valeurs attendues des valorisations ne sont
  pas recopiées depuis le code : elles viennent de deux calculs de référence écrits en Python, à part
  ([scripts/reference-valorisation.py](scripts/reference-valorisation.py),
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md), [docs/DEMO.md](docs/DEMO.md)). **Limite** : ces
  scripts ont aussi été écrits avec l'IA, sur les mêmes formules. Ils vérifient l'arithmétique, pas la méthode.
- **Documentation** : README, PLAN.md, docs/, écrits avec Claude Code.
- **Dans le produit**, l'IA ne fait que **lire et rédiger** :
  - les montants lus dans une liasse sont des propositions, jamais validées d'office (`src/routes/valorisation.js`) ;
  - le teaser passe un contrôle d'anonymat codé (`src/documents/anonymat.js`) et une version identifiante est refusée ;
  - un fait de marché n'est retenu que si son adresse figure parmi les pages réellement renvoyées par la recherche
    (`faitsSourcesVerifies`), puis le dirigeant le valide ;
  - les valeurs (multiples, DCF, ANCC, synthèse) sont calculées par `src/valuation/`, jamais par le modèle.

## 4. Vérifications humaines

Vérifiable dans le dépôt :
- suite de tests relancée par GitHub Actions à chaque envoi (`.github/workflows/tests.yml`) ;
- contrôles de cohérence automatiques des comptes (`src/valuation/controles.js`) ;
- vérifications consignées dans le journal de PLAN.md (captures, Lighthouse, axe-core, essais en ligne sur des SIREN
  réels).

À valider par l'équipe :
- quels calculs ont été refaits à la main ou dans Excel par un membre du groupe (multiples, CMPC, DCF, ANCC) ;
- quelles sources de `src/data/` ont été ouvertes et relues par un humain (multiples, taux BCE, Banque de France,
  Damodaran, service-public.fr) ;
- si le datapack a été ouvert et recalculé dans Excel ou Numbers ;
- quelles Pull Requests ont été relues, et par qui.

## 5. Erreurs d'IA détectées et corrigées

| # | Erreur | Comment elle a été détectée | Correction | Preuve |
|---|---|---|---|---|
| 1 | Le moteur comptait à 0 les charges manquantes d'un exercice incomplet : avec le seul CA de 1 000 000 € validé, EBE normatif de 1 000 000 € et valeur centrale de 5,6 M€ | Audit Claude Code du 18/11/2026 (cas limite reproduit) ; aucun des 323 tests existants ne le couvrait | Exercices incomplets écartés et signalés, même règle dans Excel, 8 tests (6 échouent sur l'ancien code) | Commit `Valorisation : exercices incomplets écartés (FIN-01)…`, `test/exercices-incomplets.test.js` |
| 2 | Un test écrit avec l'IA **figeait ce défaut** (attente de 700 000 € pour un exercice partiel) | Il a échoué après la correction | Attente corrigée et justifiée dans le test | `test/approfondie.test.js` |
| 3 | Réglages non bornés côté serveur : une décote de −150 % donnait une valeur des titres négative | Audit du 18/11/2026 | Validation et refus explicite (FIN-04) | `src/valuation/validation.js`, `test/validation.test.js` |
| 4 | Une panne de l'API des comptes devenait « comptes confidentiels », mise en cache 24 h | Audit du 18/11/2026 (lecture du code) | Panne propagée, rien en cache (FIN-06) | `test/sources-pannes.test.js` |
| 5 | Les API publiques refusaient les requêtes sans User-Agent une fois sur Cloudflare | Mise en ligne du 10/11/2026 (journal de PLAN.md) ; qui l'a constaté : À valider par l'équipe | En-tête générique ajouté | Commit `2b084e0` |
| 6 | Erreurs HTTP 429 de l'annuaire depuis les adresses IP partagées de Cloudflare | Mise en ligne du 10/11/2026 ; À valider par l'équipe | Nouvelles tentatives espacées | Commit `17982c0`, `src/lib/requete.js` |
| 7 | Documentation inexacte : 265 tests annoncés (323 réels), Node 20 annoncé alors que les tests exigent Node 22.13, « huit sections » au lieu de neuf | Audit du 18/11/2026 ; Node vérifié par des essais sous 20.18, 22.12 et 22.13 | README réécrit, `engines` dans package.json | README, `.nvmrc` |
| 8 | Le calcul Python présenté comme « indépendant » partageait les conventions du moteur | Audit du 18/11/2026 | Limite écrite ici et dans le README ; conventions à arbitrer dans [docs/decisions-methode.md](docs/decisions-methode.md) | — |
| 9 | Erreurs détectées par les membres du groupe eux-mêmes | **À valider par l'équipe** (au moins un exemple vécu est attendu par le cours) | | |

## 6. Limites de l'IA et décisions gardées sous contrôle humain

- **Méthode financière** : deux conventions sont à trancher par l'équipe (décotes sur la valeur d'entreprise ou sur les
  titres ; traitement du crédit-bail), chiffrées dans [docs/decisions-methode.md](docs/decisions-methode.md). L'IA ne
  les a pas changées.
- **Prime de taille** : aucune source publique gratuite trouvée ; l'IA n'a pas proposé de valeur par défaut, donc le
  DCF reste optionnel. La valeur de 3 % du scénario de démonstration est une hypothèse de démonstration.
- **Sources** : les sources de `src/data/` ont été rassemblées pendant les sessions assistées ; leur relecture humaine
  est À valider par l'équipe.
- **Usage d'une API payante** (Anthropic) au regard de la consigne « sources gratuites » : à valider avec le
  professeur.
- **Contenus juridiques** (mentions légales, CGU, confidentialité) : brouillons, à faire relire par un professionnel.
- **Contributions** : aucune contribution, coautorat ou relecture n'a été créé artificiellement ; chaque membre
  contribue sous son propre compte GitHub.
- **Limites observées** : l'IA peut écrire des tests qui confirment son propre défaut (erreur 2), présenter comme
  indépendant un calcul qui ne l'est pas (erreur 8) et laisser la documentation dériver du code (erreur 7). D'où les
  contrôles : calculs de référence séparés, tests de non-régression qui échouent sur l'ancien code, audits relus par
  un humain.
