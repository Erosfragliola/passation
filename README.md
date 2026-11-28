**English** | [Français](README.fr.md)

# Passation

[![Tests](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml/badge.svg)](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml)

A web platform that helps owners of French small and medium-sized businesses (SMEs) prepare the sale of their
company: from a first estimate based on the SIREN number (the French company identification number) to the documents
handed to potential buyers (Excel datapack, anonymized teaser, information memorandum).

Project for the course "Programming and AI for Corporate Finance" (EDHEC Business School, 2026).

**Live:** https://passation.eros-fragliola-freedom.workers.dev (English at `/`, French at `/fr/`).

## Who it is for

The owner of a French SME (identified by its SIREN) who is preparing to sell the company and wants, before meeting an
advisor or a buyer, a sourced first valuation and the usual sale documents. Their chartered accountant or M&A advisor
can review the figures and the documents with them.

## What the application does

| Feature | Status | Depends on |
|---|---|---|
| Public profile of the company without an account (SIREN or company name); quick estimate (enterprise value range based on sourced EBITDA multiples) once the account is created | Available | Free public APIs |
| Account required after the SIREN, created and opened with a 6-digit code sent by email; owner's space; guided steps that can be resumed | Available | Brevo (locally: code shown in the terminal) |
| Bilingual interface, English (default, at `/`) and French (at `/fr/`), with an "EN \| FR" language switcher | Available | — |
| Guided steps in two stages: 1. Your valuation (three fiscal years, adjustments, net debt and scope, « Your value » with the bridge from EBITDA to the value of the shares, approved by the owner), 2. Your memorandum (company, photos and logo, management team, drafting); the memorandum only after the approval | Available | — |
| Entry of the accounts and consistency checks (balanced balance sheet, published revenue, unit, suspicious change, net income above EBITDA, negative equity, revenue up or down by more than 30 %) | Available | — |
| Automatic reading of a PDF French tax return (*liasse fiscale*): amounts are proposed, never approved automatically | Available | Claude API (paid) |
| Detailed valuation: EBITDA multiples, 5-year DCF, adjusted net assets (ANCC), adjustments, discounts, bridge from enterprise value (EV) to equity value, sensitivities | Available; **the DCF requires a size premium** (no free public source: to be set by the owner) | — |
| Excel datapack (9 tabs, live formulas) | Available | — |
| Anonymized teaser, with an automatic anonymity check | Available | Claude API |
| Information memorandum (9 chapters, approved facts, sourced market research) | Available | Claude API (web search for the market research) |
| Logo and photos: upload of several files with progress, reduced in the browser when heavy, attestation above, Claude's assessment and place in the memorandum for each photo | Available | Claude API (assessment) |
| Upload of the file's supporting documents | Available | — |
| Word export of the memorandum | Not developed (printable PDF version) | — |
| Resource library, "Sale expert" chat | Not developed | — |
| Account deletion from the owner's space | Not developed (deleting the file itself is available) | — |

**Without an Anthropic key**, the estimate, data entry, checks, detailed valuation and datapack all work; tax-return
reading and drafting answer "unavailable".

## Principles

- **AI drafts, code calculates.** Every value is produced by deterministic, tested code. Claude reads documents
  (amounts proposed to the owner) and drafts text from the results; it does not calculate any value.
- **No invented data.** Industry multiples and assumptions are stored with their source and date in `src/data/`. A
  value without a source stays "To be completed" (for example the size premium, hence the optional DCF).
- **The owner approves.** Only complete, approved fiscal years go into the calculation; an incomplete fiscal year is
  left out and flagged, never filled with zeros. Out-of-range settings are rejected with a message.
- **Security and GDPR**: no amount sent by the server without a session; sign-in code hashed (salt + server secret),
  single use, 10 minutes, 5 attempts, same answer whether or not the address has an account; cookie
  `HttpOnly; Secure; SameSite=Lax`; origin check (CSRF); every private route checks that the file belongs to the user;
  rate limits based on a hash of the IP address; daily quotas for Claude processing; one-click deletion of the file and
  its documents (the account itself is not deleted: see `public/confidentialite.html`).

## Free data and APIs

All the company data comes from free public sources that need no key. Calls follow the terms of use
(`src/lib/requete.js`, `src/config.js`): an identifying User-Agent (`Passation/0.1 (outil de preparation de cession
de PME)`), responses cached for 24 hours in D1 (`DURATIONS.apiCache`, `src/lib/cache.js`), and up to 4 attempts
spaced out exponentially on a 429 (too many requests) or a 5xx error, following the `Retry-After` header when it is
short. An API outage is reported as such (never as missing accounts) and is not cached.

