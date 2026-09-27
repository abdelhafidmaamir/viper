// Gift panels: the effect legend ('complet'), the scrolling columns ('defile') and the effect
// glyphs they share. TikTok LIVE guidelines forbid on-screen prices and permanent calls to
// action, so the columns show effects, not costs, and fade out on a configurable cycle.

import type {
  Body,
  Team,
  GiftFeedbackEntry,
  GiftBanner,
  DuelGift,
  GiftEffect,
  EffectLabel,
} from './types.ts';
import { L } from './layout.ts';
import { ctx } from './canvas.ts';
import { SHADOW, GOLD } from './palette.ts';
import { SHIELD_DURATION, BOOST_DURATION } from './rules.ts';
import { giftBanner, giftFeedback } from './gift-feedback.ts';
import { bodies, settings, t } from '../scripts/game.ts';

// Duel gift legend: one column per team below the counter. Each row shows the TikTok gift image
// (assets/gifts/*.png, transparent background), price in coins, and the in-game effect.
export const DUEL_GIFTS: Record<Team, DuelGift[]> = {
  gold: [
    { img: 'rose-red', price: 1, effect: '+1' },
    { img: 'rose-10', price: 10, effect: 'speed 10s' },
    { img: 'bouquet', price: 20, effect: 'steal 15%' },
    { img: 'bagel', price: 30, effect: 'shield 15s' },
    { img: 'teddy', price: 100, effect: '+1 life' },
  ],
  shadow: [
    { img: 'rose-white', price: 1, effect: '+1' },
    { img: 'dyno', price: 10, effect: 'speed 10s' },
    { img: 'perfume', price: 20, effect: 'steal 15%' },
    { img: 'capybara', price: 30, effect: 'shield 15s' },
    { img: 'hand-heart', price: 100, effect: '+1 life' },
  ],
};

const giftImages: Record<string, HTMLImageElement | null> = {};

function loadGiftImage(imgKey: string): HTMLImageElement | null {
  const cached = giftImages[imgKey];
  if (cached !== undefined) return cached;
  if (typeof Image === 'undefined') {
    giftImages[imgKey] = null;
    return null;
  }
  const img = new Image();
  img.src = 'assets/gifts/' + imgKey + '.png';
  giftImages[imgKey] = img;
  return img;
}

