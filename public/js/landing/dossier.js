// Le dossier de présentation (couverture, onglets, teaser anonyme), partagé par la fin de l'histoire des clés,
// la démo « Et la vôtre ? » et l'écran de résultat. Mis en page en unités de sa propre largeur (container queries,
// CSS .dossier) : il reste net et lisible à toutes les tailles.
//
// definir(etat) accepte un état partiel :
//   attente      0 à 1   « Votre entreprise » en attente (pointillés)
//   nom          [ligne1, ligne2] et ecrit (0 à 1, part des caractères tapés)
//   meta         texte de la ligne SIREN · ville, et metaOp (0 à 1)
//   bandeaux     [b1, b2, b3] de 0 à 1 (recouvrement du nom puis de la ligne SIREN)
//   tampon       { op, echelle, nom }   (« PROJET CHÊNE »)
//   lignes       [{ texte, revele }] × 4 (Secteur, Région, Ancienneté, Effectif)
//   pastille     { op, echelle, valeur }
//   mentionOp    0 à 1
//   onglets      [{ op, dx }] × 9
//   secousse     décalage vertical (px de la maquette) du choc du tampon

const el = (tag, classe, texte) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
};
const CADENAS = '<svg width="11" height="13" viewBox="0 0 11 13" aria-hidden="true"><rect x="1" y="5.5" width="9" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 5.5V3.8a2.5 2.5 0 0 1 5 0V5.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 27V15a7 7 0 0 1 14 0v12" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M5 27h22" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="21" r="2.8" fill="#A8653A"/></svg>';