| Source | URL | What we take from it | Access |
|---|---|---|---|
| Company search API (French government) | https://recherche-entreprises.api.gouv.fr | Identity, NAF code (French industry classification), headcount band, headquarters; counts of companies by industry and region (Market chapter) | Free, no key |
| `ratios_inpi_bce` dataset (data.economie.gouv.fr) | https://data.economie.gouv.fr/explore/dataset/ratios_inpi_bce/ | Published revenue, EBITDA (French *EBE*), EBIT and net income per fiscal year | Free, no key |
| BODACC (official bulletin of civil and commercial announcements) | https://bodacc-datadila.opendatasoft.com | Events: incorporation, moves, acquisitions of businesses | Free, no key |
| EBITDA multiples by industry | `src/data/multiples-sources.json` (URL and date of each source) | Cross-check of Argos Index Q2 2026, Dealsuite/Fusac (via Capital Stack), Captain 2026 scale, Damodaran Europe 01/2026, calculated with `npm run multiples` | Free publications |
| Valuation assumptions | `src/data/hypotheses.json` (URL and date of each value) | Risk-free rate, cost of debt, risk premium, betas, corporate income tax, perpetual growth (ECB, Banque de France, Damodaran, service-public.fr) | Free publications |
| English industry names | `src/data/naf-divisions-en.json` | Eurostat, NACE Rev. 2 division titles (same divisions as the French NAF Rev. 2) | Free publication |

**Claude API (Anthropic), the only paid service, pay-as-you-go** (models `claude-sonnet-5-5` and `claude-haiku-5-5`,
`src/config.js`). It is used only to **read** (tax returns, the company's website, photos) and to **draft** (teaser,
memorandum, market research). It never calculates a value: the valuation and the Excel datapack work without it.
With the simulated Claude (see « Local check without the Claude API » below), the whole flow runs without any key.
Other services: Brevo for sign-in emails (limited free plan) and Cloudflare Workers, D1 and R2 (free plan).

## Assumptions

