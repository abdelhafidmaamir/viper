// The beach's crabs (Sea ambience): one crab per viewer who likes. It digs itself out of the sand
// holding the viewer's picture between its claws, scuttles sideways along the shore, and hops every
// time its viewer likes again. The beach holds a handful: the one that has been quiet the longest
// gives its place to a newcomer.

import { ctx, setCtx } from '../engine/canvas.ts';
import { H, W } from '../engine/layout.ts';
import type { Weather } from '../engine/types.ts';
import type { SleeperLife, SleeperLook } from '../../shared/feed-protocol.ts';
import { CRITTERS, LOOP, stirred, type Stir } from './critter-art.ts';
import { bigHeart } from './alert-fx.ts';
import { FONT, crown, paintFace, photo, photoImage } from './paint.ts';

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
  /** On a beach laid out by Snake Arena (setCrabSpots): where it stands and walks to. */
  spot?: {
    x: number;
    to: number;
    /** Height above its row on the sand, now and where it goes: rows and the walking lane. */
    dy: number;
    toDy: number;
    leaving: boolean;
    /** When it began to bury itself in the sand, leaving. */
    goneAt: number;
    /** When its spot last moved along the line: those moving right wait for the others to step back. */
    movedAt: number;
    crown: boolean;
    ring: string | undefined;
    tag: string | undefined;
  };
}

/**
 * A spot on a beach that Snake Arena lays out itself: who stands there, at which x, the outline of
 * their picture and a small tag over it.
 */
export interface CrabSpot {
  readonly nickname: string;
  readonly avatar?: string | undefined;
  readonly x: number;
  /** Pixels up from where the sand would have it: a second row behind the first. */
  readonly dy?: number;
  /** It wears the crown: on a laid-out beach the arena says who leads. */
  readonly crown?: boolean;
  readonly ring?: string | undefined;
  readonly tag?: string | undefined;
}

/**
 * Snake Arena lays the beach out itself (null: Feed's own beach, the default). A crab comes up out
 * of the sand at its spot as Feed's do, once any crab still burying there is gone, and buries
 * itself again when it leaves or changes group. When its spot moves along the line it walks there
 * sideways, all of them at once: one moving left steps back a little first, the others wait for
 * that, so no two pictures ever cross. A like makes its crab hop as usual but never brings one.
 */
export interface CrabWalks {
  /** Size of the animals. */
  readonly scale: number;
  /** How far up a crab walks when it comes, goes or crosses the beach: no picture is there. */
  readonly lane: number;
  /** Space between two spots: a move of about one is a short walk, not through the lane. */
  readonly step: number;
  /** How far up a crab steps to pass another one on a short walk forward. */
  readonly lift: number;
}
let managed: ({ spots: readonly CrabSpot[] } & CrabWalks) | null = null;
export function setCrabSpots(spots: readonly CrabSpot[] | null, walks?: CrabWalks): void {
  managed = spots ? { spots, scale: 1, lane: 0, step: 0, lift: 0, ...walks } : null;
}

/** Where the sleeping crabs begin on the right of the beach (W when there are none). */
export function sleepersFrom(): number {
  if (!beach || !sleeperCount) return W;
  return Math.min(...(SLEEPER_X[sleeperCount] ?? [940])) - 60;
}
/** Pixels a second a crab walks to its spot, and the clock of the last frame it walked at. */
const WALK = 260;
let walkedAt = -1;

/** How long a crab takes to bury itself, the reverse of coming out of the sand. */
const BURY = 0.5;

