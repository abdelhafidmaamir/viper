// Fan rings: a donor's photo leaves the gift banner at the top as it fades (or, with banners off,
// appears beside the score card on its team's side) and flies into their team's snake and stays on the
// body as a small badge. Badges are anchored by their distance from the tail, so they ride along as
// the snake moves and fall off when a cut takes that part of the tail. Nothing here touches the
// shared seeded random: the AI must play the same with or without this layer.

import { getAvatar } from './announcements.ts';
import { CELL, COLS, ROWS, SC_CY, W, X0, Y0 } from './layout.ts';
import { BOOST_COST } from './rules.ts';
import { SEED_GROW_TIME } from './rules.ts';
import { berries, bodies, px, seeds, settings, t } from '../scripts/game.ts';

type Ctx = CanvasRenderingContext2D;
interface Point {
  x: number;
  y: number;
}

interface Fan {
  team: number;
  nickname: string;
  avatar: string | undefined;
  big: boolean;
}

interface Ring extends Fan {
  /** Position along the body in cells from the head; eases toward its even-spread target. */
  pos: number;
  target: number;
  born: number;
}

interface Flyer extends Fan {
  /** Where the gift acts: a HUD icon or a berry's cell; null flies to the head. */
  to: Point | null;
  /** The gift berry it flies to, which shows the donor's face once the photo lands on it. */
  berry: { x: number; y: number; nickname: string } | null;
  /** Radius at departure. */
  r0: number;
  /** Seconds before the flight starts: pop-in and wait, zero when the banner already showed it. */
  pre: number;
  flight: number;
  trail: Point[];
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  age: number;
}

interface Fall {
  ring: Ring;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
}

