// The berry flower: the object that feeds the snake, in the place of the original's pearl. Idle it
// is a closed bud with a glowing seed. A gift makes it bloom around the giver's face, with their
// name, their daily title and "+N BERRIES", and it stays open while their berries drip out of it
// one by one; then it closes again.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { FLOWER } from './grid.ts';
import { GOLD, berryTint } from '../engine/palette.ts';
import { bigHeart, burstSprite } from './alert-fx.ts';
import { FONT, berrySprite, paintFace } from './paint.ts';
import { fanOf, game } from './state.ts';

const GREEN = berryTint(null);
const PETALS = 9;

function petal(angle: number, len: number, wide: number, shade: number): void {
  const c = ctx;
  c.save();
  c.rotate(angle);
  const g = c.createLinearGradient(0, 0, 0, -len);
  g.addColorStop(
    0,
    `rgb(${String(200 - shade)},${String(84 - shade / 2)},${String(110 - shade / 2)})`,
  );
  g.addColorStop(1, '#f6b8c4');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(wide, -len * 0.35, wide * 0.8, -len * 0.95, 0, -len);
  c.bezierCurveTo(-wide * 0.8, -len * 0.95, -wide, -len * 0.35, 0, 0);
  c.fill();
  c.strokeStyle = 'rgba(255,235,240,0.35)';
  c.lineWidth = 1.5;
  c.stroke();
  c.restore();
}

function leaf(angle: number, len: number): void {
  const c = ctx;
  c.save();
  c.rotate(angle);
  c.fillStyle = '#4f7a4a';
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.3, 0, 0);
  c.fill();
  c.restore();
}

const easeOutBack = (u: number): number => {
  const x = Math.min(1, Math.max(0, u)) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};
const easeInOut = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/**
 * What the open flower shows beside the giver's photo: a card on each side of it (who gave, what
 * they gave), the plain text of before, or nothing when the tray thanks the gift on the board.
 */
export type FlowerSides = 'cards' | 'text' | 'none';
let flowerWings = true,
  flowerText = false;
export function setFlowerSides(sides: FlowerSides): void {
  flowerWings = sides === 'cards';
  flowerText = sides === 'text';
}

/**
 * What the flower throws when a gift opens it: sparkles, blossoms and beads of light that fan out
 * to both sides in an arc, hang a moment, and drift down as they fade. They never climb much
 * above the flower, where the live's own interface sits.
 */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  kind: 0 | 1 | 2;
  phase: number;
}
let motes: Mote[] = [];
let motesAt = 0;

function spray(n: number, force: number): void {
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1,
      u = Math.random(),
      speed = (260 + 620 * u) * force,
      // Mostly outward, a little upward so each one arcs before it falls.
      lift = (60 + 250 * Math.random()) * force,
      pick = Math.random();
    motes.push({
      x: FLOWER.x + side * (40 + Math.random() * 30),
      y: FLOWER.y + (Math.random() - 0.5) * 50,
      vx: side * speed,
      vy: -lift,
      age: -Math.random() * 0.08,
      life: 0.9 + Math.random() * 0.9,
      size: 20 + Math.random() * 24,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 9,
      kind: pick < 0.45 ? 0 : pick < 0.8 ? 1 : 2,
      phase: Math.random() * 6,
    });
  }
  if (motes.length > 260) motes = motes.slice(-260);
}

let beadSprite: HTMLCanvasElement | null = null;
/** A bead of light in the berries' green, drawn once with its halo. */
function bead(): HTMLCanvasElement {
  if (beadSprite) return beadSprite;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(214,255,203,1)');
    glow.addColorStop(0.22, 'rgba(214,255,203,1)');
    glow.addColorStop(0.3, 'rgba(155,226,138,0.6)');
    glow.addColorStop(1, 'rgba(155,226,138,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 64);
  }
  beadSprite = cv;
  return cv;
}

