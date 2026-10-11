// Snake Arena's simulated audience, for rehearsals: 10, 100 or 700 viewers really sending likes
// and gifts at rates that scale with the room, a few much keener than the rest, as on a live.
// The rates are assumptions, not measurements. What they send goes the way a live's events go
// (main.ts hands it to the same functions), so a rehearsal plays the real rules.

import type { CrowdLevel } from '../../shared/feed-protocol.ts';

const BASE = [
  'lina.snx',
  'moe_88',
  'Capy',
  'jozsor003',
  'Rafa A.S',
  'Caylee',
  'dan',
  'Petra',
  'kedo3838',
  'Leonmx',
  'zoe.art',
  'ines.b',
  'tom_k',
  'NightOwl',
  'sofia.rz',
  'maxou',
  'yas.min',
  'kirby77',
  'ellie',
  'nour',
  'sam.wave',
  'theo_b',
  'luna',
  'ravi',
  'mia.k',
  'jules',
  'omar',
  'tess',
  'noa',
  'eli.v',
];

/** Viewers per audience size in the control room: small, medium, busy. */
export const AUDIENCE: Readonly<Record<CrowdLevel, number>> = { 0: 0, 1: 10, 2: 100, 3: 700 };

/** Per viewer per second: like bursts and gifts. */
const RATES = { like: 0.3 / 15, gift: 0.06 / 60 };
/** Odds of each gift size, by coins: Rose, Rosa, a 20 or 30 coin gift, a big one. */
const GIFTS: readonly [number, number][] = [
  [1, 0.8],
  [10, 0.12],
  [20, 0.03],
  [30, 0.03],
  [100, 0.02],
];

interface Sim {
  name: string;
  /** A made-up picture: a colour and the name's first letter, as a data URL. */
  avatar: string;
  /** How much this viewer does, relative to an average one. */
  zeal: number;
  gifter: boolean;
}

let viewers: Sim[] = [];

export function setAudience(n: number, rand: () => number = Math.random): void {
  viewers = [];
  for (let i = 0; i < n; i++) {
    const base = BASE[i % BASE.length] ?? 'viewer',
      name = i < BASE.length ? base : `${base}${String(Math.floor(i / BASE.length) + 1)}`,
      z = rand();
    viewers.push({
      name,
      avatar: pictureOf(name, i),
      zeal: 0.25 + 2.5 * z * z,
      gifter: rand() < 0.15,
    });
  }
}

export const audienceSize = (): number => viewers.length;

/** A rehearsal viewer's picture: their initial on a colour of their own. */
function pictureOf(name: string, i: number): string {
  const hue = (i * 47) % 360,
    letter = (name.replace(/[^A-Za-z]/g, '').slice(0, 1) || '?').toUpperCase();
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${String(hue)} 45% 42%)"/><text x="32" y="43" font-family="sans-serif" font-size="30" font-weight="700" fill="#f3f7ec" text-anchor="middle">${letter}</text></svg>`,
  )}`;
}

function pick(rand: () => number, gifting: boolean): Sim | undefined {
  // Weighted by zeal: the keen few do most of it.
  const pool = gifting ? viewers.filter((v) => v.gifter) : viewers;
  let total = 0;
  for (const v of pool) total += v.zeal;
  let r = rand() * total;
  for (const v of pool) {
    r -= v.zeal;
    if (r <= 0) return v;
  }
  return pool[pool.length - 1];
}

export interface AudienceOut {
  like: (nickname: string, n: number, avatar: string) => void;
  /** A gift worth `coins` per unit. */
  gift: (nickname: string, coins: number, avatar: string) => void;
}

/** Advances the audience by dt seconds. */
export function tickAudience(dt: number, out: AudienceOut, rand: () => number = Math.random): void {
  const n = viewers.length;
  if (!n) return;
  let likes = n * RATES.like * dt;
  while (likes > 0) {
    if (rand() < Math.min(1, likes)) {
      const v = pick(rand, false);
      if (v) out.like(v.name, 1 + Math.floor(rand() * 20), v.avatar);
    }
    likes -= 1;
  }
  let gifts = n * RATES.gift * dt;
  while (gifts > 0) {
    if (rand() < Math.min(1, gifts)) {
      const v = pick(rand, true);
      if (v) {
        let r = rand(),
          coins = 1;
        for (const [c, p] of GIFTS) {
          coins = c;
          r -= p;
          if (r <= 0) break;
        }
        out.gift(v.name, coins, v.avatar);
      }
    }
    gifts -= 1;
  }
}
