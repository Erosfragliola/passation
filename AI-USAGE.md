# Use of artificial intelligence in Passation

This document records the use of AI in Passation from the start of the project to the submission (period covered: up
to 1 December 2026). It states only facts that can be **checked in the repository** (Git history, pull requests and
their reviews, files, tests). It was first written on 18/11/2026 and updated on 27/11/2026 with the help of Claude Code.

## 1. AI tools used

| Tool | Use | Evidence in the repository |
|---|---|---|
| **Claude Code** (Anthropic, Claude Opus 5.5 model), a programming assistant in the terminal and in VS Code | Writing the code, the tests and the documentation, audits, research and drafting of the deliverables | 206 of the 271 commits on `main` as of 27/11/2026 carry the mention `Co-Authored-By: Claude` (198 of the 208 commits that are not merge commits; count: `git log main`); rules given to the assistant in [CLAUDE.md](CLAUDE.md); dated log in [PLAN.md](PLAN.md) |
| **Claude API** inside the application: `claude-haiku-5-5` (reading PDF tax returns and websites), `claude-sonnet-5-5` (teaser, memorandum, market research through web search) | Product features | `src/config.js`, `src/lib/claude.js` |

Members did not report other AI tools.

## 2. How we worked with Claude Code

- **Written rules** ([CLAUDE.md](CLAUDE.md)): one step of [PLAN.md](PLAN.md) at a time, demonstration and approval
  before the next step; no financial data, multiple or source invented ("À compléter", i.e. to be completed,
  otherwise); calculations are tested code and Claude does not calculate the values; secrets only through
  `wrangler secret put`.
- **Plan, then steps**: PLAN.md sets the architecture, the schema, the valuation method and 8 delivery steps; the
  "Progress log" section dates each delivery and its checks.
- **Recorded decisions**: the "User decisions" section of PLAN.md (sources of the multiples, display of the
  assumptions, color palette, name) records the choices made by the humans.
- **Audit, then fixes**: on 18/11/2026, a Claude Code session audited the repository (without changing anything), then
  a second session fixed the demonstrated issues on a dedicated branch, submitted through a Pull Request.
