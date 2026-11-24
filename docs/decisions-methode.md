# Method decisions to be made (FIN-03, FIN-05)

Audit of 18/11/2026. **Neither of these two conventions has been changed in the code**: the decision lies with the team.
If a convention changes, the following must be changed **together**: the engine (`src/valuation/approfondie.js`), the
datapack (`src/documents/datapack.js`), the tests (`test/approfondie.test.js`, `test/datapack.test.js`,
`test/demo.test.js`), the reference calculation (`scripts/reference-valorisation.py`) and
`docs/valorisation-calculs.md`; the expected values must then be recalculated independently.

The differences below were calculated by a Python script independent of the site's code. The methodological references
are to be provided by the team (textbook or course used): **none is cited here, since none has been checked**.

## FIN-03: where to apply discounts and premiums

**Current convention** (`approfondie.js`, `versTitres`): equity value = EV × (1 + Σ discounts) − net debt
+ working capital gap + non-operating assets. The discount applies to **enterprise value**.

**Other possible convention**: equity value = (EV − net debt + working capital gap + non-operating assets)
× (1 + Σ discounts). The discount applies to **equity value**.

Impact of a −20% discount (central multiple):

| Profile | Current convention | Discount on equity | Difference |
|---|---:|---:|---:|
| Demonstration scenario (net debt €20,000) | €1,549,818 | €1,553,455 | +0.2% |
| Indebted company (EV €1,680,000, net debt €1,200,000) | €144,000 | €384,000 | +166.7% |
| Company with net cash (EV €1,680,000, net cash €500,000) | €1,844,000 | €1,744,000 | −5.4% |

**Limitations of the current convention**: the effect of the discount is amplified by debt: in the indebted case, a 20%
discount removes 70% of the equity value (€480,000 without the discount, €144,000 with it). Net cash, on the other
hand, escapes the discount.

**Possible arguments for each convention, to be checked in the literature**:
- the factors offered (dependence on the owner, customer concentration, recurrence, growth) describe the operations:
  they can be defended on EV, like an adjustment of the multiple;
- the "Size and liquidity of the shares" factor describes the shares: it would rather be defended on equity value.

**Decision to be made**: (a) keep the convention and explain it in the README and the presentation; (b) apply all
discounts to equity value; (c) separate the operating factors (on EV) from the liquidity factor (on equity value).

## FIN-05: lease financing

**Current convention**: the remaining lease financing due is added to net debt (`detteNette`, line `credit_bail`)
whereas the lease payments remain in external expenses, and therefore in EBITDA. The financing is then counted twice:
once in EBITDA (payments) and once in debt.

Example: payments of €50,000 a year, €150,000 remaining due, EBITDA €350,000, multiple 5.6, other net debt €20,000.

| Convention | Equity value (central multiple) |
|---|---:|
| (1) Current: payments in EBITDA and remaining amount in debt | €1,790,000 |
| (2) Lease financing treated as debt: payments added back to EBITDA, remaining amount in debt | €2,070,000 |
| (3) Lease financing treated as a rental: payments in EBITDA, nothing in debt | €1,940,000 |

**Limitations of the current convention**: it undervalues companies that finance their equipment through lease
financing (−€150,000 compared with (3), −€280,000 compared with (2) in the example). To be fair, (2) requires knowing
the annual payments (a field that does not exist today) and checking whether the source multiples (Argos, Dealsuite,
Captain, Damodaran) measure EBITDA before or after rental payments (IFRS 16 for listed companies).

**Decision to be made**: (2) needs a new field "lease financing payments for the fiscal year" and an EBITDA adjustment.
(3) is the simplest: remove the line from net debt. Failing that, keep (1) and flag it to the user.

## Other documented conventions (P2 items of the audit, not changed)

- ANCC (adjusted book net assets): no deferred tax deducted from unrealized gains; provisions for risks counted at 100%
  in net debt, before tax.
- DCF: the terminal value uses the year-5 cash flow, including the change in working capital calculated at the year-5
  growth rate and not at the perpetual growth rate.
- If WACC − 1 point ≤ perpetual growth, the upper bound of the DCF does not exist: the upper summary then uses the
  central DCF value.
