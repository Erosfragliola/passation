# Step-by-step recalculation of the demonstration valuation

This document recalculates by hand the three values of the **« EBITDA multiples »** line of
[docs/DEMO.md](DEMO.md) (low, central, high equity value), from the fictitious tax return to the value of the shares.
Every figure is **synthetic** (fictitious company « Atelier Exemple », `test/fixtures/liasse-fictive.pdf`). Amounts are
in euros (EUR); « days » are days of revenue on a 365-day year.

**How this document was made.** It was written with Claude Code (the coding assistant used by the team, see
[AI-USAGE.md](../AI-USAGE.md)) and checked by running the commands at the end. It checks the **arithmetic and the
documented conventions**; it does not check the **choice of the method** (EBITDA multiples, average EBITDA, working
capital gap), which is discussed in [docs/decisions-methode.md](decisions-methode.md).

## Where each input comes from

| Input | Source |
|---|---|
| Income statement and balance sheet, 2024 and 2025 | Table « Amounts in the fictitious tax return » of [docs/DEMO.md](DEMO.md) |
| Multiples 4 / 5.6 / 7 (industry, NAF sections B to E) | [src/data/multiples.json](../src/data/multiples.json), row `industrie`, source `croisement-2026-11` (Argos Index Q2 2026, Dealsuite/Fusac via Capital Stack, Captain 2026 scale, Damodaran Europe 01/2026; consulted 10/11/2026) |
| EBITDA, normalized EBITDA, working capital, bridge to equity | [PLAN.md § 5.2](../PLAN.md) (steps 1, 2, 4 and 8) and [docs/valorisation-calculs.md](valorisation-calculs.md) |
| Where discounts apply (none in this scenario) | [docs/decisions-methode.md](decisions-methode.md), FIN-03 |

The demonstration has no adjustment (pay, rent, one-off item), no discount or premium and no non-operating asset:
[test/demo.test.js](../test/demo.test.js) runs the engine with these settings.

## 1. Reported EBITDA (French *EBE*)

EBITDA = revenue − cost of goods and materials − other purchases and external expenses − taxes and duties − wages and
payroll taxes (depreciation is below EBITDA and is not deducted).

| Step | 2024 | 2025 | Source |
|---|---:|---:|---|
| Revenue | 2,200,000 | 2,400,000 | DEMO.md |
| − Cost of goods and materials | −880,000 | −960,000 | DEMO.md |
| − Other purchases and external expenses | −320,000 | −340,000 | DEMO.md |
| − Taxes and duties | −40,000 | −40,000 | DEMO.md |
| − Wages and payroll taxes | −640,000 | −680,000 | DEMO.md |
| **= Reported EBITDA** | **320,000** | **380,000** | |

## 2. Normalized EBITDA

PLAN.md § 5.2, step 1: by default, the average of the last three adjusted fiscal years. The demonstration has two
fiscal years (2023 skipped) and no adjustment, so the average of two years:

(320,000 + 380,000) / 2 = **350,000**

## 3. Enterprise value (EV)

PLAN.md § 5.2, step 4: EV = normalized EBITDA × EBITDA multiple.

| | Low | Central | High |
|---|---:|---:|---:|
| Normalized EBITDA | 350,000 | 350,000 | 350,000 |
| × Multiple (multiples.json, industry) | 4 | 5.6 | 7 |
| **= Enterprise value** | **1,400,000** | **1,960,000** | **2,450,000** |

## 4. Net debt, 2025 balance sheet

Net debt = borrowings + provisions for risks − cash − investments (latest fiscal year).

| Step | Amount | Source |
|---|---:|---|
| Borrowings | 300,000 | DEMO.md, 2025 |
| + Provisions for risks | 20,000 | DEMO.md, 2025 |
| − Cash | −250,000 | DEMO.md, 2025 |
| − Investments | −50,000 | DEMO.md, 2025 |
| **= Net debt** | **20,000** | |

## 5. Working capital adjustment

PLAN.md § 5.2, step 2: operating working capital = inventories + trade receivables − trade payables − tax and social
security liabilities; the normalized level is the average over the available fiscal years, in days of revenue.

| Step | 2024 | 2025 |
|---|---:|---:|
| Inventories | 180,000 | 200,000 |
| + Trade receivables | 370,000 | 400,000 |
| − Trade payables | −230,000 | −250,000 |
| − Tax and social security liabilities | −140,000 | −150,000 |
| **= Working capital** | **180,000** | **200,000** |
| In days of revenue (× 365 / revenue) | 29.8636 | 30.4167 |

- Average: (29.8636 + 30.4167) / 2 = **30.1402 days** (DEMO.md and the header of test/demo.test.js: 30.14 days).
- Normalized working capital at the 2025 revenue: 30.1402 / 365 × 2,400,000 = **198,181.82**.
- Gap = actual 2025 − normalized = 200,000 − 198,181.82 = **+1,818.18** (the company carries 1,818.18 more working
  capital than its normal level, which is added to the value of the shares, PLAN.md § 5.2 step 8).

Exactly: the two ratios are 180,000 / 2,200,000 = 0.0818182 and 200,000 / 2,400,000 = 0.0833333; their average is
0.0825758, and 0.0825758 × 2,400,000 = 198,181.82.

## 6. From enterprise value to the value of the shares

PLAN.md § 5.2, step 8, and decisions-methode.md (FIN-03): equity value = EV × (1 + Σ discounts) − net debt + working
capital gap + non-operating assets. Here Σ discounts = 0 and there is no non-operating asset.

| Step | Low | Central | High |
|---|---:|---:|---:|
| Enterprise value (§ 3) | 1,400,000.00 | 1,960,000.00 | 2,450,000.00 |
| − Borrowings | −300,000.00 | −300,000.00 | −300,000.00 |
| − Provisions for risks | −20,000.00 | −20,000.00 | −20,000.00 |
| + Cash | +250,000.00 | +250,000.00 | +250,000.00 |
| + Investments | +50,000.00 | +50,000.00 | +50,000.00 |
| + Working capital gap (§ 5) | +1,818.18 | +1,818.18 | +1,818.18 |
| **= Value of the shares** | **1,381,818.18** | **1,941,818.18** | **2,431,818.18** |

The site shows the same bridge in thousands of euros on the « Your value » screen (fictitious file « Projet Chêne »,
same figures): €1,382K / €2,432K, with « Working capital gap €2K ».

## 7. Comparison with the expected values

| | Low | Central | High |
|---|---:|---:|---:|
| This recalculation | 1,381,818.18 | 1,941,818.18 | 2,431,818.18 |
| [docs/DEMO.md](DEMO.md), « EBITDA multiples » line | 1,381,818 | 1,941,818 | 2,431,818 |
| [test/demo.test.js](../test/demo.test.js), first test (engine, tolerance €0.05) | 1,381,818.18 | 1,941,818.18 | 2,431,818.18 |
| **Difference** | **€0** | **€0** | **€0** |

DEMO.md rounds to the euro (1,381,818 for 1,381,818.18): the difference is €0 once rounded.

## Run the checks

```bash
npx vitest run test/demo.test.js        # the engine gives back these three values (and the DCF and summary lines)
python3 scripts/reference-valorisation.py   # independent Python reference of the 3-year test case (valorisation-calculs.md)
```