function paintMotes(t: number): void {
  const dt = Math.min(0.05, Math.max(0, t - motesAt));
  motesAt = t;
  if (!motes.length) return;
  const c = ctx,
    sparkle = burstSprite('join'),
    blossom = burstSprite('share');
  c.save();
  for (const m of motes) {
    m.age += dt;
    if (m.age < 0) continue;
    // Fast out of the flower, then the air holds them and they sink slowly.
    const drag = Math.exp(-dt * 2.6);
    m.vx *= drag;
    m.vy = m.vy * drag + 520 * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt + Math.sin(t * 3 + m.phase) * 14 * dt;
    m.rot += m.spin * dt;
    const u = m.age / m.life,
      born = Math.min(1, m.age / 0.08),
      alpha = born * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45),
      twinkle = m.kind === 0 ? 0.7 + 0.3 * Math.sin(t * 14 + m.phase) : 1,
      sz = m.size * (0.5 + 0.5 * born) * twinkle;
    if (alpha <= 0) continue;
    c.globalAlpha = alpha;
    if (m.kind === 2) {
      const d = sz * 1.5;
      c.drawImage(bead(), m.x - d / 2, m.y - d / 2, d, d);
      continue;
    }
    c.translate(m.x, m.y);
    c.rotate(m.rot);
    c.drawImage(m.kind ? blossom : sparkle, -sz / 2, -sz / 2, sz, sz);
    c.rotate(-m.rot);
    c.translate(-m.x, -m.y);
  }
  c.restore();
  motes = motes.filter((m) => m.age < m.life);
}

const raySprites: (HTMLCanvasElement | undefined)[] = [];
/** The fan of rays behind the flower for a level, drawn once: pink, gold from 30 berries. */
function rays(level: number): HTMLCanvasElement {
  const made = raySprites[level];
  if (made) return made;
  const R = 256,
    n = 12 + 2 * level,
    cv = document.createElement('canvas');
  cv.width = cv.height = R * 2;
  const g = cv.getContext('2d');
  if (g) {
    const tint = level >= 3 ? '242,197,124' : '246,184,196',
      fade = g.createRadialGradient(R, R, R * 0.16, R, R, R);
    fade.addColorStop(0, `rgba(${tint},1)`);
    fade.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = fade;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      g.moveTo(R, R);
      g.arc(R, R, R, a, a + (Math.PI / n) * 0.6);
      g.closePath();
    }
    g.fill();
  }
  raySprites[level] = cv;
  return cv;
}

const CARD_L = 440,
  CARD_H = 108,
  WHO_W = CARD_L - 140,
  COUNT_PAD = 48;

// The cards' text is drawn once per giver and once per count, then stamped each frame: fitting a
// font and stroking large text every frame is what costs, and a streak keeps the cards up long.
let who: { key: string; cv: HTMLCanvasElement } | null = null,
  what: { key: string; cv: HTMLCanvasElement } | null = null;

/** Who gave: the name, large, and their title of the day on its badge. */
function whoSprite(name: string, tag: string, tint: string): HTMLCanvasElement {
  const key = `${name}|${tag}|${tint}`;
  if (who?.key === key) return who.cv;
  const cv = document.createElement('canvas');
  cv.width = WHO_W;
  cv.height = CARD_H;
  const g = cv.getContext('2d');
  if (g) {
    const mid = WHO_W / 2,
      cy = CARD_H / 2;
    let size = 48;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = `800 ${String(size)}px ${FONT}`;
    while (size > 26 && g.measureText(name).width > CARD_L - 170)
      g.font = `800 ${String(--size)}px ${FONT}`;
    g.fillStyle = '#fff';
    g.fillText(name, mid, cy - (tag ? 17 : 0));
    if (tag) {
      g.font = `800 20px ${FONT}`;
      g.letterSpacing = '1.5px';
      const tw = g.measureText(tag).width + 28;
      g.fillStyle = `rgba(${tint},0.16)`;
      g.beginPath();
      g.roundRect(mid - tw / 2, cy + 14, tw, 30, 15);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = `rgba(${tint},0.9)`;
      g.stroke();
      g.fillStyle = `rgb(${tint})`;
      g.fillText(tag, mid + 1, cy + 30);
    }
  }
  who = { key, cv };
  return cv;
}

