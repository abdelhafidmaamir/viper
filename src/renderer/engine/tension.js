// Tension: how cornered the leading snake is, from reachable space, length and dead cells nearby.
// Sampled ten times a second, rising fast and easing slowly; the camera and HUD read it.

import { palier } from './crowd.js';
import { roncesDures } from './hazards.js';
import { COLS, ROWS } from './layout.js';
import { ALERTE } from './rules.js';
import { autre, rochers, serpent } from '../scripts/game.js';

// La tension, ce qui resserre l'image. L'avancement de la manche ne dit rien du risque :
// on peut etre a une baie de gagner en pleine ouverture, ou coince des la deuxieme. Trois
// choses la nourrissent : l'espace encore atteignable depuis la tete, la longueur du serpent,
// et les cases mortes qui la touchent. Elle monte vite, elle redescend lentement.
export let tension = 0,
  tensionCible = 0,
  tensionT = 0;

// la tension se remesure dix fois par seconde, puis se lisse : vite vers le haut, lentement vers le bas
export function majTension(dt) {
  tensionT -= dt;
  if (tensionT <= 0) {
    tensionT = 0.1;
    tensionCible = mesurerTension();
  }
  tension += (tensionCible - tension) * Math.min(1, dt * (tensionCible > tension ? 3.5 : 0.9));
}

export function mesurerTension() {
  if (!serpent.length) return 0;
  const tete = serpent[0],
    mur = new Set();
  for (let i = 0; i < serpent.length - 1; i++) mur.add(serpent[i].x + ',' + serpent[i].y);
  const a = autre();
  if (a) a.serpent.forEach((s) => mur.add(s.x + ',' + s.y));
  rochers.forEach((r) => {
    if (r.t >= ALERTE) mur.add(r.x + ',' + r.y);
  });
  roncesDures().forEach((g) => mur.add(g.x + ',' + g.y));
  const VOISINS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // 1. on remplit tout ce qui est atteignable depuis la tete, le plateau est petit
  const vus = new Set([tete.x + ',' + tete.y]);
  let file = [tete],
    n = 0;
  while (file.length) {
    const suiv = [];
    for (const c of file) {
      for (const d of VOISINS) {
        const x = c.x + d[0],
          y = c.y + d[1],
          k = x + ',' + y;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || vus.has(k) || mur.has(k)) continue;
        vus.add(k);
        n++;
        suiv.push({ x, y });
      }
    }
    file = suiv;
  }
  const libres = Math.max(1, COLS * ROWS - mur.size);
  // ce qui est coupe : le serpent s'est enferme dans une poche du plateau
  const coupe = 1 - Math.min(1, n / libres);
  // ce qui est etroit : meme sans poche, il ne reste plus de quoi manoeuvrer
  const etroit = 1 - Math.min(1, n / (serpent.length * 2 + 16));
  // la longueur seule, qui pese meme quand tout est ouvert
  const longueur = Math.min(1, serpent.length / (COLS * ROWS * 0.3));
  // ce qui touche deja la tete : mur, corps ou rocher pose
  let morts = 0;
  for (const d of VOISINS) {
    const x = tete.x + d[0],
      y = tete.y + d[1];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || mur.has(x + ',' + y)) morts++;
  }
  const colle = Math.min(1, morts / 3);
  // les pierres posees : chacune retire une case et ferme une ligne de fuite
  const pierres = Math.min(
    1,
    rochers.filter((r) => r.t >= ALERTE).length / Math.max(1, palier.maxRochers),
  );
  return Math.max(
    0,
    Math.min(1, 0.3 * coupe + 0.25 * etroit + 0.28 * longueur + 0.1 * colle + 0.07 * pierres),
  );
}
