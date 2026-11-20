# Use of artificial intelligence in Passation

This document separates what can be **checked in the repository** (Git history, files, tests) from what the team has
to confirm itself, marked **"To be confirmed by the team"**. It was prepared on 18/11/2026 with the help of Claude Code
and must be reviewed and completed by each member of the group before submission.

## 1. AI tools used

| Tool | Use | Evidence in the repository |
|---|---|---|
| **Claude Code** (Anthropic, Claude Opus 5.5 model), a programming assistant in the terminal and in VS Code | Writing the code, the tests and the documentation, audits | 77 of the 78 commits on `main` as of 18/11/2026 carry the mention `Co-Authored-By: Claude Opus 5.5`; rules given to the assistant in [CLAUDE.md](CLAUDE.md); dated log in [PLAN.md](PLAN.md) |
| **Claude API** inside the application: `claude-haiku-5-5` (reading PDF tax returns and websites), `claude-sonnet-5-5` (teaser, memorandum, market research through web search) | Product features | `src/config.js`, `src/lib/claude.js` |
| Other tools (ChatGPT, Copilot, translation tools, visual tools…) | To be confirmed by the team | — |

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
- Who ran the sessions, reviewed the proposals and made the decisions: **To be confirmed by the team** (the repository
  shows two GitHub accounts: `Erosfragliola`, author of the commits up to 18/11/2026, and `Victoirejacob`, author of
  the fix branch `fix/rendu-edhec`).

## 3. AI in the code, the tests and the documentation

- **Code**: Cloudflare Worker (`src/`), front end without a framework (`public/`), D1 schema (`migrations/`), written
  with Claude Code (co-author mention in the commits).
- **Tests**: 356 Vitest tests as of 18/11/2026, written with Claude Code. The expected valuation values are not copied
  from the code: they come from two reference calculations written separately in Python
  ([scripts/reference-valorisation.py](scripts/reference-valorisation.py),
  [docs/valorisation-calculs.md](docs/valorisation-calculs.md), [docs/DEMO.md](docs/DEMO.md)). **Limitation**: these
  scripts were also written with AI, from the same formulas. They check the arithmetic, not the method.
- **Documentation**: README, PLAN.md, docs/, written with Claude Code.
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
- checks recorded in the PLAN.md log (screenshots, Lighthouse, axe-core, live tests on real SIREN numbers).

To be confirmed by the team:
- which calculations were redone by hand or in Excel by a member of the group (multiples, WACC, DCF, ANCC);
- which sources in `src/data/` were opened and read by a human (multiples, ECB rates, Banque de France, Damodaran,
  service-public.fr);
- whether the datapack was opened and recalculated in Excel or Numbers;
- which Pull Requests were reviewed, and by whom.

## 5. AI errors detected and fixed

| # | Error | How it was detected | Fix | Evidence |
|---|---|---|---|---|
| 1 | The engine counted the missing expenses of an incomplete fiscal year as 0: with only revenue of €1,000,000 approved, normalized EBITDA of €1,000,000 and a central value of €5.6M | Claude Code audit of 18/11/2026 (edge case reproduced); none of the 323 existing tests covered it | Incomplete fiscal years left out and flagged, same rule in Excel, 8 tests (6 fail on the old code) | Commit `Valorisation : exercices incomplets écartés (FIN-01)…`, `test/exercices-incomplets.test.js` |
| 2 | A test written with AI **locked in this defect** (expected €700,000 for a partial fiscal year) | It failed after the fix | Expected value corrected and justified in the test | `test/approfondie.test.js` |
| 3 | Settings not bounded on the server side: a −150% discount gave a negative equity value | Audit of 18/11/2026 | Validation and explicit rejection (FIN-04) | `src/valuation/validation.js`, `test/validation.test.js` |
| 4 | An outage of the accounts API turned into "confidential accounts", cached for 24 hours | Audit of 18/11/2026 (code reading) | Outage passed on, nothing cached (FIN-06) | `test/sources-pannes.test.js` |
| 5 | The public APIs rejected requests without a User-Agent once on Cloudflare | Deployment of 10/11/2026 (PLAN.md log); who noticed it: To be confirmed by the team | Generic header added | Commit `2b084e0` |
| 6 | HTTP 429 errors from the business directory from Cloudflare's shared IP addresses | Deployment of 10/11/2026; To be confirmed by the team | Spaced-out retries | Commit `17982c0`, `src/lib/requete.js` |
| 7 | Inaccurate documentation: 265 tests announced (323 in reality), Node 20 announced whereas the tests require Node 22.13, "eight sections" instead of nine | Audit of 18/11/2026; Node checked by running under 20.18, 22.12 and 22.13 | README rewritten, `engines` in package.json | README, `.nvmrc` |
| 8 | The Python calculation presented as "independent" shared the engine's conventions | Audit of 18/11/2026 | Limitation written here and in the README; conventions to be decided in [docs/decisions-methode.md](docs/decisions-methode.md) | — |
| 9 | Errors detected by the members of the group themselves | **To be confirmed by the team** (the course expects at least one real example) | | |

## 6. Limits of AI and decisions kept under human control

- **Financial method**: two conventions are for the team to decide (discounts on enterprise value or on the shares;
  treatment of lease financing), quantified in [docs/decisions-methode.md](docs/decisions-methode.md). AI did not
  change them.
- **Size premium**: no free public source found; AI did not propose a default value, so the DCF stays optional. The 3%
  value in the demonstration scenario is a demonstration assumption.
- **Sources**: the sources in `src/data/` were gathered during the assisted sessions; their human review is To be
  confirmed by the team.
- **Use of a paid API** (Anthropic) with regard to the course's "free sources" requirement: to be confirmed with the
  professor.
- **Legal content** (legal notice, terms of use, privacy policy): drafts, to be reviewed by a professional.
- **Contributions**: no contribution, co-authorship or review was created artificially; each member contributes under
  their own GitHub account.
- **Observed limitations**: AI can write tests that confirm its own defect (error 2), present as independent a
  calculation that is not (error 8) and let the documentation drift away from the code (error 7). Hence the checks:
  separate reference calculations, regression tests that fail on the old code, audits reviewed by a human.
