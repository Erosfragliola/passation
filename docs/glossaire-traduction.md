# Glossaire de traduction (français → anglais américain)

Référence pour tout texte ajouté ou modifié sur le site : chaque terme se traduit toujours de la même façon. Les
textes vivent dans `src/contenu/fr/*.json` et `src/contenu/en/*.json` (mêmes clés). Contrôle : `npm run i18n:check`.

**À relire par le propriétaire.** Les choix ci-dessous sont des propositions. Les termes comptables et fiscaux
français n'ont pas tous d'équivalent exact : la règle est de garder le sens français et d'ajouter, la première fois,
le terme d'origine entre parenthèses quand un repreneur ou un conseil anglophone pourrait en avoir besoin.

## Ton

- Le français vouvoie : l'anglais est professionnel, sobre et chaleureux, à la deuxième personne (« you »).
- Phrases courtes, verbes d'action sur les boutons (« Get a value », « Open my file »). Contractions courantes admises
  dans les petits textes d'interface (« don't », « you'll »), évitées dans les pages juridiques.
- Majuscules : titres en « sentence case » comme en français (« How it works », pas « How It Works »).

## Jamais traduits

Passation (nom du produit), SIREN, SIRET, code NAF, INPI, BODACC, Brevo, Cloudflare, Claude, Excel, noms de
sociétés, noms de personnes, noms de villes, adresses e-mail, codes (« Projet Chêne » reste un nom de code).

## Termes

| Français | Anglais | Remarque |
|---|---|---|
| cession (de l'entreprise) | sale (of the business) | « préparer la cession » : prepare to sell |
| transmission | handover | sens familial et patrimonial |
| céder | sell | |
| repreneur | buyer | « potential buyers » au pluriel générique |
| dirigeant | owner | « business owner » la première fois |
| PME | small business ; SME | « SME » dans les textes formels |
| entreprise | company ; business | |
| valorisation | valuation | |
| estimation (express) | (quick) estimate | |
| valorisation approfondie / détaillée | detailed valuation | |
| fourchette de valeur | value range | |
| dossier (de cession) | file ; sale file | « Mon dossier » : My file |
| teaser anonyme | anonymous teaser | « blind teaser » chez les professionnels |
| mémorandum d'information | information memorandum | « IM » en abrégé |
| datapack (Excel) | (Excel) datapack | |
| nom de code | code name | |
| parcours guidé | guided steps | |
| pièces (justificatives) | documents | liste des pièces : document checklist |
| conseils (avocat, expert-comptable) | advisors | |
| expert-comptable | accountant | |
| registres officiels | official registries | |
| comptes annuels | annual accounts | |
| comptes confidentiels | confidential accounts | comptes non publiés au greffe |
| liasse fiscale | French tax return (liasse fiscale) | |
| exercice (comptable) | fiscal year | « dernier exercice » : latest fiscal year |
| chiffre d'affaires (CA) | revenue | |
| excédent brut d'exploitation (EBE) | EBITDA (EBE) | proche de l'EBITDA anglo-saxon ; « EBITDA » ensuite |
| résultat d'exploitation | operating income (EBIT) | |
| résultat net | net income | |
| marge d'EBE | EBITDA margin | |
| capitaux propres | shareholders' equity | |
| trésorerie | cash | |
| dette financière nette | net debt | |
| valeur d'entreprise (VE) | enterprise value (EV) | |
| valeur des titres | equity value | « valeur de vos titres » : value of your shares |
| multiple (d'EBE, de CA) | (EBITDA, revenue) multiple | |
| décote, prime | discount, premium | |
| retraitements | adjustments | |
| éléments exceptionnels | one-off items | |
| rémunération normative du dirigeant | market-rate owner salary | |
| loyer de marché | market rent | |
| compte courant d'associé | shareholder loan | |
| crédit-bail | lease financing | |
| plus-values latentes | unrealized gains | |
| impôt sur les sociétés (IS) | corporate income tax | taux réduit de 15 % : reduced 15% rate |
| BFR (besoin en fonds de roulement) | working capital | |
| à compléter | to be completed | |
| à remplir | to be filled in | |

## Formats

| | Français | Anglais |
|---|---|---|
| Date | 19 novembre 2026 ; 19/11/2026 | November 19, 2026 ; 11/19/2026 |
| Nombre | 1 234,50 | 1,234.50 |
| Montant | 12,50 € ; 1,8 M€ ; 450 k€ | €12.50 ; €1.8M ; €450K |
| Fourchette | 1,8 – 2,4 M€ | €1.8M – €2.4M |
| Pourcentage | 12,5 % | 12.5% |
| Téléphone | 01 23 45 67 89 | +33 1 23 45 67 89 |

Les formats viennent du code (`Intl`, avec la langue de la page), jamais d'un texte écrit à la main.
