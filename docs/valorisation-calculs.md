# Valorisation approfondie : cas d'essai et calcul de référence

Les valeurs attendues des tests (`test/approfondie.test.js`) ont été calculées **indépendamment du code du site**, par
un script Python qui suit les formules de `PLAN.md` § 5.2. Hypothèses : `src/data/hypotheses.json`.

## Cas d'essai « Atelier Exemple » (secteur industrie, multiples 4 / 5,6 / 7)

| | 2023 | 2024 | 2025 |
|---|---:|---:|---:|
| Chiffre d'affaires | 2 000 000 | 2 200 000 | 2 400 000 |
| Achats consommés | 800 000 | 880 000 | 960 000 |
| Charges externes | 300 000 | 320 000 | 340 000 |
| Impôts et taxes | 40 000 | 40 000 | 40 000 |
| Salaires et charges | 600 000 | 640 000 | 680 000 |
| **EBE comptable** | **260 000** | **320 000** | **380 000** |
| Dirigeant (150 000 réel − 100 000 normatif) | +50 000 | +50 000 | +50 000 |
| Loyer (60 000 payé − 48 000 marché) | +12 000 | +12 000 | +12 000 |
| Exceptionnel (litige) | | +20 000 | |
| **EBE retraité** | **322 000** | **402 000** | **442 000** |

- EBE normatif = (322 000 + 402 000 + 442 000) / 3 = **388 666,67**.
- Multiples : VE = 388 666,67 × 4 / 5,6 / 7 = 1 554 666,67 / **2 176 533,33** / 2 720 666,67.
- BFR (stocks + clients − fournisseurs − dettes fiscales et sociales) :
  - montants : 160 000 / 180 000 / 200 000 ;
  - en jours de CA : 29,2 / 29,8636 / 30,4167, soit une moyenne de **29,8268 j** ;
  - BFR normatif = 29,8268 / 365 × 2 400 000 = **196 121,21**, d'où un écart réel − normatif de **+3 878,79**.
- Dette nette 2025 = 300 000 (emprunts) + 50 000 (comptes courants) + 20 000 (provisions) − 250 000 (trésorerie)
  − 50 000 (placements) = **70 000**.
- Décotes : −10 % (dépendance au dirigeant) + 5 % (récurrence), soit un facteur de × 0,95.
- Titres (multiples) = VE × 0,95 − 70 000 + 3 878,79 = 1 410 812,12 / **2 001 585,45** / 2 518 512,12.
- CMPC, avec une prime de taille de 3 % :
  - bêta endetté = 1,0844 × (1 + 0,75 × 0,1136) = 1,17679 ;
  - coût des fonds propres = 3,27 % + 1,17679 × 5,01 % + 3 % = 12,1657 % ;
  - poids de la dette = 0,1136 / 1,1136 = 10,20 % ;
  - coût de la dette après impôt = 3,71 % × 0,75 = 2,7825 % ;
  - **CMPC = 11,2085 %**.
- DCF sur 5 ans (convention de fin d'année) :
  - hypothèses : CA + 5 %/an, marge d'EBE 16 %, amortissements 3 % du CA, investissements 3 % du CA, BFR 30 j, IS 25 % ;
  - flux : 235 836,99 / 247 628,84 / 260 010,28 / 273 010,79 / 286 661,33 ;
  - valeur terminale = 286 661,33 × 1,02 / (0,112085 − 0,02) = 3 175 259,15 ;
  - VE = 948 371,45 + 1 866 761,17 = **2 815 132,61** ;
  - titres : **2 608 254,77** (CMPC + 1 pt : 2 341 609,13 ; CMPC − 1 pt : 2 940 077,98).
- ANCC = 900 000 − 10 000 (créances douteuses) = **890 000** : plancher, présenté à part.
- **Synthèse** = 60 % × 2 001 585,45 + 40 % × 2 608 254,77 = **2 244 253,18**.
- Sensibilité au multiple ± 1x (titres) : 1 632 352,12 / 2 370 818,79.
- IS au taux réduit sur 100 000 € = 42 500 × 15 % + 57 500 × 25 % = **20 750**.

Le parcours complet par l'API et dans le navigateur (`test/parcours.test.js`) donne 2 244 512 € avec les mêmes données.
Seule différence : les amortissements (3,0 %) et le BFR (29,83 j) y sont tirés de l'historique validé, au lieu des
3 % et 30 j fixés à la main dans le cas d'essai.
