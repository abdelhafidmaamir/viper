// The end of a round: who fed the snake this round, then who has supported the live all along.
// Gifts rank first, likes second, in the look of the supporter entrances (medals, crown, gold
// names on dark glass). Only berries and likes are ever shown, never coins.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { H, W } from '../engine/layout.ts';
import { GOLD } from '../engine/palette.ts';
import { burstSprite } from './alert-fx.ts';
import { FONT, berrySprite, crown, paintFace } from './paint.ts';
import { game, roundHold } from './state.ts';
import { topSupporters } from './supporters.ts';
import { paintBloom } from './welcome.ts';
import { TIER, medal } from './vip.ts';

interface Line {
  readonly nickname: string;
  readonly avatar?: string | undefined;
  readonly berries: number;
  readonly likes: number;
}

/** This round's ranking: berries given first, likes to break a tie and to rank those who only like. */
export function roundRanking(n: number): Line[] {
  const by = new Map<
    string,
    { nickname: string; avatar?: string | undefined; berries: number; likes: number }
  >();
  for (const f of game.fans.values())
    by.set(f.nickname, { nickname: f.nickname, avatar: f.avatar, berries: f.coins, likes: 0 });
  for (const l of game.likes.values()) {
    const line = by.get(l.nickname);
    if (line) {
      line.likes = l.likes;
      line.avatar ??= l.avatar;
    } else
      by.set(l.nickname, { nickname: l.nickname, avatar: l.avatar, berries: 0, likes: l.likes });
  }
  return [...by.values()]
    .filter((l) => l.berries > 0 || l.likes > 0)
    .sort((a, b) => b.berries - a.berries || b.likes - a.likes)
    .slice(0, n);
}

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
const easeOutBack = (v: number): number => {
  const x = Math.max(0, Math.min(1, v)) - 1;
  return 1 + 2.7 * x * x * x + 1.7 * x * x;
};
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const num = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ');

const CARD_X = 84,
  CARD_W = W - 168;

function card(y: number, h: number, alpha: number): void {
  const c = ctx;
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = 'rgba(10,16,12,0.86)';
  c.beginPath();
  c.roundRect(CARD_X, y, CARD_W, h, 28);
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(242,197,124,0.28)';
  c.stroke();
  c.restore();
}

/** Letters spread apart, centred. */
function kicker(text: string, y: number, color: string): void {
  const c = ctx;
  c.font = `800 22px ${FONT}`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.letterSpacing = '6px';
  c.fillText(text, W / 2 + 3, y);
  c.letterSpacing = '0px';
}

/**
 * "🍓 120   ♥ 340" drawn with the game's own berry and heart, `align` telling where x is. Berries
 * come first and brighter: gifts rank first. Returns the width drawn.
 */
function stats(line: Line, x: number, y: number, size: number, align: 'center' | 'right'): number {
  const c = ctx,
    icon = size * 0.95,
    gap = size * 0.3,
    parts: { sprite: HTMLCanvasElement; text: string; color: string }[] = [];
  if (line.berries > 0)
    parts.push({ sprite: berrySprite(0), text: num(line.berries), color: '#fff' });
  if (line.likes > 0)
    parts.push({
      sprite: burstSprite('like'),
      text: num(line.likes),
      color: 'rgba(255,255,255,0.62)',
    });
  c.font = `800 ${String(size)}px ${FONT}`;
  const widths = parts.map((p) => icon + gap + c.measureText(p.text).width),
    // The berry sprite leaves room for its bounce: drawn larger to look the heart's size.
    grow = (p: { sprite: HTMLCanvasElement }): number =>
      p.sprite === parts[0]?.sprite && line.berries > 0 ? 2.5 : 1,
    total = widths.reduce((s, w) => s + w, 0) + Math.max(0, parts.length - 1) * size * 0.9;
  let at = align === 'center' ? x - total / 2 : x - total;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  parts.forEach((p, i) => {
    const s = icon * grow(p);
    c.drawImage(p.sprite, at + icon / 2 - s / 2, y - s / 2, s, s);
    c.fillStyle = p.color;
    c.fillText(p.text, at + icon + gap, y + 1);
    at += (widths[i] ?? 0) + size * 0.9;
  });
  return total;
}

