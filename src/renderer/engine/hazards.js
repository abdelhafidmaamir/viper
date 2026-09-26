// Board hazards: where stones and brambles may appear. Nothing ever spawns in the lane a snake
// will cross before it becomes solid.

import { playBramble, playBrambleStep } from './audio.js';
import { tier } from './crowd.js';
import { COLS, ROWS } from './layout.js';
import { STONE_CLEARANCE, BRAMBLE_WARNING, SPEED } from './rules.js';
import {
  activeIndex,
  rival,
  berries,
  bodies,
  requestAiMove,
  dir,
  seeds,
  rise,
  settings,
  stones,
  brambles,
  snake,
} from '../scripts/game.js';

export function freeCells() {
  const occupied = new Set(snake.map((s) => s.x + ',' + s.y));
  const a = rival();
  if (a) a.snake.forEach((s) => occupied.add(s.x + ',' + s.y));
  seeds.concat(berries, stones).forEach((o) => occupied.add(o.x + ',' + o.y));
  brambles.forEach((R) => R.seg.forEach((g) => occupied.add(g.x + ',' + g.y)));
  const l = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) if (!occupied.has(x + ',' + y)) l.push({ x, y });
  return l;
}

// REGLE, valable pour TOUT ce qui bloque, pierre comme ronce, ancrage comme croissance :
// on ne pose jamais rien devant le serpent s'il aura traverse la case avant que ca devienne
// actif. Sinon l'objet apparait sous lui pour rien, l'animation ne sert a rien, et le joueur
// comme le spectateur ne comprennent pas ce qu'ils voient.
export function isDeadZone(c, delay) {
  if (!snake.length) return false;
  const h = snake[0],
    dx = c.x - h.x,
    dy = c.y - h.y;
  const devant = dx * dir.x + dy * dir.y,
    side = Math.abs(dx * dir.y - dy * dir.x);
  if (devant > 0 && side <= 1 && devant <= SPEED * (delay + 0.25)) return true;
  const a = rival();
  if (a && a.snake.length) {
    const h2 = a.snake[0],
      dx2 = c.x - h2.x,
      dy2 = c.y - h2.y;
    const dev2 = dx2 * a.dir.x + dy2 * a.dir.y,
      cot2 = Math.abs(dx2 * a.dir.y - dy2 * a.dir.x);
    if (dev2 > 0 && cot2 <= 1 && dev2 <= SPEED * (delay + 0.25)) return true;
  }
  return false;
}

// Les cases mortes de la ronce, celles qui tuent deja.
export function activeBrambles(k) {
  const l = [];
  brambles.forEach((R) =>
    R.seg.forEach((g) => {
      if (g.t >= BRAMBLE_WARNING * (k || 1)) l.push(g);
    }),
  );
  return l;
}

export const maxBrambles = () => Math.max(1, Math.round(tier.maxStones / 2));

// Elle prend racine hors de la zone morte, comme la pierre, mais elle pousse ensuite en travers
// de la course du serpent : c'est une voie qu'elle ferme, pas une case.
export function plantBramble(nickname) {
  if (!snake.length) return false;
  if (settings.caps && brambles.length >= maxBrambles()) return false;
  const h = snake[0],
    range = STONE_CLEARANCE();
  const isInLane = (c) => isDeadZone(c, BRAMBLE_WARNING);
  const candidates = freeCells().filter(
    (c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 3 && !isInLane(c),
  );
  if (!candidates.length) return false;
  // elle s'ancre a l'entree de la voie qu'il allait prendre, un peu de biais
  const farAhead = Math.ceil(range) + 2;
  const aimPoint = { x: h.x + dir.x * farAhead + dir.y * 2, y: h.y + dir.y * farAhead + dir.x * 2 };
  candidates.sort(
    (a, b) =>
      Math.abs(a.x - aimPoint.x) +
      Math.abs(a.y - aimPoint.y) -
      (Math.abs(b.x - aimPoint.x) + Math.abs(b.y - aimPoint.y)),
  );
  const c = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
  // elle rampe en travers : perpendiculaire a la course, vers le large du plateau
  let axis = { x: Math.abs(dir.y), y: Math.abs(dir.x) };
  if (!axis.x && !axis.y) axis = { x: 1, y: 0 };
  const growDir = axis.x ? (c.x < COLS / 2 ? 1 : -1) : c.y < ROWS / 2 ? 1 : -1;
  brambles.push({
    seg: [{ x: c.x, y: c.y, t: 0 }],
    ax: axis,
    direction: growDir,
    t: 0,
    step: 0,
    nickname: nickname || '',
  });
  playBramble();
  rise('moon', 1);
  return true;
}

// Elle s'allonge d'une case a la fois, et se retourne si le large lui est ferme.
export function extendBramble(R) {
  const occupied = new Set(snake.map((g) => g.x + ',' + g.y));
  stones.forEach((r) => occupied.add(r.x + ',' + r.y));
  brambles.forEach((o) => o.seg.forEach((g) => occupied.add(g.x + ',' + g.y)));
  for (const direction of [R.direction, -R.direction]) {
    const tip = direction === R.direction ? R.seg[R.seg.length - 1] : R.seg[0];
    const n = { x: tip.x + R.ax.x * direction, y: tip.y + R.ax.y * direction, t: 0 };
    if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || occupied.has(n.x + ',' + n.y)) continue;
    if (isDeadZone(n, BRAMBLE_WARNING)) continue; // elle ne repousse pas sous ses pattes non plus
    if (direction === R.direction) R.seg.push(n);
    else R.seg.unshift(n);
    R.direction = direction;
    playBrambleStep(R.seg.length - 1);
    requestAiMove();
    return true;
  }
  return false;
}

// Les baies offertes sont vues tout de suite : une action de spectateur a un effet visible sans delai
// En duel, une baie reservee a l'autre camp n'existe pas pour cette IA : elle ne la vise pas.
export function allFruits() {
  const myTeam = bodies[activeIndex] ? bodies[activeIndex].team : null;
  return berries
    .filter((b) => !b.owner || !myTeam || b.owner === myTeam)
    .map((b) => ({ x: b.x, y: b.y, gifted: true }));
}
