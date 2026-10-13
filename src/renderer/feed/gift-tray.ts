// The gift tray: how a gift from someone who has given before is thanked on the board. One row
// per giver in the board's lower left corner, up to three at once: their photo, their name, the
// berry and a gold count that punches up at each step of a streak. Nothing waits in a queue and
// the board stays in view. A row can slide in by itself, or its photo can first come down from
// the flower that pours the berries, so the two read as one gesture.
//
// It only thanks: nothing on a row asks for anything.

import { ctx } from '../engine/canvas.ts';
import { burstSprite } from './alert-fx.ts';
import { alertSounds } from './alerts.ts';
import { BOARD_H, BOARD_W, FLOWER, FX0, FY0 } from './grid.ts';
import { FONT, berrySprite, paintFace } from './paint.ts';
import { titleFor, todayOf } from './state.ts';

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
const easeOutBack = (v: number): number => {
  const x = Math.max(0, Math.min(1, v)) - 1;
  return 1 + 2.7 * x * x * x + 1.7 * x * x;
};

/** The gift tray: one row per giver, several at once, in the board's lower left. */
interface Chip {
  nickname: string;
  avatar: string | undefined;
  berries: number;
  age: number;
  /** When the count last went up, on the row's own clock. */
  bumped: number;
  /** Where the row sits, eased towards its slot so rows glide when one leaves. */
  slot: number;
  /** Their title of the day as last drawn, and when it changed. */
  title?: string;
  titleAt?: number;
}
const chips: Chip[] = [];
const CHIP_STAY = 5,
  ROW_H = 104,
  ROW_GAP = 14;

/** The rows' colour: the berry flower's pink. */
const TINT = '246,184,196';

/** Where a tray row sits: stacked up from the board's lower left corner. */
const rowY = (chip: Chip): number =>
  FY0 +
  BOARD_H -
  26 -
  ROW_H -
  chip.slot * (ROW_H + ROW_GAP) -
  smooth((chip.age - (CHIP_STAY - 0.45)) / 0.45) * 30;