/** One number per person, easy to read on a phone: the berries they gave, or their likes if none. */
function score(line: Line, x: number, y: number, size: number, align: 'center' | 'right'): void {
  stats(line.berries > 0 ? { ...line, likes: 0 } : { ...line, berries: 0 }, x, y, size, align);
}

/** One place on the podium: the photo springs up, medal and crown, the name, what they gave. */
function podium(
  line: Line,
  rank: number,
  x: number,
  y: number,
  R: number,
  age: number,
  t: number,
  /** The Hall of Fame: the berry flower opens around the photo, like an entrance. */
  flower = false,
): void {
  const c = ctx,
    pop = Math.max(0, easeOutBack(age / 0.5)),
    tier = TIER[rank] ?? TIER[0];
  if (!tier || pop <= 0) return;
  const r = R * pop;
  c.save();
  if (flower) paintBloom(x, y, r * 0.8, age, t);
  else {
    // A soft glow in the medal's colour.
    const halo = c.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1);
    halo.addColorStop(0, `rgba(${tier.glow},${String(0.42 * Math.min(1, age * 2))})`);
    halo.addColorStop(1, `rgba(${tier.glow},0)`);
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r * 2.1, 0, Math.PI * 2);
    c.fill();
  }
  c.shadowColor = `rgba(${tier.glow},0.8)`;
  c.shadowBlur = 22;
  paintFace(line, x, y, r, tier.main);
  c.shadowBlur = 0;
  if (rank === 1) crown(x, y - r - 18 + Math.sin(t * 3) * 2, (R / 40) * pop, { x, y, r });
  medal(x + r * 0.72, y + r * 0.72, Math.max(0.5, R * 0.34 * pop), rank, tier.main);
  const k = smooth((age - 0.25) / 0.35);
  c.globalAlpha *= k;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Under the open flower when there is one, its petals reaching past the photo.
  const below = flower ? R * 0.6 : 0,
    size = rank === 1 ? (flower ? 34 : 40) : flower ? 30 : 34;
  c.font = `900 ${String(size)}px ${FONT}`;
  c.lineWidth = 7;
  c.strokeStyle = 'rgba(6,10,8,0.85)';
  const name = clip(line.nickname, rank === 1 ? 13 : 10),
    ny = y + R + below + size * 0.95 + (1 - k) * 10;
  c.strokeText(name, x, ny);
  c.fillStyle = rank === 1 ? GOLD : '#fff';
  c.fillText(name, x, ny);
  score(line, x, ny + size * 1.05, Math.round(size * 0.8), 'center');
  c.restore();
}

/**
 * One of the round's top likers, under the podium: those who cannot give get their moment too.
 * Photo, name and hearts, centred on x.
 */
function likeChip(line: Line, rank: number, x: number, y: number, age: number): void {
  const c = ctx,
    k = smooth(age / 0.35);
  if (k <= 0) return;
  c.save();
  c.globalAlpha *= k;
  c.translate(0, (1 - k) * 12);
  const w = 268,
    h = 136;
  c.fillStyle = 'rgba(255,120,160,0.08)';
  c.beginPath();
  c.roundRect(x - w / 2, y, w, h, 22);
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = rank === 1 ? 'rgba(255,140,175,0.6)' : 'rgba(255,140,175,0.25)';
  c.stroke();
  paintFace(line, x, y + 40, 28, rank === 1 ? '#ff8fab' : 'rgba(255,200,215,0.6)');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#fff';
  c.font = `800 26px ${FONT}`;
  c.fillText(clip(line.nickname, 11), x, y + 88);
  stats(line, x, y + 118, 24, 'center');
  c.restore();
}

