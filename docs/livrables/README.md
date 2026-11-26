# EDHEC deliverables: status as of 18/11/2026

| Deliverable | File | Status |
|---|---|---|
| Business plan (8 to 12 pages) | `business-plan.html` → `business-plan.pdf` (11 pages) | **Draft** prepared with Claude Code: structure and facts about the product; business model and 3-year projections taken from the financial model (26/11/2026); market, interviews, team and indicators "To be completed" by the team, with sources cited |
| Financial model (36 months) | `business-plan-model.xlsx` (three scenarios, active scenario chosen in the Assumptions tab, saved with Base) | Provided by Eros on 26/11/2026; only source of the figures of the business model in the business plan (section 4.4) and the presentation. Not to be edited when the documents are updated |
| Presentation (8 minutes) | `presentation.html` → `presentation.pdf` (10 16:9 slides, timing shown) | **Draft**: same reservations |
| AI-USAGE.md | `../../AI-USAGE.md` | Written; "To be confirmed by the team" passages to be completed |
| Demonstration scenario | `../DEMO.md` | Ready (values checked by `test/demo.test.js`) |

Regenerate the PDFs after changing the HTML (Chrome installed):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --print-to-pdf=business-plan.pdf business-plan.html
```

No market data, price or testimonial has been invented; the prices and projections of the business model are those
of the team's financial model. The submitted versions must be rewritten and owned by the
team, and the use of AI to produce them declared in AI-USAGE.md.
