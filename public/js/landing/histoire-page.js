// Point d'entrée de l'histoire des clés : textes (chapitres, dossier, exemple fictif) posés par le Worker dans <script id="textes-histoire">.
import { lancerHistoire } from "/js/landing/histoire.js";

let H = {};
try { H = JSON.parse(document.getElementById("textes-histoire")?.textContent || "{}"); } catch { H = {}; }
lancerHistoire(document.getElementById("histoire"), { chapitres: H.chapitres || [], dossierTextes: H.dossier || {}, demo: H.demo, fictif: H.dossier?.fictif });
