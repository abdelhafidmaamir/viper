// The beach's crabs (Sea ambience): one crab per viewer who likes. It digs itself out of the sand
// holding the viewer's picture between its claws, scuttles sideways along the shore, and hops every
// time its viewer likes again. The beach holds a handful: the one that has been quiet the longest
// gives its place to a newcomer.

import { ctx } from '../engine/canvas.ts';
import { H, W } from '../engine/layout.ts';
import { paintFace } from './paint.ts';

interface Crab {
  nickname: string;
  avatar: string | undefined;
  /** Clock time of the first like (the crab comes out) and of the latest one (it hops). */
  born: number;
  hop: number;
  /** Clock times of the latest likes: each one sends up a little heart. */
  hearts: number[];
}

const SPOTS = 5,
  HOP = 0.7,
  HEART = 1.3,
  HEARTS = 14;
const crabs: (Crab | undefined)[] = [];
let now = 0;

/** A like: the viewer's crab hops, or a new crab comes out for them. */
export function crabLike(nickname: string, avatar: string | undefined): void {
  if (!nickname) return;
  const mine = crabs.find((c) => c?.nickname === nickname);
  if (mine) {
    mine.hearts.push(now);
    if (mine.hearts.length > HEARTS) mine.hearts.shift();
    // A hop already under way finishes first: a burst of likes is a run of hops, not a shiver.
    if (now - mine.hop > HOP) mine.hop = now;
    if (avatar) mine.avatar = avatar;
    return;
  }
  let spot = 0;
  for (let i = 0; i < SPOTS; i++) {
    const c = crabs[i];
    if (!c) {
      spot = i;
      break;
    }
    if (c.hop < (crabs[spot]?.hop ?? Infinity)) spot = i;
  }
  crabs[spot] = { nickname, avatar, born: now, hop: now, hearts: [now] };
}

export function clearCrabs(): void {
  crabs.length = 0;
}

function rand(i: number, d: number): number {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
// The crest of the front dune, the same curve the ambience draws its sand with.
const dune = (x: number): number =>
  112 + 28 * Math.sin(x * 0.0046 + 4.1) + 10 * Math.sin(x * 0.02 + 1.0);

/** `rise` is how far the round has filled the board (0..1): the beach climbs with it. */
export function paintCrabs(t: number, rise: number, reduced: boolean): void {
  now = t;
  const g = ctx,
    low = (1 - (0.5 + 0.5 * Math.min(1, Math.max(0, rise)))) * 100,
    still = reduced ? 0 : 1;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  crabs.forEach((crab, i) => {
    if (!crab) return;
    const w = 0.16 + rand(i, 955) * 0.12,
      ph = rand(i, 957) * 6.28,
      // Walking only in the middle of each crossing: at both ends the crab stands a moment.
      pace = (Math.max(0, Math.abs(Math.cos(t * w * still + ph)) - 0.3) / 0.7) * still,
      x = W * (0.12 + 0.19 * i) + 60 * Math.sin(t * w * still + ph),
      y = H + low - dune(x) + 12 + rand(i, 961) * 12,
      step = t * 13 + i * 2,
      out = Math.min(1, (t - crab.born) / 0.5),
      h = Math.min(1, (t - crab.hop) / HOP),
      jump = h < 1 ? Math.sin(h * Math.PI) * 46 : 0;
    // The shadow stays on the sand while the crab is in the air.
    g.fillStyle = `rgba(60,40,20,${String(0.28 * out * (1 - jump / 90))})`;
    g.beginPath();
    g.ellipse(x, y + 18, 34 - jump * 0.2, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    // Coming out of the sand: it grows from the ground up.
    g.translate(x, y + 18 - Math.abs(Math.sin(step)) * 1.5 * pace - jump);
    g.scale(1.4 * out, 1.4 * out);
    g.translate(0, -13);
    // Legs, three a side, stepping in turn; tucked in during a hop.
    g.strokeStyle = '#a83c26';
    g.lineWidth = 3;
    for (const side of [-1, 1]) {
      for (let l = 0; l < 3; l++) {
        const lift = Math.sin(step + l * 2.1 + (side > 0 ? 1.6 : 0)) * 3.5 * pace,
          x0 = side * (11 + l * 2),
          x1 = side * (22 + l * 3);
        g.beginPath();
        g.moveTo(x0, 2 + l * 2);
        g.lineTo(x1, -3 + l * 3 - lift);
        g.lineTo(x1 + side * 4, 11 - Math.max(0, lift) - Math.min(4, jump * 0.3));
        g.stroke();
      }
      // The claws, held up on either side of the picture; they snap during a hop.
      const cx = side * 34,
        cy = -34,
        open = 0.15 + 0.45 * Math.abs(Math.sin(t * 22)) * Math.min(1, jump / 12);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(side * 12, -3);
      g.quadraticCurveTo(side * 34, -6, cx, cy);
      g.stroke();
      g.fillStyle = '#e2674a';
      g.beginPath();
      g.arc(cx, cy, 7.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a2a1a';
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, 8, -Math.PI / 2 - open, -Math.PI / 2 + open);
      g.closePath();
      g.fill();
    }
    // The shell, with a lighter back.
    g.fillStyle = '#d8573a';
    g.strokeStyle = '#8c2f1d';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, 0, 17, 11.5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,190,150,0.5)';
    g.beginPath();
    g.ellipse(-3, -4, 9, 4, -0.2, 0, Math.PI * 2);
    g.fill();
    // Two dots for eyes, low on the shell: the picture sits where the stalks would be.
    g.fillStyle = '#1c1410';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(side * 6, 2, 1.9, 0, Math.PI * 2);
      g.fill();
    }
    paintFace(crab, 0, -42, 28, '#fff');
    g.restore();
    // One heart per like, drifting up from the picture and fading: a like spree is a stream of them.
    crab.hearts = crab.hearts.filter((born) => t - born < HEART);
    crab.hearts.forEach((born) => {
      const age = (t - born) / HEART,
        // Everything about a heart comes from its birth time alone, so it keeps its path while
        // others come and go around it.
        seed = born * 7.3,
        hx = x + Math.sin(seed) * 34 + Math.sin(age * 5 + seed) * 8,
        hy = y - 95 - age * 110,
        s = (0.7 + 0.5 * rand(Math.floor(born * 60), 967)) * Math.min(1, age * 6);
      g.save();
      g.translate(hx, hy);
      g.scale(s, s);
      g.globalAlpha = 1 - age * age;
      g.fillStyle = '#ff5c8a';
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 9);
      g.bezierCurveTo(-18, -4, -9, -17, 0, -7);
      g.bezierCurveTo(9, -17, 18, -4, 0, 9);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    });
  });
  g.restore();
}
