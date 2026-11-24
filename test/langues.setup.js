// Installs the dictionaries (src/contenu/<language>/*.json) before each test file: the modules shared with
// the browser read their texts with t() (public/js/i18n.js). Without a request language, t() returns French.
import "../src/i18n.js";
