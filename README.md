**English** | [Français](README.fr.md)

# Passation

[![Tests](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml/badge.svg)](https://github.com/Erosfragliola/passation/actions/workflows/tests.yml)

A web platform that helps owners of French small and medium-sized businesses (SMEs) prepare the sale of their
company: from a first estimate based on the SIREN number (the French company identification number) to the documents
handed to potential buyers (Excel datapack, anonymized teaser, information memorandum).

Project for the course "Programming and AI for Corporate Finance" (EDHEC Business School, 2026).

**Live:** https://passation.eros-fragliola-freedom.workers.dev (English at `/`, French at `/fr/`; the bilingual
version is visible online once `main` has been deployed).

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

## Data sources

| Data | Source | Access |
|---|---|---|
| Identity, NAF code (French industry classification), headcount, headquarters | Company search API (`recherche-entreprises.api.gouv.fr`) | Free, no key |
| Published revenue, EBITDA (French *EBE*), net income | `ratios_inpi_bce` dataset (`data.economie.gouv.fr`) | Free, no key |
| Events (incorporation, moves, acquisitions of businesses) | BODACC, the French official bulletin of civil and commercial announcements (`bodacc-datadila.opendatasoft.com`) | Free, no key |
| EBITDA multiples by industry | Cross-check of Argos Index Q2 2026, Dealsuite/Fusac (via Capital Stack), Captain 2026 scale, Damodaran Europe 01/2026: `src/data/multiples-sources.json`, calculated with `npm run multiples` | Free publications |
| Risk-free rate, cost of debt, risk premium, betas, corporate income tax, perpetual growth | ECB, Banque de France, Damodaran, service-public.fr: `src/data/hypotheses.json` | Free |
| English industry names (English version of the site) | Eurostat, NACE Rev. 2 division titles (same divisions as the French NAF Rev. 2): `src/data/naf-divisions-en.json` | Free publication |

Responses are cached for 24 hours (D1). An API outage is reported as such (never as missing accounts) and is not
cached.

**Paid external services or services that need an account**: Anthropic's Claude API (pay-as-you-go, models
`claude-sonnet-5-5` and `claude-haiku-5-5`, `src/config.js`); Brevo (limited free plan); Cloudflare Workers, D1 and R2
(free plan). The use of a paid API needs to be approved with regard to the course's "free sources" requirement.

## Local installation

Requirements: **Node.js 22.13 or later** (the tests use `node:sqlite`, which is missing from Node 20 and Node 22.12)
and npm. No Cloudflare account is needed locally.

```bash
git clone https://github.com/Erosfragliola/passation.git && cd passation
npm ci
npm test                       # Vitest suite, no network or key needed
npm run i18n:check             # translation files: same keys in both languages, no empty value
cp .dev.vars.example .dev.vars # then fill in the values yourself (file never committed)
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

**671 Vitest tests** (49 files), run again by GitHub Actions (Node 22, Ubuntu 24.04) on every push. D1 is simulated
with in-memory SQLite and the real migrations; R2, Claude and the public APIs are simulated.

- **Valuation**: three methods, EV-to-equity bridge, edge cases (negative EBITDA, missing accounts, a single fiscal
  year, net cash, WACC ≤ g, incomplete fiscal years left out, out-of-range settings). Two reference cases calculated
  independently in Python: `scripts/reference-valorisation.py` (details in
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md)) and the scenario in [docs/DEMO.md](docs/DEMO.md).
- **Datapack**: a formula evaluator recalculates the workbook and compares it with the engine (it does not replace
  opening the file in Excel).
- **Sign-in and access rights**: codes, sessions, access to someone else's file refused, server secret required.
- **Public sources**: normalization tested on recorded real responses (`test/fixtures/`), 429 and 500 outages.
- **Quotas** for Claude processing, teaser anonymity, guided steps, home page content.
- **Account and flow** (24-25/11/2026): no amount without a session, account created and opened by code, two-stage
  flow, bridge from EBITDA to the value of the shares (values calculated by hand), approval and « to approve
  again », upload queue of the photos (`test/acces-par-code.test.js`, `test/valeur-pont.test.js`,
  `test/parcours-v2.test.js`, `test/depot-photos.test.js`, `test/dossier-exemple.test.js`).
- **Bilingual site**: same keys in both languages, no key used in the code without a French text, language of each
  request, `/fr/` addresses, plurals, reading of entered amounts (`test/i18n.test.js`, `npm run i18n:check`).

A large share of the tests covers the home page and its illustration (about 140). The number of tests does not by
itself prove that a financial method is correct: see [docs/decisions-methode.md](docs/decisions-methode.md).

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
| `scripts/` | Generation of images, fonts, multiples and test datasets; Python reference calculation |
| `docs/` | Demonstration, method decisions, reference calculations, deliverables, mockups awaiting a decision, screenshots of past audits (French interface) |

## Known limitations

- The DCF is only calculated once the size premium has been filled in (no free public source).
- Conventions to be decided: discounts applied to enterprise value, lease financing counted in net debt without an
  EBITDA adjustment ([docs/decisions-methode.md](docs/decisions-methode.md)).
- The datapack is checked by an internal formula evaluator, not by Excel.
- Legal pages are drafts (publisher, contact, hosting "To be completed"); account deletion is not available.
- No CSP or `frame-ancestors` headers on the pages.

## Deployment (owner of the Cloudflare account)

```bash
npx wrangler secret list                    # check SESSION_SECRET (required), ANTHROPIC_API_KEY, BREVO_API_KEY…
npx wrangler secret put SESSION_SECRET      # same for the other missing secrets
npx wrangler d1 migrations apply passation --remote
npm run deploy
```

## Documentation and deliverables

- [AI-USAGE.md](AI-USAGE.md): use of AI, human checks, errors detected.
- [docs/livrables/](docs/livrables/): drafts of the business plan and the presentation, and the 36-month financial
  model (`business-plan-model.xlsx`, three scenarios).
- [docs/DEMO.md](docs/DEMO.md): demonstration scenario.
- [docs/decisions-methode.md](docs/decisions-methode.md): valuation conventions to be decided.
- [docs/valorisation-calculs.md](docs/valorisation-calculs.md): reference calculations.
- [docs/glossaire-traduction.md](docs/glossaire-traduction.md): translation glossary of the site (French → English).
- [PLAN.md](PLAN.md): initial plan and dated development log.
- [CLAUDE.md](CLAUDE.md): rules given to the coding assistant (Claude Code).
- [public/img/CREDITS.md](public/img/CREDITS.md): credits and licenses for images and libraries.

Branches other than `main` are steps that have already been merged or archives (`archive/…`), kept for reference.
