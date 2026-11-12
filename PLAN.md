# PASSATION : plan du projet

> Statut : **validé le 10/11/2026**. Étape 1 livrée (voir §10).
> Projet indépendant : aucun lien avec `~/Desktop/FREEDOM`.

## Décisions de l'utilisateur (10/11/2026)
- **Sources** : je recherche les multiples, décotes et paramètres. Les sources sont citées **dans le code**
  (`src/data/*.json`, avec URL et date de consultation), **pas affichées sur le site**.
- **DCF** : les paramètres trouvés sont affichés au dirigeant comme **« Hypothèses Passation »**, modifiables champ par
  champ. Si rien de fiable n'est trouvé, le champ est vide et le dirigeant le renseigne.
- **Palette (DA v2, remplace la v1)** : crème `#FBF6EC`, espresso `#231E18`, sable `#EADFCB`, pierre `#8A7F70`,
  vert `#1E3A2E`, cuivre `#A8653A` (le témoin, jamais en texte), cuivre clair `#E9C9A4` (italique sur fond sombre).
- **Nom** : Passation, pour l'instant.

---

## 1. Ce que les API publiques renvoient vraiment (testé le 10/11/2026, SIREN 434436622)

| Source | Ce qu'on obtient | Limites constatées |
|---|---|---|
| `recherche-entreprises.api.gouv.fr/search?q=` | nom, NAF (`activite_principale`, et `activite_principale_naf25`), catégorie (PME…), tranche d'effectif, adresse du siège, date de création, dirigeants (nom, qualité, année de naissance), `finances: {"2024": {ca, resultat_net}}` | recherche par nom : plusieurs homonymes (3 « HABI PRO »), donc l'autocomplétion doit afficher ville + SIREN |
| `data.economie.gouv.fr … ratios_inpi_bce/records?where=siren="…"` | par exercice : `chiffre_d_affaires`, `marge_brute`, `ebe`, `ebit`, `resultat_net`, ratios (`taux_d_endettement`, `autonomie_financiere`, `poids_bfr_exploitation_sur_ca_jours`, délais clients/fournisseurs/stocks…), `confidentiality` | **pas de montant** de trésorerie, de dettes ni de capitaux propres ; **exercices manquants** (ici 2022 et 2023 absents) |
| `bodacc-datadila…/annonces-commerciales/records?where=registre like "…"` | annonces : `familleavis_lib` (dépôts des comptes, procédures collectives, ventes et cessions, modifications), date, tribunal | champ `listepersonnes` en JSON encodé dans une chaîne, à décoder |

Conséquences pour le produit :
- La valorisation express donne une **valeur d'entreprise** (VE). La valeur des titres demande la dette nette, que seul le dirigeant peut fournir : la page le dit et renvoie vers la valorisation approfondie.
- On affiche toujours **l'exercice** utilisé (« comptes 2024 »), et on signale s'il date de plus de 2 ans.
- Si `confidentiality` n'est pas `Public` ou s'il n'y a aucun exercice : message clair (« Vos comptes ne sont pas publiés ») et petit formulaire CA / EBE saisis par le dirigeant.
- Si une procédure collective apparaît au BODACC, on l'affiche comme point d'attention.

---

## 2. Architecture

```
Navigateur (HTML + CSS + JS vanilla, public/)
        │  fetch /api/*
        ▼
Cloudflare Worker (src/)  ── run_worker_first = ["/api/*"], le reste est servi par [assets]
   ├── D1  « passation »            : utilisateurs, sessions, dossiers, chiffres, valorisations, chat, cache API, limites
   ├── R2  « passation-fichiers »   : liasses importées, .xlsx / .docx générés
   ├── API Claude                   : extraction PDF, commentaires, rédaction, chat (streaming)
   ├── Brevo                        : e-mails du code de connexion et notifications
   └── API publiques (sans clé)     : recherche-entreprises, ratios INPI, BODACC
```

Organisation des fichiers :

```
PASSATION/
├── CLAUDE.md, PLAN.md, README.md, .gitignore, .dev.vars.example
├── wrangler.toml, package.json, vitest.config.js
├── migrations/0001_init.sql, 0002_…
├── content/                    fiches Markdown (ressources), modifiables sans code
├── scripts/build-content.mjs   transforme content/*.md en src/data/content.json (un Worker ne lit pas de dossier)
├── public/                     front : index.html, espace/, ressources/, css/, js/, fonts/, img/ (SVG originaux)
├── src/
│   ├── index.js                routeur
│   ├── config.js               MODELS, CHAT_LIMITS, EXPRESS_RATE_LIMIT, durées (constantes uniques)
│   ├── routes/                 company.js, express.js, auth.js, dossier.js, valuation.js, documents.js, chat.js, files.js
│   ├── lib/                    claude.js, brevo.js, auth.js (cookies, HMAC), cache.js, ratelimit.js, sources.js (normalisation)
│   ├── valuation/              logique pure, testée : normalize.js, multiples.js, dcf.js, anc.js, bridge.js, adjustments.js, synthesis.js
│   ├── documents/              xlsx.js, docx.js, prompts/ (teaser, memo)
│   └── data/multiples.json, content.json
└── test/                       tests vitest (calculs d'abord)
```

