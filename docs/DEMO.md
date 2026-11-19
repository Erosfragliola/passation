# Démonstration de Passation : scénario reproductible

Ce scénario utilise **uniquement des données fictives** pour les chiffres : la liasse
`test/fixtures/liasse-fictive.pdf` (« Atelier Exemple SAS », entreprise fictive, sans SIREN). Les valeurs attendues
sont vérifiées par `test/demo.test.js` et ont été calculées indépendamment (script Python sans import du code du site).

## Avant la démonstration (la veille)

1. Vérifier le site : `https://passation.eros-fragliola-freedom.workers.dev/api/health` doit répondre `{"ok":true}`.
2. Vérifier que l'envoi des codes de connexion fonctionne (secret `BREVO_API_KEY` en production) : demander un code.
   Sans Brevo, la connexion n'est possible qu'en local (`npm run dev`), où le code s'affiche dans le terminal.
3. Vérifier la clé Anthropic (lecture de la liasse, teaser, mémorandum). Sans clé, la saisie manuelle, la
   valorisation et le datapack fonctionnent ; la lecture de la liasse et les rédactions sont indisponibles (503).
4. **Préparer un dossier de secours** déjà rempli (session ouverte dans un second navigateur) et des captures
   d'écran : les API publiques peuvent répondre lentement ou refuser des requêtes (HTTP 429).
5. Choisir une entreprise active de l'industrie (section NAF C) pour l'estimation express. Le dossier qui lui sera
   rattaché contiendra des chiffres fictifs : ne pas diffuser ses documents et **supprimer le dossier après la
   démonstration** (Mon dossier → Supprimer).

## Déroulé (environ 5 minutes)

| Étape | Action | Ce qu'on montre |
|---|---|---|
| 1 | Accueil : saisir le SIREN ou le nom | Données publiques (annuaire, INPI, BODACC), fourchette express à partir de multiples sourcés |
| 2 | « Ouvrir mon dossier » : e-mail puis code à 6 chiffres | Connexion sans mot de passe, code haché, usage unique |
| 3 | Déposer `liasse-fictive.pdf` (ou saisir les montants ci-dessous) | Lecture par Claude **proposée**, jamais validée d'office ; contrôles automatiques (le CA diffère des comptes publiés de l'entreprise choisie : alerte attendue) |
| 4 | Confirmer les exercices 2024 et 2025 | Validation par le dirigeant ; un exercice incomplet est écarté du calcul et signalé |
| 5 | Valorisation | Multiples seuls, fourchette sans valeur centrale (décision du 19/11/2026) ; l'actif net corrigé en contrôle ; phrase qui explique l'écart avec l'estimation express |
| 6 | « Affiner » : EBE retenu, décotes et primes, Recalculer | Le DCF n'est plus affiché ni réglable à l'écran ; il reste calculé dans le datapack (onglet DCF) |
| 7 | Télécharger le datapack | 9 onglets, formules vivantes : modifier une cellule jaune recalcule tout |
| 8 | Teaser, mémorandum (si la clé Claude est active) | Rédaction à partir des seuls faits validés ; contrôle d'anonymat du teaser |

**La prime de taille de 3 % est une hypothèse de démonstration, pas une donnée sourcée.** Aucune source publique
gratuite n'a été trouvée (`src/data/hypotheses.json`, `prime_taille`) : c'est au dirigeant ou à son conseil de la
fixer et de la justifier. C'est pourquoi le DCF n'est pas calculé par défaut.

## Montants de la liasse fictive (en euros)

| Poste | 2024 | 2025 |
|---|---:|---:|
| Chiffre d'affaires | 2 200 000 | 2 400 000 |
| Achats consommés (achats + variation de stock) | 880 000 | 960 000 |
| Autres achats et charges externes | 320 000 | 340 000 |
| Impôts et taxes | 40 000 | 40 000 |
| Salaires et charges sociales | 640 000 | 680 000 |
| Dotations aux amortissements | 66 000 | 72 000 |
| Stocks / Clients | 180 000 / 370 000 | 200 000 / 400 000 |
| Disponibilités / Placements | 210 000 / 50 000 | 250 000 / 50 000 |
| Capitaux propres | 590 000 | 700 000 |
| Emprunts / Provisions pour risques | 340 000 / 20 000 | 300 000 / 20 000 |
| Fournisseurs / Dettes fiscales et sociales | 230 000 / 140 000 | 250 000 / 150 000 |

## Résultats attendus (valeur des titres, secteur industrie)

| | Basse | Centrale | Haute |
|---|---:|---:|---:|
| Multiples d'EBE (4 / 5,6 / 7 × EBE normatif 350 000) | 1 381 818 | 1 941 818 | 2 431 818 |
| DCF, prime de taille 3 % (CMPC 11,21 % ± 1 pt) | 2 530 797 | 2 819 933 | 3 180 021 |
| **Synthèse par défaut (multiples seuls)** | **1 381 818** | **1 941 818** | **2 431 818** |
| Synthèse avec le DCF en option à 40 % | 1 841 410 | 2 293 064 | 2 731 099 |
| Actif net comptable corrigé (plancher) | | 700 000 | |

Les multiples dépendent du secteur de l'entreprise choisie (`src/data/multiples.json`) : avec un autre secteur, les
chiffres diffèrent. Les prévisions du DCF viennent de l'historique (croissance 9,09 %, marge d'EBE 14,58 %,
amortissements et investissements 3 % du CA, BFR 30,14 jours).
