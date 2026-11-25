# Translation glossary (French → American English)

Reference for any text added to or changed on the site: each term is always translated the same way. The texts live
in `src/contenu/fr/*.json` and `src/contenu/en/*.json` (same keys). Check: `npm run i18n:check`.

**To be reviewed by the owner.** The choices below are proposals. Not all French accounting and tax terms have an exact
equivalent: the rule is to keep the French meaning and to add, the first time, the original term in parentheses when
an English-speaking buyer or advisor might need it.

## Tone

- The French version uses the formal "vous": the English is professional, plain and warm, in the second person ("you").
- Short sentences, action verbs on buttons ("Get a value", "Open my file"). Common contractions are allowed in short
  interface texts ("don't", "you'll") and avoided in the legal pages.
- Capitalization: titles in sentence case, as in French ("How it works", not "How It Works").

## Never translated

Passation (product name), SIREN, SIRET, NAF code, INPI, BODACC, Brevo, Cloudflare, Claude, Excel, company names, names
of people, city names, email addresses, code names ("Projet Chêne" stays a code name).

## Terms

| French | English | Note |
|---|---|---|
| cession (de l'entreprise) | sale (of the business) | "préparer la cession": prepare to sell |
| transmission | handover | family and estate sense |
| céder | sell | |
| repreneur | buyer | "potential buyers" as the generic plural |
| dirigeant | owner | "business owner" the first time |
| PME | small business ; SME | "SME" in formal texts |
| entreprise | company ; business | |
| valorisation | valuation | |
| estimation (express) | (quick) estimate | |
| valorisation approfondie / détaillée | detailed valuation | |
| fourchette de valeur | value range | |
| dossier (de cession) | file ; sale file | "Mon dossier": My file |
| teaser anonyme | anonymous teaser | "blind teaser" among professionals |
| mémorandum d'information | information memorandum | "IM" for short |
| datapack (Excel) | (Excel) datapack | |
| nom de code | code name | |
| parcours guidé | guided steps | |
| pièces (justificatives) | documents | liste des pièces: document checklist |
| conseils (avocat, expert-comptable) | advisors | |
| expert-comptable | accountant | |
| registres officiels | official registries | |
| comptes annuels | annual accounts | |
| comptes confidentiels | confidential accounts | accounts not published at the commercial court registry |
| liasse fiscale | French tax return (liasse fiscale) | |
| exercice (comptable) | fiscal year | "dernier exercice": latest fiscal year |
| chiffre d'affaires (CA) | revenue | |
| excédent brut d'exploitation (EBE) | EBITDA (EBE) | close to the English-speaking EBITDA; "EBITDA" afterwards |
| résultat d'exploitation | operating income (EBIT) | |
| résultat net | net income | |
| marge d'EBE | EBITDA margin | |
| capitaux propres | shareholders' equity | |
| trésorerie | cash | |
| dette financière nette | net debt | |
| valeur d'entreprise (VE) | enterprise value (EV) | |
| valeur des titres | equity value | "valeur de vos titres": value of your shares |
| multiple (d'EBE, de CA) | (EBITDA, revenue) multiple | |
| décote, prime | discount, premium | |
| retraitements | adjustments | |
| éléments exceptionnels | one-off items | |
| rémunération normative du dirigeant | market-rate owner salary | |
| loyer de marché | market rent | |
| compte courant d'associé | shareholder loan | |
| crédit-bail | lease financing | |
| plus-values latentes | unrealized gains | |
| impôt sur les sociétés (IS) | corporate income tax | taux réduit de 15 %: reduced 15% rate |
| BFR (besoin en fonds de roulement) | working capital | |
| à compléter | to be completed | |
| à remplir | to be filled in | |

## Formats

| | French | English |
|---|---|---|
| Date | 19 novembre 2026 ; 19/11/2026 | November 19, 2026 ; 11/19/2026 |
| Number | 1 234,50 | 1,234.50 |
| Amount | 12,50 € ; 1,8 M€ ; 450 k€ | €12.50 ; €1.8M ; €450K |
| Range | 1,8 – 2,4 M€ ; 150 – 230 k€ | €1.8–2.4M ; €150–230K |
| Percentage | 12,5 % | 12.5% |
| Phone | 01 23 45 67 89 | +33 1 23 45 67 89 |

Formats come from the code (`Intl`, with the page's language), never from hand-written text.
