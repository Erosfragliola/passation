# PASSATION: rules for the assistant

A web platform for the owner of a French small business (SME) who is preparing to sell it: quick valuation (landing
page, SIREN or company name), detailed valuation, Excel datapack, anonymized teaser, information memorandum, resources,
AI chat. The details (architecture, schema, routes, method, steps) are in `PLAN.md`: read it at the start of each
session.

## Language
Reply to the user in French. Documentation, code comments and commit messages are written in English; keep
`README.md` and `README.fr.md` in sync.
The site is bilingual: English (default language) and French (under `/fr/`). Any text added or changed must be added
or changed in both languages (`src/contenu/en/` and `src/contenu/fr/`, same keys), with no hard-coded text in the
pages, the scripts or the Worker, following the glossary `docs/glossaire-traduction.md`. The French version uses the
formal "vous". `npm run i18n:check` must stay free of errors.

## Scope
- Work **only** in the repository clone (on the owner's machine: `~/Desktop/PROJETS/PASSATION/app`; elsewhere, the
  clone's folder). Never read, change or create anything in the neighboring projects. Never reuse their D1, R2,
  secrets or Worker.
- One step of `PLAN.md` at a time. Show the result and wait for approval before the next step.
- If something is ambiguous, costly or hard to undo: ask before acting.

## Stack
- Cloudflare Workers: API in `src/`, static vanilla JS front end in `public/` (`[assets]`, `run_worker_first = ["/api/*"]`).
- D1 `passation` (migrations in `migrations/`), R2 `passation-fichiers`.
- Models defined in one place, `src/config.js`: `claude-sonnet-5-5` (detailed valuation, memo, teaser, chat),
  `claude-haiku-5-5` (quick-estimate comment, extraction of figures). Usage limits in the same constant.
- Brevo: only for sign-in codes and notifications.
- New dependency: only if necessary and compatible with Workers.
- Public data: recherche-entreprises, INPI/BCE ratios, BODACC, 24-hour D1 cache. Normalization based on real
  responses.

## Secrets
- Only through `npx wrangler secret put` (typed by the user in the Terminal) and `.dev.vars` locally.
  `.dev.vars.example` without values.
- Never ask for a key to be pasted into the conversation; no key in a tracked file, a displayed command or a commit.
  Never read or display `.dev.vars`.
- Before every push: `git grep -nE "sk-ant-[A-Za-z0-9]|xkeysib-[A-Za-z0-9]|(API_KEY|SECRET)=[^[:space:]]"` must return
  nothing (the old pattern always matched `.dev.vars.example` and this file).

## Data and content
- Invent no financial data, no multiple, no tax rule and no source: check and cite (with a date), otherwise mark
  "À compléter" (to be completed).
- `src/data/multiples.json`: every line has a source and a date; empty field if there is no reliable source.
- Valuation calculations are tested code; Claude comments and drafts, it does not calculate.
- Anonymized teaser (no name, no precise city, no identifying figure). Information memo: a section with no data =
  "À compléter".
- No fake testimonials, fake customer logos or fake figures: "À remplir" (to be filled in) placeholders.
- Art direction: take inspiration, copy nothing (text, logo, name, photo, visual). Original SVG illustrations.

## Security and GDPR
- An account is required after the SIREN: without a valid session, no route sends an amount (range, published
  figures); the public card shows name, industry, region and headcount band only.
- Password: 12 characters at least, common passwords refused; PBKDF2-SHA256 through WebCrypto, 100,000 iterations
  (the Workers maximum), random 16-byte salt per account, constant-time comparison. Never in a log, a response or a
  test (tests draw a random one).
- Sign-in with email + password: 5 failures → 15-minute block, counted per account and per IP (hashes); the message
  never reveals whether the address exists.
- 6-digit code (sign-up, forgotten password, accounts created before passwords): verifies the address only; single
  use, 10 min, 5 attempts, stored hashed (salt + server secret); gives a one-time ticket (15 min) to choose the
  password. A new password closes every other session. Session cookie `HttpOnly; Secure; SameSite=Lax`.
- Every private route checks that the file belongs to the signed-in user.
- The owner's data is sent only to the Claude API, for the processing requested.
- One-click deletion of the file and of its R2 files. Rate limit on the quick valuation.

## Quality
- `npm test` at every step, covering at least: the three methods, the bridge from EV to equity value, edge cases
  (negative EBITDA, missing accounts). Expected values calculated by hand, not copied from the code.
- `npx wrangler dev` and a check in the browser before saying it works.
- Commit + push at the end of every tested step, on a branch; merge into `main` through a reviewed Pull Request.
  The GitHub repository is **public** (noted on 18/11/2026): no real sensitive data in the test files, demonstration
  figures entirely fictitious.

## End of session
Say what works, what is left to do, and what the user has to do on their side.