interface Spark {
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const APPEAR = 0.18; // seconds the photo pops in
const HOLD = 0.55; // seconds it waits with the name under it, so viewers can read who gave
const FLIGHT = 0.7; // seconds of travel toward the head
const TRAIL = 9; // positions kept for the comet trail behind a flying photo
const BADGE = 0.3; // badge radius in cells: the photo sits inside the body's width, set into it
const GLIDE = 5; // per second: how fast badges slide to their new places along the body
const FIRST = 1.5; // cells from the head to the first badge, so the face keeps its outline
const FLY = 0.95; // radius in cells of the photo before it leaves
const CARD_GAP = 260; // horizontal distance from the score card's center to a waiting photo
const CREDIT = 1.6; // seconds the donor's name stays beside their new badge
const BANNER_FLIGHT = 1.0; // seconds from the banner down to the head, a longer way than from below
const GAP = APPEAR + HOLD + 0.1; // seconds between two departures of the same team: the next photo
// only appears once the previous one has left its spot
const POP = 0.4; // seconds of the elastic settle once on the body
const WAVE = 0.35; // seconds of the impact ring
const QUEUE_MAX = 6; // per team; a burst of gifts beyond this is shown by the banner only
const GOLD_RGB = '242,197,124';
// Gold, shadow, then the forest green of a welcome berry (no team).
const RGB = [GOLD_RGB, '180,212,222', '134,204,112'];
const WELCOME = 2;
const rgbOf = (team: number): string => RGB[team] ?? GOLD_RGB;

let queue: Fan[][] = [[], []];
// Gift berries on the board last frame, to see which one a head just ate.
let giftBerries: { ref: object; x: number; y: number; nickname: string; wild: boolean }[] = [];
// Gift berries the donor's photo has landed on, by cell and donor (a seed becomes a new berry
// object as it ripens), with the landing time: they show the face.
let facedBerries = new Map<string, number>();
const berryKey = (b: { x: number; y: number; nickname: string }): string =>
  `${String(b.x)},${String(b.y)}:${b.nickname}`;
// Stands for a berry already eaten when its photo left: the photo still lands on its cell, and
// the eater already got the badge.
const EATEN = { x: -1, y: -1, nickname: '' };
// Last cell of each donor's gift berry, per team, so the photo finds it even once eaten.
let berryCells: Record<string, Point> = {};
// Donor photos by nickname, so a gift berry, which only knows its donor's nickname, shows their face.
let avatars: Record<string, string | undefined> = {};
let flyers: Flyer[] = [];
let rings: Ring[] = [];
let falls: Fall[] = [];
let sparks: Spark[] = [];
let waves: (Point & { team: number; age: number; big: boolean })[] = [];
const lastLength = [0, 0];
const lastDeparture = [-9, -9];

const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const easeOutBack = (p: number): number => 1 + 3.2 * Math.pow(p - 1, 3) + 2.2 * Math.pow(p - 1, 2);

/** Clears every badge, flight and effect; called at each new round. */
export function clearFans(): void {
  queue = [[], []];
  giftBerries = [];
  facedBerries = new Map();
  berryCells = {};
  avatars = {};
  flyers = [];
  rings = [];
  falls = [];
  sparks = [];
  waves = [];
  lastLength[0] = lastLength[1] = 0;
  lastDeparture[0] = lastDeparture[1] = -9;
}

/** Queues the donor's photo to fly into team i's snake. */
export function launchFan(
  team: number,
  nickname: string | undefined,
  avatar: string | undefined,
  value: number,
): void {
  if (!nickname || !settings.donorNames) return;
  if (avatar) avatars[nickname] = avatar;
  // With the banner on, the photo leaves from the banner instead (launchFromBanner).
  const banner = (settings as { banner?: string }).banner;
  if (banner && banner !== 'none') return;
  const q = queue[team];
  if (!q || q.length >= QUEUE_MAX) return;
  q.push({ team, nickname, avatar, big: value >= BOOST_COST });
}

function depart(fan: Fan): void {
  // The photo waits in the free space beside the score card, gold on the left and shadow on the
  // right, never on the board where it would hide the play; then it rises into the board and bends
  // toward the head.
  const x0 = W / 2 + (fan.team === 0 ? -CARD_GAP : CARD_GAP),
    y0 = SC_CY;
  flyers.push({
    ...fan,
    to: null,
    berry: null,
    r0: CELL * FLY * (fan.big ? 1.15 : 1),
    pre: APPEAR + HOLD,
    flight: FLIGHT,
    trail: [],
    x0,
    y0,
    cx: x0,
    cy: Y0 + ROWS * CELL * 0.55,
    x: x0,
    y: y0,
    age: 0,
  });
}

/** Sends the photo shown at (x, y) with radius r in the gift banner to team i's snake. */
export function launchFromBanner(
  team: number,
  nickname: string,
  avatar: string | undefined,
  value: number,
  x: number,
  y: number,
  r: number,
  effect: string | undefined,
): void {
  // The photo flies to where the gift acts: the donor's berry, the team's speed gauge, or its
  // shield and life icons under the gauge (same anchors as duel-hud); anything else to the head.
  const side = team === 0 ? X0 - 82 : X0 + COLS * CELL + 82,
    gaugeTop = Y0 + 7 + 26 + 4 * 52 + 16 + 20,
    gaugeBottom = gaugeTop + 220;
  let to: Point | null = null,
    berry: { x: number; y: number; nickname: string } | null = null,
    flight = BANNER_FLIGHT;
  if (effect === 'SPEED') to = { x: side, y: gaugeTop + 40 };
  else if (effect === 'SHIELD') to = { x: side, y: gaugeBottom + 48 };
  else if (effect === 'LIFE') {
    const shielded = (bodies[team]?.shieldTime ?? 0) > 0;
    to = { x: side, y: gaugeBottom + 48 + (shielded ? 110 : 0) };
  } else if (effect === 'BERRY') {
    // Several berries from one donor: each photo takes a berry no other photo is heading to.
    const taken = new Set([
      ...facedBerries.keys(),
      ...flyers.flatMap((f) => (f.berry ? [berryKey(f.berry)] : [])),
    ]);
    const mine = [...seeds, ...berries].filter(
      (b) =>
        b.nickname === nickname &&
        !('wild' in b && b.wild) &&
        (b.team === 'shadow' ? 1 : 0) === team &&
        !taken.has(berryKey(b)),
    );
    const last = mine[mine.length - 1];
    if (last) {
      to = px(last.x, last.y);
      berry = last;
      // Timed to land as the berry finishes growing, before any snake can reach it.
      const seed = seeds.find((g) => g === last);
      if (seed) flight = Math.max(0.5, Math.min(BANNER_FLIGHT, SEED_GROW_TIME - seed.t));
      else flight = 0.5;
    } else {
      berry = EATEN;
      to = berryCells[`${String(team)}:${nickname}`] ?? null;
    }
  }
  flyers.push({
    to,
    berry,
    team,
    nickname,
    avatar,
    big: value >= BOOST_COST,
    r0: r,
    pre: 0,
    flight,
    trail: [],
    x0: x,
    y0: y,
    // Drops straight down out of the banner first, then bends toward the head.
    cx: x,
    cy: Y0 + ROWS * CELL * 0.4,
    x,
    y,
    age: 0,
  });
}

// Pixel position `cells` cells behind the head, on the smooth trace. The trace starts at the head
// and holds three points per cell, so it is read at 3 * cells, interpolated between two points:
// a badge rides the same curve as the body, frame after frame.
function pointAt(team: number, cells: number): Point | null {
  const tr = bodies[team]?.trace;
  if (!tr?.length) return null;
  const f = Math.max(0, Math.min(tr.length - 1, cells * 3)),
    i0 = Math.floor(f),
    w = f - i0;
  const a = tr[i0],
    c = tr[Math.min(tr.length - 1, i0 + 1)] ?? a;
  if (!a || !c) return null;
  return { x: a.x + (c.x - a.x) * w, y: a.y + (c.y - a.y) * w };
}

const headOf = (team: number): Point | null => pointAt(team, 0);

// Even spread: a team's badges share the body from just behind the head to the tail, newest in
// front, so they never bunch up and the spacing grows or shrinks with the snake.
function spreadTargets(team: number): void {
  const own = rings.filter((r) => r.team === team).sort((a, b) => b.born - a.born);
  const tail = Math.max(FIRST, (bodies[team]?.snake.length ?? 1) - 1);
  const step = own.length > 1 ? (tail - FIRST) / (own.length - 1) : 0;
  own.forEach((r, k) => {
    r.target = own.length > 1 ? FIRST + k * Math.min(step, 2.5) : FIRST;
  });
}

export function updateFans(dt: number): void {
  // A gift berry gone from the board under a head was eaten: its donor joins that snake's body.
  const present = new Set<object>(berries);
  for (const g of giftBerries) {
    if (present.has(g.ref)) continue;
    for (let i = 0; i < 2; i++) {
      const h = bodies[i]?.snake[0];
      if (h?.x !== g.x || h.y !== g.y) continue;
      // A welcome berry picks no side: the eater gets the bite, not a supporter.
      if (g.wild) {
        const p = px(g.x, g.y);
        waves.push({ team: WELCOME, x: p.x, y: p.y, age: 0, big: false });
        continue;
      }
      addRing({ team: i, nickname: g.nickname, avatar: avatars[g.nickname], big: false });
      const p = px(g.x, g.y);
      waves.push({ team: i, x: p.x, y: p.y, age: 0, big: false });
    }
    facedBerries.delete(berryKey(g));
  }
  for (const b of [...seeds, ...berries])
    if (b.nickname) berryCells[`${b.team === 'shadow' ? '1' : '0'}:${b.nickname}`] = px(b.x, b.y);
  giftBerries = berries
    .filter((b) => b.nickname)
    .map((b) => ({ ref: b, x: b.x, y: b.y, nickname: b.nickname, wild: !!b.wild }));

  // A length drop means a cut took the tail: badges past the new tail fall off, the rest re-spread.
  for (let i = 0; i < 2; i++) {
    const len = bodies[i]?.snake.length ?? 0;
    const lost = (lastLength[i] ?? 0) - len;
    if (lost > 0) {
      rings = rings.filter((r) => {
        if (r.team !== i || r.pos <= len - 1) return true;
        const p = pointAt(i, r.pos);
        const side = Math.round(r.pos) % 2 === 0 ? -1 : 1;
        if (p)
          falls.push({ ring: r, x: p.x, y: p.y, vx: side * 160, vy: -380, angle: 0, life: 1.2 });
        return false;
      });
    }
    lastLength[i] = len;
    const q = queue[i];
    if (q?.length && t - (lastDeparture[i] ?? -9) >= GAP) {
      const fan = q.shift();
      if (fan) depart(fan);
      lastDeparture[i] = t;
    }
  }

  for (let i = 0; i < 2; i++) spreadTargets(i);
  const glide = Math.min(1, dt * GLIDE);
  for (const r of rings) r.pos += (r.target - r.pos) * glide;

  for (const f of flyers) {
    f.age += dt;
    const p = Math.max(0, Math.min(1, (f.age - f.pre) / f.flight)),
      e = easeInOut(p),
      u = 1 - e;
    const head = f.to ?? headOf(f.team);
    const hx = head?.x ?? f.cx,
      hy = head?.y ?? f.cy;
    f.x = u * u * f.x0 + 2 * u * e * f.cx + e * e * hx;
    f.y = u * u * f.y0 + 2 * u * e * f.cy + e * e * hy;
    if (p > 0) {
      f.trail.push({ x: f.x, y: f.y });
      if (f.trail.length > TRAIL) f.trail.shift();
    }
  }
  for (const f of flyers) if (f.age >= f.pre + f.flight) land(f);
  flyers = flyers.filter((f) => f.age < f.pre + f.flight);

  for (const f of falls) {
    f.vy += 1300 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.angle += (f.vx > 0 ? 6 : -6) * dt;
    f.life -= dt;
  }
  falls = falls.filter((f) => f.life > 0);
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - 5 * dt;
    s.vy *= 1 - 5 * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
  for (const w of waves) w.age += dt;
  waves = waves.filter((w) => w.age < WAVE);
}

function land(f: Flyer): void {
  waves.push({ team: f.team, x: f.x, y: f.y, age: 0, big: f.big });
  // Short sparks on fixed angles (no random, see the header).
  const n = f.big ? 14 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.3,
      v = 110 + (k % 3) * 45;
    sparks.push({
      team: f.team,
      x: f.x,
      y: f.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.45,
    });
  }
  if (f.berry) {
    // The face stays on the berry; the donor joins the body of whichever snake eats it.
    if (f.berry !== EATEN) facedBerries.set(berryKey(f.berry), t);
    return;
  }
  const head = headOf(f.team);
  if (!head) return;
  if (f.to) {
    // The gift showed on its gauge; the photo goes on to the snake, like every other donor's.
    flyers.push({
      team: f.team,
      nickname: f.nickname,
      avatar: f.avatar,
      big: f.big,
      to: null,
      berry: null,
      r0: CELL * BADGE,
      pre: 0,
      flight: 0.7,
      trail: [],
      x0: f.x,
      y0: f.y,
      cx: (f.x + head.x) / 2,
      cy: Math.min(f.y, head.y) - CELL * 2,
      x: f.x,
      y: f.y,
      age: 0,
    });
    return;
  }
  addRing(f);
}

