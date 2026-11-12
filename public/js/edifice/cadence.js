// Mesure de la cadence d'affichage pour la qualité adaptative de la maquette. Module sans DOM ni WebGL (testé
// dans test/edifice-cadence.test.js).
//
// Le rendu est à la demande : une image peut être sautée sans que rien ne ralentisse (rien n'a bougé), et une image
// demandée par un événement (défilement, pointeur) n'arrive pas forcément à l'image suivante. On ne mesure donc que
// les images que la scène s'est elle-même demandées d'une image à la suivante (enchaine = true) : seule une page
// réellement ralentie espace ces images-là.

/**
 * @param {object} o
 * @param {number} o.depart    instant de création (ms) ; rien n'est jugé pendant `o.attente` ms (chargement)
 * @param {number} [o.seuil]   cadence minimale acceptée (images par seconde)
 * @param {number} [o.duree]   durée cumulée sous le seuil avant de demander une baisse de qualité (ms)
 * @returns {{ tic(t: number, enchaine: boolean, cache?: boolean): boolean, readonly ips: number }}
 *   tic renvoie true quand il faut baisser la qualité d'un palier.
 */
export function creerCadence({ depart, seuil = 45, duree = 2000, attente = 3500, fenetre = 500, coupure = 250 }) {
  let images = 0, debut = depart, derniere = depart, sousSeuil = 0, ips = 60;
  return {
    tic(t, enchaine, cache = false) {
      // Chaîne interrompue (image demandée par un événement, pause, onglet masqué) : on repart de zéro.
      if (!enchaine || cache || t - depart < attente || t - derniere > coupure) { debut = t; images = 0; derniere = t; return false; }
      derniere = t;
      images++;
      const ecoule = t - debut;
      if (ecoule < fenetre) return false;
      ips = (images * 1000) / ecoule;
      images = 0; debut = t;
      if (ips >= seuil) { sousSeuil = 0; return false; }
      sousSeuil += ecoule;
      if (sousSeuil < duree) return false;
      sousSeuil = 0;
      return true;
    },
    get ips() { return ips; },
  };
}