/** The gold count, outlined, centred on its sprite. */
function countSprite(count: string): HTMLCanvasElement {
  if (what?.key === count) return what.cv;
  const cv = document.createElement('canvas'),
    font = `italic 900 72px ${FONT}`;
  ctx.save();
  ctx.font = font;
  cv.width = Math.ceil(ctx.measureText(count).width) + COUNT_PAD;
  ctx.restore();
  cv.height = 120;
  const g = cv.getContext('2d');
  if (g) {
    g.font = font;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.translate(cv.width / 2, 60);
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(8,12,10,0.9)';
    g.strokeText(count, 0, 0);
    const gold = g.createLinearGradient(0, -36, 0, 36);
    gold.addColorStop(0, '#fff6d8');
    gold.addColorStop(0.5, '#f2c57c');
    gold.addColorStop(1, '#e08a3c');
    g.fillStyle = gold;
    g.fillText(count, 0, 0);
  }
  what = { key: count, cv };
  return cv;
}

const CARD_M = 12;
const cardSprites: (HTMLCanvasElement | undefined)[] = [];
/** One card for a level, opening to the right: dark body, lit edge, its glow from 5 berries. */
function cardSprite(level: number): HTMLCanvasElement {
  const made = cardSprites[level];
  if (made) return made;
  const cv = document.createElement('canvas');
  cv.width = CARD_L + CARD_M * 2;
  cv.height = CARD_H + CARD_M * 2;
  const g = cv.getContext('2d');
  if (g) {
    const tint = level >= 3 ? '242,197,124' : '246,184,196';
    g.translate(CARD_M, CARD_M);
    const body = g.createLinearGradient(0, 0, CARD_L, 0);
    body.addColorStop(0, 'rgba(10,16,12,0.94)');
    body.addColorStop(0.68, 'rgba(10,16,12,0.8)');
    body.addColorStop(1, 'rgba(10,16,12,0)');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(0, 0, CARD_L, CARD_H, CARD_H / 2);
    g.fill();
    const edge = g.createLinearGradient(0, 0, CARD_L * 0.85, 0);
    edge.addColorStop(0, `rgba(${tint},0.95)`);
    edge.addColorStop(1, `rgba(${tint},0)`);
    g.strokeStyle = edge;
    if (level) {
      g.globalAlpha = Math.min(0.5, 0.1 * level);
      g.lineWidth = 12;
      g.stroke();
      g.globalAlpha = 1;
    }
    g.lineWidth = 3 + 0.5 * level;
    g.stroke();
  }
  cardSprites[level] = cv;
  return cv;
}

let seenPour = -1,
  seenTotal = 0,
  bumpAt = -9,
  openAt = -9;

/**
 * The flower's cards: the gift tray's row opened in two around the flower. Left, who gave and
 * their title of the day; right, the berry and the gold count, which punches at each step of a
 * streak. Rays turn behind the flower and it throws particles to both sides. Glows are wide soft
 * strokes, never blurred shadows: this is on screen for as long as gifts keep coming.
 */