function addRing(f: Fan): void {
  // The photo lands right behind the head, then slides back to its place as the others make room.
  rings.push({
    team: f.team,
    nickname: f.nickname,
    avatar: f.avatar,
    big: f.big,
    pos: FIRST,
    target: FIRST,
    born: t,
  });
}

// `inset`: a badge set into the body, with a thin team-colored rim and no drop shadow, so the body
// stays one smooth shape; otherwise a photo in flight, lifted off the board by its shadow.
function face(c: Ctx, who: Fan, x: number, y: number, r: number, angle = 0, inset = false): void {
  if (r <= 0.5) return;
  const img = getAvatar(who.avatar, who.nickname);
  const rgb = rgbOf(who.team);
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  if (!inset) {
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 2;
  }
  // Big gifts keep a pale gold rim, on the body too: the donors who gave more stand out.
  c.fillStyle = who.big ? '#fff3c4' : `rgb(${rgb})`;
  c.beginPath();
  c.arc(0, 0, r + (inset ? (who.big ? 2.5 : 1.5) : who.big ? 3.5 : 2.5), 0, Math.PI * 2);
  c.fill();
  c.shadowColor = 'transparent';
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.clip();
  c.drawImage(img, -r, -r, r * 2, r * 2);
  c.restore();
}

// Comet trail: the recent positions as a tapering stroke in the team color, oldest faintest.
function paintTrail(c: Ctx, f: Flyer, r: number): void {
  const n = f.trail.length;
  if (n < 2) return;
  c.save();
  c.lineCap = 'round';
  for (let k = 1; k < n; k++) {
    const a = f.trail[k - 1],
      b = f.trail[k];
    if (!a || !b) continue;
    const w = k / n;
    c.globalAlpha = w * 0.55;
    c.strokeStyle = `rgb(${rgbOf(f.team)})`;
    c.lineWidth = r * 1.4 * w;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.restore();
}

// Pill with the donor's name. `x` is the pill's center when `side` is 0, else the edge the pill
// grows away from: -1 grows to the left, 1 to the right.
// Names already shown this frame: one donor sending five gifts gets one name, not five stacked.
let tagged = new Set<string>();

function nameTag(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  alpha: number,
  team: number,
  side: -1 | 0 | 1 = 0,
): void {
  if (alpha <= 0.01 || tagged.has(text)) return;
  tagged.add(text);
  c.save();
  c.globalAlpha = alpha;
  c.font = 'bold 28px sans-serif';
  const w = c.measureText(text).width + 28;
  const cx = x + (side * w) / 2;
  c.fillStyle = 'rgba(14,16,20,0.82)';
  c.beginPath();
  c.roundRect(cx - w / 2, y - 20, w, 40, 20);
  c.fill();
  c.fillStyle = `rgb(${rgbOf(team)})`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, cx, y + 1);
  c.restore();
}

