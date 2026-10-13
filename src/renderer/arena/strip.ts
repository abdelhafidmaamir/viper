// Snake Arena: the like strip, in the battle only. A row of compact chips just under the board's
// bottom line, centred, above the alert card: one for every living player from GO, 0 % included
// (an empty ring is an invitation), in the qualifying's seat order for the whole battle; a player
// who falls loses theirs, eased out, and the others slide together. Up to STRIP.most chips keep
// their full size; more are scaled down evenly to fit the board's width. A chip: the player's photo in the red ring of their likes toward the
// next speed boost, the goal a bolt badge on the ring at the upper right (the ring starts just past
// it and runs clockwise back to it), and the percentage. At 100 % the chip turns gold, the badge
// lights and a big lit bolt replaces the number for a moment, while the alert card says SPEED
// BOOST; then the ring starts again from what was left over. Small hearts pop over a chip at each
// like. Painted after the alert card, so its rising particles pass behind the strip.

import { ctx } from '../engine/canvas.ts';
import { GOLD } from '../engine/palette.ts';
import { alertBoost, paintCardBolt } from '../feed/alerts.ts';
import { burstSprite } from '../feed/alert-fx.ts';
import { BOARD_H, BOARD_W, FY0 } from '../feed/grid.ts';
import { FONT, paintFace } from '../feed/paint.ts';
import { W } from '../engine/layout.ts';
import { COLOURS } from './board-paint.ts';
import { BOOST, fired, isPilot, likeHooks, rings } from './entry.ts';
import { alive, arena, snakeOf } from './rules.ts';

export const STRIP = {
  /** Chips at full size at most; past that every chip shrinks so the row fits the board. */
  most: 6,
  /** Seconds a chip stays gold once its ring is full. */
  full: 1.5,
  /** Seconds of a chip's coming and going. */
  ease: 0.3,
  /** The row's middle, in game units: under the board's bottom line, above the alert card. */
  y: FY0 + BOARD_H + 84,
};

/**
 * The alert card under the strip (alerts.setAlertLook): the arena's order of importance, a card
 * the size of Feed's (never smaller), its top clear of the strip.
 */
export const ARENA_ALERTS = {
  cx: W / 2,
  cy: STRIP.y + 32 + 12 + 57,
  w: 790,
  h: 114,
  avatar: 86,
  text: 38,
  arena: true,
};

/** A chip, in game units: its size, its photo, its ring and the room for its number. */
const CHIP = { w: 148, h: 64, gap: 8, pad: 18, photo: 17, ring: 24, box: 54, mid: 12, text: 44 };
const RED = '#ff4d6d';
/** The ring's gap round the badge, each side, in radians; the badge's direction. */
const GAP = 0.55,
  BADGE = -Math.PI / 4;

interface Chip {
  readonly nickname: string;
  /** Where it stands, its size, and how much it shows (0 to 1). */
  x: number;
  k: number;
  shown: number;
  leaving: boolean;
}

const chips: Chip[] = [];
/** The battle's players in the qualifying's seat order (their snakes were laid in that order). */
let order: string[] = [];
let wasBattle = false;
/** Small hearts over the chips, at each like. */
const pops: { nickname: string; dx: number; t: number; size: number }[] = [];
const POPS_MAX = 30;
/** Each player's last boost the strip has told the alert card about. */
const told = new Map<string, number>();
let at = -1;

const battle = (): boolean => arena.phase === 'play';

/** A player's like in the battle: hearts pop over their chip. */
export function stripLike(nickname: string, n: number): void {
  const chip = chips.find((c) => c.nickname === nickname && !c.leaving);
  if (!battle() || !chip) return;
  const hearts = Math.min(3, 1 + Math.floor(Math.log10(Math.max(1, n))));
  for (let i = 0; i < hearts && pops.length < POPS_MAX; i++)
    pops.push({
      nickname,
      dx: (Math.random() - 0.5) * 60,
      t: -i * 0.08,
      size: 20 + Math.random() * 10,
    });
}

likeHooks.battle = stripLike;

/** A player's likes toward their next boost, 0 to 1, and whether their chip shows gold now. */
function progress(nickname: string): { fill: number; full: boolean } {
  const full = arena.clock - (fired.get(nickname) ?? -Infinity) < STRIP.full;
  return { fill: Math.min(1, (rings.get(nickname) ?? 0) / BOOST.likes), full };
}

/** The players of the battle, alive, as the strip shows them. */
const players = (): string[] =>
  alive()
    .filter((s) => !s.wild && !isPilot(s) && s.in)
    .sort((p, q) => p.id - q.id)
    .map((s) => s.nickname);

/**
 * The chips follow the living players, in the seat order, easing to their places and size; a full
 * ring tells the alert card.
 */
