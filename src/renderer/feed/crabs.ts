// The beach's crabs (Sea ambience): one crab per viewer who likes. It digs itself out of the sand
// holding the viewer's picture between its claws, scuttles sideways along the shore, and hops every
// time its viewer likes again. The beach holds a handful: the one that has been quiet the longest
// gives its place to a newcomer.

import { ctx, setCtx } from '../engine/canvas.ts';
import { H, W } from '../engine/layout.ts';
import type { Weather } from '../engine/types.ts';
import { CRITTERS, LOOP } from './critter-art.ts';
import { bigHeart } from './alert-fx.ts';
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
/** Lowest the feet may stand: any lower and the frame cuts the legs and the shadow. */
const feetMax = (): number => H - 36;

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
  const v = seen(nickname, avatar);
  v.liked = now;
  v.fresh = false;
  // The viewer a sleeping crab shows: their like flies to its heart first, and wakes them up when
  // it lands (stepSleepers).
  const s = beach && !hasCrab(nickname) ? sleepers.find((o) => o.who === nickname) : undefined;
  if (s) {
    if (s.flight) s.flight.n += n;
    else s.flight = { at: now, n, avatar };
    return;
  }
  wake(nickname, avatar, n);
}

/** The like itself: the viewer's animal comes out if it has to, hops and sends its hearts up. */
function wake(nickname: string, avatar: string | undefined, n: number): void {
  let mine = crabs.find((c) => c?.nickname === nickname);
  if (!mine) {
    let spot = 0;
    for (let i = 0; i < spots(); i++) {
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

let likeCount = true;
/** The control room's choice: whether the animals show their like count on the picture. */
export function setLikeCount(on: boolean): void {
  likeCount = on;
}

export function clearCrabs(): void {
  crabs.length = 0;
  viewers.clear();
  sleepers.length = 0;
  sparks.length = 0;
  sleepFaces.clear();
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
  stepSleepers(t, weather);
  const g = ctx,
    kind = CRITTERS[weather],
    low = (1 - (0.5 + 0.5 * Math.min(1, Math.max(0, rise)))) * 100,
    still = reduced ? 0 : 1;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (beach) paintSleepers(t, low, reduced);
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
      // Never so low that the frame cuts its feet or its shadow.
      y = Math.min(H + low - dune(x) + 12 + rand(i, 961) * 12, feetMax()),
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
    if (likeCount) {
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
    }
    // The crown goes to whoever of the five has liked the most.
    if (crab === leader)
      crown(0, fy - 35 + Math.sin(t * 3) * 1.2, 0.95, { x: 0, y: fy, r: FACE / 2 });
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
  if (beach) paintFlights(t, low);
  g.restore();
}

// ---- the sleeping crabs ------------------------------------------------------------------------
// On the beach (Sea), one or two crabs sleep on the right, grey, eyes shut, an empty heart over
// them. Each shows in turn a viewer who is here but has no crab out: who just joined first, then
// whoever has been seen on the live. When that viewer likes, the heart flies in from the corner
// TikTok's own hearts rise from, fills, and their crab comes out like any other. The likers' crabs
// keep to the places on the left, clear of the sleepers.

interface Viewer {
  avatar: string | undefined;
  /** Order of their latest join, 0 if never seen joining; fresh until shown once. */
  joined: number;
  fresh: boolean;
  /** Clock times of their latest like and of the latest time a sleeper showed them. */
  liked: number;
  shown: number;
}

interface Sleeper {
  x: number;
  who: string | undefined;
  /** The face before, while the new one fades in over it from `swap`. */
  prev: string | undefined;
  swap: number;
  /** When the face moves on to the next viewer. */
  next: number;
  /** Likes on their way to the heart, since `at`. */
  flight?: { at: number; n: number; avatar: string | undefined } | undefined;
  filled: number;
}

const ROTATE = 2.5,
  FADE = 0.4,
  /** A viewer who liked this recently is not shown asleep. */
  IDLE = 10,
  FLY = 0.85,
  FILL = 0.7,
  HEART_SIZE = 96,
  FLY_SIZE = 84,
  VIEWERS_MAX = 400,
  /** One sleeper lies clear of the fourth place's whole sway, two clear of the third's. */
  SLEEPER_X: Readonly<Record<number, readonly number[]>> = { 1: [940], 2: [800, 960] },
  SLEEP_ALPHA = 0.75,
  SLEEP_FILTER = 'grayscale(0.9) brightness(0.85)';

interface Spark {
  from: Sleeper;
  vx: number;
  vy: number;
  born: number;
  life: number;
  s: number;
}

const viewers = new Map<string, Viewer>(),
  sleepers: Sleeper[] = [],
  sparks: Spark[] = [];
let joins = 0,
  sleeperCount = 1,
  /** The sleepers are out: the ambience is the sea. */
  beach = false,
  reducedNow = false;

/** Places the likers' crabs may take: those left of the sleepers when they are out. */
function spots(): number {
  return beach ? 5 - sleeperCount : SPOTS;
}
function hasCrab(nickname: string): boolean {
  return crabs.some((c) => c?.nickname === nickname);
}

/** The viewer, remembered as here; the longest unseen are forgotten past a few hundred. */
function seen(nickname: string, avatar: string | undefined): Viewer {
  const v = viewers.get(nickname) ?? {
    avatar,
    joined: 0,
    fresh: false,
    liked: -Infinity,
    shown: -Infinity,
  };
  if (avatar) v.avatar = avatar;
  viewers.delete(nickname);
  viewers.set(nickname, v);
  for (const old of viewers.keys()) {
    if (viewers.size <= VIEWERS_MAX) break;
    viewers.delete(old);
  }
  return v;
}

/** Someone joined or commented: a sleeper may show them. A join puts them first in line. */
export function crabSeen(nickname: string, avatar: string | undefined, joined: boolean): void {
  if (!nickname) return;
  const v = seen(nickname, avatar);
  if (!joined) return;
  v.joined = ++joins;
  v.fresh = true;
}

/** The control room's choice: one sleeping crab or two. */
export function setSleepers(n: number): void {
  const count = n === 2 ? 2 : 1;
  if (count === sleeperCount) return;
  sleeperCount = count;
  buildSleepers();
}

/** Who may be shown next: fresh joins, the latest first, then the others, the least shown first. */
function candidates(): string[] {
  const busy = new Set(sleepers.map((s) => s.who)),
    fresh: [string, Viewer][] = [],
    rest: [string, Viewer][] = [];
  for (const [name, v] of viewers) {
    if (now - v.liked < IDLE || busy.has(name) || hasCrab(name)) continue;
    (v.fresh ? fresh : rest).push([name, v]);
  }
  fresh.sort((a, b) => b[1].joined - a[1].joined);
  rest.sort((a, b) => a[1].shown - b[1].shown);
  return [...fresh, ...rest].map(([name]) => name);
}

/** The sleeper moves on to the next viewer, or keeps its own if nobody else is left. */
function rotate(s: Sleeper): void {
  const next = candidates()[0],
    cur = s.who === undefined ? undefined : viewers.get(s.who),
    keep = s.who !== undefined && cur !== undefined && now - cur.liked >= IDLE && !hasCrab(s.who),
    who = next ?? (keep ? s.who : undefined);
  const v = next === undefined ? undefined : viewers.get(next);
  if (v) {
    v.fresh = false;
    v.shown = now;
  }
  if (who === s.who) return;
  s.prev = s.who;
  s.who = who;
  s.swap = now;
}

function buildSleepers(): void {
  // Likes still on their way are not lost: their crabs come out at once.
  for (const s of sleepers) if (s.flight && s.who) wake(s.who, s.flight.avatar, s.flight.n);
  sleepers.length = 0;
  sparks.length = 0;
  for (const [i, x] of (SLEEPER_X[sleeperCount] ?? [940]).entries())
    sleepers.push({
      x,
      who: undefined,
      prev: undefined,
      swap: -Infinity,
      // The second one turns half a beat after the first, so they never change together.
      next: now + ROTATE * (1 + i / 2),
      filled: -Infinity,
    });
  for (const s of sleepers) rotate(s);
}

/** The faces turn, hearts land and wake their viewer; the likers' crabs keep to the left. */
export function stepSleepers(t: number, weather: Weather): void {
  now = t;
  beach = weather === 'sea';
  if (sleepers.length !== sleeperCount) buildSleepers();
  for (const s of sleepers) {
    if (s.flight && (!beach || now - s.flight.at >= FLY)) {
      const { n, avatar } = s.flight;
      s.flight = undefined;
      if (s.who) {
        s.filled = now;
        burst(s);
        wake(s.who, avatar, n);
      }
      rotate(s);
      // A face just come stays up a moment before the next turn.
      if (s.next - now < 1) s.next += ROTATE;
    }
    if (s.flight) continue;
    if (now >= s.next) {
      s.next = Math.max(s.next + ROTATE, now + ROTATE / 2);
      rotate(s);
    } else if (s.who === undefined) rotate(s);
  }
  if (beach) keepLeft();
  for (const name of sleepFaces.keys())
    if (!sleepers.some((s) => s.who === name || s.prev === name)) sleepFaces.delete(name);
}

/** A crab standing where the sleepers lie moves to a free place on the left, or the quietest goes. */
function keepLeft(): void {
  const lim = spots();
  for (let i = lim; i < crabs.length; i++) {
    const c = crabs[i];
    if (!c) continue;
    crabs[i] = undefined;
    let spot = 0;
    for (let j = 0; j < lim; j++) {
      const o = crabs[j];
      if (!o) {
        spot = j;
        break;
      }
      if (o.spreeAt < (crabs[spot]?.spreeAt ?? Infinity)) spot = j;
    }
    const there = crabs[spot];
    if (!there || there.spreeAt < c.spreeAt) crabs[spot] = c;
  }
  if (crabs.length > lim) crabs.length = lim;
}

/** For tests: who each sleeper shows, and the likes flying to it. */
export const sleepersState = (): readonly { who: string | undefined; flying: number }[] =>
  sleepers.map((s) => ({ who: s.who, flying: s.flight?.n ?? 0 }));

/** Where a sleeper lies: a little lower on the sand than the others, never cut by the frame. */
function sleeperY(x: number, low: number): number {
  return Math.min(H + low - dune(x) + 12 + 64, feetMax());
}
/** The heart over a sleeper, clear of its picture's ring. */
function heartY(y: number): number {
  return y + 18 - 55 * 1.4 - (28 * 1.4 + 44);
}

function burst(s: Sleeper): void {
  if (reducedNow) return;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.random() * 0.4,
      sp = 170 + Math.random() * 130;
    sparks.push({
      from: s,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 80,
      born: now,
      life: 0.55 + Math.random() * 0.25,
      s: 26 + Math.random() * 16,
    });
  }
}

/** A grey copy of a picture, the way the sleepers look. */
function greyed(src: HTMLCanvasElement, into?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = into ?? document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext('2d');
  if (c) {
    c.filter = SLEEP_FILTER;
    c.drawImage(src, 0, 0);
    c.filter = 'none';
  }
  return cv;
}

let sleepArt: HTMLCanvasElement | null = null;
/** The crab asleep: standing still, eyes shut, in grey. Drawn once. */
function sleepingCrab(): HTMLCanvasElement {
  if (sleepArt) return sleepArt;
  const cv = document.createElement('canvas');
  cv.width = ART_W * ART_SCALE;
  cv.height = ART_H * ART_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(ART_SCALE, 0, 0, ART_SCALE, ART_X * ART_SCALE, ART_Y * ART_SCALE);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    CRITTERS.sea.paint(c, {
      t: 0,
      step: 0,
      pace: 0,
      jump: 0,
      flick: 0,
      lift: 0,
      seed: 0,
      hop: 9,
      bounce: 0,
      tier: 0,
      asleep: true,
    });
  }
  sleepArt = greyed(cv);
  return sleepArt;
}

/** The pictures the sleepers show, in grey, redrawn now and then (a photo may still load). */
const sleepFaces = new Map<string, { cv: HTMLCanvasElement; fresh: number }>();
let faceScratch: HTMLCanvasElement | null = null;
function sleepFace(name: string | undefined): HTMLCanvasElement {
  if (name === undefined) return nobody();
  const kept = sleepFaces.get(name);
  if (kept && kept.fresh-- > 0) return kept.cv;
  faceScratch ??= document.createElement('canvas');
  const raw = faceScratch;
  raw.width = raw.height = FACE * FACE_SCALE;
  const c = raw.getContext('2d');
  if (c) {
    c.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, raw.width / 2, raw.height / 2);
    const main = setCtx(c);
    paintFace({ nickname: name, avatar: viewers.get(name)?.avatar }, 0, 0, 28, '#d2d2d2');
    setCtx(main);
  }
  const cv = greyed(raw, kept?.cv);
  sleepFaces.set(name, { cv, fresh: 45 });
  return cv;
}

