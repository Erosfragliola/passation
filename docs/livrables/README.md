# EDHEC deliverables: status as of 18/11/2026

| Deliverable | File | Status |
|---|---|---|
| Business plan (8 to 12 pages) | `business-plan.html` → `business-plan.pdf` (7 pages) | **Draft** prepared with Claude Code: structure and facts about the product; market, interviews, revenue model, team and indicators "To be completed" by the team, with sources cited |
| Presentation (8 minutes) | `presentation.html` → `presentation.pdf` (10 16:9 slides, timing shown) | **Draft**: same reservations |
| AI-USAGE.md | `../../AI-USAGE.md` | Written; "To be confirmed by the team" passages to be completed |
| Demonstration scenario | `../DEMO.md` | Ready (values checked by `test/demo.test.js`) |

Regenerate the PDFs after changing the HTML (Chrome installed):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --print-to-pdf=business-plan.pdf business-plan.html
```

No market data, price or testimonial has been invented. The submitted versions must be rewritten and owned by the
team, and the use of AI to produce them declared in AI-USAGE.md.
