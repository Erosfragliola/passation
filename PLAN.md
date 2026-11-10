# PASSATION : plan du projet

> Statut : **proposition, en attente d'accord**. Rien n'est codé avant validation.
> Rédigé le 10/11/2026. Projet indépendant : aucun lien avec `~/Desktop/FREEDOM`.

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
   ├── Brevo                        : e-mails de lien magique et notifications
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
- **Polices** auto-hébergées : Instrument Serif et Inter (licence SIL Open Font, libres), fichiers .woff2 dans `public/fonts/`.

Dépendances prévues : `wrangler`, `vitest` (dév.) ; `exceljs` ou `fflate`, `docx`, `marked` (Markdown → HTML, au build seulement). Rien d'autre sans accord.

---

## 3. Schéma de la base D1

```sql
users            (id TEXT PK, email TEXT UNIQUE, created_at, last_login_at)
magic_tokens     (token_hash TEXT PK, email, expires_at, used_at)              -- 15 min, usage unique, hash SHA-256 seulement
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
| `POST /api/auth/request` | envoie le lien magique (réponse identique que l'e-mail existe ou non) | public, limité |
| `GET /api/auth/verify?token=` | consomme le jeton, crée la session, redirige vers `/espace/` | public |
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
9. **Synthèse** : fourchette par méthode, graphique « football field », valeur centrale = moyenne pondérée des méthodes (pondération réglable, égale par défaut), justification rédigée par Sonnet, **sensibilités** : multiple ± 1×, CMPC ± 1 point, croissance terminale ± 0,5 point.

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
| 3 | Comptes et espace dirigeant | lien magique Brevo, sessions, contrôle de propriété, tableau de bord, checklist, suppression du dossier | tests 401 / accès à un dossier d'autrui, parcours complet |
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
- [ ] Source des multiples sectoriels (bloque l'étape 2)
- [ ] Valeurs par défaut des décotes/primes et des paramètres du CMPC (étape 4), ou accord pour que je recherche des sources citées
- [ ] Textes « À remplir » : chiffres clés, éditeur des mentions légales, hébergeur, contact
- [ ] Couleur d'accent : vert sauge (proposé) ou bleu ardoise
- [ ] Adresse d'expédition Brevo (étape 3)