export function paintDuelLegend(): void {
  const c = ctx as CanvasRenderingContext2D | null; // canvas.ts not yet typed; runtime is non-null after bindCanvas()
  if (!c) return;
  // 5 rows of 92 px fit between y=1340 and y=1800; no team label, color identifies the team.
  const Y = L.legY,
    LH = 92,
    IMG = 64,
    CW = 400;
  c.save();
  const mode = settings.giftFeedback;
  (
    [
      ['gold', L.legCxG, GOLD, '242,197,124'],
      ['shadow', L.legCxD, SHADOW, '180,212,222'],
    ] as [Team, number, string, string][]
  ).forEach(([team, cx, tint, rgb]) => {
    const giftList = DUEL_GIFTS[team],
      teamIdx = team === 'gold' ? 0 : 1,
      body: Body | undefined = bodies[teamIdx];
    // G4: donor banner above the column, slides up and fades out.
    const donorBanner: GiftBanner | null = team === 'gold' ? giftBanner[0] : giftBanner[1];
    if (mode === 'G4' && donorBanner !== null && t - donorBanner.t < 2.6) {
      const a = t - donorBanner.t,
        entryFade = Math.min(1, a / 0.35),
        exitFade = a > 2 ? 1 - (a - 2) / 0.6 : 1,
        e2 = 1 - Math.pow(1 - entryFade, 3);
      c.globalAlpha = Math.max(0, e2 * exitFade);
      c.fillStyle = tint;
      c.font = '700 24px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(donorBanner.text, cx, Y - LH / 2 - 16 + (1 - e2) * 18);
      c.globalAlpha = 1;
    }
    giftList.forEach((gift, k) => {
      const y = Y + k * LH;
      // Visual feedback: age of the last gift on this row, and remaining fraction of a timed effect.
      const lineFeedback = (giftFeedback as (GiftFeedbackEntry | undefined)[][])[teamIdx]?.[k],
        age = lineFeedback ? t - lineFeedback.t : 99;
      const remaining = body
        ? k === 1
          ? Math.min(1, (body.boostTime || 0) / BOOST_DURATION)
          : k === 3
            ? Math.min(1, (body.shieldTime || 0) / SHIELD_DURATION)
            : 0
        : 0;
      if (mode === 'G1' && (age < 1.8 || remaining > 0)) {
        const flash = age < 1.8 ? Math.pow(1 - age / 1.8, 1.5) : 0;
        c.fillStyle = `rgba(${rgb},${String(0.3 * flash + (remaining > 0 ? 0.1 + 0.03 * Math.sin(t * 2.4) : 0))})`;
        c.beginPath();
        c.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
        c.fill();
      }
      // card background
      c.fillStyle = 'rgba(6,11,8,0.46)';
      c.beginPath();
      c.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = `rgba(${rgb},0.35)`;
      c.stroke();
      // Gift image. Shadow team mirrors Gold: image and price badge on the right, effect right-aligned.
      const mirrored = team === 'shadow';
      const img = loadGiftImage(gift.img);
      const ix = mirrored ? cx + CW / 2 - 16 - IMG : cx - CW / 2 + 16,
        iy = y - IMG / 2;
      // G2: image pops (scale burst); G3: image hops (vertical bounce).
      const bounce = mode === 'G2' && age < 0.3 ? 1 + 0.18 * Math.sin((age / 0.3) * Math.PI) : 1,
        hop = mode === 'G3' && age < 0.25 ? -9 * Math.sin((age / 0.25) * Math.PI) : 0;
      if (img && img.complete && img.naturalWidth) {
        const d2 = IMG * bounce;
        c.drawImage(img, ix + IMG / 2 - d2 / 2, iy + IMG / 2 - d2 / 2 + hop, d2, d2);
      } else {
        c.fillStyle = `rgba(${rgb},0.25)`;
        c.beginPath();
        c.arc(ix + IMG / 2, y, IMG * 0.38, 0, Math.PI * 2);
        c.fill();
      }
      // Price badge (tinted circle) then effect text, on one line.
      const pcx = mirrored ? ix - 18 - 17 : ix + IMG + 18 + 17; // center of the price badge
      c.fillStyle = tint;
      c.beginPath();
      c.arc(pcx, y, 17, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0c110e';
      c.font = '900 18px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(gift.price), pcx, y + 1);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.font = '700 30px system-ui, sans-serif';
      c.textAlign = mirrored ? 'right' : 'left';
      c.fillText(gift.effect, mirrored ? pcx - 29 : pcx + 29, y + 1);
      c.textAlign = 'left';
      if (mode === 'G1') {
        if (lineFeedback && age < 2.2 && settings.donorNames) {
          c.globalAlpha = age < 1.6 ? 1 : Math.max(0, 1 - (age - 1.6) / 0.6);
          c.fillStyle = tint;
          c.font = '600 19px system-ui, sans-serif';
          c.textAlign = mirrored ? 'left' : 'right';
          c.fillText(
            lineFeedback.nickname,
            mirrored ? cx - CW / 2 + 18 : cx + CW / 2 - 18,
            y - LH / 2 + 24,
          );
          c.globalAlpha = 1;
          c.textAlign = 'left';
        }
        if (remaining > 0) {
          c.strokeStyle = `rgba(${rgb},0.95)`;
          c.lineWidth = 3;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(cx - CW / 2 + 24, y + LH / 2 - 9);
          c.lineTo(cx - CW / 2 + 24 + (CW - 48) * remaining, y + LH / 2 - 9);
          c.stroke();
        }
      }
      if (mode === 'G2' && remaining > 0) {
        c.lineWidth = 4;
        c.lineCap = 'round';
        c.strokeStyle = 'rgba(255,255,255,0.14)';
        c.beginPath();
        c.arc(ix + IMG / 2, y, IMG / 2 + 5, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = tint;
        c.beginPath();
        c.arc(ix + IMG / 2, y, IMG / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
        c.stroke();
      }
      if (mode === 'G3' && lineFeedback && lineFeedback.n > 0) {
        const bx = mirrored ? ix + 6 : ix + IMG - 6,
          by = y - IMG / 2 + 8,
          pop = age < 0.3 ? 1 + 0.35 * Math.sin((age / 0.3) * Math.PI) : 1;
        c.fillStyle = tint;
        c.beginPath();
        c.arc(bx, by, 15 * pop, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#0c110e';
        c.font = '900 17px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText(String(lineFeedback.n), bx, by + 1);
        c.textAlign = 'left';
      }
    });
  });
  c.restore();
}

// Scrolling gift ribbon (Livecade pattern): a horizontal strip at the bottom that scrolls continuously.
// Each entry shows the animated gift image (wiggle) and the effect in full text.
// No prices, no call-to-action verbs: this is a game menu, not a shop display.
export const EFFECT_LABEL: Record<GiftEffect, EffectLabel> = {
  '+1': 'BERRY',
  'speed 10s': 'SPEED',
  'steal 15%': 'STEAL',
  'shield 15s': 'SHIELD',
  '+1 life': 'LIFE',
};

interface GiftTile {
  readonly img: string;
  readonly label: string;
}

const teamTilesCache = new Map<Team, GiftTile[]>();

function getTiles(team: Team): GiftTile[] {
  const cached = teamTilesCache.get(team);
  if (cached !== undefined) return cached;
  const tiles = DUEL_GIFTS[team].map((entry) => ({
    img: entry.img,
    label: EFFECT_LABEL[entry.effect], // Record<GiftEffect, EffectLabel> covers all keys
  }));
  teamTilesCache.set(team, tiles);
  return tiles;
}

// Compact ribbon: a narrow box on one side. The team's gift list scrolls and loops, fading out at both
// edges (rendered on a separate canvas then erased at the extremities). Animated icons (wiggle),
// team-tinted label. No prices.
const ribbonLayers: Partial<Record<Team, HTMLCanvasElement>> = {};

function getRibbonLayer(team: Team, bw: number, bh: number): HTMLCanvasElement | null {
  let oc = ribbonLayers[team] ?? null;
  if (!oc) {
    if (typeof document === 'undefined') return null;
    oc = document.createElement('canvas');
    ribbonLayers[team] = oc;
  }
  if (oc.width !== bw) {
    oc.width = bw;
    oc.height = bh;
  }
  return oc;
}

// Effect glyph in the game's visual language (matching the duel rail: shield, heart, bolt, berry),
// drawn onto a given context. This is the primary element per row; the TikTok gift image is only
// a small secondary badge (the game effect leads, the gift icon confirms it).
export function paintEffectGlyph(
  o: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  s: number,
  rgb: string,
): void {
  o.save();
  o.lineJoin = 'round';
  o.lineCap = 'round';
  if (label === 'SHIELD') {
    o.beginPath();
    o.moveTo(x, y - s);
    o.lineTo(x + s * 0.8, y - s * 0.6);
    o.lineTo(x + s * 0.8, y + s * 0.1);
    o.bezierCurveTo(x + s * 0.8, y + s * 0.7, x, y + s, x, y + s);
    o.bezierCurveTo(x, y + s, x - s * 0.8, y + s * 0.7, x - s * 0.8, y + s * 0.1);
    o.lineTo(x - s * 0.8, y - s * 0.6);
    o.closePath();
    o.fillStyle = `rgba(${rgb},0.92)`;
    o.shadowColor = `rgba(${rgb},0.6)`;
    o.shadowBlur = 10;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
    o.lineWidth = 2.6;
    o.strokeStyle = 'rgba(12,17,14,0.7)';
    o.beginPath();
    o.moveTo(x, y - s * 0.55);
    o.lineTo(x, y + s * 0.5);
    o.moveTo(x - s * 0.45, y - s * 0.1);
    o.lineTo(x + s * 0.45, y - s * 0.1);
    o.stroke();
  } else if (label === 'LIFE') {
    o.beginPath();
    o.moveTo(x, y + s * 0.85);
    o.bezierCurveTo(x - s * 1.15, y - s * 0.05, x - s * 0.6, y - s * 0.95, x, y - s * 0.35);
    o.bezierCurveTo(x + s * 0.6, y - s * 0.95, x + s * 1.15, y - s * 0.05, x, y + s * 0.85);
    o.closePath();
    o.fillStyle = `rgba(${rgb},0.95)`;
    o.shadowColor = `rgba(${rgb},0.7)`;
    o.shadowBlur = 12;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
  } else if (label === 'SPEED') {
    o.beginPath();
    o.moveTo(x - s * 0.05, y - s);
    o.lineTo(x + s * 0.6, y - s);
    o.lineTo(x + s * 0.1, y - s * 0.15);
    o.lineTo(x + s * 0.55, y - s * 0.15);
    o.lineTo(x - s * 0.35, y + s);
    o.lineTo(x - s * 0.05, y + s * 0.12);
    o.lineTo(x - s * 0.6, y + s * 0.12);
    o.closePath();
    o.fillStyle = `rgba(${rgb},0.95)`;
    o.shadowColor = `rgba(${rgb},0.65)`;
    o.shadowBlur = 12;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
  } else if (label === 'BERRY') {
    // Berry: glowing circle in the team's color, like every other effect of that team.
    o.fillStyle = `rgba(${rgb},0.96)`;
    o.shadowColor = `rgba(${rgb},0.8)`;
    o.shadowBlur = 14;
    o.beginPath();
    o.arc(x, y, s * 0.72, 0, Math.PI * 2);
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
    o.fillStyle = 'rgba(255,255,255,0.55)';
    o.beginPath();
    o.arc(x - s * 0.25, y - s * 0.25, s * 0.18, 0, Math.PI * 2);
    o.fill();
  } else if (label === 'STEAL') {
    // A thief's mask: the eye holes are cut out, so the panel shows through them.
    o.fillStyle = `rgba(${rgb},0.95)`;
    o.shadowColor = `rgba(${rgb},0.6)`;
    o.shadowBlur = 10;
    o.beginPath();
    o.moveTo(x - s * 1.05, y - s * 0.2);
    o.quadraticCurveTo(x, y - s * 0.75, x + s * 1.05, y - s * 0.2);
    o.quadraticCurveTo(x + s * 1.1, y + s * 0.55, x + s * 0.45, y + s * 0.45);
    o.quadraticCurveTo(x + s * 0.15, y + s * 0.2, x, y + s * 0.3);
    o.quadraticCurveTo(x - s * 0.15, y + s * 0.2, x - s * 0.45, y + s * 0.45);
    o.quadraticCurveTo(x - s * 1.1, y + s * 0.55, x - s * 1.05, y - s * 0.2);
    o.closePath();
    o.ellipse(x - s * 0.45, y + s * 0.02, s * 0.26, s * 0.17, 0, 0, Math.PI * 2);
    o.ellipse(x + s * 0.45, y + s * 0.02, s * 0.26, s * 0.17, 0, 0, Math.PI * 2);
    o.fill('evenodd');
    o.shadowBlur = 0;
    // The knot's two loose ends, out the side.
    o.strokeStyle = `rgba(${rgb},0.95)`;
    o.lineWidth = 3.5;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(x + s * 1.02, y - s * 0.12);
    o.lineTo(x + s * 1.35, y - s * 0.45);
    o.moveTo(x + s * 1.02, y - s * 0.05);
    o.lineTo(x + s * 1.38, y + s * 0.1);
    o.stroke();
  }
  o.restore();
}

// Vertical ribbon: one team column scrolling up or down. Each entry shows an icon and effect label.
// Spotlight at the vertical center, fade at top and bottom, production-quality card.
function paintGiftRibbon(
  team: Team,
  x0: number,
  y0: number,
  bw: number,
  bh: number,
  rgb: string,
  speed: number,
  direction: number,
): void {
  const c = ctx as CanvasRenderingContext2D | null; // canvas.ts not yet typed; runtime is non-null after bindCanvas()
  if (!c) return;
  const T = getTiles(team),
    n = T.length,
    TH = 132,
    FADE = 64,
    midY = bh / 2,
    icx = 52;
  c.save();
  // Translucent card: game ambience shows through. Soft drop shadow, tinted border.
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 5;
  const pg = c.createLinearGradient(x0, 0, x0 + bw, 0);
  pg.addColorStop(0, 'rgba(14,19,16,0.42)');
  pg.addColorStop(1, 'rgba(8,11,9,0.5)');
  c.fillStyle = pg;
  c.beginPath();
  c.roundRect(x0, y0, bw, bh, 22);
  c.fill();
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  c.lineWidth = 2;
  c.strokeStyle = `rgba(${rgb},0.5)`;
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.beginPath();
  c.roundRect(x0 + 2, y0 + 2, bw - 4, bh - 4, 20);
  c.stroke();
  const oc = getRibbonLayer(team, bw, bh);
  if (oc) {
    const o = oc.getContext('2d');
    if (!o) {
      c.restore();
      return;
    } // getContext returned null; save is balanced by this restore
    o.clearRect(0, 0, bw, bh);
    // Both columns share the same scroll position; the direction>0 side is the vertical mirror of the other:
    // the same effect is centered on both sides at the same moment, while scrolling in opposite directions.
    const scrollBand = n * TH,
      scrollOffset = (((t * speed) % scrollBand) + scrollBand) % scrollBand;
    const firstTile = Math.floor(scrollOffset / TH) - 1;
    o.textAlign = 'left';
    o.textBaseline = 'middle';
    for (let i = firstTile; i * TH - scrollOffset < bh + TH; i++) {
      const itRaw = T[((i % n) + n) % n]; // modular arithmetic always in bounds; n = T.length > 0
      if (!itRaw) continue;
      const it = itRaw,
        cyB = i * TH - scrollOffset + TH / 2,
        cy = direction > 0 ? bh - cyB : cyB;
      if (cy < -TH || cy > bh + TH) continue;
      // Subtle divider between rows.
      const byB = i * TH - scrollOffset,
        by = direction > 0 ? bh - byB : byB;
      o.fillStyle = 'rgba(255,255,255,0.10)';
      o.fillRect(20, by - 0.5, bw - 40, 1);
      // Spotlight at the vertical center: the middle entry animates, others are idle.
      let envelope = 1 - Math.abs(cy - midY) / 95;
      envelope = envelope > 0 ? envelope * envelope * (3 - 2 * envelope) : 0;
      const ang = envelope * 0.17 * Math.sin(t * 9.2),
        sc = 1 + envelope * 0.15;
      if (envelope > 0.04) {
        const r = o.createRadialGradient(icx, cy, 0, icx, cy, 66);
        r.addColorStop(0, `rgba(${rgb},${String(0.22 * envelope)})`);
        r.addColorStop(1, 'rgba(' + rgb + ',0)');
        o.fillStyle = r;
        o.fillRect(icx - 66, cy - 66, 132, 132);
      }
      // Primary element: the effect glyph in the game's visual language (animated at center).
      o.save();
      o.translate(icx, cy);
      o.rotate(ang);
      o.scale(sc, sc);
      paintEffectGlyph(o, it.label, 0, 0, 22, rgb);
      o.restore();
      // Effect label.
      o.shadowColor = 'rgba(0,0,0,0.6)';
      o.shadowBlur = 4;
      o.shadowOffsetY = 2;
      o.fillStyle = `rgba(${rgb},${String(0.9 + 0.1 * envelope)})`;
      o.font = '800 24px system-ui, sans-serif';
      o.fillText(it.label, icx + 36, cy + 1);
      o.shadowColor = 'transparent';
      o.shadowBlur = 0;
      o.shadowOffsetY = 0;
      // TikTok gift as a small badge on the right: secondary, slightly dimmed.
      const img = loadGiftImage(it.img),
        GB = 34,
        gx = bw - 24 - GB / 2;
      o.save();
      o.globalAlpha = 0.88;
      o.shadowColor = 'rgba(0,0,0,0.4)';
      o.shadowBlur = 5;
      o.shadowOffsetY = 2;
      if (img && img.complete && img.naturalWidth)
        o.drawImage(img, gx - GB / 2, cy - GB / 2, GB, GB);
      o.restore();
    }
    // Fade top and bottom: erase the layer content (alpha), the translucent card behind stays intact.
    o.globalCompositeOperation = 'destination-out';
    const gt = o.createLinearGradient(0, 0, 0, FADE);
    gt.addColorStop(0, 'rgba(0,0,0,1)');
    gt.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = gt;
    o.fillRect(0, 0, bw, FADE);
    const gb = o.createLinearGradient(0, bh - FADE, 0, bh);
    gb.addColorStop(0, 'rgba(0,0,0,0)');
    gb.addColorStop(1, 'rgba(0,0,0,1)');
    o.fillStyle = gb;
    o.fillRect(0, bh - FADE, bw, FADE);
    o.globalCompositeOperation = 'source-over';
    c.beginPath();
    c.roundRect(x0, y0, bw, bh, 22);
    c.clip();
    c.drawImage(oc, x0, y0);
  }
  c.restore();
}

// Ribbons are NOT permanent on screen (a permanent panel is a documented TikTok trigger).
// Duration is configurable in the control room: visible for scrollVisible s, hidden for scrollHidden s, looping.
// Soft fade in and out. Independent of incoming gifts (pure timing pattern).
const SCROLL_FADE = 0.7; // s

function scrollAlpha(): number {
  // 0 is a valid hidden duration (always visible): do not treat it as unset.
  const visibleDuration = settings.scrollVisible > 0 ? settings.scrollVisible : 8,
    hiddenDuration = settings.scrollHidden, // settings.scrollHidden: number (always present)
    P = visibleDuration + hiddenDuration,
    ph = t % P;
  if (hiddenDuration <= 0) return 1; // always-visible option (off-live testing)
  const a =
    ph < SCROLL_FADE
      ? ph / SCROLL_FADE
      : ph < visibleDuration - SCROLL_FADE
        ? 1
        : ph < visibleDuration
          ? 1 - (ph - (visibleDuration - SCROLL_FADE)) / SCROLL_FADE
          : 0;
  return Math.max(0, Math.min(1, a));
}

export function paintGiftScroll(): void {
  const c = ctx as CanvasRenderingContext2D | null; // canvas.ts not yet typed; runtime is non-null after bindCanvas()
  if (!c) return;
  const al = scrollAlpha();
  if (al <= 0.01) return;
  // Two tall vertical columns on the right side, below the board (left side stays free).
  const BW = 250,
    BH = 372,
    YB = L.scrollRowY,
    XD = L.scrollRightX,
    XG = L.scrollLeftX;
  c.save();
  c.globalAlpha = al;
  paintGiftRibbon('gold', XG, YB, BW, BH, '242,197,124', 40, -1);
  paintGiftRibbon('shadow', XD, YB, BW, BH, '180,212,222', 40, 1);
  c.restore();
}
