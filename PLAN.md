# PASSATION: project plan

> Status: **approved on 10/11/2026**. Step 1 delivered (see §10).
> Independent project: no link with the other projects in `~/Desktop/PROJETS` (including FREEDOM).

## User decisions (10/11/2026)
- **Sources**: I research the multiples, discounts and parameters. Sources are cited **in the code**
  (`src/data/*.json`, with URL and date accessed), **not displayed on the site**.
- **DCF**: the parameters found are shown to the owner as **"Passation assumptions"**, editable field by field. If
  nothing reliable is found, the field is empty and the owner fills it in.
- **Palette (art direction v2, replaces v1)**: cream `#FBF6EC`, espresso `#231E18`, sand `#EADFCB`, stone `#8A7F70`,
  green `#1E3A2E`, copper `#A8653A` (the marker, never for text), light copper `#E9C9A4` (italics on a dark background).
- **Name**: Passation, for now.

---

## 1. What the public APIs really return (tested on 10/11/2026, SIREN 434436622)

| Source | What we get | Limitations observed |
|---|---|---|
| `recherche-entreprises.api.gouv.fr/search?q=` | name, NAF (`activite_principale`, and `activite_principale_naf25`), category (SME…), headcount band, headquarters address, incorporation date, officers (name, role, year of birth), `finances: {"2024": {ca, resultat_net}}` | search by name: several namesakes (3 "HABI PRO"), so the autocomplete must show city + SIREN |
| `data.economie.gouv.fr … ratios_inpi_bce/records?where=siren="…"` | per fiscal year: `chiffre_d_affaires`, `marge_brute`, `ebe`, `ebit`, `resultat_net`, ratios (`taux_d_endettement`, `autonomie_financiere`, `poids_bfr_exploitation_sur_ca_jours`, customer/supplier/inventory days…), `confidentiality` | **no amount** for cash, debt or shareholders' equity; **missing fiscal years** (here 2022 and 2023 absent) |
| `bodacc-datadila…/annonces-commerciales/records?where=registre like "…"` | announcements: `familleavis_lib` (filing of accounts, insolvency proceedings, sales and transfers, changes), date, court | `listepersonnes` field as JSON encoded in a string, to be decoded |

Consequences for the product:
- The quick valuation gives an **enterprise value** (EV). Equity value requires net debt, which only the owner can provide: the page says so and points to the detailed valuation.
- We always display the **fiscal year** used ("2024 accounts"), and flag it if it is more than 2 years old.
- If `confidentiality` is not `Public` or if there is no fiscal year: clear message ("Your accounts are not published") and a small revenue / EBITDA form filled in by the owner.
- If insolvency proceedings appear in the BODACC, we show them as a point to watch.

---

## 2. Architecture

```
Browser (HTML + CSS + vanilla JS, public/)
        │  fetch /api/*
        ▼
Cloudflare Worker (src/)  ── run_worker_first = ["/api/*"], the rest is served by [assets]
   ├── D1  "passation"              : users, sessions, files, figures, valuations, chat, API cache, limits
   ├── R2  "passation-fichiers"     : uploaded tax returns, generated .xlsx / .docx
   ├── Claude API                   : PDF extraction, comments, drafting, chat (streaming)
   ├── Brevo                        : sign-in code and notification emails
   └── Public APIs (no key)         : recherche-entreprises, INPI ratios, BODACC
```

File organization:

```
PASSATION/
├── CLAUDE.md, PLAN.md, README.md, .gitignore, .dev.vars.example
├── wrangler.toml, package.json, vitest.config.js
├── migrations/0001_init.sql, 0002_…
├── content/                    Markdown sheets (resources), editable without code
├── scripts/build-content.mjs   turns content/*.md into src/data/content.json (a Worker cannot read a folder)
├── public/                     front end: index.html, espace/, ressources/, css/, js/, fonts/, img/ (original SVGs)
├── src/
│   ├── index.js                router
│   ├── config.js               MODELS, CHAT_LIMITS, EXPRESS_RATE_LIMIT, durations (single constants)
│   ├── routes/                 company.js, express.js, auth.js, dossier.js, valuation.js, documents.js, chat.js, files.js
│   ├── lib/                    claude.js, brevo.js, auth.js (cookies, HMAC), cache.js, ratelimit.js, sources.js (normalization)
│   ├── valuation/              pure, tested logic: normalize.js, multiples.js, dcf.js, anc.js, bridge.js, adjustments.js, synthesis.js
│   ├── documents/              xlsx.js, docx.js, prompts/ (teaser, memo)
│   └── data/multiples.json, content.json
└── test/                       vitest tests (calculations first)
```

