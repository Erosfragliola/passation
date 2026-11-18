# Décisions de méthode à prendre (FIN-03, FIN-05)

Audit du 18/11/2026. **Aucune de ces deux conventions n'a été modifiée dans le code** : la décision revient à l'équipe.
Si une convention change, il faut modifier **en même temps** le moteur (`src/valuation/approfondie.js`), le datapack
(`src/documents/datapack.js`), les tests (`test/approfondie.test.js`, `test/datapack.test.js`, `test/demo.test.js`), le
calcul de référence (`scripts/reference-valorisation.py`) et `docs/valorisation-calculs.md`, puis recalculer les valeurs
attendues indépendamment.

Les écarts ci-dessous ont été calculés par un script Python indépendant du code du site. Les références
méthodologiques sont à apporter par l'équipe (manuel ou cours utilisé) : **aucune n'est citée ici faute de l'avoir
vérifiée**.

## FIN-03 : où appliquer les décotes et primes

**Convention actuelle** (`approfondie.js`, `versTitres`) : valeur des titres = VE × (1 + Σ décotes) − dette nette
+ écart de BFR + actifs hors exploitation. La décote porte sur la **valeur d'entreprise**.

**Autre convention possible** : valeur des titres = (VE − dette nette + écart de BFR + actifs hors exploitation)
× (1 + Σ décotes). La décote porte sur la **valeur des titres**.

Impact d'une décote de −20 % (multiple central) :

| Profil | Convention actuelle | Décote sur les titres | Écart |
|---|---:|---:|---:|
| Scénario de démonstration (dette nette 20 000 €) | 1 549 818 € | 1 553 455 € | +0,2 % |
| Société endettée (VE 1 680 000 €, dette nette 1 200 000 €) | 144 000 € | 384 000 € | +166,7 % |
| Société à trésorerie nette (VE 1 680 000 €, trésorerie nette 500 000 €) | 1 844 000 € | 1 744 000 € | −5,4 % |

**Limites de la convention actuelle** : l'effet de la décote est amplifié par l'endettement : dans le cas endetté, une décote de 20 % retire 70 % de
la valeur des titres (480 000 € sans décote, 144 000 € avec). La trésorerie nette, elle, échappe à la décote.

**Arguments possibles pour chaque convention, à vérifier dans la littérature** :
- les facteurs proposés (dépendance au dirigeant, concentration des clients, récurrence, croissance) qualifient
  l'exploitation : ils peuvent se défendre sur la VE, comme un ajustement du multiple ;
- le facteur « Taille et liquidité des titres » qualifie les titres : il se défendrait plutôt sur la valeur des titres.

**Décision à prendre** : (a) garder la convention et l'expliquer dans le README et la présentation ; (b) appliquer toutes
les décotes sur les titres ; (c) distinguer les facteurs d'exploitation (sur la VE) et le facteur de liquidité (sur les
titres).

## FIN-05 : crédit-bail

**Convention actuelle** : le crédit-bail restant dû est ajouté à la dette nette (`detteNette`, ligne `credit_bail`)
alors que les loyers de crédit-bail restent dans les charges externes, donc dans l'EBE. Le financement est alors
compté deux fois : une fois dans l'EBE (loyers) et une fois dans la dette.

Exemple : loyers de 50 000 €/an, restant dû 150 000 €, EBE 350 000 €, multiple 5,6, autre dette nette 20 000 €.

| Convention | Valeur des titres (multiple central) |
|---|---:|
| (1) Actuelle : loyers dans l'EBE et restant dû dans la dette | 1 790 000 € |
| (2) Crédit-bail traité comme une dette : loyers ajoutés à l'EBE, restant dû dans la dette | 2 070 000 € |
| (3) Crédit-bail traité comme une location : loyers dans l'EBE, rien dans la dette | 1 940 000 € |

**Limites de la convention actuelle** : elle sous-évalue les entreprises qui financent leurs équipements par
crédit-bail (−150 000 € par rapport à (3), −280 000 € par rapport à (2) dans l'exemple). Pour être juste, (2) suppose de
connaître les loyers annuels (champ absent aujourd'hui) et de vérifier si les multiples sources (Argos, Dealsuite,
Captain, Damodaran) mesurent l'EBE avant ou après loyers de location (IFRS 16 pour les sociétés cotées).

**Décision à prendre** : (2) demande un nouveau champ « loyers de crédit-bail de l'exercice » et un retraitement de
l'EBE. (3) est la plus simple : retirer la ligne de la dette nette. À défaut, garder (1) en le signalant à
l'utilisateur.

## Autres conventions documentées (P2 de l'audit, non modifiées)

- ANCC : pas d'impôt latent déduit des plus-values latentes ; provisions pour risques comptées à 100 % dans la dette
  nette, avant impôt.
- DCF : la valeur terminale reprend le flux de l'an 5, dont la variation de BFR calculée à la croissance de l'an 5
  et non à la croissance à l'infini.
- Si CMPC − 1 point ≤ croissance à l'infini, la borne haute du DCF n'existe pas : la synthèse haute reprend alors la
  valeur centrale du DCF.