Choix techniques à vérifier pendant le développement (étape indiquée) :
- **Import de liasse PDF** (étape 4) : l'API Claude lit directement un PDF envoyé en base64. Pas de bibliothèque PDF à installer.
- **Excel** (étape 5) : je testerai `exceljs` dans un Worker avec `nodejs_compat`. S'il ne fonctionne pas, j'écris le fichier .xlsx moi-même (c'est un zip de XML) avec `fflate`, petite bibliothèque compatible Workers. Les deux permettent les formules vivantes et les styles. SheetJS est écarté : sa version gratuite ne gère pas les couleurs.
- **Word** (étape 6) : la bibliothèque `docx` (pur JavaScript) est le candidat ; je vérifierai qu'elle tourne dans un Worker.
- **PDF** (étape 6) : générer un PDF mis en page dans un Worker est fragile. Je propose une **vue HTML prête à imprimer** (CSS `@media print`, bouton « Enregistrer en PDF »). Le rendu par navigateur de Cloudflare (Browser Rendering) est une option payante, écartée sauf demande.
- **Liens signés** : le Worker signe une URL `/api/files/:id?exp=…&sig=…` (HMAC avec `SESSION_SECRET`, validité 10 minutes) et lit le fichier dans R2. Pas besoin de clés R2 supplémentaires.
- **Limite de débit** de la valorisation express : compteur dans D1 par empreinte d'IP (hachée, jamais l'IP en clair) et par heure.
- **Tests** : `vitest` sur les modules de calcul (purs, sans Cloudflare). Tests des routes avec `@cloudflare/vitest-pool-workers` à partir de l'étape 3 (droits d'accès, 401).
- **Polices** auto-hébergées : Geist (titres et texte, avec italique) et Geist Mono (étiquettes), licence SIL Open Font, fichiers .woff2 dans `public/fonts/` (choix utilisateur du 10/11/2026).

Dépendances prévues : `wrangler`, `vitest` (dév.) ; `exceljs` ou `fflate`, `docx`, `marked` (Markdown → HTML, au build seulement). Rien d'autre sans accord.

---

## 3. Schéma de la base D1

```sql
users            (id TEXT PK, email TEXT UNIQUE, created_at, last_login_at)
login_codes      (id PK = sel, email, code_hash, created_at, expires_at, attempts, used_at) -- code 6 chiffres, 10 min, 5 essais, empreinte salée + secret
sessions         (id_hash TEXT PK, user_id FK, expires_at, created_at)          -- cookie HttpOnly Secure SameSite=Lax
dossiers         (id TEXT PK, user_id FK, siren, company_json, code_name,
                  status, created_at, updated_at)
answers          (dossier_id FK, step TEXT, data_json, updated_at, PK(dossier_id, step))   -- questionnaire, sauvegarde auto
financials       (dossier_id FK, year INT, field TEXT, value REAL,
                  source TEXT CHECK IN ('inpi','dirigeant','liasse'),
                  validated INT DEFAULT 0, PK(dossier_id, year, field))       -- chaque chiffre extrait doit être validé
adjustments      (id PK, dossier_id FK, kind TEXT, label, amount REAL, justification)  -- retraitements EBE, décotes/primes
valuations       (id PK, dossier_id FK NULL, kind TEXT CHECK IN ('express','approfondie'),
                  inputs_json, result_json, commentary, created_at)
uploads          (id PK, dossier_id FK, r2_key, filename, mime, size, extracted_json, created_at)
documents        (id PK, dossier_id FK, kind TEXT CHECK IN ('datapack','teaser','memo'),
                  version INT, r2_key, created_at)
document_sections(document_id FK, section_key, content_md, edited_by_user INT, updated_at, PK(document_id, section_key))
checklist        (dossier_id FK, item_key, done INT, updated_at, PK(dossier_id, item_key))
chat_messages    (id PK, dossier_id FK, role, content, tokens_in, tokens_out, created_at)
usage_daily      (user_id FK, day TEXT, messages INT, tokens INT, PK(user_id, day))
api_cache        (key TEXT PK, payload_json, fetched_at)                        -- 24 h
rate_limits      (bucket TEXT PK, count INT, window_start)                      -- valorisation express publique
```

Suppression du dossier (un clic) : effacement en cascade de toutes les lignes du dossier **et** des objets R2 associés, puis de l'utilisateur s'il le demande.

---

## 4. Pages et routes API

### Pages (front statique)

| URL | Contenu | Connexion |
|---|---|---|
| `/` | landing : hero avec champ SIREN/nom, chiffres clés, comment ça marche, boîte à outils, confidentialité, FAQ, pied de page | non |
| `/estimation?siren=…` | résultat de la valorisation express | non |
| `/connexion` | saisie e-mail → « vérifiez votre boîte » | non |
| `/espace/` | tableau de bord : checklist, valorisation actuelle, documents | oui |
| `/espace/valorisation` | questionnaire en étapes, import liasse, validation des chiffres, résultat (football field) | oui |
| `/espace/documents` | datapack, teaser, info memo : générer, relire, modifier, régénérer une section, télécharger | oui |
| `/espace/chat` | chat « Expert cession » | oui |
| `/ressources/`, `/ressources/:slug` | bibliothèque par étape | non |
| `/confidentialite`, `/mentions-legales`, `/cgu` | brouillons « À compléter » | non |

