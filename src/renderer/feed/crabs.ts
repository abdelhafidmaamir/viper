// The beach's crabs (Sea ambience): one crab per viewer who likes. It digs itself out of the sand
// holding the viewer's picture between its claws, scuttles sideways along the shore, and hops every
// time its viewer likes again. The beach holds a handful: the one that has been quiet the longest
// gives its place to a newcomer.

import { ctx, setCtx } from '../engine/canvas.ts';
import { H, W } from '../engine/layout.ts';
import type { Weather } from '../engine/types.ts';
import { CRITTERS, LOOP } from './critter-art.ts';
import { FONT, crown, paintFace } from './paint.ts';

interface Crab {
  nickname: string;
  avatar: string | undefined;
  /** Clock time of the first like (the crab comes out) and of the latest hop. */
  born: number;
  hop: number;
  /** Hops still to come: a burst of likes is a run of hops. */
  owed: number;
  /** Clock times its hearts leave at, one per like of a burst, a beat apart. */
  hearts: number[];
  /** Likes of the spree under way, and when the last of them came. */
  spree: number;
  spreeAt: number;
  /** Likes since it came out: what its badge shows, and what ranks it among the five. */
  total: number;
  /** The picture's image, and the frames left before it is drawn again (a photo may still load). */
  face?: { cv: HTMLCanvasElement; fresh: number; gold: boolean };
  /** The count's image, and the number it shows. */
  label?: { n: number; cv: HTMLCanvasElement };
}

const SPOTS = 5,
  HOP = 0.7,
  HEART = 1.3,
  HEARTS = 18,
  /** Hearts one burst sends up at most, and the beat between two of them. */
  BURST = 12,
  BEAT = 0.07,
  /** Likes this close together are one spree: its count shows above the picture. */
  SPREE = 2.2;
const crabs: (Crab | undefined)[] = [];
let now = 0;

/** How many hops a burst of `n` likes is worth. */
/** Likes that earn the animal its ornament, then the gold ring round the picture. */
const TIERS = [500, 2000] as const;
const tierOf = (total: number): number => (total >= TIERS[1] ? 2 : total >= TIERS[0] ? 1 : 0);
/** Likes before the crown is worth wearing. */
const CROWN_FROM = 10;

const hopsFor = (n: number): number => (n >= 15 ? 4 : n >= 5 ? 3 : n >= 2 ? 2 : 1);

/**
 * Likes, `n` at once the way the live sends them: the viewer's animal hops, more than once for a
 * burst, one heart leaves per like, and the spree's count builds up over the picture. A viewer
 * without an animal yet gets one.
 */
export function crabLike(nickname: string, avatar: string | undefined, n = 1): void {
  if (!nickname || n <= 0) return;
  let mine = crabs.find((c) => c?.nickname === nickname);
  if (!mine) {
    let spot = 0;
    for (let i = 0; i < SPOTS; i++) {
      const c = crabs[i];
      if (!c) {
        spot = i;
        break;
      }
      if (c.spreeAt < (crabs[spot]?.spreeAt ?? Infinity)) spot = i;
    }
    mine = {
      nickname,
      avatar,
      born: now,
      hop: now,
      owed: -1,
      hearts: [],
      spree: 0,
      spreeAt: now,
      total: 0,
    };
    crabs[spot] = mine;
  }
  if (avatar && avatar !== mine.avatar) {
    mine.avatar = avatar;
    if (mine.face) mine.face.fresh = 0;
  }
  const last = Math.max(now, mine.hearts[mine.hearts.length - 1] ?? 0);
  for (let k = 0; k < Math.min(n, BURST); k++) mine.hearts.push(last + k * BEAT);
  if (mine.hearts.length > HEARTS) mine.hearts.splice(0, mine.hearts.length - HEARTS);
  mine.spree = now - mine.spreeAt < SPREE ? mine.spree + n : n;
  mine.spreeAt = now;
  mine.total += n;
  // A hop under way finishes first; the others follow it, four in a row at most.
  mine.owed = Math.min(4, Math.max(0, mine.owed) + hopsFor(n));
  if (now - mine.hop > HOP) {
    mine.hop = now;
    mine.owed--;
  }
}