function paintWings(
  pour: {
    id: number;
    nickname: string;
    total: number;
    title: string;
    carried?: boolean;
    life?: boolean;
  },
  t: number,
): void {
  const c = ctx;
  if (pour.id !== seenPour) {
    seenPour = pour.id;
    seenTotal = pour.total;
    openAt = t;
    bumpAt = -9;
    spray(18 + 9 * levelOf(pour.total), 1);
  } else if (pour.total !== seenTotal) {
    seenTotal = pour.total;
    bumpAt = t;
    spray(7 + 3 * levelOf(pour.total), 0.75);
  }
  const since = t - openAt,
    shut = 1 - easeInOut(game.closeT / 0.5),
    punch = Math.max(0, 1 - (t - bumpAt) / 0.35),
    // Out fast, a little too far, and back.
    reach = easeOutBack(since / 0.42) * shut,
    L = CARD_L;
  if (reach <= 0.02) return;
  c.save();
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  // How grand it gets: one berry already gets rays, a ring and a burst of petals; the more is
  // given, the more is added and the further it reaches.
  const level = levelOf(pour.total),
    amp = Math.min(1, Math.log10(Math.max(1, pour.total)) / 2),
    spark0 = burstSprite('join');
  // Rays turning behind the flower: a flash for a single berry, a standing sun for a big gift.
  const rayA = (0.55 * Math.max(0, 1 - since / 1.3) + 0.3 * amp + 0.4 * punch) * shut;
  if (rayA > 0.01) {
    const far = 210 + 150 * amp + 40 * punch;
    c.save();
    c.translate(FLOWER.x, FLOWER.y);
    c.rotate(t * 0.35);
    c.globalAlpha = Math.min(0.6, rayA * 0.7);
    c.drawImage(rays(level), -far, -far, far * 2, far * 2);
    c.restore();
  }
  c.globalAlpha = 1;
  // The gift tray's own row, opened in two around the flower: the same dark rounded card, lit
  // edge, sheen and gold count as under the board. Left, who gave, large; right, what they gave.
  const tint = level >= 3 ? '242,197,124' : '246,184,196',
    out = easeOutBack(since / 0.45),
    H = CARD_H,
    y0 = FLOWER.y - H / 2,
    name = pour.nickname.length > 14 ? pour.nickname.slice(0, 13) + '…' : pour.nickname,
    tag = pour.carried ? tr('feed.carried') : (pour.title.split(' · ')[0] ?? ''),
    count = `×${String(pour.total)}`;
  for (const side of [-1, 1]) {
    const len = L * Math.min(1.03, out),
      inner = FLOWER.x + side * 30,
      x = (d: number): number => inner + side * d,
      left = Math.min(x(0), x(len));
    if (len < 8) continue;
    c.globalAlpha = shut;
    // The card: dark by the flower, fading out at its far end. While it opens, only its near
    // part is stamped; the far end is see-through anyway.
    const card = cardSprite(level),
      shown = Math.min(L, len) + CARD_M;
    if (side > 0)
      c.drawImage(card, 0, 0, shown, card.height, inner - CARD_M, y0 - CARD_M, shown, card.height);
    else {
      c.save();
      c.translate(inner + CARD_M, 0);
      c.scale(-1, 1);
      c.drawImage(card, 0, 0, shown, card.height, 0, y0 - CARD_M, shown, card.height);
      c.restore();
    }
    c.beginPath();
    c.roundRect(left, y0, len, H, H / 2);
    if (punch > 0) {
      // The edge flares at each step of a streak.
      const edge = c.createLinearGradient(x(0), 0, x(L * 0.85), 0);
      edge.addColorStop(0, `rgba(${tint},0.95)`);
      edge.addColorStop(1, `rgba(${tint},0)`);
      c.strokeStyle = edge;
      c.globalAlpha = shut * 0.3 * punch;
      c.lineWidth = 12 + 10 * punch;
      c.stroke();
      c.globalAlpha = shut;
    }
    c.save();
    // The sheen: once as the card lands, again at each step of a streak.
    const sheens = [(since - 0.2) / 0.6, (t - bumpAt) / 0.5].filter((q) => q > 0 && q < 1);
    if (sheens.length) c.clip();
    for (const q of sheens) {
      const sx = x(q * L),
        sheen = c.createLinearGradient(sx - 90, 0, sx + 90, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sheen;
      c.fillRect(sx - 90, y0, 180, H);
    }
    const ink = Math.max(0, Math.min(1, (since - 0.18) / 0.22)),
      mid = x(96 + (L - 150) / 2);
    c.globalAlpha = shut * ink;
    if (side < 0) {
      const who = whoSprite(name, tag, tint);
      c.drawImage(who, mid - WHO_W / 2, y0);
    } else {
      // What: the berry and the gold count, as on the tray.
      const bs = 156 * (1 + 0.18 * punch),
        what = countSprite(count),
        cw = what.width - COUNT_PAD,
        from = mid - (cw + 96) / 2,
        k = 1 + 0.42 * punch;
      c.drawImage(
        // Snake Arena's life gift shows the like heart where a gift shows its berry.
        pour.life ? bigHeart(true) : berrySprite(0, pour.nickname),
        from + 38 - bs / 2,
        FLOWER.y - bs / 2 + Math.sin(t * 5) * 3,
        bs,
        bs,
      );
      c.save();
      c.translate(from + 96 + cw / 2, FLOWER.y + 2);
      c.rotate(-0.06);
      if (punch > 0) {
        // A wider, fainter copy behind it while it punches.
        const e = k * 1.14;
        c.globalAlpha = shut * ink * 0.35 * punch;
        c.drawImage(
          what,
          (-what.width / 2) * e,
          (-what.height / 2) * e,
          what.width * e,
          what.height * e,
        );
        c.globalAlpha = shut * ink;
      }
      c.drawImage(
        what,
        (-what.width / 2) * k,
        (-what.height / 2) * k,
        what.width * k,
        what.height * k,
      );
      c.restore();
    }
    c.restore();
    // Sparks thrown by the punch, around the count and at the far end of each card.
    if (punch > 0)
      for (let n = 0; n < 7; n++) {
        const a = n * 0.9 + pour.total,
          d = 40 + (1 - punch) * 90,
          sz = 30 * punch;
        c.globalAlpha = punch * shut;
        c.drawImage(
          spark0,
          x(L - 90) + Math.cos(a) * d - sz / 2,
          FLOWER.y + Math.sin(a) * d * 0.6 - sz / 2,
          sz,
          sz,
        );
      }
  }
  c.restore();
}

/** 0 for a berry, then 5, 10, 30 and 100 berries each add a layer to the flower's show. */
const levelOf = (total: number): number =>
  total >= 100 ? 4 : total >= 30 ? 3 : total >= 10 ? 2 : total >= 5 ? 1 : 0;

export function paintFlower(t: number): void {
  paintFlowerBody(t);
  paintMotes(t);
}

function paintFlowerBody(t: number): void {
  const c = ctx,
    pour = game.pour,
    shut = easeInOut(game.closeT / 0.7);
  // Each petal opens a beat after the previous one, with a soft spring; all close together.
  const openness = (i: number): number =>
    pour ? easeOutBack((game.pourT - i * 0.035) / 0.6) * (1 - shut) : 0;
  const open = openness(PETALS / 2),
    squeeze = 1 + 0.07 * Math.exp(-game.dripT * 14) * open,
    sway = 0.035 * Math.sin(t * 1.3);
  if (flowerWings && pour) paintWings(pour, t);
  c.save();
  c.translate(FLOWER.x, FLOWER.y);
  c.rotate(sway);
  c.scale(squeeze, squeeze);
  // Glow behind, stronger while it pours.
  const halo = c.createRadialGradient(0, 0, 10, 0, 0, 160);
  halo.addColorStop(0, `rgba(246,184,196,${String(0.16 + 0.32 * open)})`);
  halo.addColorStop(1, 'rgba(246,184,196,0)');
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, 160, 0, Math.PI * 2);
  c.fill();
  leaf(0.35 + 0.05 * Math.sin(t * 1.7), 110);
  leaf(Math.PI - 0.35 - 0.05 * Math.sin(t * 1.7 + 1), 110);
  // A bigger gift opens more rings of petals behind the usual two.
  const rings = flowerWings && pour ? Math.min(2, Math.floor(levelOf(pour.total) / 2)) : 0;
  for (let ring = rings; ring >= 1; ring--)
    for (let i = 0; i < PETALS + 3 * ring; i++) {
      const o = openness(i % PETALS),
        a = (i / (PETALS + 3 * ring)) * Math.PI * 2 + ring * 0.3 + 0.04 * Math.sin(t * 1.5 + i);
      if (o > 0.02) petal(a, (104 + 7 * ring) * o * (1 + 0.03 * Math.sin(t * 2 + i)), 30, 70);
    }
  // Petals: bunched upward as a bud, fanned all around when open, each breathing on its own.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < PETALS; i++) {
      const o = openness(i),
        k = i - (PETALS - 1) / 2,
        closedA = k * 0.15,
        openA = (i / PETALS) * Math.PI * 2 + (pass ? Math.PI / PETALS : 0),
        flutter = 0.03 * Math.sin(t * 2.4 + i * 0.9);
      const a = closedA + (openA - closedA) * o + flutter,
        len = (58 + 44 * o) * (1 + 0.025 * Math.sin(t * 2 + i)) * (pass ? 0.78 : 1),
        wide = 24 + 14 * o;
      petal(a, len, wide, pass ? 0 : 40);
    }
  c.restore();
  if (pour && open > 0.05) {
    const pop = easeOutBack(game.pourT / 0.45);
    c.save();
    c.globalAlpha = Math.min(1, open * 1.4);
    if (flowerWings) {
      // A soft ring of light behind the photo.
      const r = 58 * pop * squeeze;
      c.strokeStyle = levelOf(pour.total) >= 3 ? 'rgba(242,197,124,0.3)' : 'rgba(246,184,196,0.3)';
      for (const w of [22, 12]) {
        c.lineWidth = w;
        c.beginPath();
        c.arc(FLOWER.x, FLOWER.y, r, 0, Math.PI * 2);
        c.stroke();
      }
    }
    paintFace(
      fanOf(pour.nickname) ?? pour,
      FLOWER.x,
      FLOWER.y,
      (flowerWings ? 58 : 50) * pop * squeeze,
      flowerWings && levelOf(pour.total) < 3 ? '#f6b8c4' : GOLD,
    );
    if (flowerWings) {
      c.restore();
      return;
    }
    // The text counts berries: a life gift (Snake Arena) shows its giver's picture alone.
    if (!flowerText || pour.life) {
      c.restore();
      return;
    }
    // Left: who. Right: how much. They slide out from behind the flower.
    const slide = 40 * (1 - Math.min(1, open));
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    c.fillStyle = '#fff';
    c.font = `900 32px ${FONT}`;
    c.lineWidth = 7;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,20,15,0.8)';
    const name = pour.nickname.length > 14 ? pour.nickname.slice(0, 13) + '…' : pour.nickname,
      lx = FLOWER.x - 118 + slide,
      rx = FLOWER.x + 118 - slide;
    c.strokeText(name, lx, FLOWER.y - 14);
    c.fillText(name, lx, FLOWER.y - 14);
    // Berries owed from the last round say so, so the giver knows they were not lost.
    const tag = pour.carried ? tr('feed.carried') : pour.title;
    if (tag) {
      c.font = `800 17px ${FONT}`;
      const w = c.measureText(tag).width + 26;
      c.fillStyle = 'rgba(12,20,15,0.85)';
      c.beginPath();
      c.roundRect(lx - w, FLOWER.y + 8, w, 30, 15);
      c.fill();
      c.fillStyle = GOLD;
      c.fillText(tag, lx - 13, FLOWER.y + 24);
    }
    c.textAlign = 'left';
    c.font = `900 50px ${FONT}`;
    c.strokeText(`+${String(pour.total)}`, rx, FLOWER.y - 12);
    c.fillStyle = GREEN;
    c.fillText(`+${String(pour.total)}`, rx, FLOWER.y - 12);
    c.font = `800 18px ${FONT}`;
    const unit = tr(pour.total > 1 ? 'feed.berries' : 'feed.berry');
    c.beginPath();
    c.roundRect(rx, FLOWER.y + 18, c.measureText(unit).width + 24, 28, 14);
    c.fillStyle = 'rgba(12,20,15,0.85)';
    c.fill();
    c.fillStyle = GREEN;
    c.fillText(unit, rx + 12, FLOWER.y + 33);
    c.restore();
  } else {
    // The seed waiting in the bud.
    c.save();
    c.fillStyle = GREEN;
    c.shadowColor = 'rgba(155,226,138,0.9)';
    c.shadowBlur = 18;
    c.beginPath();
    c.arc(FLOWER.x, FLOWER.y - 20, 11 + 2 * Math.sin(t * 3), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