Technical choices to check during development (step indicated):
- **PDF tax-return upload** (step 4): the Claude API reads a PDF sent in base64 directly. No PDF library to install.
- **Excel** (step 5): I will test `exceljs` in a Worker with `nodejs_compat`. If it does not work, I write the .xlsx file myself (it is a zip of XML) with `fflate`, a small library compatible with Workers. Both allow live formulas and styles. SheetJS is ruled out: its free version does not handle colors.
- **Word** (step 6): the `docx` library (pure JavaScript) is the candidate; I will check that it runs in a Worker.
- **PDF** (step 6): generating a laid-out PDF in a Worker is fragile. I propose a **print-ready HTML view** (CSS `@media print`, "Save as PDF" button). Cloudflare's browser rendering (Browser Rendering) is a paid option, ruled out unless requested.
- **Signed links**: the Worker signs a URL `/api/files/:id?exp=…&sig=…` (HMAC with `SESSION_SECRET`, valid for 10 minutes) and reads the file from R2. No extra R2 keys needed.
- **Rate limit** on the quick valuation: counter in D1 per IP hash (hashed, never the IP in clear) and per hour.
- **Tests**: `vitest` on the calculation modules (pure, without Cloudflare). Route tests with `@cloudflare/vitest-pool-workers` from step 3 (access rights, 401).
- Self-hosted **fonts**: Geist (titles and body text, with italics) and Geist Mono (labels), SIL Open Font License, .woff2 files in `public/fonts/` (user's choice of 10/11/2026).

Planned dependencies: `wrangler`, `vitest` (dev); `exceljs` or `fflate`, `docx`, `marked` (Markdown → HTML, at build time only). Nothing else without approval.

---

## 3. D1 database schema

```sql
users            (id TEXT PK, email TEXT UNIQUE, created_at, last_login_at)
login_codes      (id PK = salt, email, code_hash, created_at, expires_at, attempts, used_at) -- 6-digit code, 10 min, 5 attempts, salted hash + secret
sessions         (id_hash TEXT PK, user_id FK, expires_at, created_at)          -- HttpOnly Secure SameSite=Lax cookie
dossiers         (id TEXT PK, user_id FK, siren, company_json, code_name,
                  status, created_at, updated_at)
answers          (dossier_id FK, step TEXT, data_json, updated_at, PK(dossier_id, step))   -- questionnaire, autosave
financials       (dossier_id FK, year INT, field TEXT, value REAL,
                  source TEXT CHECK IN ('inpi','dirigeant','liasse'),
                  validated INT DEFAULT 0, PK(dossier_id, year, field))       -- every extracted figure must be approved
adjustments      (id PK, dossier_id FK, kind TEXT, label, amount REAL, justification)  -- EBITDA adjustments, discounts/premiums
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
rate_limits      (bucket TEXT PK, count INT, window_start)                      -- public quick valuation
```

File deletion (one click): cascading deletion of all the file's rows **and** of the associated R2 objects, then of the user if they request it.

---

## 4. Pages and API routes

### Pages (static front end)

| URL | Content | Sign-in |
|---|---|---|
| `/` | landing page: hero with SIREN/name field, key figures, how it works, toolbox, confidentiality, FAQ, footer | no |
| `/estimation?siren=…` | result of the quick valuation | no |
| `/connexion` | email entry → "check your inbox" | no |
| `/espace/` | dashboard: checklist, current valuation, documents | yes |
| `/espace/valorisation` | step-by-step questionnaire, tax-return upload, approval of figures, result (football field) | yes |
| `/espace/documents` | datapack, teaser, information memo: generate, review, edit, regenerate a section, download | yes |
| `/espace/chat` | "Sale expert" chat | yes |
| `/ressources/`, `/ressources/:slug` | library by step | no |
| `/confidentialite`, `/mentions-legales`, `/cgu` | drafts "To be completed" | no |

### API routes

| Method and route | Purpose | Access |
|---|---|---|
| `GET /api/company/search?q=` | autocomplete (24-hour cache) | public |
| `GET /api/company/:siren` | company sheet + INPI fiscal years + normalized BODACC announcements | public |
| `POST /api/express` | quick valuation + Haiku comment | public, rate-limited |
| `POST /api/auth/request` | sends a 6-digit code (same response whether or not the email exists) | public, limited |
| `POST /api/auth/code` | checks the code (5 attempts), creates the session and the file for the SIREN, returns the destination | public, limited |
| `POST /api/auth/logout`, `GET /api/me` | session | private |
| `GET/POST /api/dossiers`, `GET/DELETE /api/dossiers/:id` | file (complete deletion) | private + owner |
| `GET/PUT /api/dossiers/:id/answers/:step` | questionnaire, autosave | private + owner |
| `GET/PUT /api/dossiers/:id/financials` | figures per fiscal year, approval | private + owner |
| `POST /api/dossiers/:id/uploads` | PDF upload → R2 → Haiku extraction → figures "to be approved" | private + owner |
| `POST /api/dossiers/:id/valuation` | calculation of the 3 methods + Sonnet justification | private + owner |
| `PUT /api/dossiers/:id/checklist/:item` | checklist | private + owner |
| `POST /api/dossiers/:id/documents/:kind` | generates datapack / teaser / memo | private + owner |
| `PUT /api/documents/:id/sections/:key`, `POST …/regenerate` | edit / regenerate a section | private + owner |
| `GET /api/documents/:id/link` | link signed for 10 min | private + owner |
| `GET /api/files/:id?exp&sig` | download from R2 | valid signature |
| `GET /api/resources` | list of resource sheets | public |
| `POST /api/dossiers/:id/chat` (SSE), `GET …/chat` | streaming chat, history | private + owner, quota |

All private routes go through the same check: valid session **and** `dossiers.user_id = signed-in user`, otherwise 401 or 404.

---

## 5. Valuation method

All the calculation is **tested deterministic code**. Claude never calculates: it comments and drafts from the results.

### 5.1 Quick valuation
1. Latest published fiscal year (revenue, EBITDA). Fiscal year displayed.
2. Industry multiples read from `multiples.json` according to the NAF code (2-digit division, otherwise section).
3. EBITDA > 0: EV = EBITDA × multiple (low / central / high), cross-checked with revenue × revenue multiple.
   EBITDA ≤ 0 or missing: only the revenue approach is possible; wider range and warning.
   Unpublished accounts: the owner is asked for revenue and EBITDA.
   **Industry without a sourced multiple: no figure displayed**, message "industry benchmark to be completed".
4. Result: low / central / high EV, multiples used and their source, Haiku comment of 3 to 4 lines, mention "Indicative, non-binding estimate".

### 5.2 Detailed valuation
1. **Adjusted EBITDA** = reported EBITDA
   + (owner's actual pay − market-rate pay of a salaried manager, including payroll taxes)
   + (intragroup rent paid − market rent)
   ± one-off items (amount + justification for each).
   **Normalized EBITDA**: by default the average of the last 3 adjusted fiscal years; the owner can choose the latest fiscal year. The choice is displayed.
2. **Normalized working capital** = average operating working capital (inventories + trade receivables − trade payables − operating tax and social security liabilities) over the available fiscal years, in days of revenue.
3. **Net debt** = financial debt (borrowings, restated lease financing, repayable shareholder loans) − cash − investments, + items treated as debt (provisions for risks, dividends declared but unpaid, non-operating tax due).
4. **Method 1: multiples** — EV = normalized EBITDA × EBITDA multiple; cross-check EV = revenue × revenue multiple.
5. **Method 2: simplified 5-year DCF** — cash flow = EBIT × (1 − corporate tax rate) + depreciation − capital expenditure − change in working capital; Gordon-Shapiro terminal value (cash flow Y+5 × (1+g) / (WACC − g)); discounting at the WACC. Assumptions entered by the owner with **sourced** default values (risk-free rate, market premium, size premium); as long as they are not sourced, the field is "To be completed". Safeguard: error if WACC ≤ g.
6. **Method 3: adjusted book net assets (ANCC)** — shareholders' equity + reported unrealized gains (real estate, goodwill) − assets with no value (start-up costs, doubtful receivables); gives an equity value directly.
7. **Discounts and premiums** on the value from the multiples and the DCF: dependence on the owner, customer concentration, revenue recurrence, growth, size. Each factor has a rating (low / medium / high) and an **adjustable** percentage, with a written justification. Default percentages will be sourced or left "To be completed".
8. **EV → equity value bridge** = EV − net debt ± (actual working capital − normalized working capital) + non-operating assets (excess cash, unused real estate).
9. **Summary**: range per method, "football field" chart. **Central value = multiples (main method) and DCF (cross-check), weighted 60 / 40 by default and adjustable; the ANCC is shown separately as a floor value** (decision of 10/11/2026, replaces the equally weighted average). Justification drafted by Sonnet, **sensitivities**: multiple ± 1×, WACC ± 1 point, terminal growth ± 0.5 point.

### 5.3 Edge cases covered by the tests
Negative or zero EBITDA; missing or confidential accounts; a single fiscal year; negative net debt (net cash); WACC ≤ g; negative shareholders' equity; industry without a multiple; non-consecutive fiscal years.

### 5.4 Industry multiples: **to be completed by you**
`src/data/multiples.json` will contain one line per industry with `naf`, `ebe_bas/central/haut`, `ca_bas/central/haut`, `source`, `date_source`, `perimetre` (company size). **I will not put any unsourced figure in it.** Possible sources to review together (I have not checked any of them yet):
- Argos Index (Epsilon Research): median multiples of unlisted transactions in the euro area, quarterly publication, but not by detailed industry;
- Damodaran (NYU, "Europe" datasets): EV/EBITDA multiples by industry, free and dated, but for listed companies (a size discount would be needed);
- professional scales for businesses (retail, restaurants, pharmacies…), to be cited precisely;
- your own firm's references, if you have any.

As long as the file is empty for an industry, the quick valuation shows "benchmark to be completed" instead of a figure. **This is what blocks step 2: I need your choice of source.**

### 5.5 Tax rules to check (step 7 and DCF)
Corporate income tax rate (standard and reduced SME rate), allowances on capital gains from a sale, retirement (art. 150-0 D ter of the French General Tax Code), contribution and sale (150-0 B ter), Dutreil pact (787 B): each rule will be checked on impots.gouv.fr, service-public.fr or Légifrance, cited and dated. Nothing from memory.

---

## 6. AI: models and safeguards

`src/config.js`:
```js
export const MODELS = { deep: "claude-sonnet-5-5", fast: "claude-haiku-5-5" };
export const CHAT_LIMITS = { messagesParJour: 30, tokensParJour: 150_000 };   // to be adjusted
export const EXPRESS_RATE_LIMIT = { parHeureParIP: 10 };                       // to be adjusted
```
- Haiku: quick-estimate comment, extraction of the figures from a tax return (JSON output, then line-by-line approval by the owner).
- Sonnet: justification of the valuation, teaser, information memo, chat.
- Teaser: anonymization checked by code after generation (the name, the city, the SIREN and exact amounts must not appear; otherwise new generation or blocking).
- Information memo: section without data → "To be completed", never invented.
- Chat: system prompt limited to the domain, the file's data + library sheets, citation of the sheets used, referral to a lawyer, an accountant or an M&A advisor for any binding question.

---

## 7. Delivery steps

| # | Step | Contents | Check |
|---|---|---|---|
| 1 | Skeleton and landing page | Git + private GitHub repository, wrangler.toml, migration 0001, complete static landing page (art direction, original SVGs, FAQ, "To be filled in" placeholders), draft legal pages | `npm test` (smoke test), `wrangler dev`, visual check on mobile and desktop |
| 2 | Search and quick valuation | autocomplete, normalization of the 3 APIs, 24-hour cache, quick calculation, Haiku comment, rate limit, result page | calculation + normalization tests (on recorded real responses), trial on 434436622 |
| 3 | Accounts and owner's space | Brevo sign-in code (window on the landing page), sessions, ownership check, dashboard, checklist, file deletion | 401 tests / access to someone else's file, complete flow |
| 4 | Detailed valuation | step-by-step questionnaire, PDF upload + approval, adjustments, 3 methods, discounts, EV → equity, football field, sensitivities | tests of the 3 methods, the EV → equity bridge and the edge cases, with expected values calculated by hand |
| 5 | Excel datapack | 9 tabs, live formulas, formatting | opened in Excel/Numbers, recalculation identical to the engine |
| 6 | Teaser and information memo | generation, review, editing, regeneration by section, .docx + printable view, R2, signed links | automated anonymization check, expired links rejected |
| 7 | Resources and chat | sourced and dated Markdown sheets, streaming chat, history, quotas | quota tests, trial of off-topic questions |
| 8 | Deployment | D1, R2, secrets entered by you, deploy, final check | landing page, quick valuation on 434436622, 401 on private routes |

Each step: commit in French, anti-secret check (`git grep`), push, demonstration, then your approval before the next one.

---

## 8. Costs to know about
- Cloudflare Workers, D1, R2: free plans are enough to get started.
- Brevo: free plan (limited number of emails per day); the sender address must be validated at Brevo.
- Claude API: **pay-as-you-go**. The public quick valuation is the main cost risk, hence the rate limit and the cache. A monthly spending cap should be set in the Anthropic console.

## 9. Items to be completed by you (follow-up)
- [x] Industry multiples: cross-check of three sources decided by the user on 10/11/2026 (Argos Q2 2026,
      Dealsuite/Fusac 2026 via Capital Stack, Captain 2026 scale, relative levels from Damodaran Europe 01/2026).
      Cited inputs: `src/data/multiples-sources.json`; calculation: `npm run multiples`. Agriculture and "other":
      derived range (no line in the scale). No revenue multiple.
- [x] Discounts/premiums and WACC parameters: I research them; displayed as editable assumptions (step 4)
- [x] Palette: provided (see top)
- [ ] "To be filled in" texts: real partners/testimonials, prices, publisher in the legal notice, contact, governing law
- [ ] Brevo sender address (step 3)

## 10. Progress log
- **10/11/2026, step 1 delivered**: private GitHub repository, Worker skeleton (`/api/health`, JSON 404), D1 migration
  0001 applied locally, complete landing page (7 sections), draft legal pages, placeholder estimate/sign-in pages,
  404, self-hosted fonts, original SVG illustrations. `npm test`: 3 tests pass. Checked with `wrangler dev` and
  screenshots at 390 px and 1440 px.
- **10/11/2026, 3D and brand**: 3D model (self-hosted Three.js 0.186.1), "Le Seuil" logo, `/marque` board.
- **10/11/2026, art direction v2**: warm palette (cream, espresso, sand, green, copper), Instrument Serif + Inter Tight +
  IBM Plex Mono, full-screen hero, 3 espresso sections, mosaic, original painted texture (`npm run images`), 3D loaded
  on demand. AA contrast: stone `#8A7F70` reserved for lines; secondary text `#696155` (light) and `#A39886` (dark).
  Lighthouse: mobile perf 99 / a11y 98, desktop perf 93. Real photos pending (`public/img/source/`, credits in
  `public/img/CREDITS.md`).
- **10/11/2026, "Your model" and "You built it" timeline** (awaiting approval before commit):
  `GET /api/maquette/:siren` (24-hour D1 cache, 20 req/h/IP), `GET /api/company/search` (autocomplete),
  `POST /api/estimation` (nothing saved). Pure rules shared in `public/js/regles.js`; normalization of the 3 sources
  on real responses (`test/fixtures/`, 7 companies, personal data removed).
  Findings: confidential fiscal year = revenue 0 in the source (treated as missing); sales of businesses by the
  company excluded (only the buyer is kept); change of legal form ≠ change of name.
  Floor formula kept: 8 floors from about €178M (user decision).
  9 archetypes, 6 s interruptible animation, PNG export without value, SVG fallback without WebGL.
  Tests: 81; Lighthouse mobile perf 99 / a11y 100. Pexels video as the hero background (large screens), illustrative
  photos.
- **10/11/2026, deployment**: https://passation.eros-fragliola-freedom.workers.dev (Worker `passation`, D1
  `passation` a33eabb7…, R2 `passation-fichiers`, `SESSION_SECRET` secret generated without being displayed). Fix: the
  public APIs reject requests without a User-Agent from Cloudflare → generic header added (`config.js`).
  2nd fix: the business directory returns HTTP 429 from Cloudflare's shared IPs → spaced-out retries
  (`src/lib/requete.js`, Retry-After respected). Final check: 6/6 models and 4/4 searches at 200, browser flow
  434436622 OK (€293K – €489K), production Lighthouse mobile perf 93 / a11y 100 / BP 100 / SEO 100.
  Not published: `marque.html`, `img/source/`, `CREDITS.md` (`public/.assetsignore`). ANTHROPIC/BREVO secrets not
  required at this stage (steps 3 and later).
- **10/11/2026, typography**: Geist everywhere (titles 500, tight letter spacing, keywords in italics; figures in 300), Geist Mono for labels; replaces Instrument Serif, Inter Tight and IBM Plex Mono (including the 3D model and the downloadable image).
- **20/11/2026, more guided analysis flow (PR #29, recommended options A1 to F1 adopted)**: welcome screen;
  10 screens instead of 14 (9 questions + the website), each answer linked to a section of the memorandum; amounts
  in a formatted field + slider (`public/js/montants.js`), a suggestion is never saved without confirmation; trades as
  chips (website, then the finest NAF label: `src/data/naf-sous-classes.json` INSEE, `naf-classes-en.json`
  Eurostat); awards and growth areas: 3 at most; key dates as rows; website facts grouped by theme, contradictions with
  the registers to be settled (`public/js/faits-site.js`); logo and photos chosen right after the website is read,
  shown on the cover, the business page and the team page of the memorandum; photos filtered when read (`site.js`).

## 11. Flow after the SIREN and deliverables (decisions of 10/11/2026)

**Approved flow**
1. Landing page: model, timeline, quick range (done).
2. Opening the file: email + 6-digit code, in a window without leaving the page, **before any private figure is entered**; file prefilled
   (identity, INPI fiscal years, quick range). Dashboard in 4 blocks with progress: Your figures,
   Your valuation, Your documents, Your preparation.
3. Your figures: **upload of the PDF tax return as the main path** (Claude extraction, line-by-line approval),
   guided entry as a fallback; 3 fiscal years; balance-sheet items for net debt and working capital required.
4. Your company: **short questionnaire (≈ 15 questions, 5 screens, autosave)**: owner and pay, adjustments,
   customers (concentration, recurrence), 3-5 year outlook, deal.
5. Your valuation: bridge from reported to normalized EBITDA, 3 methods, football field, discounts/premiums with
   sliders, EV → equity bridge, sensitivities, editable Passation assumptions.
6. Your documents: **automatic datapack**; **teaser** after approval of the anonymization; **information memo**
   unlocked when the questionnaire is sufficiently filled in, generated **section by section on demand**.
7. Your preparation: document checklist, related resources, expert chat.

Not in the first version: sharing with the accountant (the exported datapack is enough). **Free for now**; business
model to be defined later by the user (business plan in progress).

**Enrichment from the company's website (step 6, for the information memo)**
- Website address **entered or confirmed by the owner** (no automatic search: risk of namesakes).
- Reading on the Worker side: home page + key pages of the same domain, 8 pages at most, `robots.txt` respected;
  neither LinkedIn nor online reviews.
- Extraction by Claude (the user's `ANTHROPIC_API_KEY` key) into structured facts with the source page;
  **fact-by-fact approval** by the owner before any use.
- **Logo**: detected candidates (declared icon, header, share image), choice by the owner, manual upload as a
  fallback; stored in R2, deleted with the file.
- **Website photos** usable in the memo **if the owner confirms that they belong to the company**.
- **100% Passation presentation**: no customer brand color; only the logo appears (cover and header of the memo,
  cover of the datapack), with the mention "Strictly confidential".
- **Teaser**: never a logo, a name or a term taken from the website (brands, products); the anonymization check
  includes these terms.
- **10/11/2026, step 3 (local, not published)**: magic link (hashed token, 15 min, single use, atomic consumption),
  session in an HttpOnly/Secure/SameSite=Lax cookie, origin check on every request that changes data, rate limits
  per IP and per email. Without a Brevo key: link shown in the terminal locally only, 503 refusal in production.
  File created from the landing page's SIREN, 4-block dashboard + progress, checklist of 19 documents, complete
  deletion (database + R2). Tests: 101 (in-memory SQLite database). User choice: email later; Brevo to be configured
  before step 3 goes live.
  Note: after adding the production D1 identifier, the local database must be recreated
  (`npm run db:migrate:local`).
- **10/11/2026, step 3 published**: BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME secrets entered by the user.
  Production checks: private routes 401 without sign-in, request from another site 403, invalid address 400,
  invalid link → back to /connexion. First real email sent: tested by the user.
- **10/11/2026, sign-in by code (published)**: the magic link is replaced by a 6-digit code entered in a window over
  the landing page (or on `/connexion`): users no longer leave the page. Code drawn uniformly, 10 min, single use,
  5 attempts counted atomically, a single active code per address, salted hash + `SESSION_SECRET`, limits of 10
  requests/h per IP, 5/h per address, 30 attempts/h per IP. Migration `0002` (removes `magic_tokens`).
  Tests 107/107; browser flow checked locally (1440 px and 390 px); production checks (400, 403, 401).
  Next flow approved by the owner: ① company → ② PDF tax return read by Claude + line-by-line approval
  (3 years max, 10 MB, cost cap) → ③ questionnaire → ④ adjustments → ⑤ valuation → ⑥ deliverables.
- **10/11/2026, step 4 (detailed valuation)**:
  - Pure, tested engine: `src/valuation/approfondie.js`. It covers the EBITDA bridge, normalized EBITDA, normalized
    working capital, net debt, corporate income tax (reduced rate), WACC, the 5-year DCF, the ANCC, discounts, the EV →
    equity bridge, the 60/40 summary, sensitivities and edge cases.
  - Expected values calculated independently in Python: `docs/valorisation-calculs.md`, `scripts/reference-valorisation.py`.
  - Sourced and dated assumptions: `src/data/hypotheses.json`.
    - ECB AAA 10-year risk-free rate: 3.27% as of 09/11/2026;
    - risk premium for France (Damodaran): 5.01% as of 05/01/2026;
    - SME cost of debt (Banque de France, August 2026): 3.71%;
    - corporate income tax 25% / 15% up to €42,500 (service-public, checked on 17/02/2026);
    - terminal growth 2% (ECB target);
    - Damodaran Western Europe industry betas (05/01/2026);
    - size premium and discounts: "To be completed", set by the owner.
  - Routes (`src/routes/valorisation.js`):
    - figures prefilled from INPI, then approved line by line;
    - PDF tax-return upload → R2 → reading by Claude (`src/lib/claude.js`, official SDK 1.3.0, `claude-haiku-5-5`, JSON
      constrained by a schema), proposals never approved automatically, 6 readings at most per file;
    - questionnaire (5 screens);
    - saved calculation.
  - Page `/espace/valorisation/`: figures, questionnaire, results (football field, bridges, DCF, sensitivities,
    settings with sources).
  - Tests: 146; browser flow checked at 1440 and 390 px.
  - Pending: the `ANTHROPIC_API_KEY` key, to be entered by the owner to enable tax-return reading.
- **10/11/2026, "The bell" 3D**: built on the local branch `3d-v2-cloche` (not pushed), awaiting approval of the
  screenshots.
- **10/11/2026, step 5 (Excel datapack)**:
  - `.xlsx` written by ourselves: `src/documents/xlsx.js`, zipped with `fflate` 0.8.3 (MIT). No `exceljs`, too heavy
    for a Worker.
  - 9 tabs: Overview (logo, contents clickable by section, how to read, disclaimer), then 1.1 Accounts, 1.2 Adjustments, 1.3 Assumptions, 2.1 Bridge to equity, 2.2 Multiples, 2.3 DCF, 2.4 ANCC, 2.5 Summary (layout inspired by investment-bank datapacks, Passation branding, no chart tab).
  - Live formulas and cached values; Excel recalculates everything on opening.
  - Yellow cells = editable assumptions, with their sources.
  - Check: a formula evaluator (`src/documents/formules.js`) checks in the tests that the workbook gives back the
    engine's figures to the cent (summary €2,244,253.18, WACC ± 1 pt, g ± 0.5 pt, reduced rate, DCF to be completed).
  - Independent re-reading with SheetJS: formulas and values match.
  - Route `GET /api/dossiers/:id/documents/datapack`: version kept in R2 and deleted with the file. Buttons on the
    results and on the dashboard.
  - Tests: 154.
  - Left to do: opening in Excel and Numbers by the owner.
- **10/11/2026, step 6a (anonymized teaser)**:
  - Extended questionnaire (business, strengths, deal): 8 screens.
  - Anonymous facts calculated by the code (`src/documents/teaser.js`):
    - industry (NAF section) and region (INSEE, 2016 regions);
    - rounded age and headcount band;
    - revenue and margin ranges, trend.
  - Drafting by Claude Sonnet 5.5 (constrained JSON, automatic fallback in case of refusal).
  - Anonymity check by the code (`src/documents/anonymat.js`) on every version and every edit. It rejects:
    - the name and its distinctive words, the city, the postal code, the SIREN;
    - exact amounts, to within 1%, in all their forms;
    - terms taken from the website.
  - Two attempts at most, otherwise refusal without saving.
  - Code name ("Projet …"); versions in R2; printable page `/espace/documents/teaser/`.
  - Tests: 172.
- **10/11/2026, step 6b (information memo)**:
  - Website reading (`src/documents/site.js`):
    - address entered by the owner, public only;
    - 8 pages at most, same domain, `robots.txt` respected;
    - no social networks, no contact page, no legal notice.
  - Sourced facts extracted by Claude Haiku; **approved one by one** by the owner. Identifying terms (brands,
    products) are added to the teaser's forbidden terms.
  - Logo: detected candidates or manual upload; PNG, JPEG or WebP of 1 MB at most (SVG rejected); stored in R2, served
    only to the owner.
  - 8 sections drafted on demand by Claude Sonnet 5.5, from the useful data only (answers, approved facts, public data,
    approved figures), with "To be completed" and the list of what is missing. Each section can be edited.
  - Financial table calculated by the code.
  - Opening the memo: business described and deal specified.
  - Printable page `/espace/documents/memo/`: cover with logo, contents, "Strictly confidential".
  - Tests: 182.
  - Not done yet:
    - .docx export (the printable view serves as a PDF);
    - website photos confirmed by the owner;
    - signed sharing links.
- **10/11/2026, guided steps ("Passation does it, the owner confirms")**, decided by the owner the same day:
  - Page `/espace/demarrer/`: one step at a time, automatic resumption. After the sign-in code, the owner goes there
    directly.
  - **Approval by fiscal year**: automatic checks (`src/valuation/controles.js`), which replace line-by-line
    approval:
    - balanced balance sheet;
    - EBITDA consistent with operating income and depreciation;
    - revenue matching the public accounts;
    - impossible values and suspicious change;
    - missing lines.

    Lines with an alert are approved separately. Incomplete INPI fiscal years are no longer shown once the tax return
    has been read.
  - **Website suggested from the domain of the professional email**, to be confirmed; never for a consumer email
    provider.
  - **8 questions**, one per screen, with quick choices, and skipped when they do not apply. "I don't know" for the
    capital held by individuals counts as "no" (standard corporate tax rate, prudent).
  - **Website facts pre-ticked** (the owner unticks what is wrong) and logo suggested.
  - **Grouped drafting**: valuation, datapack, teaser, 8 sections, 4 at a time; resumption without redoing what
    exists.
  - "File ready" email sent once. **Single reminder** after 3 days (daily scheduled task, 8 a.m. UTC).
  - Size premium and discounts moved to "Fine-tune (for your advisor)".
  - "Next step" card on the dashboard.
  - Fixes:
    - race condition when creating the memo document (fixed identifier, `INSERT OR IGNORE`);
    - `ev.currentTarget` emptied after `await` (choices saved without moving to the next screen; "Recalculate" button
      left greyed out).
  - End-to-end trial with a simulated Claude (`ANTHROPIC_BASE_URL`, development setting absent in production):
    **21 actions by the owner after the SIREN** (versus about 110), desktop and mobile, without errors.
  - Tests: 197.
- **10/11/2026, "The bell" 3D goes live** (owner's approval): the `3d-v2-cloche` branch is merged without conflict.
  Tests: 211. Bell and sign-in window checked locally. Frames-per-second measurement not conclusive that day (test
  machine very busy: load average of 21); to be confirmed on a real MacBook with `?debug`.
- **12/11/2026, landing page redesign (brief `_refonte/PROMPT-CLAUDE-CODE.md`, kit not under version control)**: local
  branch `refonte-landing` from `main` (the 3D branch `3d-esquisse-edifice` stays archived: no more 3D on the landing
  page). Owner's decisions (approval of 12/11/2026): Geist font kept (no Inter); 9 chapters aligned with the real memo
  (Summary, History, Know-how, Customers, Team, Accounts, Strengths, Deal) plus the Value; "an expert to talk to"
  removed as long as the chat does not exist; "Keep my estimate" (sign-in by code) instead of sending by email;
  invitation of the accountant through a prefilled email, without sharing data; anonymity: age in bands, industry at
  the NAF division level, code name derived from the NAF code (never from the SIREN) and reused in the file; "Two
  figures are enough" (revenue and EBITDA); "about 20 minutes" badge removed.
  - Phase 2 (foundations): texts in `src/contenu/landing.json`, set by the Worker (HTMLRewriter,
    `src/routes/landing.js`, `run_worker_first` includes `/`); an empty key removes the element. Stylesheet
    `public/css/landing.css` (typographic rules, `--ocre-texte` #8E5530 for small texts, `--tampon`).
    Instrument Serif italic restored from the git history. No more 3D, figures band or "To be filled in".
    Search and estimate kept (`public/js/landing/`), temporary result until phase 7.
    Acceptance tools: `playwright-core` 1.64.1 and `axe-core` 4.14.0 (development only).
  - Phases 3 to 8 (12-13/11/2026): shared SIREN field, intro, history of the keys, sections, code-name demo, result
    screen (code name derived from the NAF code, quick teaser on the server side, INSEE NAF divisions), acceptance.
    Tests: 261. axe-core: 0 violations. Lighthouse mobile 99 / 100 / 100 / 100 (LCP 1.3 s, CLS 0). Report,
    measurements, screenshots and "To provide" list: `docs/REFONTE-LANDING.md` (removed on 19/11/2026, home page
    redone since; see the git history).
  - **13/11/2026, deployment** (owner's approval): merged into `main` (`2431141`), push, `wrangler deploy`
    (Cloudflare version 95d46642). Checked online: new page, real estimate (319252813), no errors.
- **13/11/2026, light version of the top of the landing page** ("light start" brief, owner's approval): flat header
  (centered field, second line below 1,024 px, fixed bottom bar removed), hero video in a card, cream and ink intro;
  History in a card with the same outline on a sand background in CSS (no more workbench, lamp or dust), brown
  shadows; arrival: key ring thrown on the table (formulas from the brief). Eyebrows #765840 (the brief's #7A5C42 does
  not reach 4.5:1 in the corners of the sand). Tests: 265. Merge `2ffb2c5`, Cloudflare version 5a120c85, checked
  online. References from the brief (film, light frames, light prototype) missing from the kit: frame-by-frame
  comparison to be done when they are provided. "And yours?" and the result screen remain on the wooden workbench.

- **13/11/2026, new structure of the home page** ("home" brief, branch `refonte-landing`, six commits, no push):
  twelve parts in the brief's order (hero, result, history, how it works, why, confidentiality, team, proof, guides,
  questions, final call to action, footer). History in four stages ("And yours?" merged, code-name gestures at the
  threshold, SIREN field), 400vh; steps in ARIA tabs; green, sand and ochre cards; no more wooden workbench or video
  after the hero; sections and elements removed as long as their key is empty ("To provide" list in
  `docs/REFONTE-LANDING.md`, removed on 19/11/2026). Lighthouse: accessibility 100 (desktop and phone), performance 99
  and 98, layout shift 0. Tests: 289.
- **17/11/2026, simpler onboarding** (branch `simplification-ux`, from `refonte-landing`, not published): UX review of
  the MVP (home page, result, owner's space, guided steps) then fixes, at the owner's request ("do everything").
  - Result: "Keep my estimate" and "Refine it" led to the same sign-in; a single main action "Open my file, for free",
    the invitation to the accountant as a secondary action.
  - Consistency: same range everywhere (€290 – 490K and not €293K – €489K on the dashboard); "My file" in every bar;
    the valuation page becomes the "detailed mode".
  - Guided steps: "Already done" screen (company, public accounts, first value); without a tax return, entry of the
    essentials within the steps (one fiscal year, required items, public EBITDA reused) instead of the table of
    22 lines × 3 fiscal years; the website becomes the first question (read during the following ones, "no website"
    recorded).
  - Dashboard: next step + status of the 4 documents; document list and deletion collapsed; sign-out at the top.
    Overall progress based on the steps: 25% on arrival instead of 6%.
  - Landing page: history of the keys in 280vh instead of 400vh (8.7 screens instead of 9.9).
  - Not done, waiting for the owner: price (`prix_dossier`, `faq_prix`) and founder; drafting screens not reviewed
    locally (reading by Claude inactive without a key).
  - Tests: 289; flow checked in the browser (1440 and 390 px) up to the second question.
- **17/11/2026, visual touch-ups to the landing page** (owner's choice, hero unchanged): cream, green and black
  backgrounds only (no more sand or ochre); serif italics on 3 titles instead of 13; round stamp on the final call to
  action, handwritten annotation and paper clip in "How it works"; scroll-triggered reveals
  (`public/js/landing/apparitions.js`). axe-core 0 violations, layout shift 0.
- **17/11/2026, deployment** (owner's approval): `refonte-landing` (home page structure of 13/11),
  `simplification-ux` and `esthetique-landing` merged into `main` (`b4c3cb2`), push, `wrangler deploy` (Cloudflare
  version c633bbf6). Checked online: new page, real estimate 434436622 (€290 – 490K, two options), private routes 401,
  axe-core 0 violations, no JavaScript errors.
- **17/11/2026, landing page v3 deployed** (9 proposals kept by the owner, before/after mockup approved): section
  "What you receive" (teaser, memorandum, datapack as HTML previews, fictitious example); duplicates removed (a single
  "Projet Chêne" file); Why and Confidentiality merged, confidentiality first; "Sample file" in the menu; "How it
  works" as a timeline without tabs (`frise.js` replaces `onglets.js`, classes `comment-frise` / `comment-etape`
  because `.frise` and `.etape` exist in `styles.css`); a line of proof under the field and hero tiles in the first
  screen; Why cards with the same structure; eyebrows on kraft labels (contrast tested on the measured color of the
  image); ring of the nine keys in the footer.
  Merge `91efd56`, Cloudflare version 7a050746. Checked online: expected sections and menu, 9/9 keys visible, real
  estimate 434436622 (€290 – 490K), private routes 401, axe-core 0 violations, no JavaScript errors.
  Tests: 291. Longer page: about 10 screens on desktop, 16 on phone.
- **17/11/2026, "investment bank" memorandum** (branch `memo-banque`, not published): inspired by the conventions of
  two investment-bank memorandums provided by the owner (no content reused). Kept: code name on the cover; summary
  built on six numbered strengths (one per chapter, page reference); assertive titles drafted (editable); source under
  each page of figures; 3-year income statement (% of revenue, annualized growth, CAGR); reported → adjusted EBITDA
  (justifications as references); net debt / normalized EBITDA; working capital in days; top five customers
  anonymized; diagram of the scope (holding company, premises); footer with code name · month · "Strictly
  confidential" · page. Left out: watermark, "for the attention of", disclaimer on page 2.
  No price or value in the memorandum (landing page card: "8 chapters"). Guided steps: 10 questions (holding of the
  shares, premises and what happens to them, top five customers). Drafting instructions rewritten (partner in an
  investment bank; figures copied from indicators calculated by the code). Tests: 309. Checked locally with a
  fictitious file and a simulated Claude (`ANTHROPIC_BASE_URL`): 14 pages, no overflow, 14-page PDF.
- **17/11/2026, memorandum v2: market and "wow" layout** (branch `memo-banque`, not published). Two more memorandums
  provided by the owner as a reference (conventions only, nothing reused).
  - Nine chapters in five parts (Summary; The company; Market and customers; Financial performance; Outlook and
    deal), each part opened by a full-frame page with a large number; contents by part.
  - New Market chapter: industry structure taken from the public directory (`src/sources/secteur.js`, active
    companies with the NAF code in the region by headcount band, and in France for 10 employees or more; the API's
    10,000 cap flagged; 24-hour cache) + market facts found on the web by Claude (web_search tool,
    `rechercherMarche`): a fact is kept only if its address is among the pages actually returned by the search, then
    the owner approves them one by one. 3 studies per file (`MARCHE` in config.js). Customers becomes a separate
    chapter.
  - Layout: summary as an infographic (rings of key figures, deal box), six strengths around a medallion with the code
    name and grouped by theme, drafted bullet points turned into cards with pictograms, "Key takeaway" band at the
    bottom of each chapter, arrow timeline, market cards with a large figure and source.
  - Tests: 313. Checked locally (fictitious file, simulated Claude, sample market facts marked "fictitious"):
    22 pages, no overflow, no errors.
- **17/11/2026, memorandum v3: "investment bank" typology** (branch `memo-banque`, not published). Owner's feedback:
  v2 "looked too AI". New layout modeled on the conventions of an investment-bank memorandum provided as a reference
  (conventions only, nothing reused): stylesheet `public/css/memo-im.css`, rendering in `public/js/memo.js` (prefix
  `im-`).
  - "part.page" pages (1.1, 1.2…): number in the accent color, title in small capitals, key message in the accent
    color, square bullets, boxes with a solid header band, footer with sources, notes, date and number.
  - Cover with the code name, contents paginated by part, glossary, opening pages with a large number and band,
    disclaimer on the last page (with the rule "do not contact employees, customers, suppliers").
  - Summary: column of key figures with pictograms, text, map and deal; "Key investment highlights" (six numbered
    lines). History as a timeline; market with a "Key data" band and industry structure as bars; numbered market
    drivers with large-figure tiles; customers (concentration, map, table); financials on 4 pages (charts with
    labels, income statement, adjusted EBITDA with a cascade bridge and numbered references, debt and working
    capital); outlook; legal structure chart; process in five lanes.
  - "Photo to be added" placeholders when the owner has not uploaded a photo. Non-breaking thousands space (U+00A0)
    for bold display. Tests: 313. Checked locally: 24 pages, no overflow, 24-page PDF.
- **18/11/2026, "bento" home page deployed** (mockup approved by the owner, inspired by skarlett.fr for the form,
  nothing reused): the video at the top, cut by a notch (bottom right) holding an example estimate marked "fictitious
  example" (`public/js/landing/encoche.js`, clipping path recalculated at every size; on phones the card sits on the
  bottom of the video); titles in narrow capitals (Big Shoulders, already present); line "Data from INSEE · INPI ·
  BODACC"; file in 3 blocks; steps with large numbers; confidentiality in one green block (hidden name that becomes
  "Projet Chêne"); FAQ and final call to action kept. Removed: the history of the keys (280vh), the hero tiles, the
  "Why" cards and the previews of the deliverables. Stylesheet `public/css/landing-bento.css`, new texts in
  `landing.json` (`hero.carte`, `hero.coches`, `sources`, `dossier`). Tests: 312. The flow after the SIREN (branch
  `parcours-performant`) is not merged yet.
- **18/11/2026, memorandum v5 (branch `memo-bento`, not published)**: art direction of the site (green, copper,
  cream, narrow capitals, notch) and denser pages at the owner's request. Drafting instruction: 280 to 450 words, 5 to
  8 bullet points of two or three sentences (fact, explanation, consequence for a buyer). Pictogram per bullet point
  according to its theme; introduction highlighted; 4.1 with the breakdown of revenue (ring calculated from the income
  statement, left out if the items do not add up to within 8%) and ratios; working capital as bars; page tightened
  before opening a "(continued)" page. Test case for the complete flow: `test/fixtures/` (test 2033 tax return for
  434436622, real 2024 revenue and net income, the rest fictitious; answers to the questions).
- **18/11/2026, deployment** (owner's approval): `memo-bento` (memorandum v5, filled pages) and
  `parcours-performant` (flow after the SIREN) merged into `main`. Flow checked locally end to end
  (home page → code → entry → 11 questions → drafting → "Your file is ready"): valuation, datapack, teaser,
  market research and 9 chapters out of 9. Tests: 314.
- **18/11/2026, after the SIREN in the "bento" direction** (branch `apres-siren`, not published; mockup approved by the
  owner, with the request "answers already prepared, the seller only has to approve them"):
  - Estimate: the key ring is replaced by the analysis in four steps that light up (registries, public accounts,
    multiples, code name); result as tiles ("What we read" with the real data, "With your file").
  - Guided steps: 15 questions (5 new ones: distinctive features, team, key dates, customers and growth
    opportunities, handover), answers prepared by `src/documents/propositions.js` (registries, accounts, approved
    website facts, common choices marked "to be confirmed"), route `GET …/documents/memo/propositions`, nothing is
    saved before "That's right, continue"; tiles with pictograms; "Where your answer goes" panel; step rail.
    The new answers feed the chapters (history, organization, customers, outlook, deal).
  - Owner's space: code name, progress ring, value, next step, documents as tiles.
  - Documents: Drive-style upload (migration `0003_pieces.sql`, `src/routes/pieces.js`, R2 `dossiers/<id>/pieces/`),
    20 MB per file, 80 per file folder, office file types and images; the document is ticked on upload and unticked
    when its last file is deleted; everything is erased with the file. Tests: 323.
  - In production, apply the migration: `npx wrangler d1 migrations apply passation --remote`.
- **18/11/2026, `apres-siren` deployed** (owner's approval; multiples blurred in the estimate result at the owner's
  request, visually only: they stay in the API response). Migration `0003_pieces.sql` applied in production before the
  deployment.
- **18/11/2026, home page v4** (branch `accueil-v4`, from `main`, not published): smaller fonts; hero in two parts
  (text and field at the top, smaller video below) with four bubbles placed in notches (`encoche.js`,
  `cheminEncoches`): 30 s, 3 methods, code name and sample estimate marked fictitious, documents; compact estimate
  result with a single next step ("See my file", tile listing what the file contains); steps and guarantees as tiles;
  final call to action as a light card and rounded green footer with the name in very large type (in the style of
  skarlett.fr, nothing reused); key ring removed. Tests: 323.
  - Touch-ups approved by the owner: three bubbles straddling the edges of the video (no more notches, `encoche.js`
    deleted); **single font across the whole site**: titles in narrow capitals (Big Shoulders), everything else in
    Geist (no more serif italics, monospace or handwriting in the interface; the memorandum keeps its own
    typography). Deployed on 18/11/2026.
- **18/11/2026, home page v5** (branch `hero-forme`): the hero becomes large again, the video in a non-rectangular
  shape (asymmetric 40/120 px corners, notch at the bottom center holding the SIREN field,
  `public/js/landing/forme-hero.js`, path recalculated at every size); title and text inside; three bubbles
  straddling the edges (hidden below 900 px); on phones, asymmetric corners and field inside the shape.
  - Then, from a model provided by the owner: the video is cut around four bubbles placed in a corner or on an edge
    ("puzzle pieces"), all corners rounded including the inward ones: `polygone` + `cheminArrondi` (tested,
    `test/forme-hero.test.js`); text and field inside; bubbles hidden below 900 px.
- **18/11/2026, home page v5 online**: Pull Request #2 (`hero-forme`) merged, deployment (Cloudflare version
  df47ead9). Checked online: four bubbles and cut-out shape, no resource in error (a 404 cached just after the
  deployment on `forme-hero.js` cleared in less than a minute), estimate 434436622 ok, private routes 401. Tests: 359.
- **18/11/2026, branch `memo-presentation`** (includes `marche-rapide`), not published, owner's feedback after the first
  real test:
  - Market research capped at two minutes, never run twice (409 if in progress), chapters without waiting.
  - Valuation: **multiples only by default, DCF as an option** (weighting in "Fine-tune"); `hypotheses.json` updated;
    tests adapted (the datapack tests the formulas with the DCF at 40%).
  - Short chapters: structured output (two-sentence introduction, 4 to 6 points with title + text), lengths
    guaranteed by `src/documents/concision.js` (tested); what is missing goes into "To be completed", not into the
    text.
  - Memorandum in presentation mode: one page at a time, thumbnails, keyboard arrows; panel on the right with
    recommendations (documents to complete, missing photo, market figures to check, text too long) and actions
    (redraft, edit the text); sources (website, photos, market) collapsed at the bottom.
  - Flow: summary of the prepared answers on one screen (one-click approval), then only the unanswered questions; a
    draft taken from the registries is never approved in one click. Tests: 328.
  - Integration with `main` (branch `integration-memo-presentation`, not published): four conflicts resolved (Claude
    quota from `main` kept, answered after the 409 so that a duplicate request consumes nothing); demonstration
    scenario updated (multiples only by default, 60/40 as an option; `docs/DEMO.md`); the flow no longer runs a second
    market research after a failure (checked with a simulated Claude outage: 1 call instead of 2); small copper texts
    in #8E5530 (AA contrast); exact DCF text when the size premium is missing. New tests: 409 lock, quota, 110 s
    budget. Tests: 373. axe-core: 0 violations on the summary of answers and the memorandum (1440 and 390 px).
    `/espace/` keeps 6 violations already present on `main` (ARIA tabs, contrast), to be handled with the redesign of
    the file page.
- **18/11/2026, PR #5 deployed** (integration of `memo-presentation`, owner's approval): deployment from `main`
  (Cloudflare version c9c46e37), no migration to apply. Checked online: memorandum page by page and summary of answers
  served, private routes 401, estimate 434436622 ok, no resource in error on the home page. Tests: 373. Memorandums
  already drafted keep their old texts until "Redraft".
- **19/11/2026, branch `parcours-coherence`** (PR not merged, not deployed), fixes from the audit of the flow: a single
  range (never a central value on screen; "Estimated enterprise value" for the quick estimate, "Value of your shares"
  afterwards, sentence that explains the gap from the calculated amounts); no more DCF or "three methods" on the
  owner's side (engine and datapack unchanged); single state `etatParcours` read by the file page and the final
  screen of the guided steps ("ready" and 100% only if everything required is done); a single list of steps
  (`ETAPES_PARCOURS`); questions = those of the guided steps + the website (14), the rest "Going further", screens seen
  recorded (step `parcours`); main action = first task; only the latest fiscal year is required, the two previous ones
  optional, isolated INPI years not reused. Tests: 457.
- **19/11/2026, repository cleanup** (PR #17, batch A, then batch B after the open PRs were merged): leftovers of the
  former "history of the keys" on the home page (modules, images, content), images and fonts never downloaded
  (including Geist Mono: `--mono` points to Geist since 18/11), 891 dead CSS selectors (no element in 80 screenshots and
  a class or id absent from every served source), 116 keys of `landing.json` never read, unused exports.
  Evidence: green tests and pixel-by-pixel screenshots (19 pages, 1440 and 390 px, normal and reduced animations), no
  difference other than noise. Tests: 466 (including "no orphan key" in landing.json).
- **20/11/2026, branch `feat/site-bilingue`** (not merged, not deployed): bilingual site, English by default at the
  current addresses, French under `/fr/`, "EN | FR" switcher. Texts in `src/contenu/<language>/*.json`
  (`landing.json` becomes `fr/accueil.json`, shared settings in `cles.json`), set by the Worker for all pages
  (`src/routes/pages.js`, formerly `landing.js`) and read by `t()` in the JavaScript and the Worker. Choice answers
  saved in French, labels translated; documents drafted in the language of the interface; daily reminder in French.
  SEO: `hreflang`, `canonical`, `og:locale`, `sitemap.xml`, `robots.txt`. French pages compared pixel by pixel at every
  step. Tests: 485.

- **23/11/2026, branch `livrables-police-geist`** (PR not merged, not deployed): a single font, Geist, in the
  deliverables. Titles in 500 / -0.05em / line height 0.94, settings held in variables (`--titre-police`,
  `--titre-graisse`, `--titre-interlettrage`, `--titre-interligne`, scale `--titre-1` to `--titre-4` = 44 / 32 / 24 /
  18 px, in `cqw` in the memorandum for a 1100 px page); titles in sentence case; body text in Geist 400.
  Memorandum (`memo-im.css`), teaser (`styles.css`), course business plan and presentation (PDFs regenerated, 7 and 10
  pages). Datapack: Arial kept (Excel does not embed web fonts), sizes 22 / 16 / 12 / 10 / 9 pt centralised
  (`POLICE_DATAPACK`, `TAILLES_DATAPACK`), two columns widened (no truncated cell, FR and EN). Instrument Serif was no
  longer rendered anywhere: font, licence and legal notice removed. Big Shoulders stays on the site.
  Tests: 543.
- **24/11/2026, branch `memo-phase2`** (PR not merged, not deployed), options approved by the owner (PR #35):
  photos assessed by Claude (vision, `claude-haiku-5-5`, image reduced to 1,568 px in the browser, JSON validated by
  `src/documents/jugements.js`, nothing applied without "Use as suggested"); 12 photos (`PHOTOS_MAX`, a single
  definition in `src/config.js`, passed to the browser by the API), reorderable, placed by category without
  duplicates (`placementPhotos`), site photos filtered by their real dimensions and fingerprint (`mesurerPhotos`);
  "Your management team" screen (1 to 4 people, consent required for each photo) and "The management team" page of
  the memorandum, never in the teaser (names added to the anonymity blocklist); page fill measured by area, merge
  below 16 %, table of contents recalculated, "Items to complete" at the end of each part (`public/js/memo-pages.js`);
  critical review in the side panel ("Yes, correct it" without touching any figure, conciseness checked again);
  panel with short titles that expand in place (`public/js/ameliorations.js`); "credit exhausted": a clear message
  for every drafting and analysis. Security: file paths never come from the browser any more. Tests: 586.
- **24/11/2026, branch `parcours-v2`** (PR not merged, not deployed), mission given by the owner (parts A to D, in this
  order, one PR replacing #32):
  - A. Maxime's English translation (PR #32) merged from its last clean commit `dbae4d1`: code kept from `main`,
    documentation in English completed with what `main` had added, deliverables in English with the Geist font.
  - B. Account required after the SIREN: no amount without a session (checked on the server), email verified by the
    6-digit code then a password (12 characters at least, common ones refused, PBKDF2-SHA256 100,000 iterations recorded
    in each hash and recalculated when the target changes), 5 failures → 15-minute block per account and per IP,
    forgotten password and change of password closing the other sessions. Migration `0004_mot_de_passe.sql`.
  - C. Two stages: « Your valuation » (three fiscal years, adjustments never answered in advance, net debt and scope,
    « Your value » with the bridge visible, approved by the owner; « to approve again » when the figures change), then
    « Your memorandum » (refused by the server before the approval). Leasing: convention FIN-05 kept and stated.
    Existing files drafted before: banner « Nouvelle étape », answers kept.
  - D. Logo and photos guided: screen always offered, attestation above the upload, several files with progress,
    reduction in the browser, advice for every error, place of each photo in the memorandum.
  - Local check without the Claude API: `scripts/claude-simule.mjs`. Tests: 649.
- **25/11/2026, branch `no-password`** (PR not merged, not deployed), decision of the owner: the account stays required
  after the SIREN, but sign-up and sign-in use only the 6-digit code sent by email (single use, 10 minutes,
  5 attempts, stored hashed). Password, tickets, failure counters and PBKDF2 removed; migration `0004` deleted before
  it was ever applied in production. The masking of amounts without a session, the public card and the two-stage
  flow are kept.
- **25/11/2026, branch `memo-finitions-chiffres`**, after the owner read the memorandum:
  - No page « Éléments à compléter » in the document any more (it was printed in the PDF sent to buyers): what is
    missing is listed in the « À améliorer » panel only; a chapter with no data stays in place, « À compléter ».
  - The summary has no request of its own (it sums up the detailed chapters, which raise what is missing).
  - A review correction that would make the chapter too long, or whose passage changed, is no longer offered
    (« Oui, corriger » then refused); the remark stays.
  - Owner's pay and rent adjustments carry their basis, written by the code from the owner's amounts, in the adjusted
    EBITDA table and in the data given to Claude (it wrote « justification : à compléter »).
  - Panel: « Ajouter les exercices précédents » (essential) when fewer than three fiscal years are presented.
  - An earlier fiscal year now needs only its income statement (revenue, expenses or published EBITDA): the owner's
    2023 and 2024, entered without their balance sheets, were left out and the memorandum showed 2025 alone. The
    latest fiscal year used stays complete; working capital and its average skip a year whose balance sheet is
    incomplete (never a missing item as zero, in the engine and in the datapack formulas). The key of the approved
    figures is unchanged for files whose fiscal years are complete (no « to approve again » after the update).
  - Panel: « Compléter les comptes 2023, 2024 » when entered fiscal years are still left out; « Cette page / Toutes »
    filter (the improvements of the page on screen by default).
  - Review: Claude is asked for corrections no longer than the passage they replace.
- **26/11/2026, branch `business-plan`** (PR not merged, deliverables only): business model of the EDHEC deliverables
  taken from the 36-month financial model provided by Eros (`docs/livrables/business-plan-model.xlsx`, unchanged).
  Business plan: section 4.4 (two revenues: Full Report at €850 excl. VAT, or finder's mandate with a 2% commission,
  at least €10,000, paid at signing; conversion funnel; 3-year table, scenarios, unit economics, key assumptions),
  summary, model-specific risks (with the Hoguet law cited from Légifrance), roadmap (payment and mandate not
  developed; online version free during the test phase), appendix with the assumptions of the three scenarios;
  11 pages. Presentation: « Data and business model » slide, 8 minutes unchanged. Site, code and tests unchanged.
- **26/11/2026, branch `parcours-allege`** (PR, not merged, not deployed), owner's path made lighter after the audit of
  25/11:
  - Fixes: the approval stays up to date while the approved range (low and high, to the thousand euros) is unchanged;
    the balance check runs only when net fixed assets are entered (example file: 510 k€ in 2024, 520 k€ in 2025);
    the question counter counts over all the screens of « Votre entreprise ».
  - Text: one sentence of 15 words at most under each title, field help behind an accessible « ? », no sentence at
    the bottom of the screens, no slider on euro amounts, the « Réponses préparées… » line removed.
  - Net debt: the items are ticked first (or « Aucun »), then one field per ticked item; unticking erases the amount.
  - Adjustments: one card at a time (pay, rent, exceptional items) under a sticky EBITDA line; leasing as one line
    with a « ? »; « Valider » waits for the three cards.
  - File page: compact step bar, value card on one line, one « Prochaine étape » card (approve again → resume →
    memorandum points → documents, two secondary links at most); documents to gather folded until the memorandum
    is ready.
  - Home page: 300 words at most in French; sections that repeated an argument removed (confidentiality, final call,
    sources band, hero bubbles, duplicate documents list).
  - Pure functions tested: `public/js/dette-elements.js`, `retraitements-cartes.js`, `prochaineEtape`. Tests: 671.
- **27/11/2026, branch `remise-finale`** (PR reviewed by the team, not merged by its author, nothing deployed), final
  submission documents; no change to `src/`, `public/`, `migrations/`, `wrangler.toml` or `package.json`:
  - README (both languages): « Who it is for », « Free data and APIs » (terms of use checked in `src/lib/requete.js`),
    « Assumptions », « Synthetic data », « Number checks », « Team » (from merged PRs and reviews), « Deliverables
    (where to find them) »; CSP limitation removed (the headers exist); installation checked on a fresh clone.
  - `test/rapprochement-sources.test.js`: retained revenue, EBITDA and net income reconciled with the published
    accounts on the six recorded real responses. `docs/verification-calcul.md`: step-by-step recalculation of the
    demonstration valuation (€0 difference).
  - `.env.example`; outdated presentation draft (HTML and PDF) removed; `docs/livrables/README.md` status table.
  - Business plan final (11 pages of body): sourced market (Bpifrance Le Lab study via Bpifrance Création),
    competitors with public prices, SDG target 9.3, transformation, controls, « Sources » appendix; section 4.4
    unchanged. `AI-USAGE.md`: facts proven in the repository only.
  - Left for a separate PR: the presentation (`docs/livrables/presentation.pptx` and `.pdf`). Tests: 695.
- **28/11/2026, branch `nettoyage-final`** (cleanup before the submission, no change in behavior):
  - Dead code removed, each item with zero references (`git grep`): `PALIERS_MARGE` (`src/documents/teaser.js`),
    `MESSAGE_CLE_REFUSEE` (`src/lib/claude.js`), `public/img/photos/etape-artisane-2400.webp` (not in any `srcset`),
    `scripts/polices-landing.mjs` (empty font list since 23/11/2026), devDependency `axe-core` (no import).
  - 69 translation keys no longer read, removed in both languages (screens replaced by the lighter flow of PR #43).
    Keys built in pieces (`ligne_${…}`, `conflit_${…}`) were matched against every dynamic pattern of the code first.
  - CSS rules of 41 classes no longer used, removed from the five style sheets (selectors shared with live classes
    kept).
  - Checked: `npm test` 695/695, `npm run i18n:check`; the whole flow run in a browser on `main` and on this branch,
    in English and French (42 screens each): no raw key on screen, same console messages as `main`, and 79 of 84
    screenshots identical to the pixel (the other 5 differ by the test email address and by anti-aliasing, at most
    0.03% of pixels).
  - Indexes added: `scripts/README.md`, `docs/README.md`. Kept on purpose: `docs/captures/` and `docs/maquettes/`,
    shown in the descriptions of 16 pull requests.
  - Legal pages: the privacy page showed the raw template « {legal.raison_sociale}, {legal.adresse} » online, and the
    legal notice showed « Publisher details: to be completed ». The identity line is now removed while the legal fields
    are empty, and both pages state that Passation is a student project of EDHEC Business School, published by the
    project team, contact through the GitHub repository (test added in `test/pages-legales.test.js`; 696 tests).
  - Transparency: README, README.fr and AI-USAGE state that 47 commits were pushed directly to `main` before
    18/11/2026, while the first version was built alone; since then every change goes through a pull request and
    `main` is protected. Business plan § 2.2: evidence from the Bpifrance study only (no interviews were conducted).
- **28/11/2026, PRs #46 and #47, then branch `corrections-audit`** (audit of the repository against the EDHEC brief):
  - #46 and #47: presentation with a live demo on the site (slide 4), product screens as backup, and the three
    remarks of Mohamed Reda Aboualam's review applied. `main` protected the same day (pull request with one approval,
    `tests` check required, force-push and deletion blocked); the 60 merged or obsolete branches deleted.
  - Simulated Claude (`scripts/claude-simule.mjs`): its texts said « Exemple simulé », and « exemple » belongs to the
    name of the demonstration company, so the anonymity check refused the teaser in local mode. Texts reworded; the
    teaser is accepted again (checked through the API).
  - Business plan § 2.1: how the problem is solved today and what it costs (sourced valuation prices, 12 to 18 months
    of preparation), as the brief asks. AI-USAGE.md: agents, skills and review loops, three more errors caught.
    README: Known limitations and Team section brought up to date.