export function clearCrabs(): void {
  crabs.length = 0;
}

/** For tests: who holds each place, with their likes, the hearts on their way and the hops owed. */
export const crabsState = (): readonly {
  nickname: string;
  total: number;
  hearts: number;
  owed: number;
}[] =>
  crabs.flatMap((c) =>
    c ? [{ nickname: c.nickname, total: c.total, hearts: c.hearts.length, owed: c.owed }] : [],
  );

function rand(i: number, d: number): number {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
// The crest of the front dune, the same curve the ambience draws its sand with.
const dune = (x: number): number =>
  112 + 28 * Math.sin(x * 0.0046 + 4.1) + 10 * Math.sin(x * 0.02 + 1.0);

// Hearts and counts are drawn once to small images and stamped: a like spree puts dozens of
// hearts up at once, and stroking each of them every frame is what would cost.
let heartImg: HTMLCanvasElement | null = null;
function heart(): HTMLCanvasElement {
  if (heartImg) return heartImg;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 88;
  const h = cv.getContext('2d');
  if (h) {
    h.translate(44, 50);
    h.scale(2, 2);
    h.fillStyle = '#ff5c8a';
    h.strokeStyle = 'rgba(255,255,255,0.85)';
    h.lineWidth = 2;
    h.lineJoin = 'round';
    h.beginPath();
    h.moveTo(0, 9);
    h.bezierCurveTo(-18, -4, -9, -17, 0, -7);
    h.bezierCurveTo(9, -17, 18, -4, 0, 9);
    h.closePath();
    h.fill();
    h.stroke();
  }
  heartImg = cv;
  return cv;
}

/** The badge on the picture: a heart and the likes so far, redrawn only when the number changes. */
function badge(crab: Crab): HTMLCanvasElement {
  if (crab.label?.n === crab.total) return crab.label.cv;
  const cv = crab.label?.cv ?? document.createElement('canvas'),
    text = crab.total > 9999 ? `${String(Math.floor(crab.total / 1000))}k` : String(crab.total),
    wide = 58 + text.length * 22;
  cv.width = wide;
  cv.height = 48;
  const c = cv.getContext('2d');
  if (c) {
    c.fillStyle = tierOf(crab.total) > 1 ? '#c8860f' : '#e8436f';
    c.strokeStyle = '#fff';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(3, 3, wide - 6, 42, 21);
    c.fill();
    c.stroke();
    c.drawImage(heart(), 6, 4, 40, 40);
    c.font = `900 30px ${FONT}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText(text, 44, 26);
  }
  crab.label = { n: crab.total, cv };
  return cv;
}

// An animal is dozens of small shapes, too many to draw five times every frame. Its poses are
// drawn once each to small images and replayed: the idle cycle as a strip of frames (standing,
// walking or bounding), and the hop as another. Where the animal stands, how high it is and its
// squash are applied when the image is stamped, so those stay smooth at any frame rate.
const ART_X = 58,
  ART_Y = 66,
  ART_W = 116,
  ART_H = 122,
  ART_SCALE = 1.8,
  /** Frames a second of the idle cycle and of the hop. */
  IDLE_FPS = 10,
  HOP_FRAMES = 18,
  /** A hop's image strip runs past the landing, for what follows it (a ripple, a wobble). */
  HOP_TAIL = 1.8;

/** Side of the picture's image, in the animal's units, and how many pixels a unit gets. */
const FACE = 64,
  FACE_SCALE = 2.5;

/** The viewer's picture with its ring, white then gold at the top tier, drawn now and then. */
function face(crab: Crab): HTMLCanvasElement {
  const kept = crab.face,
    gold = tierOf(crab.total) > 1;
  if (kept?.gold === gold && kept.fresh-- > 0) return kept.cv;
  const cv = kept?.cv ?? document.createElement('canvas');
  cv.width = cv.height = FACE * FACE_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, cv.width / 2, cv.height / 2);
    const main = setCtx(c);
    paintFace(crab, 0, 0, 28, gold ? '#ffd24a' : '#fff');
    setCtx(main);
  }
  crab.face = { cv, fresh: 45, gold };
  return cv;
}

type Kind = (typeof CRITTERS)[Weather];
let cacheKind: Kind | null = null;
const cache = new Map<number, HTMLCanvasElement>();

function drawn(
  kind: Kind,
  i: number,
  t: number,
  hop: number,
  moving: number,
  tier: number,
): HTMLCanvasElement {
  if (kind !== cacheKind) {
    cache.clear();
    cacheKind = kind;
  }
  const frames = Math.round(LOOP * IDLE_FPS),
    hopping = hop < HOP_TAIL,
    hf = Math.min(HOP_FRAMES - 1, Math.floor((hop / HOP_TAIL) * HOP_FRAMES)),
    // Each of the five is at its own point of the cycle.
    f = Math.floor(t * IDLE_FPS + i * 7) % frames,
    // Standing, half way or fully moving.
    level = Math.round(Math.min(1, moving) * 2),
    key = (hopping ? 1000 + hf : f * 3 + level) + tier * 10000,
    made = cache.get(key);
  if (made) return made;
  const cv = document.createElement('canvas');
  cv.width = ART_W * ART_SCALE;
  cv.height = ART_H * ART_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(ART_SCALE, 0, 0, ART_SCALE, ART_X * ART_SCALE, ART_Y * ART_SCALE);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const h = hopping ? ((hf + 0.5) / HOP_FRAMES) * HOP_TAIL : 9,
      jump = hopping ? hopHeight(kind, Math.min(1, h)) : 0,
      pace = hopping ? 0 : level / 2,
      at = hopping ? 0.4 + h * HOP : f / IDLE_FPS;
    kind.paint(c, {
      t: at,
      // Seven steps to a cycle, so the walk loops with it.
      step: (at / LOOP) * Math.PI * 2 * 7,
      pace,
      jump,
      flick: Math.min(1, jump / 12),
      lift: kind.lift,
      seed: 0,
      hop: h,
      bounce: kind.bound ? pace : 0,
      tier,
    });
  }
  cache.set(key, cv);
  return cv;
}

/** How high a hop is at `h` of its length: every animal but the crab gathers itself first. */
function hopHeight(kind: Kind, h: number): number {
  if (h >= 1) return 0;
  const springy = kind !== CRITTERS.sea,
    air = springy ? Math.min(1, Math.max(0, (h - 0.16) / 0.7)) : h;
  return Math.sin(air * Math.PI) * (springy ? 54 : 46);
}

/** `rise` is how far the round has filled the board (0..1): the beach climbs with it. */
export function paintCrabs(t: number, rise: number, reduced: boolean, weather: Weather): void {
  now = t;
  const g = ctx,
    kind = CRITTERS[weather],
    low = (1 - (0.5 + 0.5 * Math.min(1, Math.max(0, rise)))) * 100,
    still = reduced ? 0 : 1;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let leader: Crab | undefined;
  for (const c of crabs)
    if (c && c.total >= CROWN_FROM && c.total > (leader?.total ?? 0)) leader = c;
  crabs.forEach((crab, i) => {
    if (!crab) return;
    if (crab.owed > 0 && t - crab.hop > HOP) {
      crab.hop = t;
      crab.owed--;
    }
    const w = 0.16 + rand(i, 955) * 0.12,
      ph = rand(i, 957) * 6.28,
      // Walking only in the middle of each crossing: at both ends the crab stands a moment.
      pace = (Math.max(0, Math.abs(Math.cos(t * w * still + ph)) - 0.3) / 0.7) * still,
      x = W * (0.12 + 0.19 * i) + 60 * Math.sin(t * w * still + ph),
      y = H + low - dune(x) + 12 + rand(i, 961) * 12,
      step = t * 13 + i * 2,
      out = Math.min(1, (t - crab.born) / 0.5),
      hop = (t - crab.hop) / HOP,
      h = Math.min(1, hop),
      // Every animal but the crab gathers itself, springs, stretches in the air and lands soft.
      springy = kind !== CRITTERS.sea,
      air = springy ? Math.min(1, Math.max(0, (h - 0.16) / 0.7)) : h,
      jump = hopHeight(kind, h),
      part = (a: number, b: number): number =>
        h > a && h < b ? Math.sin((Math.PI * (h - a)) / (b - a)) : 0,
      tall = springy
        ? 1 - 0.22 * part(0, 0.16) + 0.1 * Math.sin(air * Math.PI) - 0.18 * part(0.86, 1)
        : 1,
      bounce = kind.bound ? Math.abs(Math.sin(t * kind.bound[1] * 0.5 + i)) * pace : 0;
    // The shadow stays on the sand while the crab is in the air.
    g.fillStyle = `rgba(60,40,20,${String(0.28 * out * (1 - jump / 90))})`;
    g.beginPath();
    g.ellipse(x, y + 18, 34 - jump * 0.2, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    // Coming out of the sand: it grows from the ground up.
    g.translate(
      x,
      y +
        18 -
        Math.abs(Math.sin(step)) * 1.5 * pace -
        jump -
        bounce * (kind.bound?.[0] ?? 0) -
        (kind.hover ? kind.hover + 5 * Math.sin(t * 2.3 + i) : 0),
    );
    g.scale(1.4 * out, 1.4 * out);
    g.translate(0, -13);
    g.save();
    g.translate(0, 12);
    g.scale(1 + (1 - tall) * 0.8, tall);
    g.translate(0, -12);
    g.drawImage(
      drawn(kind, i, t, hop, kind.bound ? bounce : pace, tierOf(crab.total)),
      -ART_X,
      -ART_Y,
      ART_W,
      ART_H,
    );
    g.restore();
    // The picture follows the arms without being squashed with them.
    const fy = 12 + (-54 - kind.lift) * tall;
    g.drawImage(face(crab), -FACE / 2, fy - FACE / 2, FACE, FACE);
    // The badge pops at each burst.
    const tag = badge(crab),
      pop = 0.42 * (1 + 0.4 * Math.max(0, 1 - (t - crab.spreeAt) / 0.25));
    g.drawImage(
      tag,
      20 - (tag.width * pop) / 2,
      fy + 21 - (tag.height * pop) / 2,
      tag.width * pop,
      tag.height * pop,
    );
    // The crown goes to whoever of the five has liked the most.
    if (crab === leader) crown(0, fy - 35 + Math.sin(t * 3) * 1.2, 0.95);
    g.restore();
    // One heart per like, drifting up from the picture and fading: a like spree is a stream of them.
    crab.hearts = crab.hearts.filter((born) => t - born < HEART);
    crab.hearts.forEach((born) => {
      if (born > t) return;
      const age = (t - born) / HEART,
        // Everything about a heart comes from its birth time alone, so it keeps its path while
        // others come and go around it.
        seed = born * 7.3,
        // It leaves from the rim of the picture, somewhere over its top or its upper sides, flies
        // out from it and then floats up.
        from = -Math.PI / 2 + (rand(Math.floor(born * 97), 971) * 2 - 1) * 1.7,
        far = 44 + 62 * (1 - (1 - age) ** 3),
        hx = x + Math.cos(from) * far + Math.sin(age * 5 + seed) * 6,
        hy = y + 18 - 1.4 * (55 + kind.lift) - jump + Math.sin(from) * far - age * 46,
        w = 44 * (0.7 + 0.5 * rand(Math.floor(born * 60), 967)) * Math.min(1, age * 6);
      g.globalAlpha = 1 - age * age;
      g.drawImage(heart(), hx - w / 2, hy - w / 2, w, w);
    });
    g.globalAlpha = 1;
  });
  g.restore();
}