/** The round is over: the headline, this round's podium, then the Hall of Fame's flowers. */
export function paintRoundEnd(t: number, carried: number): void {
  const c = ctx,
    a = game.full;
  if (a < 0) return;
  const fade = Math.min(1, a / 0.4) * Math.min(1, (roundHold() - a) / 0.5);
  c.save();
  c.globalAlpha = Math.max(0, fade);
  c.fillStyle = 'rgba(5,9,7,0.82)';
  c.fillRect(0, 0, W, H);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  // Headline.
  const pop = a < 0.35 ? 0.75 + 0.25 * Math.sin((a / 0.35) * (Math.PI / 2)) : 1;
  c.save();
  c.translate(W / 2, 248);
  c.scale(pop, pop);
  c.shadowColor = 'rgba(242,197,124,0.6)';
  c.shadowBlur = 30;
  c.fillStyle = GOLD;
  c.font = `900 60px ${FONT}`;
  c.fillText(tr('feed.filled'), 0, 0);
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.font = `700 26px ${FONT}`;
  c.fillText(
    tr('feed.next', { n: game.eaten, q: String(Math.max(0, Math.ceil(roundHold() - a))) }),
    W / 2,
    298,
  );
  if (carried > 0) {
    c.fillStyle = '#9be28a';
    c.font = `800 22px ${FONT}`;
    c.fillText(tr('feed.carriedNext', { n: carried }), W / 2, 328);
  }

  // This round: the podium, then #4 and #5.
  // This round: the gifters on the podium, then the top likers, each with their own moment.
  const lines = roundRanking(20)
      .filter((l) => l.berries > 0)
      .slice(0, 3),
    likes = [...game.likes.values()]
      .sort((p, q) => q.likes - p.likes)
      .slice(0, 3)
      .map((l) => ({ nickname: l.nickname, avatar: l.avatar, berries: 0, likes: l.likes })),
    y1 = 352;
  card(y1, 600, smooth(a / 0.3));
  kicker(tr('feed.thisRound'), y1 + 40, '#f6b8c4');
  if (!lines.length) {
    c.fillStyle = 'rgba(232,241,220,0.6)';
    c.font = `700 30px ${FONT}`;
    c.fillText(tr('feed.nobody'), W / 2, y1 + 200);
  }
  // The podium rises from third to first, first last.
  const spots: [number, number, number, number][] = [
    [1, W / 2, y1 + 178, 78],
    [2, W / 2 - 300, y1 + 206, 60],
    [3, W / 2 + 300, y1 + 206, 60],
  ];
  for (const [rank, x, y, R] of spots) {
    const line = lines[rank - 1];
    if (line) podium(line, rank, x, y, R, a - (0.2 + (3 - rank) * 0.25), t);
  }
  if (likes.length) {
    c.save();
    c.globalAlpha *= smooth((a - 1.0) / 0.4);
    kicker(tr('feed.topLikes'), y1 + 402, '#ff8fab');
    c.restore();
    // First in the middle, like the podium.
    const at = [W / 2, W / 2 - 290, W / 2 + 290];
    likes.forEach((line, i) => {
      likeChip(line, i + 1, at[i] ?? W / 2, y1 + 428, a - (1.1 + i * 0.12));
    });
  }

  // Hall of Fame: the berry flower opens around the three who have given the most, ever.
  const best = topSupporters(3),
    y2 = y1 + 600 + 18;
  if (best.length) {
    card(y2, 330, smooth((a - 1.3) / 0.4));
    c.save();
    c.globalAlpha *= smooth((a - 1.3) / 0.4);
    kicker(tr('feed.allTime'), y2 + 36, GOLD);
    c.restore();
    const hall: [number, number, number, number][] = [
      [1, W / 2, y2 + 142, 54],
      [2, W / 2 - 300, y2 + 156, 44],
      [3, W / 2 + 300, y2 + 156, 44],
    ];
    for (const [rank, x, y, R] of hall) {
      const s = best[rank - 1];
      if (s) podium(s, rank, x, y, R, a - (1.5 + (3 - rank) * 0.2), t, true);
    }
  }
  c.restore();
}
