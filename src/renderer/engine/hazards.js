// Board hazards: where stones and brambles may appear. Nothing ever spawns in the lane a snake
// will cross before it becomes solid.

import { sonRonce, sonRoncePas } from './audio.js';
import { palier } from './crowd.js';
import { COLS, ROWS } from './layout.js';
import { PORTEE, RONCE_ALERTE, VITESSE } from './rules.js';
import {
  actif,
  autre,
  baies,
  corps,
  demanderIA,
  dir,
  graines,
  monter,
  reglages,
  rochers,
  ronces,
  serpent,
} from '../scripts/game.js';

export function libres() {
  const occ = new Set(serpent.map((s) => s.x + ',' + s.y));
  const a = autre();
  if (a) a.serpent.forEach((s) => occ.add(s.x + ',' + s.y));
  graines.concat(baies, rochers).forEach((o) => occ.add(o.x + ',' + o.y));
  ronces.forEach((R) => R.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
  const l = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) if (!occ.has(x + ',' + y)) l.push({ x, y });
  return l;
}

// ce que le serpent avale pendant la pousse, avec marge
// REGLE, valable pour TOUT ce qui bloque, pierre comme ronce, ancrage comme croissance :
// on ne pose jamais rien devant le serpent s'il aura traverse la case avant que ca devienne
// actif. Sinon l'objet apparait sous lui pour rien, l'animation ne sert a rien, et le joueur
// comme le spectateur ne comprennent pas ce qu'ils voient.
export function zoneMorte(c, delai) {
  if (!serpent.length) return false;
  const h = serpent[0],
    dx = c.x - h.x,
    dy = c.y - h.y;
  const devant = dx * dir.x + dy * dir.y,
    cote = Math.abs(dx * dir.y - dy * dir.x);
  if (devant > 0 && cote <= 1 && devant <= VITESSE * (delai + 0.25)) return true;
  const a = autre();
  if (a && a.serpent.length) {
    const h2 = a.serpent[0],
      dx2 = c.x - h2.x,
      dy2 = c.y - h2.y;
    const dev2 = dx2 * a.dir.x + dy2 * a.dir.y,
      cot2 = Math.abs(dx2 * a.dir.y - dy2 * a.dir.x);
    if (dev2 > 0 && cot2 <= 1 && dev2 <= VITESSE * (delai + 0.25)) return true;
  }
  return false;
}

// Les cases mortes de la ronce, celles qui tuent deja.
export function roncesDures(k) {
  const l = [];
  ronces.forEach((R) =>
    R.seg.forEach((g) => {
      if (g.t >= RONCE_ALERTE * (k || 1)) l.push(g);
    }),
  );
  return l;
}

export const maxRonces = () => Math.max(1, Math.round(palier.maxRochers / 2));

// Elle prend racine hors de la zone morte, comme la pierre, mais elle pousse ensuite en travers
// de la course du serpent : c'est une voie qu'elle ferme, pas une case.
export function planterRonce(pseudo) {
  if (!serpent.length) return false;
  if (reglages.plafonds && ronces.length >= maxRonces()) return false;
  const h = serpent[0],
    portee = PORTEE();
  const couloir = (c) => zoneMorte(c, RONCE_ALERTE);
  const tout = libres().filter(
    (c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 3 && !couloir(c),
  );
  if (!tout.length) return false;
  // elle s'ancre a l'entree de la voie qu'il allait prendre, un peu de biais
  const loin = Math.ceil(portee) + 2;
  const vise = { x: h.x + dir.x * loin + dir.y * 2, y: h.y + dir.y * loin + dir.x * 2 };
  tout.sort(
    (a, b) =>
      Math.abs(a.x - vise.x) +
      Math.abs(a.y - vise.y) -
      (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
  );
  const c = tout[Math.floor(Math.random() * Math.min(4, tout.length))];
  // elle rampe en travers : perpendiculaire a la course, vers le large du plateau
  let ax = { x: Math.abs(dir.y), y: Math.abs(dir.x) };
  if (!ax.x && !ax.y) ax = { x: 1, y: 0 };
  const versPlus = ax.x ? (c.x < COLS / 2 ? 1 : -1) : c.y < ROWS / 2 ? 1 : -1;
  ronces.push({
    seg: [{ x: c.x, y: c.y, t: 0 }],
    ax,
    sens: versPlus,
    t: 0,
    pas: 0,
    pseudo: pseudo || '',
  });
  sonRonce();
  monter('moon', 1);
  return true;
}

// Elle s'allonge d'une case a la fois, et se retourne si le large lui est ferme.
export function allongerRonce(R) {
  const occ = new Set(serpent.map((g) => g.x + ',' + g.y));
  rochers.forEach((r) => occ.add(r.x + ',' + r.y));
  ronces.forEach((o) => o.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
  for (const sens of [R.sens, -R.sens]) {
    const bout = sens === R.sens ? R.seg[R.seg.length - 1] : R.seg[0];
    const n = { x: bout.x + R.ax.x * sens, y: bout.y + R.ax.y * sens, t: 0 };
    if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || occ.has(n.x + ',' + n.y)) continue;
    if (zoneMorte(n, RONCE_ALERTE)) continue; // elle ne repousse pas sous ses pattes non plus
    if (sens === R.sens) R.seg.push(n);
    else R.seg.unshift(n);
    R.sens = sens;
    sonRoncePas(R.seg.length - 1);
    demanderIA();
    return true;
  }
  return false;
}

// Les baies offertes sont vues tout de suite : une action de spectateur a un effet visible sans delai
// En duel, une baie reservee a l'autre camp n'existe pas pour cette IA : elle ne la vise pas.
export function tousFruits() {
  const moi = corps[actif] ? corps[actif].camp : null;
  return baies
    .filter((b) => !b.pour || !moi || b.pour === moi)
    .map((b) => ({ x: b.x, y: b.y, offerte: true }));
}