- **One session per member** (from 18/11/2026): each member worked in their own Claude Code session, often from
  instructions written in Eros Fragliola's session, and opened their pull requests under their own GitHub account
  (42 merged pull requests by the five members: see the « Team » section of the [README](README.md#team)).
- **Reviews between members**: every merged pull request was reviewed and approved by another member before merging:
  47 reviews on the 42 pull requests merged as of 27/11/2026, 11 of them with a written comment (counted with `gh api
  repos/Erosfragliola/passation/pulls/<n>/reviews`). Decisions on the product were taken by the members and recorded
  in the pull request descriptions (for example, removing the password: « Décision d'Eros du 25/11/2026 », PR #40).

## 3. AI in the code, the tests and the documentation

- **Code**: Cloudflare Worker (`src/`), front end without a framework (`public/`), D1 schema (`migrations/`), written
  with Claude Code (co-author mention in the commits).
- **Tests**: 695 Vitest tests as of 27/11/2026, written with Claude Code. The expected valuation values are not copied
  from the code: they come from two reference calculations written separately in Python
  ([scripts/reference-valorisation.py](scripts/reference-valorisation.py),
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md), [docs/DEMO.md](docs/DEMO.md)). **Limitation**: these
  scripts were also written with AI, from the same formulas. They check the arithmetic, not the method.
- **Documentation**: README, PLAN.md, docs/, written with Claude Code.
- **Number checks added on 27/11/2026, with Claude Code**: a reconciliation test of the retained figures against the
  published accounts ([test/rapprochement-sources.test.js](test/rapprochement-sources.test.js), expected values copied
  by hand from the raw API responses) and a step-by-step recalculation of the demonstration valuation
  ([docs/verification-calcul.md](docs/verification-calcul.md)), which checks the arithmetic and the documented
  conventions, not the choice of the method.
- **Business plan**: the 36-month financial model (`docs/livrables/business-plan-model.xlsx`, added by Eros Fragliola
  in commit 8fd50bb) and its assumptions are the team's; Maxime Parrinello's session laid out its figures in the
  business model section without changing any assumption or recalculating a value (PR #42). The final drafting, the
  research and the checking of the sources were done with Claude Code on 27/11/2026: each source cited was opened and
  is dated in the « Sources » appendix of the business plan.
- **Presentation** (added in a separate pull request): slides generated with Claude Code (pptxgenjs script, screenshots
  of the local site on the fictitious demonstration file) from a plan validated by the team, then reviewed and
  rehearsed by the team.
- **Inside the product**, AI only **reads and drafts**:
  - amounts read from a tax return are proposals, never approved automatically (`src/routes/valorisation.js`);
  - the teaser goes through a coded anonymity check (`src/documents/anonymat.js`) and an identifying version is
    rejected;
  - a market fact is kept only if its address is among the pages actually returned by the search
    (`faitsSourcesVerifies`), then the owner approves it;
  - the values (multiples, DCF, ANCC, summary) are calculated by `src/valuation/`, never by the model.

## 4. Human checks

Can be checked in the repository:
- test suite run again by GitHub Actions on every push (`.github/workflows/tests.yml`);
- automatic consistency checks on the accounts (`src/valuation/controles.js`);
- checks recorded in the PLAN.md log (screenshots, Lighthouse, axe-core, live tests on real SIREN numbers);
- **reviews**: 47 approving reviews by another member on the 42 merged pull requests, as of 27/11/2026 (23 by Eros
  Fragliola, 20 by Victoire Jacob, 3 by Ethan Barris, 1 by Maxime Parrinello);
- **tests of the site by Eros Fragliola**: after reading the memorandum generated by the site on 25/11/2026, he asked
  for the corrections of PR #41 (section 5);
- **controls of the financial model** (PR #42): every figure of the business plan compared with the workbook; the
  balance-sheet check row is zero in all three years, in the three scenarios.

Members did not report calculations redone by hand or in Excel; the recalculation of the demonstration
([docs/verification-calcul.md](docs/verification-calcul.md)) was written with Claude Code.

## 5. AI errors detected and fixed

| # | Error | How it was detected | Fix | Evidence |
|---|---|---|---|---|
| 1 | The engine counted the missing expenses of an incomplete fiscal year as 0: with only revenue of €1,000,000 approved, normalized EBITDA of €1,000,000 and a central value of €5.6M | Claude Code audit of 18/11/2026 (edge case reproduced); none of the 323 existing tests covered it | Incomplete fiscal years left out and flagged, same rule in Excel, 8 tests (6 fail on the old code) | Commit `Valorisation : exercices incomplets écartés (FIN-01)…`, `test/exercices-incomplets.test.js` |
| 2 | A test written with AI **locked in this defect** (expected €700,000 for a partial fiscal year) | It failed after the fix | Expected value corrected and justified in the test | `test/approfondie.test.js` |
| 3 | Settings not bounded on the server side: a −150% discount gave a negative equity value | Audit of 18/11/2026 | Validation and explicit rejection (FIN-04) | `src/valuation/validation.js`, `test/validation.test.js` |
| 4 | An outage of the accounts API turned into "confidential accounts", cached for 24 hours | Audit of 18/11/2026 (code reading) | Outage passed on, nothing cached (FIN-06) | `test/sources-pannes.test.js` |
| 5 | The public APIs rejected requests without a User-Agent once on Cloudflare | Deployment of 10/11/2026 (PLAN.md log) | Generic header added | Commit `2b084e0` |
| 6 | HTTP 429 errors from the business directory from Cloudflare's shared IP addresses | Deployment of 10/11/2026 (PLAN.md log) | Spaced-out retries | Commit `17982c0`, `src/lib/requete.js` |
| 7 | Inaccurate documentation: 265 tests announced (323 in reality), Node 20 announced whereas the tests require Node 22.13, "eight sections" instead of nine | Audit of 18/11/2026; Node checked by running under 20.18, 22.12 and 22.13 | README rewritten, `engines` in package.json | README, `.nvmrc` |
| 8 | The Python calculation presented as "independent" shared the engine's conventions | Audit of 18/11/2026 | Limitation written here and in the README; conventions to be decided in [docs/decisions-methode.md](docs/decisions-methode.md) | — |
| 9 | The memorandum showed 2025 alone: the earlier fiscal years 2023 and 2024, entered without their balance sheets, were left out entirely | Eros Fragliola, reading the memorandum generated by the site on 25/11/2026 | Earlier fiscal years kept for their income statement; a missing item never counted as zero | PR #41 (« Corrections après la lecture du mémorandum par Eros le 25/11/2026 »), `test/exercices-incomplets.test.js` |
| 10 | « Oui, corriger » was offered on a review remark, then refused by the server (« the chapter would be too long ») | Same reading by Eros Fragliola | The correction is offered only if it can apply; Claude is asked for corrections no longer than the passage | PR #41, `test/memo-finitions.test.js` |
| 11 | A page « Éléments à compléter », made only of requests to the owner, was printed in the PDF sent to buyers; Claude wrote « Sa justification : à compléter » for adjustments whose amounts were known | Same reading by Eros Fragliola | Page removed (requests kept in the owner's panel); justification written by the code from the owner's amounts | PR #41 |

## 6. Limits of AI and decisions kept under human control

- **Financial method**: two conventions are for the team to decide (discounts on enterprise value or on the shares;
  treatment of lease financing), quantified in [docs/decisions-methode.md](docs/decisions-methode.md). AI did not
  change them.
- **Size premium**: no free public source found; AI did not propose a default value, so the DCF stays optional. The 3%
  value in the demonstration scenario is a demonstration assumption.
- **Sources**: the sources in `src/data/` were gathered during the assisted sessions, with their URL and date in the
  files; the sources of the business plan were opened and dated on 27/11/2026.
- **Use of a paid API**: the data is free and public. The Claude API is paid per use and serves only to read and
  draft; the valuation and the datapack work without it, and a simulated Claude runs the whole flow without any key.
- **Legal content** (legal notice, terms of use, privacy policy): drafts, to be reviewed by a professional.
- **Contributions**: no contribution, co-authorship or review was created artificially; each member contributes under
  their own GitHub account.
- **Observed limitations**: AI can write tests that confirm its own defect (error 2), present as independent a
  calculation that is not (error 8) and let the documentation drift away from the code (error 7). Hence the checks:
  separate reference calculations, regression tests that fail on the old code, audits reviewed by a human.