/** Nom de société en deux lignes équilibrées (« MENUISERIE » / « DURAND & FILS »). */
export function couperNom(nom) {
  const mots = String(nom || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return [mots[0] || "", ""];
  let meilleur = [mots.join(" "), ""], ecart = Infinity;
  for (let i = 1; i < mots.length; i++) {
    const a = mots.slice(0, i).join(" "), b = mots.slice(i).join(" ");
    if (Math.max(a.length, b.length) < ecart) { ecart = Math.max(a.length, b.length); meilleur = [a, b]; }
  }
  return meilleur;
}

/**
 * @param {{ textes: object, chapitres: {numero: string}[], valeurLibelle?: string }} options
 *   textes : histoire.dossier du contenu (entete, confidentiel, titre, teaser, secteur, region, anciennete, effectif, pied)
 */
export function creerDossier({ textes = {}, chapitres = [], valeurLibelle = "" }) {
  const racine = el("div", "dossier");
  racine.append(el("div", "dossier-feuille dossier-feuille-3"), el("div", "dossier-feuille dossier-feuille-2"));

  const onglets = el("div", "dossier-onglets");
  const ongletsEl = chapitres.map((c, i) => {
    const o = el("div", `dossier-onglet${i === chapitres.length - 1 ? " dossier-onglet-valeur" : ""}`);
    o.style.setProperty("--i", i);
    o.append(el("span", null, c.numero));
    onglets.append(o);
    return o;
  });
  racine.append(onglets);

  const couverture = el("div", "dossier-couverture");
  const entete = el("div", "dossier-entete");
  const conf = el("span", "dossier-confidentiel");
  conf.innerHTML = CADENAS;
  conf.append(" ", textes.confidentiel || "");
  entete.append(el("span", null, textes.entete), conf);

  const identite = el("div", "dossier-identite");
  const attente = el("p", "dossier-attente", textes.titre);
  const nom = el("p", "dossier-nom");
  const l1 = el("span", "dossier-nom-ligne"), l2 = el("span", "dossier-nom-ligne");
  nom.append(l1, l2);
  const meta = el("p", "dossier-meta");
  const tampon = el("div", "dossier-tampon");
  const tamponNom = el("span", "dossier-tampon-nom");
  tampon.append(el("span", "dossier-tampon-libelle", "Nom de code"), tamponNom);
  identite.append(attente, nom, meta, tampon);

  const teaser = el("p", "dossier-teaser", textes.teaser);
  const lignes = el("dl", "dossier-lignes");
  const lignesEl = ["secteur", "region", "anciennete", "effectif"].map((k, j) => {
    const d = el("div", "dossier-ligne");
    const dd = el("dd");
    const barre = el("span", "dossier-ligne-barre");
    barre.style.setProperty("--l", [0.47, 0.37, 0.18, 0.39][j]);
    const valeur = el("span", "dossier-ligne-valeur");
    dd.append(barre, valeur);
    d.append(el("dt", null, textes[k]), dd);
    lignes.append(d);
    return { barre, valeur };
  });
  const pastille = el("p", "dossier-pastille");
  const pastilleValeur = el("strong");
  pastille.append(el("span", null, valeurLibelle), pastilleValeur);
  const mention = el("p", "dossier-mention");
  const pied = el("div", "dossier-pied");
  const logo = el("span", "dossier-logo");
  logo.innerHTML = LOGO;
  logo.append("Passation");
  pied.append(logo, el("span", null, textes.pied));
  couverture.append(entete, identite, teaser, lignes, pastille, mention, pied);
  racine.append(couverture);

  const etat = { nom: ["", ""], ecrit: 1 };
  // Le nom de code tient dans le cadre du tampon (484 unités de large, marge comprise)
  function ajusterTampon() {
    tamponNom.style.setProperty("--tampon-taille", "1");
    const dispo = couverture.clientWidth * (440 / 600);
    const largeur = tamponNom.scrollWidth;
    if (dispo > 0 && largeur > dispo) tamponNom.style.setProperty("--tampon-taille", (dispo / largeur).toFixed(3));
  }
  // Mesure sur le texte complet (même pendant qu'il s'écrit) : la taille ne change pas en cours de frappe
  function ajusterNom() {
    nom.style.setProperty("--nom-echelle", "1");
    const mesure = el("span", "dossier-nom-mesure");
    nom.append(mesure);
    let taille = 1;
    for (const ligne of etat.nom) {
      mesure.textContent = ligne;
      const dispo = couverture.clientWidth * (512 / 600);
      if (mesure.scrollWidth > dispo && dispo > 0) taille = Math.min(taille, dispo / mesure.scrollWidth);
    }
    mesure.remove();
    nom.style.setProperty("--nom-echelle", taille.toFixed(3));
  }
  function definir(e = {}) {
    if ("attente" in e) { attente.style.opacity = e.attente; racine.classList.toggle("dossier-nomme", e.attente < 0.5); }
    if (e.nom) etat.nom = e.nom;
    if ("ecrit" in e || e.nom) {
      if ("ecrit" in e) etat.ecrit = e.ecrit;
      const [a, b] = etat.nom;
      const n = Math.floor(etat.ecrit * (a.length + b.length) + 1e-6);
      l1.textContent = a.slice(0, n);
      l2.textContent = b.slice(0, Math.max(0, n - a.length));
    }
    if (e.nom) requestAnimationFrame(ajusterNom);
    if ("meta" in e) meta.textContent = e.meta;
    if ("metaOp" in e) meta.style.opacity = e.metaOp;
    if (e.bandeaux) [l1, l2, meta].forEach((x, i) => x.style.setProperty("--bandeau", e.bandeaux[i] ?? 0));
    if (e.tampon) {
      if (e.tampon.nom != null) { tamponNom.textContent = e.tampon.nom; requestAnimationFrame(ajusterTampon); }
      if ("op" in e.tampon) tampon.style.opacity = e.tampon.op;
      if ("echelle" in e.tampon) tampon.style.setProperty("--tampon-echelle", e.tampon.echelle);
    }
    if (e.lignes) e.lignes.forEach((x, j) => {
      if (!lignesEl[j] || !x) return;
      if (x.texte != null) lignesEl[j].valeur.textContent = x.texte;
      if ("revele" in x) { lignesEl[j].valeur.style.setProperty("--revele", x.revele); lignesEl[j].barre.style.opacity = 1 - x.revele; }
    });
    if (e.pastille) {
      if (e.pastille.valeur != null) pastilleValeur.textContent = e.pastille.valeur;
      if ("op" in e.pastille) pastille.style.opacity = e.pastille.op;
      if ("echelle" in e.pastille) pastille.style.setProperty("--pastille", e.pastille.echelle);
    }
    if ("mention" in e) mention.textContent = e.mention;
    if ("mentionOp" in e) mention.style.opacity = e.mentionOp;
    if (e.onglets) e.onglets.forEach((o, i) => { if (ongletsEl[i] && o) { ongletsEl[i].style.opacity = o.op; ongletsEl[i].style.setProperty("--dx", o.dx); } });
    if ("secousse" in e) racine.style.setProperty("--secousse", e.secousse);
  }
  // État de départ : en attente, rien d'écrit, onglets cachés
  definir({ attente: 1, nom: ["", ""], ecrit: 0, metaOp: 0, bandeaux: [0, 0, 0], tampon: { op: 0, echelle: 1.9 },
    lignes: lignesEl.map(() => ({ revele: 0 })), pastille: { op: 0, echelle: 0.86 }, mentionOp: 0,
    onglets: ongletsEl.map(() => ({ op: 0, dx: -64 })), secousse: 0 });
  return { element: racine, definir, onglets: ongletsEl };
}