function paintChips(t: number): void {
  const c = ctx;
  c.save();
  c.beginPath();
  c.roundRect(FX0, FY0, BOARD_W, BOARD_H, 18);
  c.clip();
  c.textBaseline = 'middle';
  chips.forEach((chip) => {
    // Still on its way down from the flower.
    if (chip.age < 0) return;
    const inn = trayFly ? 1 : easeOutBack(chip.age / 0.45),
      out = smooth((chip.age - (CHIP_STAY - 0.45)) / 0.45),
      since = chip.age - chip.bumped,
      punch = chip.bumped < 0 ? 0 : Math.max(0, 1 - since / 0.3),
      r = ROW_H / 2 - 8,
      name = chip.nickname.length > 15 ? chip.nickname.slice(0, 14) + '…' : chip.nickname,
      count = `×${String(chip.berries)}`,
      tint = TINT,
      w = 640,
      x = FX0 + 18 - (1 - inn) * (w + 40),
      y = rowY(chip);
    c.save();
    c.globalAlpha = (1 - out) * (trayFly ? 1 : Math.min(1, chip.age / 0.15));
    if (trayFly) {
      // The row unrolls from the photo that just landed, and a ring spreads from the landing.
      const open = easeOutBack(chip.age / 0.45),
        ring = chip.age / 0.5;
      if (ring < 1) {
        c.strokeStyle = `rgba(${tint},${String(0.9 * (1 - ring))})`;
        c.lineWidth = 6 * (1 - ring);
        c.beginPath();
        c.arc(x + 8 + r, y + ROW_H / 2, r + ring * 110, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.rect(x - 30, y - 70, 30 + ROW_H + (w - ROW_H) * Math.min(1.05, open), ROW_H + 140);
      c.clip();
    }
    // The row: dark on the left where the text sits, fading out to the right.
    const body = c.createLinearGradient(x, 0, x + w, 0);
    body.addColorStop(0, 'rgba(10,16,12,0.94)');
    body.addColorStop(0.62, 'rgba(10,16,12,0.78)');
    body.addColorStop(1, 'rgba(10,16,12,0)');
    c.fillStyle = body;
    c.beginPath();
    c.roundRect(x, y, w, ROW_H, ROW_H / 2);
    c.fill();
    // A lit edge along the top left, in the giver's colour.
    const edge = c.createLinearGradient(x, 0, x + w * 0.7, 0);
    edge.addColorStop(0, `rgba(${tint},0.95)`);
    edge.addColorStop(1, `rgba(${tint},0)`);
    c.strokeStyle = edge;
    c.lineWidth = 3;
    c.stroke();
    // A sheen that crosses the row once as it lands.
    const sweep = (chip.age - 0.25) / 0.6;
    if (sweep > 0 && sweep < 1) {
      c.save();
      c.clip();
      const sx = x + sweep * w,
        sheen = c.createLinearGradient(sx - 90, 0, sx + 90, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sheen;
      c.fillRect(sx - 90, y, 180, ROW_H);
      c.restore();
    }
    // The photo in a glowing ring.
    const ax = x + 8 + r,
      ay = y + ROW_H / 2;
    c.shadowColor = `rgba(${tint},0.9)`;
    c.shadowBlur = 18 + 14 * punch;
    paintFace(chip, ax, ay, r, `rgb(${tint})`);
    c.shadowBlur = 0;
    // Who, and what they did.
    c.textAlign = 'left';
    const tx = ax + r + 20;
    c.font = `800 36px ${FONT}`;
    c.fillStyle = '#fff';
    c.fillText(name, tx, ay - 18);
    if (trayTitles) {
      // Their title of the day on a badge; it flashes gold the moment a gift earns a new one.
      const title = titleFor(todayOf(chip.nickname)).split(' · ')[0] ?? '';
      if (chip.title !== undefined && chip.title !== title) chip.titleAt = chip.age;
      chip.title = title;
      const flash =
          chip.titleAt === undefined ? 0 : Math.max(0, 1 - (chip.age - chip.titleAt) / 1.4),
        label = flash > 0 ? `NEW TITLE · ${title}` : title;
      c.font = `800 20px ${FONT}`;
      c.letterSpacing = '1.5px';
      const lw = c.measureText(label).width + 28,
        ly = ay + 9,
        grow = 1 + 0.12 * Math.sin(flash * Math.PI) * flash;
      c.save();
      c.translate(tx + lw / 2, ly + 15);
      c.scale(grow, grow);
      c.beginPath();
      c.roundRect(-lw / 2, -15, lw, 30, 15);
      c.fillStyle =
        flash > 0 ? `rgba(242,197,124,${String(0.35 + 0.65 * flash)})` : `rgba(${tint},0.16)`;
      c.shadowColor = 'rgba(242,197,124,0.9)';
      c.shadowBlur = 24 * flash;
      c.fill();
      c.shadowBlur = 0;
      c.lineWidth = 1.5;
      c.strokeStyle = `rgba(${flash > 0 ? '242,197,124' : tint},0.9)`;
      c.stroke();
      c.fillStyle = flash > 0.4 ? '#1d1408' : `rgb(${tint})`;
      c.fillText(label, -lw / 2 + 14, 1);
      c.restore();
      c.letterSpacing = '0px';
    } else {
      c.font = `700 23px ${FONT}`;
      c.fillStyle = `rgb(${tint})`;
      c.letterSpacing = '1px';
      c.fillText('feeds the snake', tx, ay + 22);
      c.letterSpacing = '0px';
    }
    // The berry, then the count that punches up at every step of a streak.
    const bx = x + 392,
      bob = Math.sin(t * 5 + chip.slot) * 3,
      bs = 156 * (1 + 0.18 * punch);
    c.drawImage(berrySprite(0, chip.nickname), bx - bs / 2, ay - bs / 2 + bob, bs, bs);
    const k = 1 + 0.42 * punch;
    c.save();
    c.translate(bx + 52, ay + 2);
    c.rotate(-0.06);
    c.scale(k, k);
    c.font = `italic 900 70px ${FONT}`;
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(8,12,10,0.9)';
    c.strokeText(count, 0, 0);
    const gold = c.createLinearGradient(0, -34, 0, 34);
    gold.addColorStop(0, '#fff6d8');
    gold.addColorStop(0.5, '#f2c57c');
    gold.addColorStop(1, '#e08a3c');
    c.fillStyle = gold;
    c.shadowColor = 'rgba(242,197,124,0.9)';
    c.shadowBlur = 26 * punch;
    c.fillText(count, 0, 0);
    c.restore();
    // Sparks thrown by the punch.
    if (punch > 0) {
      const spark = burstSprite('join');
      for (let n = 0; n < 6; n++) {
        const a = n * 1.05 + chip.berries,
          d = 46 + (1 - punch) * 70,
          sz = 26 * punch;
        c.drawImage(
          spark,
          bx + 100 + Math.cos(a) * d - sz / 2,
          ay + Math.sin(a) * d * 0.7 - sz / 2,
          sz,
          sz,
        );
      }
    }
    c.restore();
  });
  c.restore();
  if (trayFly) paintFlights();
}

/** How a row's photo gets from the flower that pours its berries down to its row. */
export type TrayFly = '' | 'arc' | 'comet' | 'portal' | 'carry';
let trayFly: TrayFly = '',
  trayTitles = false;

/** The control room's choice: how rows arrive, and whether they show the title of the day. */
export function setTray(fly: TrayFly, titles: boolean): void {
  trayFly = fly;
  trayTitles = titles;
}

/** Seconds the way down takes. */
const flyTime = (): number =>
  trayFly === 'comet' ? 0.3 : trayFly === 'portal' ? 0.55 : trayFly === 'carry' ? 1 : 0.6;

/** The way down from the flower, one look per mode. */
function paintFlights(): void {
  const c = ctx,
    petal = burstSprite('share'),
    r = ROW_H / 2 - 8,
    time = flyTime();
  c.save();
  for (const chip of chips) {
    // A comet's flash and the butterflies linger a moment after the landing.
    if (chip.age >= 0.7) continue;
    const u = Math.min(1, 1 + chip.age / time),
      after = Math.max(0, chip.age),
      flying = chip.age < 0,
      tint = TINT,
      tx = FX0 + 26 + r,
      ty = rowY(chip) + ROW_H / 2;
    c.globalAlpha = 1;
    if (trayFly === 'comet') {
      // A streak of light, fast: it leaves the flower and hits the row in a flash.
      const pos = (v: number): [number, number] => {
        const e = Math.max(0, Math.min(1, v)) ** 1.6;
        return [FLOWER.x + (tx - FLOWER.x) * e, FLOWER.y + (ty - FLOWER.y) * e];
      };
      if (flying) {
        const [hx, hy] = pos(u),
          [bx, by] = pos(u - 0.45);
        c.lineCap = 'round';
        for (const [width, alpha, colour] of [
          [34, 0.35, tint],
          [16, 0.7, tint],
          [6, 1, '255,255,255'],
        ] as const) {
          const g = c.createLinearGradient(bx, by, hx, hy);
          g.addColorStop(0, `rgba(${colour},0)`);
          g.addColorStop(1, `rgba(${colour},${String(alpha)})`);
          c.strokeStyle = g;
          c.lineWidth = width;
          c.beginPath();
          c.moveTo(bx, by);
          c.lineTo(hx, hy);
          c.stroke();
        }
        c.fillStyle = '#fff';
        c.shadowColor = `rgba(${tint},1)`;
        c.shadowBlur = 40;
        c.beginPath();
        c.arc(hx, hy, 16, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
      } else if (after < 0.45) {
        // The hit: a white flash, and sparks thrown out along the row.
        const q = after / 0.45,
          flash = c.createRadialGradient(tx, ty, 0, tx, ty, 60 + 240 * q);
        flash.addColorStop(0, `rgba(255,255,255,${String(0.9 * (1 - q))})`);
        flash.addColorStop(0.4, `rgba(${tint},${String(0.5 * (1 - q))})`);
        flash.addColorStop(1, `rgba(${tint},0)`);
        c.fillStyle = flash;
        c.fillRect(tx - 320, ty - 320, 640, 640);
        const spark = burstSprite('join');
        for (let n = 0; n < 12; n++) {
          const ang = (n / 12) * Math.PI * 2 + 0.3,
            d = 50 + 230 * (1 - (1 - q) ** 2),
            sz = 40 * (1 - q);
          c.globalAlpha = 1 - q;
          c.drawImage(
            spark,
            tx + Math.cos(ang) * d - sz / 2,
            ty + Math.sin(ang) * d * 0.6 - sz / 2,
            sz,
            sz,
          );
        }
      }
    } else if (trayFly === 'portal') {
      // The photo is drawn into a ring at the flower and comes out of a twin ring on the row.
      if (!flying) continue;
      const gate = (x: number, y: number, size: number, alpha: number, spin: number): void => {
        c.globalAlpha = alpha;
        c.strokeStyle = `rgb(${tint})`;
        c.shadowColor = `rgba(${tint},1)`;
        c.shadowBlur = 26;
        c.lineWidth = 7;
        c.setLineDash([26, 16]);
        c.lineDashOffset = spin;
        c.beginPath();
        c.arc(x, y, Math.max(1, size), 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(x, y, Math.max(1, size * 0.78), 0, Math.PI * 2);
        c.stroke();
        c.shadowBlur = 0;
      };
      const inn = Math.min(1, u / 0.5),
        outU = Math.max(0, (u - 0.4) / 0.6);
      // A thread of dots between the two gates.
      c.fillStyle = `rgb(${tint})`;
      for (let n = 1; n < 14; n++) {
        const v = n / 14,
          lit = Math.max(0, 1 - Math.abs(v - u) * 4);
        c.globalAlpha = 0.15 + 0.85 * lit;
        c.beginPath();
        c.arc(
          FLOWER.x + (tx - FLOWER.x) * v,
          FLOWER.y + (ty - FLOWER.y) * v,
          3 + 5 * lit,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      gate(FLOWER.x, FLOWER.y, 74 * (1 - 0.6 * inn), 1 - smooth((u - 0.5) / 0.3), u * 260);
      if (inn < 1) {
        c.globalAlpha = 1 - inn;
        c.save();
        c.translate(FLOWER.x, FLOWER.y);
        c.rotate(inn * 5);
        paintFace(chip, 0, 0, 50 * (1 - inn), `rgb(${tint})`);
        c.restore();
      }
      if (outU > 0) {
        const grow = easeOutBack(outU);
        gate(tx, ty, (r + 16) * grow, 1, -u * 260);
        c.globalAlpha = Math.min(1, outU * 2);
        c.save();
        c.translate(tx, ty);
        c.rotate((1 - outU) * -4);
        paintFace(chip, 0, 0, r * grow, `rgb(${tint})`);
        c.restore();
      }
    } else if (trayFly === 'carry') {
      // Two butterflies lift the photo out of the flower, carry it down on threads, set it on
      // its row and fly off.
      const wing = burstSprite('follow'),
        butterfly = (x: number, y: number, size: number, beat: number, lean: number): void => {
          const flap = 0.3 + 0.7 * Math.abs(Math.sin(beat));
          c.save();
          c.translate(x, y);
          c.rotate(lean);
          c.drawImage(wing, -size * flap, -size, size * 2 * flap, size * 2);
          c.restore();
        };
      if (flying) {
        const e = smooth(u),
          x = FLOWER.x + (tx - FLOWER.x) * e + Math.sin(u * Math.PI * 2) * 110 * (1 - e),
          lift = Math.sin(Math.min(1, u * 4) * Math.PI) * 26,
          y = FLOWER.y + (ty - FLOWER.y) * e - lift + Math.sin(u * 14) * 7,
          swing = Math.sin(u * 11) * 0.16 * (1 - e * 0.6),
          size = 50 + (r - 50) * e,
          hang = 96;
        // The photo swings under the two of them.
        const px = x + Math.sin(swing) * hang,
          py = y + Math.cos(swing) * hang - hang;
        c.globalAlpha = Math.min(1, u * 6);
        c.strokeStyle = 'rgba(255,255,255,0.75)';
        c.lineWidth = 2.5;
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(x + side * 46, y - hang - 6);
          c.lineTo(px + side * size * 0.6, py - size * 0.7);
          c.stroke();
        }
        c.shadowColor = `rgba(${tint},1)`;
        c.shadowBlur = 26;
        paintFace(chip, px, py, size, `rgb(${tint})`);
        c.shadowBlur = 0;
        butterfly(x - 46, y - hang - 22, 60, u * 60, -0.35);
        butterfly(x + 46, y - hang - 22, 60, u * 60 + 1.3, 0.35);
      } else {
        // Their job done, they flutter away, one to each side.
        const q = after / 0.7;
        c.globalAlpha = 1 - smooth((q - 0.4) / 0.6);
        for (const side of [-1, 1]) {
          const bx = tx + side * (46 + 250 * q) + Math.sin(after * 16 + side) * 14,
            by = ty - 110 - 360 * q * q - Math.abs(Math.sin(after * 9)) * 20;
          butterfly(bx, by, 60 - 14 * q, after * 60 + side, side * (0.35 + 0.4 * q));
        }
      }
    } else {
      if (!flying) continue;
      // Out to the left of the flower first, then down onto the row.
      const at = (v: number): [number, number, number] => {
        const e = v * v * (3 - 2 * v),
          mx = tx - 30,
          my = FLOWER.y + 40,
          a = 1 - e;
        return [
          a * a * FLOWER.x + 2 * a * e * mx + e * e * tx,
          a * a * FLOWER.y + 2 * a * e * my + e * e * ty,
          50 + (r - 50) * e,
        ];
      };
      for (let k = 9; k >= 1; k--) {
        const v = u - k * 0.045;
        if (v <= 0) continue;
        const [px, py] = at(v),
          sz = 34 - k * 2.4;
        c.globalAlpha = 0.75 * (1 - k / 10);
        c.translate(px, py);
        c.rotate(k * 0.7 + u * 6);
        c.drawImage(petal, -sz / 2, -sz / 2, sz, sz);
        c.rotate(-(k * 0.7 + u * 6));
        c.translate(-px, -py);
      }
      const [x, y, size] = at(u);
      c.globalAlpha = Math.min(1, u * 5);
      c.shadowColor = `rgba(${tint},1)`;
      c.shadowBlur = 34;
      paintFace(chip, x, y, size * (1 + 0.25 * Math.sin(u * Math.PI)), `rgb(${tint})`);
      c.shadowBlur = 0;
    }
  }
  c.restore();
}

/** A gift from someone who gave before: a new row, or more on the row they already have. */
export function trayGift(nickname: string, avatar: string | undefined, berries: number): void {
  const mine = chips.find((k) => k.nickname === nickname);
  alertSounds.thanks(false);
  if (mine) {
    mine.berries += berries;
    mine.bumped = mine.age;
    // Still there two seconds after the last step of a streak.
    if (mine.age > CHIP_STAY - 2) {
      mine.bumped -= mine.age - (CHIP_STAY - 2);
      mine.age = CHIP_STAY - 2;
    }
    return;
  }
  if (chips.length >= 3) chips.shift();
  chips.push({
    nickname,
    avatar,
    berries,
    age: trayFly ? -flyTime() : 0,
    bumped: -1,
    slot: chips.length,
  });
}

export function updateTray(dt: number): void {
  if (!chips.length) return;
  for (const chip of chips) chip.age += dt;
  for (let k = chips.length - 1; k >= 0; k--)
    if ((chips[k]?.age ?? 0) > CHIP_STAY) chips.splice(k, 1);
  chips.forEach((chip, k) => {
    chip.slot += (k - chip.slot) * Math.min(1, dt * 10);
  });
}

export function paintTray(t: number): void {
  if (chips.length) paintChips(t);
}

/** Clears everything (tests, new session). */
export function resetTray(): void {
  chips.length = 0;
}

/** For tests: the rows on screen. */
export const trayState = (): readonly { nickname: string; berries: number; age: number }[] =>
  chips.map((k) => ({ nickname: k.nickname, berries: k.berries, age: k.age }));
