# Detailed valuation: test case and reference calculation

The expected values of the tests (`test/approfondie.test.js`) were calculated **independently of the site's code**, by
a Python script that follows the formulas in `PLAN.md` § 5.2. Assumptions: `src/data/hypotheses.json`.

## "Atelier Exemple" test case (manufacturing industry, multiples 4 / 5.6 / 7)

| | 2023 | 2024 | 2025 |
|---|---:|---:|---:|
| Revenue | 2,000,000 | 2,200,000 | 2,400,000 |
| Cost of goods and materials | 800,000 | 880,000 | 960,000 |
| External expenses | 300,000 | 320,000 | 340,000 |
| Taxes and duties | 40,000 | 40,000 | 40,000 |
| Wages and payroll taxes | 600,000 | 640,000 | 680,000 |
| **Reported EBITDA** | **260,000** | **320,000** | **380,000** |
| Owner (150,000 actual − 100,000 market rate) | +50,000 | +50,000 | +50,000 |
| Rent (60,000 paid − 48,000 market) | +12,000 | +12,000 | +12,000 |
| One-off item (dispute) | | +20,000 | |
| **Adjusted EBITDA** | **322,000** | **402,000** | **442,000** |

- Normalized EBITDA = (322,000 + 402,000 + 442,000) / 3 = **388,666.67**.
- Multiples: EV = 388,666.67 × 4 / 5.6 / 7 = 1,554,666.67 / **2,176,533.33** / 2,720,666.67.
- Working capital (inventories + trade receivables − trade payables − tax and social security liabilities):
  - amounts: 160,000 / 180,000 / 200,000;
  - in days of revenue: 29.2 / 29.8636 / 30.4167, i.e. an average of **29.8268 days**;
  - normalized working capital = 29.8268 / 365 × 2,400,000 = **196,121.21**, hence an actual − normalized gap of
    **+3,878.79**.
- Net debt 2025 = 300,000 (borrowings) + 50,000 (shareholder loans) + 20,000 (provisions) − 250,000 (cash)
  − 50,000 (investments) = **70,000**.
- Discounts: −10% (dependence on the owner) + 5% (recurrence), i.e. a factor of × 0.95.
- Equity (multiples) = EV × 0.95 − 70,000 + 3,878.79 = 1,410,812.12 / **2,001,585.45** / 2,518,512.12.
- WACC, with a 3% size premium:
  - levered beta = 1.0844 × (1 + 0.75 × 0.1136) = 1.17679;
  - cost of equity = 3.27% + 1.17679 × 5.01% + 3% = 12.1657%;
  - debt weight = 0.1136 / 1.1136 = 10.20%;
  - after-tax cost of debt = 3.71% × 0.75 = 2.7825%;
  - **WACC = 11.2085%**.
- 5-year DCF (end-of-year convention):
  - assumptions: revenue + 5% a year, EBITDA margin 16%, depreciation 3% of revenue, capital expenditure 3% of
    revenue, working capital 30 days, corporate income tax 25%;
  - cash flows: 235,836.99 / 247,628.84 / 260,010.28 / 273,010.79 / 286,661.33;
  - terminal value = 286,661.33 × 1.02 / (0.112085 − 0.02) = 3,175,259.15;
  - EV = 948,371.45 + 1,866,761.17 = **2,815,132.61**;
  - equity: **2,608,254.77** (WACC + 1 pt: 2,341,609.13; WACC − 1 pt: 2,940,077.98).
- ANCC (adjusted book net assets) = 900,000 − 10,000 (doubtful receivables) = **890,000**: floor, shown separately.
- **Summary** = 60% × 2,001,585.45 + 40% × 2,608,254.77 = **2,244,253.18**.
- Sensitivity to the multiple ± 1x (equity): 1,632,352.12 / 2,370,818.79.
- Corporate income tax at the reduced rate on €100,000 = 42,500 × 15% + 57,500 × 25% = **20,750**.

The complete flow through the API and in the browser (`test/parcours.test.js`) gives €2,244,512 with the same data.
The only difference: depreciation (3.0%) and working capital (29.83 days) are taken there from the approved history,
instead of the 3% and 30 days set by hand in the test case.
