// Chargé de façon bloquante dans <head> de l'accueil (avant les feuilles de style) : décide tout de suite si
// l'animation d'ouverture joue, pour éviter un éclair du contenu. Fichier séparé plutôt que script en ligne, pour que
// la politique de sécurité du contenu (src/lib/entetes.js) n'autorise aucun script en ligne.
try {
  var d = document.documentElement;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && !location.hash && !location.search && !sessionStorage.getItem("passation-intro")) d.classList.add("avec-intro");
} catch (e) { /* stockage indisponible : pas d'animation */ }