export function stepStrip(): void {
  const dt = at < 0 ? 0 : Math.min(0.1, Math.max(0, arena.clock - at));
  at = arena.clock;
  const now = battle();
  if (now && !wasBattle) order = [];
  wasBattle = now;
  const living = now ? players() : [];
  for (const n of living) if (!order.includes(n)) order.push(n);
  for (const c of chips) if (!living.includes(c.nickname)) c.leaving = true;
  for (const n of living)
    if (!chips.some((c) => c.nickname === n && !c.leaving))
      chips.push({ nickname: n, x: NaN, k: 1, shown: 0, leaving: false });
  const row = order
      .map((n) => chips.find((c) => c.nickname === n && !c.leaving))
      .filter((c): c is Chip => !!c),
    full = row.length * CHIP.w + Math.max(0, row.length - 1) * CHIP.gap,
    k = row.length > STRIP.most ? Math.min(1, BOARD_W / full) : 1,
    step = (CHIP.w + CHIP.gap) * k,
    left = W / 2 - ((row.length - 1) * step) / 2,
    ease = 1 - Math.exp(-dt * 10);
  row.forEach((c, i) => {
    const to = left + i * step;
    c.x = Number.isNaN(c.x) ? to : c.x + (to - c.x) * ease;
    c.k = c.shown <= 0 ? k : c.k + (k - c.k) * ease;
  });
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    if (!c) continue;
    c.shown = Math.max(0, Math.min(1, c.shown + (c.leaving ? -dt : dt) / STRIP.ease));
    if (c.leaving && c.shown <= 0) chips.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const h = pops[i];
    if (!h) continue;
    h.t += dt;
    if (h.t > 0.8) pops.splice(i, 1);
  }
  // A full ring: the alert card says SPEED BOOST, once per boost.
  if (battle())
    for (const [nickname, when] of fired) {
      if (told.get(nickname) === when) continue;
      told.set(nickname, when);
      const s = snakeOf(nickname);
      if (s && !s.wild && !isPilot(s) && arena.clock - when < 1)
        alertBoost({ nickname, avatar: s.avatar }, light(COLOURS[s.colour]));
    }
}

/** The snake's colour, lighter: for a name or an outline on a dark card. */
export function light(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const mix = (v: string | undefined): number =>
    Math.round(parseInt(v ?? '0', 16) + (255 - parseInt(v ?? '0', 16)) * 0.4);
  return `rgb(${String(mix(m[1]))},${String(mix(m[2]))},${String(mix(m[3]))})`;
}

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/** One chip at (x, y): the pill, the ringed photo with its badge, the number or the big bolt. */
function paintChip(chip: Chip, y: number): void {
  const c = ctx,
    s = snakeOf(chip.nickname),
    { fill, full } = progress(chip.nickname),
    left = chip.x - CHIP.w / 2,
    px = left + CHIP.pad + CHIP.box / 2,
    show = smooth(chip.shown),
    k = chip.k * (0.9 + 0.1 * show);
  c.save();
  c.globalAlpha = show;
  c.translate(chip.x, y);
  c.scale(k, k);
  c.translate(-chip.x, -y);
  c.fillStyle = 'rgba(14,16,20,0.92)';
  c.beginPath();
  c.roundRect(left, y - CHIP.h / 2, CHIP.w, CHIP.h, CHIP.h / 2);
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = full ? 'rgba(242,193,78,0.9)' : 'rgba(255,255,255,0.12)';
  c.stroke();
  const outline = s ? light(COLOURS[s.colour]) : '#fff';
  paintFace({ nickname: chip.nickname, avatar: s?.avatar }, px, y, CHIP.photo, outline);
  // The ring: from just past the badge, clockwise round the photo, back to it.
  const start = BADGE + GAP,
    span = Math.PI * 2 - 2 * GAP;
  c.lineCap = 'round';
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(255,255,255,0.2)';
  c.beginPath();
  c.arc(px, y, CHIP.ring, start, start + span);
  c.stroke();
  const f = full ? 1 : fill;
  if (f > 0.005) {
    c.strokeStyle = full ? GOLD : RED;
    c.beginPath();
    c.arc(px, y, CHIP.ring, start, start + span * f);
    c.stroke();
  }
  // The goal: the bolt badge on the ring, lit when the ring is full.
  const bx = px + Math.cos(BADGE) * CHIP.ring + 2,
    by = y + Math.sin(BADGE) * CHIP.ring - 2;
  c.fillStyle = full ? GOLD : 'rgba(14,16,20,0.96)';
  c.beginPath();
  c.arc(bx, by, 14, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 2.8;
  c.strokeStyle = full ? '#fff4c2' : 'rgba(242,193,78,0.85)';
  c.stroke();
  paintCardBolt(bx, by + 0.6, 21, full);
  const tx = left + CHIP.pad + CHIP.box + CHIP.mid + CHIP.text / 2;
  if (full) paintCardBolt(tx, y, 34, true);
  else {
    c.font = `800 21px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText(`${String(Math.min(99, Math.floor(fill * 100)))}%`, tx, y + 1);
  }
  c.restore();
}

/** The strip, over the alert card's particles: the chips, then the hearts over them. */
export function paintStrip(): void {
  stepStrip();
  if (!chips.length) return;
  const c = ctx,
    y = STRIP.y;
  for (const chip of chips) paintChip(chip, y);
  const heart = burstSprite('like');
  for (const h of pops) {
    const chip = chips.find((k) => k.nickname === h.nickname);
    if (!chip || h.t < 0) continue;
    const u = h.t / 0.8,
      size = h.size * (0.6 + 0.4 * smooth(u / 0.3));
    c.save();
    c.globalAlpha = (1 - smooth((u - 0.5) / 0.5)) * smooth(chip.shown);
    c.drawImage(
      heart,
      chip.x + (20 + h.dx * 0.5) * chip.k - size / 2,
      y - (CHIP.h / 2) * chip.k - 10 - 40 * smooth(u) - size / 2,
      size,
      size,
    );
    c.restore();
  }
}

/** For tests: the chips on the strip now, in order, and what each shows. */
export function stripState(): {
  nickname: string;
  leaving: boolean;
  full: boolean;
  percent: number;
  x: number;
  k: number;
}[] {
  return chips.map((c) => {
    const { fill, full } = progress(c.nickname);
    return {
      nickname: c.nickname,
      leaving: c.leaving,
      full,
      percent: Math.floor(fill * 100),
      x: c.x,
      k: c.k,
    };
  });
}

/** Clears the strip (tests, a new session). */
export function resetStrip(): void {
  chips.length = 0;
  pops.length = 0;
  order = [];
  wasBattle = false;
  told.clear();
  at = -1;
}