/** A viewer just joined: their face shows on the welcome berry at once, with their name. */
export function welcomeFan(
  berry: { x: number; y: number; nickname: string },
  avatar?: string,
): void {
  if (avatar) avatars[berry.nickname] = avatar;
  facedBerries.set(berryKey(berry), t);
}

/** Paints the donor's face on each gift berry, and their name while it grows; call after the berries. */
export function paintGiftBerries(c: Ctx): void {
  tagged = new Set(); // first fan layer painted each frame
  for (const b of berries) {
    const landed = facedBerries.get(berryKey(b));
    if (landed === undefined || !b.nickname) continue;
    const p = px(b.x, b.y),
      team = b.wild ? WELCOME : b.team === 'shadow' ? 1 : 0,
      age = t - landed;
    const who = { team, nickname: b.nickname, avatar: avatars[b.nickname], big: false };
    face(c, who, p.x, p.y, CELL * BADGE * easeOutBack(Math.min(1, age / POP)), 0, true);
    if (age < CREDIT)
      nameTag(c, '@' + b.nickname, p.x, p.y - CELL * 0.85, Math.min(1, (CREDIT - age) * 3), team);
  }
}

/** Paints badges, falls and landing effects; call right after the snakes. */
export function paintFans(c: Ctx): void {
  for (const r of rings) {
    const p = pointAt(r.team, r.pos);
    if (!p) continue;
    const settle = easeOutBack(Math.min(1, (t - r.born) / POP));
    const rad = CELL * BADGE;
    face(c, r, p.x, p.y, rad * settle, 0, true);
    // The name stays beside the new badge a moment, so viewers see whose photo just joined.
    const age = t - r.born;
    if (age < CREDIT)
      nameTag(c, '@' + r.nickname, p.x, p.y - rad - 30, Math.min(1, (CREDIT - age) * 3), r.team);
  }
  for (const f of falls) {
    c.save();
    c.globalAlpha = Math.min(1, f.life * 2);
    face(c, f.ring, f.x, f.y, CELL * BADGE, f.angle, true);
    c.restore();
  }
  for (const w of waves) {
    const p = w.age / WAVE;
    c.save();
    c.globalAlpha = (1 - p) * 0.8;
    c.lineWidth = 3;
    c.strokeStyle = `rgb(${rgbOf(w.team)})`;
    c.beginPath();
    c.arc(w.x, w.y, CELL * (0.3 + p * (w.big ? 0.9 : 0.6)), 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  for (const s of sparks) {
    c.save();
    c.globalAlpha = Math.min(1, s.life * 3);
    c.fillStyle = `rgb(${rgbOf(s.team)})`;
    c.beginPath();
    c.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

/** Paints the photos on their way in; call after the gift panels, which they start on. */
export function paintFlyers(c: Ctx): void {
  for (const f of flyers) {
    const badge = CELL * BADGE;
    const travel = Math.max(0, Math.min(1, (f.age - f.pre) / f.flight));
    const grown = f.pre > 0 ? easeOutBack(Math.min(1, f.age / APPEAR)) : 1;
    const r = f.r0 * grown + (badge - f.r0) * travel * travel;
    paintTrail(c, f, r);
    face(c, f, f.x, f.y, r);
    if (f.pre > 0) {
      // Waiting beside the score card: the name sits on the outer side, away from the card.
      const side = f.team === 0 ? -1 : 1;
      nameTag(
        c,
        '@' + f.nickname,
        f.x + side * (r + 12),
        f.y,
        Math.min(1, f.age * 6, (1 - travel * 3) * 1.5),
        f.team,
        side,
      );
    } else {
      // Out of the banner: the name travels under the photo and fades before the landing.
      nameTag(c, '@' + f.nickname, f.x, f.y + r + 28, Math.min(1, (1 - travel) * 2.5), f.team);
    }
  }
}