| Assumption | Where it is written |
|---|---|
| Amounts are in euros (EUR), as published in the French accounts | [docs/valorisation-calculs.md](docs/valorisation-calculs.md) (test case), [PLAN.md § 1](PLAN.md#1-what-the-public-apis-really-return-tested-on-10112026-siren-434436622) |
| French companies only, identified by their SIREN (9-digit number of the French register) | [PLAN.md § 4](PLAN.md#4-pages-and-api-routes) (`/api/company/:siren`) and [§ 11](PLAN.md#11-flow-after-the-siren-and-deliverables-decisions-of-10112026) |
| A fiscal year is a closed accounting year (closing date of the filed accounts) | [PLAN.md § 1](PLAN.md#1-what-the-public-apis-really-return-tested-on-10112026-siren-434436622) and [§ 5.1](PLAN.md#51-quick-valuation) |
| At most 3 fiscal years; the latest one used is complete, earlier ones are kept for their income statement | [PLAN.md § 5.2](PLAN.md#52-detailed-valuation) (average of the last 3 adjusted years) and § 10, entry of 25/11/2026 |
| Industry multiples are dated and sourced; an industry without a sourced multiple shows no figure | [PLAN.md § 5.1 and § 5.4](PLAN.md#54-industry-multiples-to-be-completed-by-you), `src/data/multiples.json` |
| Valuation conventions (discounts on enterprise value, lease financing in net debt) | [docs/decisions-methode.md](docs/decisions-methode.md) |

**What the MVP does not do:** no online payment; no matchmaking with buyers; no legal or tax advice (the site states
« This is not legal, tax or financial advice »); no foreign companies (only the French registers are queried).

## Synthetic data

- Every demonstration and test figure is **fictitious (synthetic)**: [docs/DEMO.md](docs/DEMO.md), the tax return
  `test/fixtures/liasse-fictive.pdf` / `.html` (« Atelier Exemple »), the sample file « Menuiserie Exemple » / code
  name « Projet Chêne » (`scripts/dossier-exemple.mjs`, SIREN 000000018, which does not exist).
- Exception: `test/fixtures/*.json` are **real responses of the free public APIs**, recorded on 10/11/2026 to test the
  normalization (`test/sources.test.js`, `test/rapprochement-sources.test.js`). They contain only published data.
- In use, the application reads real public data about the company the owner enters.

## Local installation

Requirements: **Node.js 22.13 or later** (the tests use `node:sqlite`, which is missing from Node 20 and Node 22.12)
and npm. No Cloudflare account is needed locally.

```bash
git clone https://github.com/Erosfragliola/passation.git && cd passation
npm ci
npm test                       # Vitest suite, no network or key needed
npm run i18n:check             # translation files: same keys in both languages, no empty value
cp .dev.vars.example .dev.vars # then fill in the values yourself (file never committed; .env.example lists the same names)
npm run db:migrate:local       # creates the local D1 database (.wrangler/)
npm run dev                    # http://127.0.0.1:8787 (English) and http://127.0.0.1:8787/fr/ (French)
```

Variables (`.dev.vars` locally, `npx wrangler secret put NAME` in production):

| Variable | Purpose | Without it |
|---|---|---|
| `SESSION_SECRET` | Secret used for hashes (verification codes, IP addresses, failed sign-in counters) | Locally: works (development secret). **Elsewhere: the API refuses to run (503).** |
| `ANTHROPIC_API_KEY` | Tax-return reading, drafting | These features answer "unavailable" |
| `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` | Sending sign-in codes and notifications | Locally: code shown in the terminal; in production: sign-in impossible |

## Demonstration

A reproducible scenario, with an **entirely fictitious** tax return and the expected results: [docs/DEMO.md](docs/DEMO.md).
Locally: `npm run dev`, enter a SIREN, request a code (it appears in the terminal), upload
`test/fixtures/liasse-fictive.pdf` (with an Anthropic key) or enter the amounts from the table in `docs/DEMO.md`.

## Local check without the Claude API (simulated Claude)

To go through the whole flow locally (tax-return reading, drafting, photo assessment, market research) without a key
or any call to Anthropic, start the simulated Claude in a second terminal, then the Worker wired to it:

```bash
node scripts/claude-simule.mjs 8790
npx wrangler dev --var ANTHROPIC_BASE_URL:http://127.0.0.1:8790 --var ANTHROPIC_API_KEY:simule
```

`scripts/claude-simule.mjs` answers every call with a JSON that follows the requested schema
(`output_config.format.schema`), with texts marked as fictitious; the tax return gives three fiscal years of
consistent fictitious amounts. `ANTHROPIC_BASE_URL` is a development setting only: never set it in production.
Sign-in codes appear in the `wrangler dev` terminal. The code request is limited to 10 per hour per IP; locally, the
counters can be reset with `npx wrangler d1 execute passation --local --command "DELETE FROM rate_limits"`.

## Languages

The site is bilingual: **English** (default language, original addresses) and **French** (under `/fr/`). An
"EN | FR" switcher sits at the top right of every page. To change a text: `src/contenu/en/<page>.json` and
`src/contenu/fr/<page>.json` (same keys), following the translation glossary
[docs/glossaire-traduction.md](docs/glossaire-traduction.md). Check: `npm run i18n:check` (same keys, no empty value,
identical values, text left hard-coded).

**Note for English-speaking readers:** documentation and code comments are in English, but the code itself (file,
folder, function and variable names) is in French, as written by the team (for example `src/contenu/` = content,
`valorisation` = valuation, `dossier` = sale file).

## Tests

```bash
npm test
```

**696 Vitest tests** (50 files), run again by GitHub Actions (Node 22, Ubuntu 24.04) on every push. D1 is simulated
with in-memory SQLite and the real migrations; R2, Claude and the public APIs are simulated.

- **Valuation**: three methods, EV-to-equity bridge, edge cases (negative EBITDA, missing accounts, a single fiscal
  year, net cash, WACC ≤ g, incomplete fiscal years left out, out-of-range settings). Two reference cases calculated
  independently in Python: `scripts/reference-valorisation.py` (details in
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md)) and the scenario in [docs/DEMO.md](docs/DEMO.md).
- **Datapack**: a formula evaluator recalculates the workbook and compares it with the engine (it does not replace
  opening the file in Excel).
- **Sign-in and access rights**: codes, sessions, access to someone else's file refused, server secret required.
- **Public sources**: normalization tested on recorded real responses (`test/fixtures/`), 429 and 500 outages;
  reconciliation of the retained figures with the published accounts (`test/rapprochement-sources.test.js`).
- **Quotas** for Claude processing, teaser anonymity, guided steps, home page content.
- **Account and flow** (24-25/11/2026): no amount without a session, account created and opened by code, two-stage
  flow, bridge from EBITDA to the value of the shares (values calculated by hand), approval and « to approve
  again », upload queue of the photos (`test/acces-par-code.test.js`, `test/valeur-pont.test.js`,
  `test/parcours-v2.test.js`, `test/depot-photos.test.js`, `test/dossier-exemple.test.js`).
- **Bilingual site**: same keys in both languages, no key used in the code without a French text, language of each
  request, `/fr/` addresses, plurals, reading of entered amounts (`test/i18n.test.js`, `npm run i18n:check`).

A large share of the tests covers the home page and its illustration (about 140). The number of tests does not by
itself prove that a financial method is correct: see [docs/decisions-methode.md](docs/decisions-methode.md).

## Number checks

Each proof that the key numbers are right, with the command to run it:

| Check | What it proves | Command |
|---|---|---|
| [scripts/reference-valorisation.py](scripts/reference-valorisation.py) | Independent Python reference of the 3-year test case (does not import the site's code); expected values in [docs/valorisation-calculs.md](docs/valorisation-calculs.md) | `python3 scripts/reference-valorisation.py` |
| [docs/DEMO.md](docs/DEMO.md) and [test/demo.test.js](test/demo.test.js) | The engine gives back the expected values of the demonstration (multiples, DCF, summary) and the datapack formulas give back the engine | `npx vitest run test/demo.test.js` |
| [docs/verification-calcul.md](docs/verification-calcul.md) | Step-by-step recalculation of the « EBITDA multiples » line of DEMO.md, from the tax return to the value of the shares: €0 difference | read the document, then `npx vitest run test/demo.test.js` |
| [test/rapprochement-sources.test.js](test/rapprochement-sources.test.js) | Reconciliation with the published accounts: on six real recorded responses, the revenue, EBITDA and net income retained by the application are exactly the published ones (same year, euros) | `npx vitest run test/rapprochement-sources.test.js` |
| Datapack formula evaluator ([src/documents/formules.js](src/documents/formules.js), tested in [test/datapack.test.js](test/datapack.test.js)) | The Excel workbook recalculated cell by cell gives back the engine's results | `npx vitest run test/datapack.test.js` |
| [src/valuation/controles.js](src/valuation/controles.js) (tested in [test/controles.test.js](test/controles.test.js)) | Consistency checks on the owner's entry: balanced balance sheet, published revenue, units, suspicious changes | `npx vitest run test/controles.test.js` |

## Team

Roles described by visible contributions (merged pull requests, reviews). Every member has commits and pull requests
under their own GitHub account (`git shortlog -sne main`; `gh pr list --state merged`). All 42 merged pull requests
were reviewed and approved by another member before merging (47 approving reviews on these 42 pull requests, as of
27/11/2026). Before 18/11/2026, while the repository owner built the first version alone, 47 commits were pushed
directly to `main`; since then every change has gone through a pull request, and `main` is protected (pull request and
approval required, force-push blocked). No force-push was ever made (GitHub activity log).

| Member | GitHub | Contributions (merged PRs) | Reviews (merged PRs) |
|---|---|---|---|
| Eros Fragliola | [@Erosfragliola](https://github.com/Erosfragliola) | Repository owner and deployment; home page (#2, #4, #9, #11); single font on the site (#34); flow consistency fixes (#36); memorandum finishing after testing the site (#38, #41); 36-month financial model file (commit 8fd50bb, in #42) | 23 |
| Maxime Parrinello | [@maximeparrinello-creator](https://github.com/maximeparrinello-creator) | Guided flow with one value and one list of steps (#15); dead code clean-up (#17, #26); bilingual site, English by default (#27); business model section and 3-year projections of the business plan (#42) | 1 |
| Victoire Jacob | [@Victoirejacob](https://github.com/Victoirejacob) | Audit fixes and EDHEC preparation (#1); anonymous teaser (#12); owner's space design (#13, #20); repairs of main after merges (#16, #24); datapack layout (#25); security headers and legal pages (#28); guided analysis flow (#29, #30); bilingual site follow-up (#31) | 20 |
| Ethan Barris | [@eltigre13om](https://github.com/eltigre13om) | Memorandum (#5, #35, #37); home page illustrated steps (#7); file page and its 5-step flow (#8, #10); code names and audit fixes (#14); repairs of main (#19, #23); upload of supporting documents (#21); single font in the deliverables (#33); lighter owner's path (#43) | 3 |
| Mohamed Reda Aboualam | [@raboualam22](https://github.com/raboualam22) | Flow v2: secure account, valuation first, guided photos, English translation (#39); sign-in by code only (#40) | 0 |

## Deliverables (where to find them)

| EDHEC requirement | Where |
|---|---|
| Live site | https://passation.eros-fragliola-freedom.workers.dev |
| Code | this repository (`src/`, `public/`, `migrations/`) |
| Business plan | [docs/livrables/business-plan.pdf](docs/livrables/business-plan.pdf) (source: `business-plan.html`) |
| Financial model | [docs/livrables/business-plan-model.xlsx](docs/livrables/business-plan-model.xlsx) |
| Presentation | `docs/livrables/presentation.pptx` and `presentation.pdf` (added in a separate PR) |
| Use of AI | [AI-USAGE.md](AI-USAGE.md) |
| Tests and number checks | [Tests](#tests) and [Number checks](#number-checks) above; `npm test` |
| Environment variables without secrets | [.env.example](.env.example) (same names as `.dev.vars.example`) |
| Demonstration scenario | [docs/DEMO.md](docs/DEMO.md) |

## Architecture

```
Browser (HTML, CSS, JavaScript without a framework: public/)
        │  fetch /api/*
        ▼
Cloudflare Worker (src/)
   ├── D1 "passation"            users, sessions, files, figures, valuations, cache, limits
   ├── R2 "passation-fichiers"   tax returns, documents, generated files, logos, photos (prefix dossiers/<id>/)
   ├── Claude API                reading tax returns and websites, drafting, market research
   ├── Brevo                     sign-in and follow-up emails
   └── Public APIs               Company search, INPI/BCE ratios, BODACC (24-hour cache)
```

| Folder | Contents |
|---|---|
| `src/index.js` | Worker router, configuration guard, errors, daily scheduled task |
| `src/contenu/` | Site text, one folder per language (`en/`, `fr/`, same keys); shared settings in `cles.json` |
| `src/i18n.js`, `public/js/i18n.js` | Language of the request, `/fr/` addresses, `t()` shared by the browser and the Worker |
| `src/routes/` | API routes: sign-in, search, estimate, files, valuation, documents, supporting documents, follow-up |
| `src/valuation/` | Quick and detailed engines, assembly and validation of inputs, consistency checks |
| `src/documents/` | Excel datapack, teaser, anonymity check, memorandum, reading of the company's website |
| `src/sources/` | Normalization of public API responses |
| `src/lib/` | Authentication, cache, Claude client, emails, rate limits and quotas |
| `src/data/` | Multiples, assumptions (and their input limits), classifications: sourced and dated |
| `src/config.js` | Single place for constants: models, limits, quotas, durations |
| `public/` | Pages, styles, browser scripts, fonts, images |
| `migrations/` | D1 database schema |
| `test/` | Automated tests and recorded datasets |
| `scripts/` | Python reference calculation, simulated Claude, demonstration file, generation of multiples, images and test datasets ([scripts/README.md](scripts/README.md)) |
| `docs/` | Demonstration, method decisions, reference calculations, deliverables, screenshots and mockups shown in the pull requests ([docs/README.md](docs/README.md)) |

## Known limitations

- The DCF is only calculated once the size premium has been filled in (no free public source).
- Conventions to be decided: discounts applied to enterprise value, lease financing counted in net debt without an
  EBITDA adjustment ([docs/decisions-methode.md](docs/decisions-methode.md)).
- The datapack is checked by an internal formula evaluator, not by Excel.
- Legal pages are drafts (publisher, contact and hosting details not filled in yet); account deletion is not available.

## Deployment (owner of the Cloudflare account)

```bash
npx wrangler secret list                    # check SESSION_SECRET (required), ANTHROPIC_API_KEY, BREVO_API_KEY…
npx wrangler secret put SESSION_SECRET      # same for the other missing secrets
npx wrangler d1 migrations apply passation --remote
npm run deploy
```

## Documentation and deliverables

- [AI-USAGE.md](AI-USAGE.md): use of AI, human checks, errors detected.
- [docs/livrables/](docs/livrables/): business plan, 36-month financial model (`business-plan-model.xlsx`, three
  scenarios) and status of the deliverables.
- [docs/verification-calcul.md](docs/verification-calcul.md): step-by-step recalculation of the demonstration valuation.
- [docs/DEMO.md](docs/DEMO.md): demonstration scenario.
- [docs/decisions-methode.md](docs/decisions-methode.md): valuation conventions to be decided.
- [docs/valorisation-calculs.md](docs/valorisation-calculs.md): reference calculations.
- [docs/glossaire-traduction.md](docs/glossaire-traduction.md): translation glossary of the site (French → English).
- [PLAN.md](PLAN.md): initial plan and dated development log.
- [CLAUDE.md](CLAUDE.md): rules given to the coding assistant (Claude Code).
- [public/img/CREDITS.md](public/img/CREDITS.md): credits and licenses for images and libraries.

Branches other than `main` are steps that have already been merged or archives (`archive/…`), kept for reference.
