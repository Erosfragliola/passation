# PASSATION : règles pour l'assistant

Plateforme web pour le dirigeant de PME française qui prépare la cession de son entreprise : valorisation express
(landing, SIREN ou nom), valorisation approfondie, datapack Excel, teaser anonymisé, info memo, ressources, chat IA.
Le détail (architecture, schéma, routes, méthode, étapes) est dans `PLAN.md` : le lire en début de session.

## Langue
Répondre en français, au vouvoiement dans l'interface. Commits en français.

## Périmètre
- Travailler **uniquement** dans `~/Desktop/PROJETS/PASSATION/app` (déplacé le 17/11/2026). Ne jamais lire, modifier
  ni créer quoi que ce soit dans les autres dossiers de `~/Desktop/PROJETS` (FREEDOM, CARROSSERIE-AUGIAS, MV-IMMO,
  POISSONNERIE-MARIO, AUTRES). Ne réutiliser ni leur D1, ni leur R2, ni leurs secrets, ni leur Worker.
- Une étape de `PLAN.md` à la fois. Montrer le résultat et attendre l'accord avant l'étape suivante.
- Si c'est ambigu, coûteux ou difficile à défaire : demander avant d'agir.

## Stack
- Cloudflare Workers : API dans `src/`, front statique vanilla JS dans `public/` (`[assets]`, `run_worker_first = ["/api/*"]`).
- D1 `passation` (migrations dans `migrations/`), R2 `passation-fichiers`.
- Modèles centralisés dans `src/config.js` : `claude-sonnet-5-5` (approfondie, memo, teaser, chat), `claude-haiku-5-5`
  (commentaire express, extraction de chiffres). Limites d'usage dans la même constante.
- Brevo : uniquement codes de connexion et notifications.
- Dépendance nouvelle : seulement si nécessaire et compatible Workers.
- Données publiques : recherche-entreprises, ratios INPI/BCE, BODACC, cache D1 24 h. Normalisation fondée sur les
  réponses réelles.

## Secrets
- Uniquement via `npx wrangler secret put` (saisie par l'utilisateur dans le Terminal) et `.dev.vars` en local.
  `.dev.vars.example` sans valeurs.
- Ne jamais demander de coller une clé dans la conversation ; aucune clé dans un fichier suivi, une commande affichée
  ou un commit. Ne jamais lire ni afficher `.dev.vars`.
- Avant chaque push : `git grep -iE "sk-ant|api[_-]?key\s*=|secret\s*="` doit être vide.

## Données et contenus
- N'inventer aucune donnée financière, aucun multiple, aucune règle fiscale, aucune source : vérifier et citer
  (avec date), sinon marquer « À compléter ».
- `src/data/multiples.json` : chaque ligne a une source et une date ; champ vide si pas de source fiable.
- Les calculs de valorisation sont du code testé ; Claude commente et rédige, il ne calcule pas.
- Teaser anonymisé (ni nom, ni ville précise, ni chiffre identifiant). Info memo : section sans donnée = « À compléter ».
- Pas de faux témoignages, faux logos clients ni faux chiffres : emplacements « À remplir ».
- Direction artistique : s'inspirer, ne rien copier (texte, logo, nom, photo, visuel). Illustrations SVG originales.

## Sécurité et RGPD
- Connexion par code à 6 chiffres : usage unique, 10 min, 5 essais, stocké haché (sel + secret serveur). Cookie de session `HttpOnly; Secure; SameSite=Lax`.
- Chaque route privée vérifie que le dossier appartient à l'utilisateur connecté.
- Données du dirigeant envoyées uniquement à l'API Claude, pour le traitement demandé.
- Suppression du dossier et des fichiers R2 en un clic. Limite de débit sur la valorisation express.

## Qualité
- `npm test` à chaque étape, au minimum : les trois méthodes, le passage VE → valeur des titres, les cas limites
  (EBE négatif, comptes absents). Valeurs attendues calculées à la main, pas recopiées depuis le code.
- `npx wrangler dev` et vérification dans le navigateur avant de dire que ça marche.
- Commit + push à la fin de chaque étape testée. Dépôt GitHub **privé**.

## Fin de session
Dire ce qui marche, ce qui reste à faire, et ce que l'utilisateur doit faire de son côté.
