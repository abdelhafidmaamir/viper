// Tension: how cornered the leading snake is, from reachable space, length and dead cells nearby.
// Sampled ten times a second, rising fast and easing slowly; the camera and HUD read it.

import { tier } from './crowd.js';
import { activeBrambles } from './hazards.js';
import { COLS, ROWS } from './layout.js';
import { STONE_WARNING } from './rules.js';
import { rival, stones, snake } from '../scripts/game.js';

// La tension, ce qui resserre l'image. L'avancement de la manche ne dit rien du risque :
// on peut etre a une baie de gagner en pleine ouverture, ou coince des la deuxieme. Trois
// choses la nourrissent : l'espace encore atteignable depuis la tete, la longueur du serpent,
// et les cases mortes qui la touchent. Elle monte vite, elle redescend lentement.
export let tension = 0,
  tensionTarget = 0,
  tensionTimer = 0;

// la tension se remesure dix fois par seconde, puis se lisse : vite vers le haut, lentement vers le bas
export function updateTension(dt) {
  tensionTimer -= dt;
  if (tensionTimer <= 0) {
    tensionTimer = 0.1;
    tensionTarget = measureTension();
  }
  tension += (tensionTarget - tension) * Math.min(1, dt * (tensionTarget > tension ? 3.5 : 0.9));
}

export function measureTension() {
  if (!snake.length) return 0;
  const head = snake[0],
    wall = new Set();
  for (let i = 0; i < snake.length - 1; i++) wall.add(snake[i].x + ',' + snake[i].y);
  const a = rival();
  if (a) a.snake.forEach((s) => wall.add(s.x + ',' + s.y));
  stones.forEach((r) => {
    if (r.t >= STONE_WARNING) wall.add(r.x + ',' + r.y);
  });
  activeBrambles().forEach((g) => wall.add(g.x + ',' + g.y));
  const VOISINS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // 1. on remplit tout ce qui est atteignable depuis la tete, le plateau est petit
  const visited = new Set([head.x + ',' + head.y]);
  let queue = [head],
    n = 0;
  while (queue.length) {
    const nextCells = [];
    for (const c of queue) {
      for (const d of VOISINS) {
        const x = c.x + d[0],
          y = c.y + d[1],
          k = x + ',' + y;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || visited.has(k) || wall.has(k)) continue;
        visited.add(k);
        n++;
        nextCells.push({ x, y });
      }
    }
    queue = nextCells;
  }
  const totalFree = Math.max(1, COLS * ROWS - wall.size);
  // ce qui est coupe : le serpent s'est enferme dans une poche du plateau
  const cutOff = 1 - Math.min(1, n / totalFree);
  // ce qui est etroit : meme sans poche, il ne reste plus de quoi manoeuvrer
  const narrow = 1 - Math.min(1, n / (snake.length * 2 + 16));
  // la longueur seule, qui pese meme quand tout est ouvert
  const lengthFactor = Math.min(1, snake.length / (COLS * ROWS * 0.3));
  // ce qui touche deja la tete : mur, corps ou rocher pose
  let blockedCount = 0;
  for (const d of VOISINS) {
    const x = head.x + d[0],
      y = head.y + d[1];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || wall.has(x + ',' + y)) blockedCount++;
  }
  const stuckFactor = Math.min(1, blockedCount / 3);
  // les pierres posees : chacune retire une case et ferme une ligne de fuite
  const stoneRatio = Math.min(
    1,
    stones.filter((r) => r.t >= STONE_WARNING).length / Math.max(1, tier.maxStones),
  );
  return Math.max(
    0,
    Math.min(
      1,
      0.3 * cutOff + 0.25 * narrow + 0.28 * lengthFactor + 0.1 * stuckFactor + 0.07 * stoneRatio,
    ),
  );
}