/** The crabs follow the spots: newcomers come up at their spot, those gone bury themselves. */
function followSpots(t: number): void {
  if (!managed) return;
  const dt = walkedAt < 0 ? 0 : Math.min(0.1, Math.max(0, t - walkedAt));
  walkedAt = t;
  // The beach's clock, which the sleepers keep on Feed's beach.
  now = t;
  const bury = (c: Crab): void => {
    if (!c.spot || c.spot.leaving) return;
    c.spot.leaving = true;
    c.spot.goneAt = now;
  };
  for (const s of managed.spots) {
    let crab = crabs.find((c) => c?.nickname === s.nickname && !c.spot?.leaving);
    // Into the other group: it buries itself here and comes up there.
    if (
      crab?.spot &&
      Math.abs(crab.spot.to - s.x) > 2 &&
      (crab.spot.ring === undefined) !== (s.ring === undefined)
    ) {
      bury(crab);
      crab = undefined;
    }
    if (!crab) {
      // A spot is taken once whoever was burying there is gone.
      const near = (managed.step || 60) * 0.95,
        clear = crabs.reduce(
          (at, c) =>
            c?.spot?.leaving && Math.abs(c.spot.x - s.x) < near
              ? Math.max(at, c.spot.goneAt + BURY)
              : at,
          now,
        );
      crab = {
        nickname: s.nickname,
        avatar: s.avatar,
        born: clear,
        hop: now - 1,
        owed: -1,
        hearts: [],
        spree: 0,
        spreeAt: now,
        total: 0,
      };
      const free = crabs.findIndex((c) => !c);
      if (free >= 0) crabs[free] = crab;
      else crabs.push(crab);
    }
    if (s.avatar && s.avatar !== crab.avatar) {
      crab.avatar = s.avatar;
      if (crab.face) crab.face.fresh = 0;
    }
    if (crab.spot?.ring !== s.ring && crab.face) crab.face.fresh = 0;
    const moved = crab.spot !== undefined && Math.abs(crab.spot.to - s.x) > 2;
    crab.spot = {
      x: crab.spot?.x ?? s.x,
      to: s.x,
      dy: crab.spot?.dy ?? s.dy ?? 0,
      toDy: s.dy ?? 0,
      leaving: false,
      goneAt: 0,
      movedAt: moved ? now : (crab.spot?.movedAt ?? -Infinity),
      crown: s.crown === true,
      ring: s.ring,
      tag: s.tag,
    };
  }
  crabs.forEach((crab, i) => {
    if (!crab) return;
    if (!crab.spot?.leaving && !managed?.spots.some((s) => s.nickname === crab.nickname)) {
      const x = crab.spot?.x ?? W / 2;
      crab.spot = {
        x,
        to: x,
        dy: crab.spot?.dy ?? 0,
        toDy: crab.spot?.dy ?? 0,
        leaving: true,
        goneAt: now,
        movedAt: -Infinity,
        crown: false,
        ring: crab.spot?.ring,
        tag: undefined,
      };
    }
    // A crab not up yet keeps its hops for when it is.
    if (crab.born > now) crab.hop = crab.born - 1;
    const spot = crab.spot;
    if (!spot) return;
    if (spot.leaving) {
      if (now - spot.goneAt >= BURY) crabs[i] = undefined;
      return;
    }
    // Sideways along the sand. One moving left steps back first and walks behind; one moving
    // right waits for that, then walks on the line; both settle on the line once there.
    const d = spot.to - spot.x,
      lift = managed?.lift ?? 0,
      stepBack = lift / (WALK * 0.6),
      back = d < -0.5 ? spot.toDy + lift : spot.toDy,
      up = back - spot.dy;
    if (Math.abs(up) > 0.5) spot.dy += Math.sign(up) * Math.min(Math.abs(up), WALK * 0.6 * dt);
    else if (d < -0.5 || (d > 0.5 && now - spot.movedAt >= stepBack))
      spot.x += Math.sign(d) * Math.min(Math.abs(d), WALK * dt);
  });
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
/**
 * The likes ranking on the beach: the top liker's crown, the ornament and the gold. Snake Arena
 * turns it off (its only crown is on the biggest snake); Feed keeps it.
 */
let ranks = true;
export function setCrabRanks(on: boolean): void {
  ranks = on;
}
const shownTier = (total: number): number => (ranks ? tierOf(total) : 0);
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
  // On a beach Snake Arena lays out, a like never brings a crab of its own.
  if (!mine && managed) return;
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
  audience = 0;
  now = 0;
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

/**
 * Where each picture was drawn this frame, in game units: its centre and radius in whatever pose
 * (hops, bob, walk, a sleeper's stir). Snake Arena draws its entry rings round them; Feed draws
 * nothing from it.
 */
const drawnFaces = new Map<string, { x: number; y: number; r: number }>();
let toGame: DOMMatrix | null = null;
export const crabFaces = (): ReadonlyMap<string, { x: number; y: number; r: number }> => drawnFaces;

/** The picture just drawn at (0, cy) under the current transform, kept for this frame. */
function noteFace(nickname: string | undefined, cy: number): void {
  if (!nickname || !toGame) return;
  const m = toGame.multiply(ctx.getTransform()),
    p = m.transformPoint({ x: 0, y: cy });
  drawnFaces.set(nickname, { x: p.x, y: p.y, r: (FACE / 2) * Math.hypot(m.a, m.b) });
}

/** A viewer's animal leaves the beach at once (Snake Arena's own player, switched off). */
export function crabGone(nickname: string): void {
  const i = crabs.findIndex((c) => c?.nickname === nickname);
  if (i >= 0) crabs[i] = undefined;
  viewers.delete(nickname);
  drawnFaces.delete(nickname);
}

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
    c.fillStyle = shownTier(crab.total) > 1 ? '#c8860f' : '#e8436f';
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
    gold = shownTier(crab.total) > 1,
    ring = (managed ? crab.spot?.ring : undefined) ?? (gold ? '#ffd24a' : '#fff');
  if (kept?.gold === gold && kept.fresh-- > 0) return kept.cv;
  const cv = kept?.cv ?? document.createElement('canvas');
  cv.width = cv.height = FACE * FACE_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, cv.width / 2, cv.height / 2);
    const main = setCtx(c);
    paintFace(crab, 0, 0, 28, ring);
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
  followSpots(t);
  drawnFaces.clear();
  toGame = ctx.getTransform().invertSelf();
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
    if (ranks && c && c.total >= CROWN_FROM && c.total > (leader?.total ?? 0)) leader = c;
  crabs.forEach((crab, i) => {
    if (!crab) return;
    if (crab.owed > 0 && t - crab.hop > HOP) {
      crab.hop = t;
      crab.owed--;
    }
    const w = 0.16 + rand(i, 955) * 0.12,
      ph = rand(i, 957) * 6.28,
      spot = managed ? crab.spot : undefined,
      // Walking only in the middle of each crossing: at both ends the crab stands a moment. On a
      // laid-out beach it walks while it goes to its spot, and only shuffles once there.
      pace = spot
        ? Math.abs(spot.to - spot.x) > 2
          ? still
          : 0
        : (Math.max(0, Math.abs(Math.cos(t * w * still + ph)) - 0.3) / 0.7) * still,
      x = spot
        ? spot.x + 4 * Math.sin(t * w * still + ph)
        : W * (0.12 + 0.19 * i) + 60 * Math.sin(t * w * still + ph),
      // Never so low that the frame cuts its feet or its shadow.
      y = Math.min(H + low - dune(x) + 12 + rand(i, 961) * 12, feetMax()) - (spot?.dy ?? 0),
      step = t * 13 + i * 2,
      out =
        Math.max(0, Math.min(1, (t - crab.born) / 0.5)) *
        (spot?.leaving ? Math.max(0, 1 - (t - spot.goneAt) / BURY) : 1) *
        (managed?.scale ?? 1),
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
      drawn(kind, i, t, hop, kind.bound ? bounce : pace, shownTier(crab.total)),
      -ART_X,
      -ART_Y,
      ART_W,
      ART_H,
    );
    g.restore();
    // The picture follows the arms without being squashed with them.
    const fy = 12 + (-54 - kind.lift) * tall;
    g.drawImage(face(crab), -FACE / 2, fy - FACE / 2, FACE, FACE);
    noteFace(crab.nickname, fy);
    const tag = spot?.tag;
    if (tag) {
      // A small descriptive tag over the picture ("NEXT").
      g.font = `900 15px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tw = g.measureText(tag).width + 14,
        ty = fy - FACE / 2 - 14;
      g.fillStyle = 'rgba(12,20,15,0.82)';
      g.beginPath();
      g.roundRect(-tw / 2, ty - 11, tw, 22, 11);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(tag, 0, ty + 1);
    }
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
    if (crab === leader || spot?.crown)
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
// them. Each shows in turn a viewer who is still here but has no crab out: who just joined first,
// then the others still watching. When that viewer likes, the heart flies in from the corner
// TikTok's own hearts rise from, fills, and their crab comes out like any other. The likers' crabs
// keep to the places on the left, clear of the sleepers.
//
// TikTok never says who left. A viewer counts as here while seen lately (a join, a comment, a like,
// a follow, a share, a gift), and no more of them than TikTok's viewer count, the ones seen last
// kept. Only a viewer whose picture has loaded is shown, never initials or a blank face: with
// nobody left to show, the sleeper is not drawn at all.
//
// How they look and how they stir in their sleep are the control room's picks. They never leave
// the ground when they stir: a hop means a like.

interface Viewer {
  avatar: string | undefined;
  /** Order of their latest join, 0 if never seen joining, and its clock time; fresh until shown. */
  joined: number;
  arrived: number;
  fresh: boolean;
  /** Clock times of their latest like and of the latest time a sleeper showed them. */
  liked: number;
  shown: number;
  /** Clock time they were last seen on the live, and when their picture was first asked for. */
  at: number;
  asked: number;
}

interface Sleeper {
  x: number;
  who: string | undefined;
  /** The face before, while the new one fades in over it from `swap`, and both pictures. */
  prev: string | undefined;
  face: string | undefined;
  prevFace: string | undefined;
  swap: number;
  /** When the face moves on to the next viewer. */
  next: number;
  /** When it last stirred in its sleep and when it will next, and the side it stirred to. */
  lifeAt: number;
  lifeNext: number;
  lifeSide: number;
  /** Likes on their way to the heart, since `at`. */
  flight?: { at: number; n: number; avatar: string | undefined } | undefined;
  filled: number;
}

const ROTATE = 2.5,
  FADE = 0.4,
  /** A viewer who liked this recently is not shown asleep. */
  IDLE = 10,
  /**
   * Seconds a viewer counts as here after the last sign of them. Visits are short: on the
   * journals of the October lives, the average viewer count over the join rate puts the average
   * visit between 20 s and 110 s.
   */
  PRESENT = 120,
  /** A join this recent puts the viewer first in line. */
  ARRIVED = 30,
  /** Pictures loaded ahead of their turn, and how long a turn waits for one still on its way. */
  AHEAD = 3,
  LOAD_WAIT = 2,
  FLY = 0.85,
  FILL = 0.7,
  HEART_SIZE = 96,
  FLY_SIZE = 84,
  VIEWERS_MAX = 400,
  /** One sleeper lies clear of the fourth place's whole sway, two clear of the third's. */
  SLEEPER_X: Readonly<Record<number, readonly number[]>> = { 1: [940], 2: [800, 960] },
  SLEEP_ALPHA = 0.75,
  SLEEP_FILTER = 'grayscale(0.9) brightness(0.85)',
  SLEEP_SCALE = 1.4,
  /** The ring round a sleeper's picture in colour, and the tint of the night look. */
  SLEEP_RING = 'rgba(210,210,210,0.7)',
  NIGHT_TINT = 'rgba(22,36,92,0.48)',
  /** How far the crab in colour sinks in the sand, and where the sand cuts it, below its feet. */
  SINK = 9,
  SAND_CUT = 19,
  /** The little z's rising over a sleeper: seconds each takes, and how many at once. */
  Z_PERIOD = 3,
  Z_COUNT = 3,
  /** Seconds between two stirs, at least and at most, for each way of sleeping. */
  LIFE_GAPS: Readonly<Record<SleeperLife, readonly [number, number] | null>> = {
    shuffle: [4, 7],
    breathe: [7.5, 8.5],
    twitch: [3, 6],
    none: null,
  };

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
  /** TikTok's latest viewer count, 0 while unknown. */
  audience = 0,
  sleeperCount = 1,
  look: SleeperLook = 'colorFaceGreyCrab',
  life: SleeperLife = 'shuffle',
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
    arrived: -Infinity,
    fresh: false,
    liked: -Infinity,
    shown: -Infinity,
    at: now,
    asked: Infinity,
  };
  if (avatar && avatar !== v.avatar) {
    v.avatar = avatar;
    v.asked = Infinity;
  }
  v.at = now;
  viewers.delete(nickname);
  viewers.set(nickname, v);
  for (const old of viewers.keys()) {
    if (viewers.size <= VIEWERS_MAX) break;
    viewers.delete(old);
  }
  return v;
}

/**
 * A sign of a viewer on the live (a join, a comment, a follow, a share, a gift): they are here,
 * and a sleeper may show them. A join puts them first in line.
 */
export function crabSeen(nickname: string, avatar: string | undefined, joined: boolean): void {
  if (!nickname) return;
  const v = seen(nickname, avatar);
  if (!joined) return;
  v.joined = ++joins;
  v.arrived = now;
  v.fresh = true;
}

/**
 * TikTok's viewer count, and the viewers it lists at the top of the room: those are here, and
 * when the list holds as many as the count, nobody else is.
 */
export function crabViewers(
  total: number,
  top: readonly { nickname: string; avatar?: string | undefined }[] = [],
): void {
  // A count of 0 comes with messages that carry none: it says nothing.
  if (total > 0) audience = Math.floor(total);
  const listed = new Set<string>();
  for (const u of top) {
    if (!u.nickname) continue;
    seen(u.nickname, u.avatar === '' ? undefined : u.avatar);
    listed.add(u.nickname);
  }
  if (audience > 0 && listed.size >= audience && listed.size > 0)
    for (const [name, v] of viewers) if (!listed.has(name)) v.at = -Infinity;
}

/**
 * The viewers still here: seen lately, and no more of them than TikTok counts, the ones seen
 * last kept.
 */
function here(): Set<string> {
  const out = new Set<string>(),
    names = [...viewers.keys()];
  for (let k = names.length - 1; k >= 0; k--) {
    if (audience > 0 && out.size >= audience) break;
    const name = names[k] ?? '',
      v = viewers.get(name);
    if (v && now - v.at < PRESENT) out.add(name);
  }
  return out;
}

/** Not liking lately and without a crab out: may sleep. */
function sleepy(name: string, v: Viewer): boolean {
  return now - v.liked >= IDLE && !hasCrab(name);
}

/** Whether the viewer a sleeper shows may stay on it. */
function stays(name: string): boolean {
  const v = viewers.get(name);
  return v !== undefined && sleepy(name, v) && here().has(name);
}

/** The control room's choice: one sleeping crab or two. */
export function setSleepers(n: number): void {
  const count = n === 2 ? 2 : 1;
  if (count === sleeperCount) return;
  sleeperCount = count;
  buildSleepers();
}

/** The control room's choice: how the sleeping crabs look. */
export function setSleeperLook(l: SleeperLook): void {
  look = l;
}

/** The control room's choice: how they stir in their sleep. */
export function setSleeperLife(l: SleeperLife): void {
  if (l === life) return;
  life = l;
  for (const s of sleepers) s.lifeNext = now + lifeGap();
}

function lifeGap(): number {
  const gap = LIFE_GAPS[life];
  return gap ? gap[0] + (gap[1] - gap[0]) * Math.random() : Infinity;
}

/**
 * Who may be shown next, among the viewers still here with a picture: who joined just now, the
 * latest first, then the others, the least shown first and the latest seen next.
 */
function candidates(): string[] {
  const busy = new Set(sleepers.map((s) => s.who)),
    fresh: [string, Viewer][] = [],
    rest: [string, Viewer][] = [];
  for (const name of here()) {
    const v = viewers.get(name);
    if (!v || busy.has(name) || !sleepy(name, v) || photo(v.avatar, false) === 'failed') continue;
    (v.fresh && now - v.arrived < ARRIVED ? fresh : rest).push([name, v]);
  }
  fresh.sort((a, b) => b[1].joined - a[1].joined);
  rest.sort((a, b) => a[1].shown - b[1].shown || b[1].at - a[1].at);
  return [...fresh, ...rest].map(([name]) => name);
}

/**
 * The sleeper moves on to the next viewer whose picture has loaded, or keeps its own while they
 * are still here, or shows nobody. The next few pictures load meanwhile; while the next one is
 * still on its way the turn waits for it, a moment at most, and this returns false.
 */
function rotate(s: Sleeper): boolean {
  let next: string | undefined,
    waiting = false;
  for (const name of candidates().slice(0, AHEAD)) {
    const v = viewers.get(name);
    if (!v) continue;
    v.asked = Math.min(v.asked, now);
    const state = photo(v.avatar);
    if (next !== undefined || waiting) continue;
    if (state === 'ready') next = name;
    else if (state === 'loading' && now - v.asked < LOAD_WAIT) waiting = true;
  }
  const keep = s.who !== undefined && stays(s.who),
    who = next ?? (keep ? s.who : undefined),
    v = next === undefined ? undefined : viewers.get(next);
  if (v) {
    v.fresh = false;
    v.shown = now;
  }
  if (who !== s.who) {
    // Back from nobody before the last face is gone: that face fades into the new one.
    if (s.who !== undefined || now - s.swap >= FADE) {
      s.prev = s.who;
      s.prevFace = s.face;
    }
    s.who = who;
    s.face = v?.avatar;
    s.swap = now;
  }
  return next !== undefined || !waiting;
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
      face: undefined,
      prevFace: undefined,
      swap: -Infinity,
      // The second one turns half a beat after the first, so they never change together.
      next: now + ROTATE * (1 + i / 2),
      lifeAt: -Infinity,
      lifeNext: now + lifeGap(),
      lifeSide: 1,
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
    if (now >= s.lifeNext) {
      s.lifeAt = now;
      s.lifeSide = Math.random() < 0.5 ? -1 : 1;
      s.lifeNext = now + lifeGap();
    }
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
      if (rotate(s)) s.next = Math.max(s.next + ROTATE, now + ROTATE / 2);
    } else if (s.who === undefined || !stays(s.who)) rotate(s);
  }
  // A beach Snake Arena lays out keeps every crab it placed.
  if (beach && !managed) keepLeft();
  for (const key of sleepFaces.keys()) {
    const url = key.slice(key.indexOf('|') + 1);
    if (!sleepers.some((s) => s.face === url || s.prevFace === url)) sleepFaces.delete(key);
  }
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

/** How a sleeper stirs right now, and how far its picture tilts. Nothing under reduced motion. */
function stirOf(s: Sleeper, t: number): { stir: Stir | undefined; tilt: number } {
  const still = { stir: undefined, tilt: 0 };
  if (reducedNow || life === 'none') return still;
  const e = t - s.lifeAt;
  if (life === 'shuffle') {
    // A little wiggle from side to side, the claws a beat behind.
    const u = e / 0.6;
    if (u < 0 || u >= 1) return still;
    const env = Math.sin(u * Math.PI),
      w = Math.sin(u * Math.PI * 4),
      lag = 2 * Math.sin(u * Math.PI * 4 - 0.8) * env;
    return {
      stir: {
        bx: 2.6 * w * env,
        brot: 0.05 * w * env,
        bs: 1,
        cdx: [lag, lag],
        cdy: [0, 0],
        copen: [0, 0],
      },
      tilt: 0,
    };
  }
  if (life === 'breathe') {
    // Swelling a little on a slow breath, and now and then a stretch of both claws.
    const u = e / 1.4,
      env = u >= 0 && u < 1 ? Math.sin(u * Math.PI) ** 2 : 0;
    return {
      stir: {
        bx: 0,
        brot: 0,
        bs: 1 + 0.015 * (1 - Math.cos((Math.PI * 2 * t) / 3 + s.x * 0.01)),
        cdx: [-4 * env, 4 * env],
        cdy: [-4 * env, -4 * env],
        copen: [0.35 * env, 0.35 * env],
      },
      tilt: 0,
    };
  }
  // A dream: one claw twitches, the picture tilts and comes back.
  const u = e / 0.4,
    v = e / 0.9,
    k = s.lifeSide > 0 ? 1 : 0,
    tilt = v >= 0 && v < 1 ? s.lifeSide * ((4 * Math.PI) / 180) * Math.sin(v * Math.PI) : 0;
  if (u < 0 || u >= 1) return { stir: undefined, tilt };
  const cdy: [number, number] = [0, 0],
    copen: [number, number] = [0, 0];
  cdy[k] = -3 * Math.sin(u * Math.PI * 3) * (1 - u);
  copen[k] = 0.4 * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u);
  return { stir: { bx: 0, brot: 0, bs: 1, cdx: [0, 0], cdy, copen }, tilt };
}

/** The crab's own look: grey, in colour sunk in the sand, or under the night's tint. */
type Body = 'grey' | 'sunk' | 'night';
const bodyOf = (l: SleeperLook): Body =>
  l === 'colorFaceAsleepCrab' ? 'sunk' : l === 'nightTint' ? 'night' : 'grey';

/** The crab asleep, eyes shut, drawn once for each look while still and afresh while it stirs. */
const restingBodies = new Map<Body, HTMLCanvasElement>();
let stirRaw: HTMLCanvasElement | null = null,
  stirGrey: HTMLCanvasElement | null = null;
function sleepingCrab(body: Body, stir: Stir | undefined): HTMLCanvasElement {
  const kept = stir ? undefined : restingBodies.get(body);
  if (kept) return kept;
  const cv = stir
    ? (stirRaw ??= document.createElement('canvas'))
    : document.createElement('canvas');
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
      stir,
    });
    // Sunk: what is under the sand line is not drawn.
    if (body === 'sunk')
      c.clearRect(-ART_X, 13 + (SAND_CUT - 18 - SINK) / SLEEP_SCALE, ART_W, ART_H);
    if (body === 'night') {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = NIGHT_TINT;
      c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'source-over';
    }
  }
  const out =
    body === 'grey'
      ? greyed(cv, stir ? (stirGrey ??= document.createElement('canvas')) : undefined)
      : cv;
  if (!stir) restingBodies.set(body, out);
  return out;
}

/** How a sleeper's picture is drawn: grey, in colour, or in colour with a thin white ring. */
type FaceKind = 'grey' | 'colour' | 'night';
const faceKindOf = (l: SleeperLook): FaceKind =>
  l === 'allGrey' ? 'grey' : l === 'nightTint' ? 'night' : 'colour';

/** The pictures the sleepers show, by look and picture, drawn once each it has loaded. */
const sleepFaces = new Map<string, HTMLCanvasElement>();
function sleepFace(url: string | undefined, kind: FaceKind): HTMLCanvasElement | null {
  if (url === undefined) return null;
  const key = `${kind}|${url}`,
    kept = sleepFaces.get(key);
  if (kept) return kept;
  // Never a placeholder: a picture not there yet is not drawn.
  const img = photoImage(url);
  if (!img) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = FACE * FACE_SCALE;
  const c = cv.getContext('2d');
  if (c) {
    c.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, cv.width / 2, cv.height / 2);
    c.beginPath();
    c.arc(0, 0, 28, 0, Math.PI * 2);
    c.fillStyle = '#1b2a1f';
    c.fill();
    c.save();
    c.clip();
    c.drawImage(img, -28, -28, 56, 56);
    c.restore();
    c.lineWidth = kind === 'night' ? 1.8 : 28 * 0.13;
    c.strokeStyle = kind === 'grey' ? '#d2d2d2' : kind === 'night' ? '#fff' : SLEEP_RING;
    c.stroke();
  }
  const out = kind === 'grey' ? greyed(cv) : cv;
  sleepFaces.set(key, out);
  return out;
}

/** The z's of sleep, drifting up beside the picture and fading; under reduced motion they only fade. */
function paintZs(s: Sleeper, fx: number, fy: number, t: number, alpha: number): void {
  const g = ctx,
    r = 28 * SLEEP_SCALE;
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(30,40,56,0.45)';
  g.fillStyle = '#e4e8ee';
  for (let k = 0; k < Z_COUNT; k++) {
    const u = ((((t + s.x * 0.0037) / Z_PERIOD + k / Z_COUNT) % 1) + 1) % 1,
      a = u < 0.2 ? u / 0.2 : (1 - u) / 0.8,
      x = reducedNow ? fx + r + 14 + k * 14 : fx + r + 14 + u * 28 + Math.sin(u * 6 + k * 2) * 3,
      y = reducedNow ? fy - 16 - k * 24 : fy - 14 - u * 72,
      size = reducedNow ? 20 + k * 6 : 20 + u * 16;
    g.globalAlpha = alpha * 0.9 * Math.max(0, Math.min(1, a));
    g.font = `700 ${String(Math.round(size))}px ${FONT}`;
    g.strokeText('z', x, y);
    g.fillText('z', x, y);
  }
  g.restore();
}

function paintSleepers(t: number, low: number, reduced: boolean): void {
  const g = ctx,
    body = bodyOf(look),
    kind = faceKindOf(look),
    dy = body === 'sunk' ? SINK : 0,
    // Grey parts keep the dimmed look of the sleepers; parts in colour are drawn whole.
    bodyAlpha = body === 'grey' ? SLEEP_ALPHA : 1,
    faceAlpha = kind === 'grey' ? SLEEP_ALPHA : 1;
  reducedNow = reduced;
  for (const s of sleepers) {
    const u = Math.min(1, Math.max(0, (t - s.swap) / FADE)),
      // With nobody to show the sleeper fades away, and back in with the next face.
      shown =
        s.who !== undefined ? (s.prev !== undefined ? 1 : u) : s.prev !== undefined ? 1 - u : 0;
    if (shown <= 0.01) continue;
    const y = sleeperY(s.x, low),
      { stir, tilt } = stirOf(s, t);
    g.globalAlpha = SLEEP_ALPHA * shown;
    g.fillStyle = 'rgba(60,40,20,0.28)';
    g.beginPath();
    g.ellipse(s.x, y + 18, 34, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(s.x, y + 18 + dy);
    g.scale(SLEEP_SCALE, SLEEP_SCALE);
    g.translate(0, -13);
    g.globalAlpha = bodyAlpha * shown;
    g.drawImage(sleepingCrab(body, stir), -ART_X, -ART_Y, ART_W, ART_H);
    // The picture moves with the claws holding it; the new face fades in over the one before.
    const [fx, fy] = stir ? stirred(stir, 0, -42) : [0, -42];
    g.translate(fx, fy);
    if (tilt) g.rotate(tilt);
    const before = u < 1 ? sleepFace(s.prevFace, kind) : null,
      current = s.who === undefined ? null : sleepFace(s.face, kind);
    if (before) {
      g.globalAlpha = faceAlpha * (s.who === undefined ? shown : 1);
      g.drawImage(before, -FACE / 2, -FACE / 2, FACE, FACE);
    }
    if (current) {
      g.globalAlpha = faceAlpha * u;
      g.drawImage(current, -FACE / 2, -FACE / 2, FACE, FACE);
      noteFace(s.who, 0);
    }
    g.restore();
    if (body === 'sunk') {
      // A soft lip of sand where it sinks in.
      g.globalAlpha = shown;
      g.fillStyle = 'rgba(208,176,124,0.5)';
      g.beginPath();
      g.ellipse(s.x, y + SAND_CUT + 1, 40, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (look === 'colorFaceGreyCrab' || look === 'colorFaceAsleepCrab')
      paintZs(s, s.x, y + 18 + dy - 55 * SLEEP_SCALE, t, shown);
    // The heart is never greyed: empty and breathing, full for a moment once a like lands in it.
    const hy = heartY(y),
      fu = (t - s.filled) / FILL;
    let size = HEART_SIZE * (reduced ? 1 : 1 + 0.08 * Math.sin(t * 2.5 + s.x * 0.01));
    if (fu >= 0 && fu < 1) {
      if (!reduced) size = HEART_SIZE * (1 + 0.35 * Math.sin(Math.min(1, fu * 2) * Math.PI));
      g.globalAlpha = shown * (fu < 0.7 ? 1 : (1 - fu) / 0.3);
      g.drawImage(bigHeart(true), s.x - size / 2, hy - size / 2, size, size);
    }
    g.globalAlpha = shown;
    g.drawImage(bigHeart(false), s.x - size / 2, hy - size / 2, size, size);
    g.globalAlpha = 1;
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
