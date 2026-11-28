# Passation demonstration: a reproducible scenario

This scenario uses **only fictitious data** for the figures: the tax return `test/fixtures/liasse-fictive.pdf`
("Atelier Exemple SAS", a fictitious company with no SIREN). The expected values are checked by `test/demo.test.js` and
were calculated independently (Python script that does not import the site's code).

## Before the demonstration (the day before)

1. Check the site: `https://passation.eros-fragliola-freedom.workers.dev/api/health` must answer `{"ok":true}`.
2. Check that sign-in codes are sent (`BREVO_API_KEY` secret in production): request a code. Without Brevo, sign-in
   only works locally (`npm run dev`), where the code appears in the terminal.
3. Check the Anthropic key (tax-return reading, teaser, memorandum). Without a key, manual entry, the valuation and the
   datapack work; tax-return reading and drafting are unavailable (503).
4. **Prepare a backup file** that is already filled in (session open in a second browser) and screenshots: the public
   APIs can be slow or reject requests (HTTP 429).
5. Use the fictitious company « Menuiserie Exemple » (SIREN 000000018, code name « Projet Chêne »), so that the whole
   demonstration runs on synthetic data: its public card was added to the cache of the production database on
   28/11/2026 (`npx wrangler d1 execute passation --remote`, with the data of `scripts/dossier-exemple.mjs`), as the
   public APIs do not know this SIREN. Prepare its file the day before with the amounts below (or the fictitious tax
   return) and **delete the file after the demonstration** (My file → Delete). Any real SIREN still works with real
   public data; its file would then mix real public data with fictitious figures, so it must not be shared.

## Plan B: a video of the flow (if the network, Brevo or Claude fail)

The live demonstration depends on Brevo (sign-in code), the Claude API (drafting) and the public APIs. A one-minute
video of the full flow can be recorded locally, without any of these dependencies, using the company and the
fictitious figures of this document ("Menuiserie Exemple", SIREN 000000018, code name "Projet Chêne"):

```
npx playwright-core install ffmpeg      # once per machine
npm run demo:video -- --langue fr --sortie ~/Desktop/Passation-demo-fr.webm
npm run demo:video -- --langue en --sortie ~/Desktop/Passation-demo-en.webm
```

The script (`scripts/video-demo.mjs`) starts its own local server, reads the sign-in code in its terminal and records
at 1440 × 900: home page, quick estimate, sign-in, file, figures, valuation, memorandum, teaser. Nothing is sent to
production. Record it again the day before if the interface has changed.

## Running order (about 5 minutes; a 3-minute version for the oral keeps steps 1, 5, 7 and 8)

| Step | Action | What we show |
|---|---|---|
| 1 | Home page: enter the SIREN or the name | Public profile (business directory, INPI, BODACC); the range stays hidden without an account (not sent by the server) |
| 2 | "Create my account": email, then the 6-digit code | Hashed single-use code (10 minutes, 5 attempts); the account is created, the quick range is visible once signed in |
| 3 | Upload `liasse-fictive.pdf` (or enter the amounts below) | Reading by Claude is **proposed**, never approved automatically; automatic checks (the revenue differs from the published accounts of the chosen company: alert expected) |
| 4 | Confirm fiscal years 2024 and 2025 (2023 skipped knowingly) | Approval by the owner; the screen says what the range loses without a third fiscal year |
| 5 | Adjustments, net debt and scope, then « Your value » | The bridge from EBITDA to the value of the shares, visible without a click; adjusted net assets below the range: a floor; « I approve these figures », after which the memorandum starts |
| 6 | "Fine-tune": EBITDA used, discounts and premiums, Recalculate | The DCF is no longer shown or adjustable on screen; it is still calculated in the datapack (DCF tab) |
| 7 | Download the datapack | Overview with logo and clickable contents, 8 tabs numbered by section, live formulas: changing a copper cell recalculates everything |
| 8 | Teaser, memorandum (if the Claude key is active) | Drafting from approved facts only; anonymity check on the teaser |

**The 3% size premium is a demonstration assumption, not sourced data.** No free public source was found
(`src/data/hypotheses.json`, `prime_taille`): it is up to the owner or their advisor to set and justify it. That is why
the DCF is not calculated by default.

## Amounts in the fictitious tax return (in euros)

| Item | 2024 | 2025 |
|---|---:|---:|
| Revenue | 2,200,000 | 2,400,000 |
| Cost of goods and materials (purchases + change in inventory) | 880,000 | 960,000 |
| Other purchases and external expenses | 320,000 | 340,000 |
| Taxes and duties | 40,000 | 40,000 |
| Wages and payroll taxes | 640,000 | 680,000 |
| Depreciation and amortization | 66,000 | 72,000 |
| Inventories / Trade receivables | 180,000 / 370,000 | 200,000 / 400,000 |
| Cash / Investments | 210,000 / 50,000 | 250,000 / 50,000 |
| Shareholders' equity | 590,000 | 700,000 |
| Borrowings / Provisions for risks | 340,000 / 20,000 | 300,000 / 20,000 |
| Trade payables / Tax and social security liabilities | 230,000 / 140,000 | 250,000 / 150,000 |

## Expected results (equity value, manufacturing industry)

| | Low | Central | High |
|---|---:|---:|---:|
| EBITDA multiples (4 / 5.6 / 7 × normalized EBITDA of 350,000) | 1,381,818 | 1,941,818 | 2,431,818 |
| DCF, 3% size premium (WACC 11.21% ± 1 pt) | 2,530,797 | 2,819,933 | 3,180,021 |
| **Default summary (multiples only)** | **1,381,818** | **1,941,818** | **2,431,818** |
| Summary with the optional DCF at 40% | 1,841,410 | 2,293,064 | 2,731,099 |
| Adjusted book net assets (floor) | | 700,000 | |

The multiples depend on the industry of the chosen company (`src/data/multiples.json`): with another industry, the
figures differ. The DCF forecasts come from the history (growth 9.09%, EBITDA margin 14.58%, depreciation and capital
expenditure 3% of revenue, working capital 30.14 days).
