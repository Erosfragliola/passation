# Refonte de la landing : rapport final (12 et 13/11/2026)

Brief : `_refonte/PROMPT-CLAUDE-CODE.md` (kit non versionné). Branche `refonte-landing`, partie de `main`, une phase
par commit. Mise en ligne le 13/11/2026 avec l'accord du dirigeant : fusion dans `main`, push, déploiement Cloudflare.

## Ce qui a été fait

| Phase | Commit | Contenu |
|---|---|---|
| 2. Fondations | `c25d226` | Textes dans `src/contenu/landing.json`, posés par le Worker (HTMLRewriter) ; une clé vide retire l'élément. `landing.css`, Instrument Serif italique, typographie française automatique. Plus de 3D ni de « À remplir ». |
| 3. Hero et champ | `cff29ce` | Champ SIREN partagé (hero, barre du haut, barre fixe du bas, relance), suggestions « Ville (dép.) · créée en AAAA · tranche INSEE », clé de Luhn. Vidéo : playlist prête, bouton pause. Intro du seuil (2,4 s, une fois par session). |
| 4. Histoire des clés | `51b6be0` | Scène collante 1920 × 1080 portée du prototype (constantes inchangées, fonctions pures testées), sprites, étiquettes retournées en 3D, ficelles, dossier et onglets ; trois panneaux sur téléphone, tablette et en mouvement réduit. |
| 5. Sections statiques | `68caf06` | Comment ça marche, Confidentialité, Tarifs (masquée sans prix), Parti pris (vidéo de l'artisan), Questions, relance, pied de page. |
| 6. Et la vôtre ? | `efd7b4c` | Démo du nom de code sur l'exemple fictif (nom, bandeaux, tampon, teaser, première valeur), puis « Personne ne saura… ». |
| 7. Résultat | `fa73ee2` | Nom de code (code NAF), fourchette, méthode réelle, teaser anonyme, comptes confidentiels sur le même écran, trois suites, erreurs. |
| 8. Recette | ce commit | Mesures ci-dessous, tampon chargé seulement quand il sert, rapport. |

## Vérifications (Chrome 157 sans interface, Apple M3, serveur local)

| Contrôle | Résultat |
|---|---|
| Tests (`npm test`) | 261 réussis |
| axe-core (WCAG 2.2 AA + bonnes pratiques), 1440 et 390 px, mouvement normal et réduit | 0 violation |
| Clavier | 25 arrêts dans l'ordre de lecture, aucun piège ; focus visible (anneau du champ sur son conteneur) |
| Lighthouse mobile (performance / accessibilité / bonnes pratiques / SEO) | 99 / 100 / 100 / 100 |
| LCP / CLS / TBT | 1,3 s / 0 / 0 ms (budgets : 2,5 s / 0,1) |
| Poids initial hors vidéo | 532 Ko ordinateur, 438 Ko mobile (budget 1,2 Mo) ; aucun three.js |
| Défilement de l'histoire (ordinateur) | 16,7 ms par image en moyenne, 95e centile 16,7 ms, aucune tâche longue |
| Parcours SIREN | comptes publics, comptes confidentiels (réponse simulée), recherche par nom, SIREN invalide, société introuvable, registre en panne : messages du brief |
| Non-régression | « Garder mon estimation » → code (mode développement) → `/espace/demarrer/` du bon dossier ; suppression du dossier et déconnexion ; pages légales et 404 inchangées |

## Captures (`docs/refonte/`)

`01-intro`, `02-hero`, `03-champ-dans-la-barre`, `04-histoire-p15`, `05-histoire-p50`, `06-histoire-p90`,
`07-et-la-votre`, `08-resultat-comptes-publics`, `09-resultat-comptes-confidentiels`, et en 390 px : `10-mobile-hero`,
`11-mobile-barre-du-bas`, `12-mobile-histoire-panneau-2`, `13-mobile-et-la-votre`, `14-mobile-resultat`.

Comparées aux images clés du kit : mêmes compositions. Différences voulues : logo du seuil (et non une maison),
petits intitulés en minuscules à 17 px (règle typographique du brief), chapitres alignés sur le mémo réel,
ancienneté par paliers, secteur au niveau de la division NAF.

## À me fournir

- `prix_dossier` (sans lui : section Tarifs, lien et question « Combien ça coûte ? » masqués) ;
- `fondateur_nom`, `fondateur_photo`, `fondateur_texte` (trois lignes) ;
- `telephone`, `contact` (adresse e-mail), `hebergement` (phrase « Vos données sont hébergées … ») ;
- `partenaires` (réels) ;
- `videos_metiers` : clips de 1,5 à 2 s `{ mp4, webm, poster, metier }`, et `mp4_720` / `webm_720` pour le téléphone ;
- l'écriture manuscrite réelle des 9 mots des étiquettes (la police n'est qu'un dépannage) ;
- validation des réponses FAQ 3, 5 et 8 (rédigées d'après le code) et de la réponse 7 (dépend du prix) ;
- validation des règles de nom de code (`src/data/noms-de-code.json`, proposition du brief).

## Écarts entre le brief et le produit (décidés le 12/11/2026)

- 9 chapitres alignés sur le mémo réel (Synthèse, Histoire, Savoir-faire, Clients, Équipe, Comptes, Atouts,
  Opération, Valeur) : Contrats, Actifs et Locaux n'existent pas dans le produit.
- « Un expert à qui parler » retiré : le chat n'est pas construit (et serait une IA). « 5 outils ».
- « Deux chiffres suffisent » (CA et EBE) ; l'effectif ne sert pas au calcul. Badge « environ 20 minutes » retiré.
- Une seule méthode en express (multiples de l'EBE), affichée en liste, avec la mention des deux autres méthodes
  dans l'estimation approfondie.
- Suites : « Garder mon estimation » (connexion par code) au lieu d'un envoi par e-mail ; « Inviter mon
  expert-comptable » ouvre un e-mail prérempli sans aucune donnée (aucun partage n'existe encore).
- Nom de code tiré du code NAF seulement (repli par empreinte du code NAF, jamais du SIREN) et repris par le teaser
  du dossier.
- Confidentialité garde son titre « Vos chiffres restent les vôtres » (« Personne ne saura… » est juste au-dessus).
- Le champ passe dans la barre quand il sort de l'écran : au demi-écran il est encore visible (capture à 0,8 écran).
- Chute des clés jouée jusqu'à t = 8,2 (et non 7,7) pour qu'aucune clé ne reste en l'air.
- Textes imprimés des étiquettes sous 14 px à l'écran (scène mise à l'échelle) : décoratifs, contenu repris en
  texte accessible.
- Polices du tampon et de l'écriture : woff2 complets (encodeur local `scripts/polices-landing.mjs`), sans
  sous-ensemble. Aucune police ne contient l'espace fine U+202F : le navigateur la prend dans une police système.
- Fourchettes sous 1 M€ en k€ (« 150 – 230 k€ »).
- Libellés de division NAF : INSEE, NAF rév. 2 ; la NAF 2025 entre en vigueur le 1er janvier 2027 (à mettre à jour).

## Pour modifier un texte

Éditer `src/contenu/landing.json` (espaces simples : la typographie est corrigée à l'affichage ; `*mot*` pour
l'italique ; une valeur vide masque l'élément), puis redéployer.
