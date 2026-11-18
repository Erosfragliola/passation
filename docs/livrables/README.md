# Livrables EDHEC : état au 18/11/2026

| Livrable | Fichier | État |
|---|---|---|
| Business plan (8 à 12 pages) | `business-plan.html` → `business-plan.pdf` (7 pages) | **Brouillon** préparé avec Claude Code : structure et faits du produit ; marché, entretiens, modèle de revenus, équipe et indicateurs « À compléter » par l'équipe, avec sources citées |
| Présentation (8 minutes) | `presentation.html` → `presentation.pdf` (10 diapositives 16:9, timing indiqué) | **Brouillon** : mêmes réserves |
| AI-USAGE.md | `../../AI-USAGE.md` | Rédigé ; passages « À valider par l'équipe » à compléter |
| Scénario de démonstration | `../DEMO.md` | Prêt (valeurs vérifiées par `test/demo.test.js`) |

Régénérer les PDF après modification du HTML (Chrome installé) :

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --print-to-pdf=business-plan.pdf business-plan.html
```

Aucune donnée de marché, aucun tarif, aucun témoignage n'a été inventé. Les versions remises doivent être réécrites et
assumées par l'équipe, et l'usage de l'IA pour les produire déclaré dans AI-USAGE.md.