### Routes API

| Méthode et route | Rôle | Accès |
|---|---|---|
| `GET /api/company/search?q=` | autocomplétion (cache 24 h) | public |
| `GET /api/company/:siren` | fiche + exercices INPI + annonces BODACC normalisés | public |
| `POST /api/express` | valorisation express + commentaire Haiku | public, limité en débit |
| `POST /api/auth/request` | envoie un code à 6 chiffres (réponse identique que l'e-mail existe ou non) | public, limité |
| `POST /api/auth/code` | vérifie le code (5 essais), crée la session et le dossier du SIREN, renvoie la destination | public, limité |
| `POST /api/auth/logout`, `GET /api/me` | session | privé |
| `GET/POST /api/dossiers`, `GET/DELETE /api/dossiers/:id` | dossier (suppression complète) | privé + propriétaire |
| `GET/PUT /api/dossiers/:id/answers/:step` | questionnaire, sauvegarde auto | privé + propriétaire |
| `GET/PUT /api/dossiers/:id/financials` | chiffres par exercice, validation | privé + propriétaire |
| `POST /api/dossiers/:id/uploads` | import PDF → R2 → extraction Haiku → chiffres « à valider » | privé + propriétaire |
| `POST /api/dossiers/:id/valuation` | calcul des 3 méthodes + justification Sonnet | privé + propriétaire |
| `PUT /api/dossiers/:id/checklist/:item` | checklist | privé + propriétaire |
| `POST /api/dossiers/:id/documents/:kind` | génère datapack / teaser / memo | privé + propriétaire |
| `PUT /api/documents/:id/sections/:key`, `POST …/regenerate` | modifier / régénérer une section | privé + propriétaire |
| `GET /api/documents/:id/link` | lien signé 10 min | privé + propriétaire |
| `GET /api/files/:id?exp&sig` | téléchargement depuis R2 | signature valide |
| `GET /api/resources` | liste des fiches | public |
| `POST /api/dossiers/:id/chat` (SSE), `GET …/chat` | chat en streaming, historique | privé + propriétaire, quota |

Toutes les routes privées passent par un même contrôle : session valide **et** `dossiers.user_id = utilisateur connecté`, sinon 401 ou 404.

---

## 5. Méthode de valorisation

Tout le calcul est du **code déterministe testé**. Claude ne calcule jamais : il commente et rédige à partir des résultats.

### 5.1 Valorisation express
1. Dernier exercice publié (CA, EBE). Exercice affiché.
2. Multiples du secteur lus dans `multiples.json` selon le code NAF (division à 2 chiffres, sinon section).
3. EBE > 0 : VE = EBE × multiple (bas / central / haut), recoupée par CA × multiple de CA.
   EBE ≤ 0 ou absent : seule l'approche par le CA est possible ; fourchette élargie et avertissement.
   Comptes non publiés : demande du CA et de l'EBE au dirigeant.
   **Secteur sans multiple sourcé : pas de chiffre affiché**, message « référence sectorielle à compléter ».
4. Résultat : VE basse / centrale / haute, multiples retenus et leur source, commentaire Haiku de 3 à 4 lignes, mention « Estimation indicative, non contractuelle ».

### 5.2 Valorisation approfondie
1. **EBE retraité** = EBE comptable
   + (rémunération réelle du dirigeant − rémunération normative d'un directeur salarié, charges comprises)
   + (loyer intragroupe payé − loyer de marché)
   ± éléments exceptionnels (montant + justification pour chacun).
   **EBE normatif** : par défaut moyenne des 3 derniers exercices retraités ; le dirigeant peut choisir le dernier exercice. Le choix est affiché.
2. **BFR normatif** = moyenne des BFR d'exploitation (stocks + créances clients − dettes fournisseurs − dettes fiscales et sociales d'exploitation) sur les exercices disponibles, en jours de CA.
3. **Dette nette** = dettes financières (emprunts, crédit-bail retraité, comptes courants d'associés remboursables) − trésorerie − placements, + éléments assimilés à de la dette (provisions pour risques, dividendes votés non versés, impôt dû hors exploitation).
4. **Méthode 1 : multiples** — VE = EBE normatif × multiple d'EBE ; recoupement VE = CA × multiple de CA.
5. **Méthode 2 : DCF simplifié sur 5 ans** — flux = EBIT × (1 − taux d'IS) + amortissements − investissements − variation du BFR ; valeur terminale de Gordon-Shapiro (flux N+5 × (1+g) / (CMPC − g)) ; actualisation au CMPC. Hypothèses saisies par le dirigeant avec des valeurs par défaut **sourcées** (taux sans risque, prime de marché, prime de taille) ; tant qu'elles ne le sont pas, champ « À compléter ». Garde-fou : erreur si CMPC ≤ g.
6. **Méthode 3 : actif net comptable corrigé (ANCC)** — capitaux propres + plus-values latentes déclarées (immobilier, fonds de commerce) − actifs sans valeur (frais d'établissement, créances douteuses) ; donne directement une valeur des titres.
7. **Décotes et primes** sur la valeur issue des multiples et du DCF : dépendance au dirigeant, concentration clients, récurrence du chiffre d'affaires, croissance, taille. Chaque facteur a une note (faible / moyen / fort) et un pourcentage **réglable**, accompagné d'une justification écrite. Les pourcentages par défaut seront sourcés ou laissés « À compléter ».
8. **Passage VE → valeur des titres** = VE − dette nette ± (BFR réel − BFR normatif) + actifs hors exploitation (trésorerie excédentaire, immobilier non utilisé).
9. **Synthèse** : fourchette par méthode, graphique « football field ». **Valeur centrale = multiples (méthode principale) et DCF (recoupement), pondérés 60 / 40 par défaut et modifiables ; l'ANCC est présenté à part comme valeur plancher** (décision du 10/11/2026, remplace la moyenne à poids égaux). Justification rédigée par Sonnet, **sensibilités** : multiple ± 1×, CMPC ± 1 point, croissance terminale ± 0,5 point.

### 5.3 Cas limites couverts par les tests
EBE négatif ou nul ; comptes absents ou confidentiels ; un seul exercice ; dette nette négative (trésorerie nette) ; CMPC ≤ g ; capitaux propres négatifs ; secteur sans multiple ; exercices non consécutifs.

### 5.4 Multiples sectoriels : **à compléter par vous**
`src/data/multiples.json` contiendra une ligne par secteur avec `naf`, `ebe_bas/central/haut`, `ca_bas/central/haut`, `source`, `date_source`, `perimetre` (taille d'entreprise). **Je n'y mettrai aucun chiffre non sourcé.** Pistes de sources à examiner ensemble (je n'en ai encore vérifié aucune) :
- Argos Index (Epsilon Research) : multiples médians des transactions non cotées en zone euro, publication trimestrielle, mais pas par secteur fin ;
- Damodaran (NYU, jeux de données « Europe ») : multiples VE/EBITDA par secteur, gratuits et datés, mais sur des sociétés cotées (une décote de taille serait nécessaire) ;
- barèmes professionnels pour les fonds de commerce (commerce, restauration, pharmacie…), à citer précisément ;
- vos propres références de cabinet, si vous en avez.

Tant que le fichier est vide pour un secteur, la valorisation express affiche « référence à compléter » au lieu d'un chiffre. **C'est le point qui bloque l'étape 2 : il me faut votre choix de source.**

### 5.5 Règles fiscales à vérifier (étape 7 et DCF)
Taux d'IS (normal et réduit PME), abattements sur plus-values de cession, départ à la retraite (art. 150-0 D ter CGI), apport-cession (150-0 B ter), pacte Dutreil (787 B) : chaque règle sera vérifiée sur impots.gouv.fr, service-public.fr ou Légifrance, citée et datée. Rien de mémoire.

---

## 6. IA : modèles et garde-fous

`src/config.js` :
```js
export const MODELS = { deep: "claude-sonnet-5-5", fast: "claude-haiku-5-5" };
export const CHAT_LIMITS = { messagesParJour: 30, tokensParJour: 150_000 };   // à ajuster
export const EXPRESS_RATE_LIMIT = { parHeureParIP: 10 };                       // à ajuster
```
- Haiku : commentaire express, extraction des chiffres d'une liasse (sortie JSON, puis validation ligne à ligne par le dirigeant).
- Sonnet : justification de la valorisation, teaser, info memo, chat.
- Teaser : anonymisation vérifiée par du code après génération (le nom, la ville, le SIREN et les montants exacts ne doivent pas apparaître ; sinon nouvelle génération ou blocage).
- Info memo : section sans donnée → « À compléter », jamais inventée.
- Chat : prompt système limité au domaine, données du dossier + fiches de la bibliothèque, citation des fiches utilisées, renvoi vers un avocat, un expert-comptable ou un conseil M&A pour toute question engageante.

---

## 7. Étapes de livraison

| # | Étape | Contenu | Vérification |
|---|---|---|---|
| 1 | Squelette et landing | Git + dépôt privé GitHub, wrangler.toml, migration 0001, landing statique complète (DA, SVG originaux, FAQ, emplacements « À remplir »), pages légales en brouillon | `npm test` (test fumée), `wrangler dev`, contrôle visuel mobile et bureau |
| 2 | Recherche et valorisation express | autocomplétion, normalisation des 3 API, cache 24 h, calcul express, commentaire Haiku, limite de débit, page résultat | tests calcul + normalisation (sur réponses réelles enregistrées), essai sur 434436622 |
| 3 | Comptes et espace dirigeant | code de connexion Brevo (fenêtre sur la landing), sessions, contrôle de propriété, tableau de bord, checklist, suppression du dossier | tests 401 / accès à un dossier d'autrui, parcours complet |
| 4 | Valorisation approfondie | questionnaire en étapes, import PDF + validation, retraitements, 3 méthodes, décotes, VE → titres, football field, sensibilités | tests des 3 méthodes, du passage VE → titres et des cas limites, avec valeurs attendues calculées à la main |
| 5 | Datapack Excel | 9 onglets, formules vivantes, mise en forme | ouverture dans Excel/Numbers, recalcul identique au moteur |
| 6 | Teaser et info memo | génération, relecture, édition, régénération par section, .docx + vue imprimable, R2, liens signés | contrôle d'anonymisation automatisé, liens expirés refusés |
| 7 | Ressources et chat | fiches Markdown sourcées et datées, chat en streaming, historique, quotas | tests quotas, essai de questions hors domaine |
| 8 | Mise en ligne | D1, R2, secrets saisis par vous, deploy, contrôle final | landing, express sur 434436622, 401 sur routes privées |

Chaque étape : commit en français, contrôle anti-secret (`git grep`), push, démonstration, puis votre accord avant la suivante.

---

## 8. Coûts à connaître
- Cloudflare Workers, D1, R2 : offres gratuites suffisantes pour démarrer.
- Brevo : offre gratuite (nombre d'e-mails par jour limité) ; l'adresse d'expédition doit être validée chez Brevo.
- API Claude : **payante à l'usage**. La valorisation express publique est le principal risque de coût, d'où la limite de débit et le cache. Un plafond de dépense mensuel est à régler dans la console Anthropic.

## 9. Points à compléter par vous (suivi)
- [x] Multiples sectoriels : croisement de trois sources décidé par l'utilisateur le 10/11/2026 (Argos Q2 2026,
      Dealsuite/Fusac 2026 via Capital Stack, barème Captain 2026, niveaux relatifs Damodaran Europe 01/2026).
      Entrées citées : `src/data/multiples-sources.json` ; calcul : `npm run multiples`. Agriculture et « autres » :
      fourchette dérivée (pas de ligne de barème). Pas de multiple de CA.
- [x] Décotes/primes et paramètres du CMPC : je recherche ; affichés comme hypothèses modifiables (étape 4)
- [x] Palette : fournie (voir en tête)
- [ ] Textes « À remplir » : partenaires/témoignages réels, tarifs, éditeur des mentions légales, contact, droit applicable
- [ ] Adresse d'expédition Brevo (étape 3)

## 10. Journal d'avancement
- **10/11/2026, étape 1 livrée** : dépôt privé GitHub, squelette Worker (`/api/health`, 404 JSON), migration D1 0001
  appliquée en local, landing complète (7 sections), pages légales en brouillon, pages d'attente estimation/connexion,
  404, polices auto-hébergées, illustrations SVG originales. `npm test` : 3 tests passent. Vérifié avec
  `wrangler dev` et captures à 390 px et 1440 px.
- **10/11/2026, 3D et marque** : maquette 3D (Three.js 0.186.1 auto-hébergé), logo « Le Seuil », planche `/marque`.
- **10/11/2026, DA v2** : palette chaude (crème, espresso, sable, vert, cuivre), Instrument Serif + Inter Tight +
  IBM Plex Mono, hero plein écran, 3 sections espresso, mosaïque, texture peinte originale (`npm run images`),
  3D chargée à la demande. Contrastes AA : pierre `#8A7F70` réservé aux traits ; texte secondaire `#696155`
  (clair) et `#A39886` (sombre). Lighthouse : mobile perf 99 / a11y 98, bureau perf 93. Photos réelles en attente
  (`public/img/source/`, crédits dans `public/img/CREDITS.md`).
- **10/11/2026, « Votre maquette » et frise « Vous avez bâti »** (en attente d'accord avant commit) :
  `GET /api/maquette/:siren` (cache D1 24 h, 20 req/h/IP), `GET /api/company/search` (autocomplétion),
  `POST /api/estimation` (sans enregistrement). Règles pures partagées `public/js/regles.js` ; normalisation des
  3 sources sur réponses réelles (`test/fixtures/`, 7 entreprises, données personnelles retirées).
  Constats : exercice confidentiel = CA 0 dans la source (traité comme absent) ; ventes de fonds par l'entreprise
  exclues (seule l'acheteuse est retenue) ; changement de forme juridique ≠ changement de nom.
  Formule des étages conservée : 8 étages à partir d'environ 178 M€ (décision utilisateur).
  9 archétypes, animation 6 s interruptible, export PNG sans valeur, repli SVG sans WebGL.
  Tests : 81 ; Lighthouse mobile perf 99 / a11y 100. Vidéo Pexels en fond de hero (grand écran), photos d'illustration.
- **10/11/2026, mise en ligne** : https://passation.eros-fragliola-freedom.workers.dev (Worker `passation`, D1
  `passation` a33eabb7…, R2 `passation-fichiers`, secret `SESSION_SECRET` généré sans affichage). Correctif : les API
  publiques refusent les requêtes sans User-Agent depuis Cloudflare → en-tête générique ajouté (`config.js`).
  2e correctif : l'annuaire renvoie HTTP 429 depuis les IP partagées de Cloudflare → nouvelles tentatives
  espacées (`src/lib/requete.js`, Retry-After respecté). Contrôle final : 6/6 maquettes et 4/4 recherches en 200,
  parcours navigateur 434436622 OK (293 k€ – 489 k€), Lighthouse prod mobile perf 93 / a11y 100 / BP 100 / SEO 100.
  Non publiés : `marque.html`, `img/source/`, `CREDITS.md` (`public/.assetsignore`). Secrets ANTHROPIC/BREVO non
  requis à ce stade (étapes 3 et suivantes).
- **10/11/2026, typographie** : Geist partout (titres 500, interlettrage serré, mots clés en italique ; chiffres en 300), Geist Mono pour les étiquettes ; remplace Instrument Serif, Inter Tight et IBM Plex Mono (y compris maquette 3D et image téléchargeable).

## 11. Parcours après le SIREN et livrables (décisions du 10/11/2026)

**Parcours validé**
1. Landing : maquette, frise, fourchette express (fait).
2. Ouverture du dossier : e-mail + code à 6 chiffres, dans une fenêtre sans quitter la page, **avant toute saisie de chiffres privés** ; dossier pré-rempli
   (identité, exercices INPI, fourchette express). Tableau de bord en 4 blocs avec avancement : Vos chiffres,
   Votre valorisation, Vos documents, Votre préparation.
3. Vos chiffres : **import de la liasse PDF en chemin principal** (extraction Claude, validation ligne à ligne),
   saisie guidée en repli ; 3 exercices ; éléments de bilan pour dette nette et BFR obligatoires.
4. Votre entreprise : **questionnaire court (≈ 15 questions, 5 écrans, sauvegarde auto)** : dirigeant et
   rémunération, retraitements, clients (concentration, récurrence), perspectives 3-5 ans, opération.
5. Votre valorisation : pont EBE comptable → normatif, 3 méthodes, football field, décotes/primes par curseurs,
   pont VE → titres, sensibilités, hypothèses Passation modifiables.
6. Vos documents : **datapack automatique** ; **teaser** après validation de l'anonymisation ; **info memo**
   débloqué quand le questionnaire est suffisamment rempli, généré **section par section à la demande**.
7. Votre préparation : checklist des pièces, ressources liées, chat expert.

Hors première version : partage avec l'expert-comptable (le datapack exporté suffit). **Gratuit pour l'instant** ;
modèle économique défini plus tard par l'utilisateur (business plan en cours).

**Enrichissement par le site internet de l'entreprise (étape 6, pour l'info memo)**
- Adresse du site **saisie ou confirmée par le dirigeant** (pas de recherche automatique : risque d'homonyme).
- Lecture côté Worker : accueil + pages clés du même domaine, 8 pages au plus, `robots.txt` respecté ;
  ni LinkedIn ni avis en ligne.
- Extraction par Claude (clé `ANTHROPIC_API_KEY` de l'utilisateur) en faits structurés avec la page source ;
  **validation fait par fait** par le dirigeant avant tout usage.
- **Logo** : candidats détectés (icône déclarée, en-tête, image de partage), choix du dirigeant, dépôt manuel en
  secours ; stocké dans R2, supprimé avec le dossier.
- **Photos du site** utilisables dans le memo **si le dirigeant atteste qu'elles appartiennent à l'entreprise**.
- **Présentation 100 % Passation** : aucune couleur de marque client ; seul le logo apparaît (couverture et
  en-tête du memo, couverture du datapack), avec la mention « Strictement confidentiel ».
- **Teaser** : jamais de logo, de nom, ni de terme issu du site (marques, produits) ; le contrôle
  d'anonymisation inclut ces termes.
- **10/11/2026, étape 3 (local, non publiée)** : lien magique (jeton haché, 15 min, usage unique, consommation
  atomique), session en cookie HttpOnly/Secure/SameSite=Lax, contrôle d'origine sur toute requête qui modifie,
  limites de débit par IP et par e-mail. Sans clé Brevo : lien affiché dans le terminal en local uniquement,
  refus 503 en production. Dossier créé depuis le SIREN de la landing, tableau de bord 4 blocs + avancement,
  checklist de 19 pièces, suppression complète (base + R2). Tests : 101 (base SQLite en mémoire). Choix
  utilisateur : e-mail plus tard ; Brevo à configurer avant la mise en ligne de l'étape 3.
  Note : après l'ajout de l'identifiant D1 de production, la base locale doit être recréée
  (`npm run db:migrate:local`).
- **10/11/2026, étape 3 publiée** : secrets BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME saisis par l'utilisateur.
  Contrôles en production : routes privées 401 sans connexion, requête d'un autre site 403, adresse invalide 400,
  lien invalide → retour à /connexion. Premier envoi réel d'e-mail : test par l'utilisateur.
- **10/11/2026, connexion par code (publiée)** : le lien magique est remplacé par un code à 6 chiffres saisi dans une
  fenêtre par-dessus la landing (ou sur `/connexion`) : on ne quitte plus la page. Code tiré uniformément, 10 min,
  usage unique, 5 essais comptés de façon atomique, un seul code actif par adresse, empreinte salée + `SESSION_SECRET`,
  limites 10 demandes/h par IP, 5/h par adresse, 30 essais/h par IP. Migration `0002` (supprime `magic_tokens`).
  Tests 107/107 ; parcours navigateur vérifié en local (1440 px et 390 px) ; contrôles en production (400, 403, 401).
  Parcours suivant validé par le dirigeant : ① entreprise → ② liasse PDF lue par Claude + validation ligne par ligne
  (3 ans max, 10 Mo, plafond de coût) → ③ questionnaire → ④ retraitements → ⑤ valorisation → ⑥ livrables.
- **10/11/2026, étape 4 (valorisation approfondie)** :
  - Moteur pur et testé : `src/valuation/approfondie.js`. Il couvre le pont EBE, l'EBE normatif, le BFR normatif, la dette
    nette, l'IS (taux réduit), le CMPC, le DCF sur 5 ans, l'ANCC, les décotes, le passage VE → titres, la synthèse 60/40,
    les sensibilités et les cas limites.
  - Valeurs attendues calculées indépendamment en Python : `docs/valorisation-calculs.md`, `scripts/reference-valorisation.py`.
  - Hypothèses sourcées et datées : `src/data/hypotheses.json`.
    - taux sans risque BCE AAA 10 ans : 3,27 % au 09/11/2026 ;
    - prime de risque France (Damodaran) : 5,01 % au 05/01/2026 ;
    - coût de la dette des PME (Banque de France, août 2026) : 3,71 % ;
    - IS 25 % / 15 % jusqu'à 42 500 € (service-public, vérifié le 17/02/2026) ;
    - croissance terminale 2 % (objectif BCE) ;
    - bêtas sectoriels Damodaran Europe de l'Ouest (05/01/2026) ;
    - prime de taille et décotes : « À compléter », réglées par le dirigeant.
  - Routes (`src/routes/valorisation.js`) :
    - chiffres pré-remplis INPI puis validés ligne par ligne ;
    - dépôt de liasse PDF → R2 → lecture par Claude (`src/lib/claude.js`, SDK officiel 1.3.0, `claude-haiku-5-5`, JSON
      contraint par un schéma), propositions jamais validées automatiquement, 6 lectures au plus par dossier ;
    - questionnaire (5 écrans) ;
    - calcul enregistré.
  - Page `/espace/valorisation/` : chiffres, questionnaire, résultats (football field, ponts, DCF, sensibilités, réglages
    avec sources).
  - Tests : 146 ; parcours navigateur vérifié en 1440 et 390 px.
  - En attente : la clé `ANTHROPIC_API_KEY` à saisir par le dirigeant pour activer la lecture des liasses.
- **10/11/2026, 3D « La cloche »** : réalisée sur la branche locale `3d-v2-cloche` (non poussée), en attente de validation
  des captures.
- **10/11/2026, étape 5 (datapack Excel)** :
  - `.xlsx` écrit par nos soins : `src/documents/xlsx.js`, zip par `fflate` 0.8.3 (MIT). Pas d'`exceljs`, trop lourd pour
    un Worker.
  - 9 onglets : Couverture, Comptes, Retraitements, Hypothèses, Passage aux titres, Multiples, DCF, ANCC, Synthèse.
  - Formules vivantes et valeurs en cache ; Excel recalcule tout à l'ouverture.
  - Cellules jaunes = hypothèses modifiables, avec leurs sources.
  - Contrôle : un évaluateur de formules (`src/documents/formules.js`) vérifie dans les tests que le classeur redonne au
    centime les chiffres du moteur (synthèse 2 244 253,18 €, CMPC ± 1 pt, g ± 0,5 pt, taux réduit, DCF à compléter).
  - Relecture indépendante par SheetJS : formules et valeurs conformes.
  - Route `GET /api/dossiers/:id/documents/datapack` : version conservée dans R2 et supprimée avec le dossier. Boutons sur
    les résultats et le tableau de bord.
  - Tests : 154.
  - Reste : ouverture dans Excel et Numbers par le dirigeant.
- **10/11/2026, étape 6a (teaser anonymisé)** :
  - Questionnaire étendu (activité, atouts, opération) : 8 écrans.
  - Faits anonymes calculés par le code (`src/documents/teaser.js`) :
    - secteur (section NAF) et région (INSEE, régions de 2016) ;
    - ancienneté arrondie et tranche d'effectif ;
    - fourchettes de CA et de marge, tendance.
  - Rédaction par Claude Sonnet 5.5 (JSON contraint, repli automatique en cas de refus).
  - Contrôle d'anonymat par le code (`src/documents/anonymat.js`) sur chaque version et chaque modification. Il refuse :
    - le nom et ses mots distinctifs, la ville, le code postal, le SIREN ;
    - les montants exacts, à 1 % près, sous toutes leurs formes ;
    - les termes issus du site.
  - Deux essais au plus, sinon refus sans enregistrement.
  - Nom de code (« Projet … ») ; versions dans R2 ; page imprimable `/espace/documents/teaser/`.
  - Tests : 172.
- **10/11/2026, étape 6b (info memo)** :
  - Lecture du site (`src/documents/site.js`) :
    - adresse saisie par le dirigeant, publique uniquement ;
    - 8 pages au plus, même domaine, `robots.txt` respecté ;
    - ni réseaux sociaux, ni contact, ni mentions légales.
  - Faits sourcés extraits par Claude Haiku ; **validés un par un** par le dirigeant. Les termes identifiants (marques,
    produits) sont ajoutés aux interdits du teaser.
  - Logo : candidats détectés ou dépôt manuel ; PNG, JPEG ou WebP de 1 Mo au plus (SVG refusé) ; stocké dans R2, servi au
    seul propriétaire.
  - 8 sections rédigées à la demande par Claude Sonnet 5.5, à partir des seules données utiles (réponses, faits validés,
    données publiques, chiffres validés), avec « À compléter » et la liste des manques. Chaque section est modifiable.
  - Tableau financier calculé par le code.
  - Ouverture du memo : activité décrite et opération précisée.
  - Page imprimable `/espace/documents/memo/` : couverture avec logo, sommaire, « Strictement confidentiel ».
  - Tests : 182.
  - Pas encore faits :
    - export .docx (la vue imprimable sert de PDF) ;
    - photos du site attestées par le dirigeant ;
    - liens signés de partage.
- **10/11/2026, parcours guidé (« Passation fait, le dirigeant confirme »)**, décidé par le dirigeant le même jour :
  - Page `/espace/demarrer/` : une étape à la fois, reprise automatique. Après le code de connexion, le dirigeant y arrive
    directement.
  - **Validation par exercice** : contrôles automatiques (`src/valuation/controles.js`), qui remplacent la validation
    ligne par ligne :
    - bilan équilibré ;
    - EBE cohérent avec le résultat d'exploitation et les dotations ;
    - chiffre d'affaires conforme aux comptes publics ;
    - valeurs impossibles et variation suspecte ;
    - lignes manquantes.

    Les lignes en alerte se valident à part. Les exercices INPI incomplets ne sont plus présentés une fois la liasse
    lue.
  - **Site proposé depuis le domaine de l'e-mail** professionnel, à confirmer ; jamais pour une messagerie grand public.
  - **8 questions**, une par écran, en choix rapides, et sautées quand elles ne s'appliquent pas. « Je ne sais pas » au
    capital détenu par des personnes physiques vaut « non » (taux normal d'IS, prudent).
  - **Faits du site pré-cochés** (le dirigeant décoche ce qui est faux) et logo proposé.
  - **Rédaction groupée** : valorisation, datapack, teaser, 8 sections, 4 à la fois ; reprise sans refaire ce qui
    existe.
  - E-mail « dossier prêt » envoyé une fois. **Rappel unique** à 3 jours (tâche planifiée quotidienne, 8 h UTC).
  - Prime de taille et décotes déplacées dans « Affiner (pour votre conseil) ».
  - Carte « Prochaine étape » sur le tableau de bord.
  - Corrections :
    - concurrence à la création du document memo (identifiant fixe, `INSERT OR IGNORE`) ;
    - `ev.currentTarget` vidé après `await` (choix enregistrés sans passage à l'écran suivant ; bouton « Recalculer »
      resté grisé).
  - Essai de bout en bout avec un Claude simulé (`ANTHROPIC_BASE_URL`, réglage de développement absent en
    production) : **21 actions du dirigeant après le SIREN** (contre environ 110), ordinateur et mobile, sans erreur.
  - Tests : 197.
- **10/11/2026, 3D « La cloche » mise en ligne** (accord du dirigeant) : la branche `3d-v2-cloche` est fusionnée sans
  conflit. Tests : 211. Cloche et fenêtre de connexion vérifiées en local. Mesure d'images par seconde non probante ce
  jour-là (machine de test très chargée : charge moyenne de 21) ; à confirmer sur un vrai MacBook avec `?debug`.
- **12/11/2026, 3D v3 « De l'esquisse à l'édifice »** : branche locale `3d-esquisse-edifice` (non poussée), en attente
  de validation. Une scène unique dans cinq fenêtres de la page, état fonction pure du défilement ; détail et
  mesures dans `docs/3D-V3-EDIFICE.md`.
  - Livraisons 1 et 2 : esquisse, volume, matière ; vue éclatée (une strate par outil), enseigne effacée, soir.
  - Livraison 3 (finitions) : plus aucune compilation de shader pendant le défilement ; qualité adaptative corrigée
    (elle se dégradait à tort au palier le plus bas) ; bandes mobiles proportionnées ; reprise après perte du
    contexte WebGL ; économiseur de données respecté.
  - Tests : 237. Lighthouse mobile 100 / 100.
