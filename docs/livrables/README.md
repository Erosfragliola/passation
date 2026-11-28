# EDHEC deliverables: status as of 1 December 2026

| Deliverable | File | Status |
|---|---|---|
| Business plan (8 to 12 pages, plus appendices) | `business-plan.html` → `business-plan.pdf` | Final |
| Financial model (36 months) | `business-plan-model.xlsx` (three scenarios, active scenario chosen in the Assumptions tab, saved with Base) | Final. Added by Eros Fragliola on 26/11/2026 (commit 8fd50bb); only source of the figures of the business model in the business plan (section 4.4). Not to be edited when the documents are updated |
| Presentation (8 minutes, in English) | `presentation.pptx` (14 slides in the structure suggested by the brief, plus 7 backup slides; timing and speaker notes on each slide; slide 4 is a 3-minute live demo on the site) and `presentation.pdf` | Final. Generated with Claude Code (pptxgenjs script, screenshots of the local site on the fictitious file « Projet Chêne »), see [AI-USAGE.md](../../AI-USAGE.md) |
| AI-USAGE.md | [`../../AI-USAGE.md`](../../AI-USAGE.md) | Final |
| Step-by-step recalculation of the demonstration valuation | [`../verification-calcul.md`](../verification-calcul.md) | Final |
| Demonstration scenario | [`../DEMO.md`](../DEMO.md) | Final (values checked by `test/demo.test.js`) |

Regenerate the PDF after changing the HTML (Chrome installed; on another system, use the path of Chrome, Chromium or
Edge):

```bash
cd docs/livrables
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --print-to-pdf=business-plan.pdf business-plan.html
```

No market data, price or testimonial has been invented: every figure of the business plan has its source and date in
its « Sources » appendix, and the prices and projections of the business model are those of the team's financial
model. The use of AI to produce these documents is declared in [AI-USAGE.md](../../AI-USAGE.md).
