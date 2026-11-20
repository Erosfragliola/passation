// Installe les dictionnaires (src/contenu/<langue>/*.json) avant chaque fichier de test : les modules partagés avec
// le navigateur lisent leurs textes avec t() (public/js/i18n.js). Sans langue de requête, t() rend le français.
import "../src/i18n.js";