let nobodyImg: HTMLCanvasElement | null = null;
/** Nobody to show: a grey silhouette. */
function nobody(): HTMLCanvasElement {
  if (nobodyImg) return nobodyImg;
  const cv = document.createElement('canvas');
  cv.width = cv.height = FACE * FACE_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, cv.width / 2, cv.height / 2);
    c.beginPath();
    c.arc(0, 0, 28, 0, Math.PI * 2);
    c.fillStyle = '#4c5154';
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = '#7d8387';
    c.beginPath();
    c.arc(0, -6, 10, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(0, 22, 19, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.lineWidth = 28 * 0.13;
    c.strokeStyle = 'rgba(210,210,210,0.7)';
    c.beginPath();
    c.arc(0, 0, 28, 0, Math.PI * 2);
    c.stroke();
  }
  nobodyImg = cv;
  return cv;
}

function paintSleepers(t: number, low: number, reduced: boolean): void {
  const g = ctx;
  reducedNow = reduced;
  for (const s of sleepers) {
    const y = sleeperY(s.x, low);
    g.globalAlpha = SLEEP_ALPHA;
    g.fillStyle = 'rgba(60,40,20,0.28)';
    g.beginPath();
    g.ellipse(s.x, y + 18, 34, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(s.x, y + 18);
    g.scale(1.4, 1.4);
    g.translate(0, -13);
    g.drawImage(sleepingCrab(), -ART_X, -ART_Y, ART_W, ART_H);
    // The new face fades in over the one before.
    const u = Math.min(1, Math.max(0, (t - s.swap) / FADE)),
      fy = -42 - FACE / 2;
    if (u < 1) g.drawImage(sleepFace(s.prev), -FACE / 2, fy, FACE, FACE);
    g.globalAlpha = SLEEP_ALPHA * u;
    g.drawImage(sleepFace(s.who), -FACE / 2, fy, FACE, FACE);
    g.restore();
    g.globalAlpha = 1;
    // The heart is never greyed: empty and breathing, full for a moment once a like lands in it.
    const hy = heartY(y),
      fu = (t - s.filled) / FILL;
    let size = HEART_SIZE * (reduced ? 1 : 1 + 0.08 * Math.sin(t * 2.5 + s.x * 0.01));
    if (fu >= 0 && fu < 1) {
      if (!reduced) size = HEART_SIZE * (1 + 0.35 * Math.sin(Math.min(1, fu * 2) * Math.PI));
      g.globalAlpha = fu < 0.7 ? 1 : (1 - fu) / 0.3;
      g.drawImage(bigHeart(true), s.x - size / 2, hy - size / 2, size, size);
      g.globalAlpha = 1;
    }
    g.drawImage(bigHeart(false), s.x - size / 2, hy - size / 2, size, size);
  }
}

/** Likes flying from the corner to a sleeper's heart, and the little hearts thrown when one lands. */
function paintFlights(t: number, low: number): void {
  const g = ctx,
    full = bigHeart(true);
  for (let k = sparks.length - 1; k >= 0; k--) {
    const p = sparks[k];
    if (!p) continue;
    const a = t - p.born,
      u = a / p.life;
    if (u >= 1) {
      sparks.splice(k, 1);
      continue;
    }
    const x = p.from.x + p.vx * a,
      y = heartY(sleeperY(p.from.x, low)) + p.vy * a + 210 * a * a,
      w = p.s * (1 - 0.4 * u);
    g.globalAlpha = 1 - u;
    g.drawImage(full, x - w / 2, y - w / 2, w, w);
  }
  g.globalAlpha = 1;
  const sx = W - 90,
    sy = H - 70;
  for (const s of sleepers) {
    if (!s.flight) continue;
    const u = Math.min(1, (t - s.flight.at) / FLY),
      e = u * u * (3 - 2 * u),
      dx = s.x,
      dy = heartY(sleeperY(s.x, low)),
      cx = (sx + dx) / 2 - 260,
      cy = Math.min(sy, dy) - 360,
      bez = (a: number, b: number, c: number): number =>
        (1 - e) * (1 - e) * a + 2 * (1 - e) * e * b + e * e * c,
      size = FLY_SIZE * (0.5 + 0.5 * Math.sin((Math.min(1, u * 1.6) * Math.PI) / 2));
    g.globalAlpha = Math.min(1, u * 5);
    g.drawImage(full, bez(sx, cx, dx) - size / 2, bez(sy, cy, dy) - size / 2, size, size);
  }
  g.globalAlpha = 1;
}
