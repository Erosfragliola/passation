# 3D v3 : « De l'esquisse à l'édifice »

Remplace la maquette sous cloche (v2). Branche `3d-esquisse-edifice`.

## Décisions (12/11/2026)

Le dirigeant a délégué ces arbitrages (« je te fais confiance ») après le plan en 14 points :

1. Pas de sections « chiffres » et « documents » sur la page : le volume puis la matière se jouent pendant la
   traversée de « Comment ça marche » (étapes 02 et 03).
2. La scène ne couvre pas la page : elle se montre dans des **fenêtres** (`[data-fenetre]`), la colonne de « Le
   témoin » et une bande vide entre l'en-tête et le contenu des sections. Le contenu existant (les trois photos,
   les cartes d'outils) ne bouge pas.
3. Vue éclatée : 6 strates fixes (fondations, rez-de-chaussée, étages, façade, toiture, enseigne), une par outil,
   indépendantes du nombre d'étages.
4. Le hero garde sa vidéo ; l'esquisse commence à « Le témoin », où s'affichent la frise et la fourchette.
5. Mesures avec `npx lighthouse@13.6.0` (cache npm, rien d'installé sur la machine).

## Principe

- Un seul canevas WebGL, déplacé dans la fenêtre la plus visible ; il défile avec elle (défilement natif,
  aucun écouteur bloquant, `pointer-events: none` : il ne capte jamais un geste).
- L'état est une **fonction pure** du défilement : `public/js/edifice/etats.js` (testé dans
  `test/edifice-etats.test.js`). Seul le changement d'entreprise joue une transition courte (1,6 s : le tracé
  s'efface puis se redessine) ; la frise et la fourchette s'affichent à son rythme.
- Rendu à la demande : une image n'est calculée que si le défilement, le pointeur ou les données changent ;
  rien quand aucune fenêtre n'est à l'écran ou que l'onglet est masqué.

| Fenêtre | Grandeur | Centre de la fenêtre (hauteurs d'écran) |
|---|---|---|
| `esquisse` (Le témoin) | tracé au trait | 1,2 → 0,62 |
| `ouvrage` (Comment ça marche) | volume : étages un à un, toit, fenêtres une par une, arbres | 1,2 → 0,7 |
| `ouvrage` | matière : pierre, verre, laiton, lumière chaude, personnages | 0,66 → 0,3 |
| `eclate` (bande collante de « La boîte à outils ») | ouverture en entrant ; fermeture quand les cartes finissent de passer sous la bande | 1,1 → 0,45 ; cartes 80 % → 100 % |
| `enseigne` (Confidentialité) | le nom quitte la plaque et le cartouche, la cote s'en va, le décor s'estompe | 1,1 → 0,5 |
| `soir` (appel final) | lumière du soir, fenêtres allumées plus lumineuses | 1,15 → 0,55 |

Vue éclatée, une strate par outil (même ordre que les cartes, attribut `data-strate`) : Valorisation → fondations,
Datapack → étages, Teaser → enseigne, Mémorandum → façade (avance vers le lecteur), Ressources → rez-de-chaussée,
Chat expert → toiture. Survoler une carte (ordinateur), la toucher, ou sur écran tactile la laisser au centre de la
zone visible sous la bande : sa strate se soulève et prend un reflet cuivré, la carte reçoit un liseré cuivre.
Après la confidentialité, la maquette reste anonyme jusqu'au soir (la feuille reste opaque : c'est le sol).

## Données → maquette (inchangé, `regles.js`)

Étages = chiffre d'affaires, fenêtres allumées = effectif, arbres = rentabilité, archétype = secteur NAF,
échafaudage = croissance. La plaque porte le nom et l'année de création ; la fourchette est écrite comme une cote
de plan (mêmes mentions que le texte : « Sur mesure », « À compléter » quand il n'y a pas de fourchette). Sans
SIREN : « Entreprise d'exemple », plaque « Exemple », cote « Exemple ».

## Fichiers

`public/js/edifice/` : `scene.js` (orchestration), `etats.js` (fonction pure), `batiment.js` (archétypes repris de
la v2, sans animation), `materiaux.js` (passage carton → matière par une seule commande, papier, cote, plaque),
`textures.js` + worker, `rendu.js`. Images fixes : `public/img/edifice/`. Lignes épaisses : modules d'exemple de
Three.js ajoutés à `public/vendor/rendu3d.js` (`npm run vendor:3d`).

## Livraisons

1. Scènes 1 à 3 (esquisse, volume, matière) avec un vrai SIREN : **faite**.
2. Scènes 4 à 6 (vue éclatée, enseigne effacée, soir) : **faite**.
3. Finitions (mobile, accessibilité, performances) : à faire.

## Mesures (local, `wrangler dev`)

| | Avant | Après livraison 1 | Après livraison 2 |
|---|---|---|---|
| Lighthouse mobile : performance / accessibilité | 100 / 100 | 100 / 100 | 100 / 100 |
| FCP / LCP / TBT / CLS | 0,8 s / 0,8 s / 0 ms / 0,001 | 0,8 s / 0,8 s / 0 ms / 0,001 | 0,9 s / 0,9 s / 0 à 10 ms / 0,001 |
| Poids au chargement (Lighthouse) | 375 Ko | 328 Ko | 407 Ko (images fixes des 5 fenêtres) |
| Parcours complet, ordinateur : image moyenne / 95e centile | 22,1 ms / 50 ms | 17,1 ms / 16,8 ms | 17,3 ms / 16,8 ms |
| Parcours complet, mobile : image moyenne / 95e centile | 17,1 ms / 16,8 ms | 17,1 ms / 16,7 ms | 17,2 ms / 16,8 ms |
| Tâches longues pendant le parcours (ordinateur / mobile) | 550 ms / 417 ms | 493 ms / 427 ms | 627 ms / 557 ms |
