// On-stream announcements: the banner that credits viewers for their plays, the phrasing it
// uses (no mention of gifts or prices, per TikTok LIVE guidelines) and viewer avatars.

import type { Announcement, Body, Point, Round, RoundDonation, Team } from './types.ts';
import { paintEffectGlyph } from './gift-panel.ts';
import { BD_CX, BD_CY, BD_W, CELL, W } from './layout.ts';
import { paintSnakeGlyph } from './scoreboard.ts';
import { ctx } from './canvas.ts';
import { SHADOW, GOLD } from './palette.ts';
import { pointRail } from './frame.ts';
import { getAmbience, bodies, round, settings, t } from '../scripts/game.ts';
import { launchFromBanner } from './fan-rings.ts';
import { tr, type I18nKey } from './i18n.ts';

// ===== Activity banner, top center. One announcement at a time; gifts jump the queue. Same panel
// geometry as the scoreboard legend rows, with the actual miniature snake rendered. Suppressed during
// the ring hold countdown (same screen area). Standalone render.
const announcements: Announcement[] = [];
let currentAnnouncement: Announcement | null = null;
// Likes counted per viewer. A viewer gets a banner from 50 likes; while it is on screen or waiting
// its counter keeps climbing, and a new banner needs another 50 likes after the last one.
export const likesByViewer: Record<string, number> = {};
const likesAtLastBanner: Record<string, number> = {};
const LIKE_BANNER_EVERY = 50;

// Per-stream state (not per-round): viewer thresholds already acknowledged, first gifts, win streaks,
// and current-round donations per viewer (for the end-of-round ranking).
export const VIEWER_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export const seenThresholds: Record<number, number> = {};
export const alreadyDonated: Record<string, unknown> = {};
export let streakTeam: Team | null = null;
export let streakCount = 0;
export const roundDonations: Record<string, RoundDonation> = {};
export const rescueTime: [number, number] = [-9, -9];

export function teamName(c: Team): string {
  return tr(c === 'gold' ? 'team.gold' : 'team.shadow');
}

// Banner copy: multiple variants per event, drawn at random without repeating the same phrasing twice
// in a row. Natural host-voice sentences with the viewer's name highlighted at render time ({name});
// {c} is the viewer's team, {a} the opposing team. No gift framing: the viewer is celebrated for their
// in-game action. EFFECT_ACTIONS = the action performed, conjugated, one entry per effect type (same
// index order as the gift panel).
export const EFFECT_ACTIONS_KEYS: readonly I18nKey[] = [
  'effect.berry',
  'effect.speed',
  'effect.steal',
  'effect.shield',
  'effect.life',
];

/** Returns translated effect action strings (same index order as the gift panel). */
export function effectActions(): readonly string[] {
  return EFFECT_ACTIONS_KEYS.map((k) => tr(k));
}

/** For backward compatibility: returns the English effect action at the given index. */
export const EFFECT_ACTIONS = [
  'drops a berry',
  'fires a speed boost',
  'pulls off a steal',
  'raises a shield',
  'grants an extra life',
];

// Phrase variant counts per key (must stay in sync with i18n dictionaries).
const PHRASE_COUNT: Record<string, number> = {
  join: 3,
  share: 2,
  follow: 2,
  like: 2,
  gift: 3,
  first: 2,
  tier: 2,
  streak: 2,
  rescue: 2,
  rescueWithout: 2,
};

export type PhraseKey =
  | 'join'
  | 'share'
  | 'follow'
  | 'like'
  | 'gift'
  | 'first'
  | 'tier'
  | 'streak'
  | 'rescue'
  | 'rescueWithout';

const lastPhraseIdx: Partial<Record<PhraseKey, number>> = {};

interface PhraseVars {
  n?: number | string;
  c?: string;
  a?: string;
  q?: string;
}

export function phrase(key: PhraseKey, v?: PhraseVars): string {
  const count = PHRASE_COUNT[key] ?? 1;
  let k = Math.floor(Math.random() * count);
  if (count > 1 && k === lastPhraseIdx[key]) k = (k + 1) % count;
  lastPhraseIdx[key] = k;
  const i18nKey = `${key}.${String(k)}` as I18nKey;
  const vars: { name?: string; n?: string | number; q?: string } = {};
  if (v?.n !== undefined) vars.n = v.n;
  if (v?.q !== undefined) vars.q = v.q;
  return tr(i18nKey, vars)
    .replace('{c}', v?.c ?? '')
    .replace('{a}', v?.a ?? '');
}

export function announceRescue(i: number, effectType: string): void {
  // A shield or extra life just prevented a loss.
  const idx = i as 0 | 1;
  if (t - rescueTime[idx] < 4) return;
  rescueTime[idx] = t;
  const team: Team = i === 0 ? 'gold' : 'shadow';
  const typedBodies: (Body | undefined)[] = bodies;
  const body = typedBodies[i];
  const donor = body?.[effectType === 'life' ? 'lifeBy' : 'shieldBy'];
  addAnnouncement({
    kind: 'rescue',
    nickname: donor ?? '',
    text: phrase(donor ? 'rescue' : 'rescueWithout', {
      c: teamName(team),
      q: tr(effectType === 'life' ? 'rescue.extra life' : 'rescue.shield'),
    }),
    avatar: body?.[effectType === 'life' ? 'lifeAvatar' : 'shieldAvatar'],
    team: team,
    effect: effectType === 'life' ? 'LIFE' : 'SHIELD',
    ahead: true,
  });
}

export function announceLikes(nickname: string, avatar: string | undefined, n: number): void {
  const total = (likesByViewer[nickname] ?? 0) + n;
  likesByViewer[nickname] = total;
  const live = [currentAnnouncement, ...announcements].find(
    (a) => a?.kind === 'like' && a.nickname === nickname,
  );
  if (live) {
    live.likes = total;
    likesAtLastBanner[nickname] = total;
    return;
  }
  if (total - (likesAtLastBanner[nickname] ?? 0) < LIKE_BANNER_EVERY) return;
  likesAtLastBanner[nickname] = total;
  addAnnouncement({
    kind: 'like',
    nickname,
    avatar,
    text: phrase('like', { n: '{n}' }),
    likes: total,
  });
}

const BANNER_DURATION = 3.8,
  BANNER_HEIGHT = 96;

// Team win streak, announced from the second consecutive win.
export function announceStreak(team: Team): void {
  if (streakTeam === team) streakCount++;
  else {
    streakTeam = team;
    streakCount = 1;
  }
  if (streakCount >= 2)
    addAnnouncement({
      kind: 'streak',
      nickname: '',
      text: phrase('streak', {
        c: teamName(team),
        a: teamName(team === 'gold' ? 'shadow' : 'gold'),
        n: streakCount,
      }),
      team: team,
      ahead: true,
    });
}

// Donations are counted per round; the end-of-round ranking resets.
export function resetRoundDonations(): void {
  for (const k in roundDonations) Reflect.deleteProperty(roundDonations, k);
}

export function addAnnouncement(a: Announcement): void {
  const s = settings as { banner?: string };
  if (!s.banner || s.banner === 'none') return;
  if (a.kind === 'gift') {
    // A gift shows at once, never after a queue: its photo must leave while its effect lands.
    // The same donor giving again keeps their banner on screen and bumps its counter.
    const cur = currentAnnouncement;
    // One photo per gift in a combo, capped so a huge combo does not flood the board.
    const photos = Math.min(10, Math.max(1, a.n ?? 1));
    if (
      cur?.kind === 'gift' &&
      cur.nickname &&
      cur.nickname === a.nickname &&
      cur.team === a.team
    ) {
      cur.count = (cur.count ?? 1) + photos;
      cur.pending = (cur.pending ?? 0) + photos;
      cur.t0 = t - 0.55; // restart its stay without replaying the entry animation
      return;
    }
    currentAnnouncement = { ...a, count: photos, pending: photos, t0: t };
    return;
  }
  if (a.ahead) {
    let k = announcements.findIndex((q) => q.kind !== 'gift');
    if (k < 0) k = announcements.length;
    announcements.splice(k, 0, a);
  } else announcements.push(a);
  if (announcements.length > 6) announcements.length = 6;
}

// Viewer profile photos (URL from TikFinity): bounded cache, returns the image if loaded or null.
const photos: Record<string, HTMLImageElement> = {};

let photoCount = 0;

export function getProfilePhoto(url: string | undefined): HTMLImageElement | null {
  if (!url || typeof url !== 'string' || !/^(https?:|\/assets\/avatars\/)/.test(url)) return null;
  let im = photos[url];
  if (!im) {
    if (photoCount > 80) {
      for (const k in photos) Reflect.deleteProperty(photos, k);
      photoCount = 0;
    }
    im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.src = url;
    photos[url] = im;
    photoCount++;
  }
  return im.complete && im.naturalWidth ? im : null;
}

// Faces for viewers without a photo URL (the simulated crowd, control-room buttons). Generated
// portraits of people who don't exist, shipped in public/assets/avatars.
const STOCK_FACES = 18;

function stockFace(nickname: string): string {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `/assets/avatars/viewer-${String((Math.abs(h) % STOCK_FACES) + 1).padStart(2, '0')}.jpg`;
}

let blankProfile: HTMLCanvasElement | null = null;

// TikTok's default profile look (grey head and shoulders), shown while a photo loads or if it fails.
function silhouette(): HTMLCanvasElement {
  if (blankProfile) return blankProfile;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = '#d7dadf';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#f5f6f8';
    g.beginPath();
    g.arc(64, 50, 24, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(64, 124, 44, 38, 0, Math.PI, 0);
    g.fill();
  }
  blankProfile = cv;
  return cv;
}

/** Always something to draw: the viewer's photo, else a stock face, never a letter. */
export function getAvatar(url: string | undefined, nickname: string): CanvasImageSource {
  if (url && /^https?:/.test(url)) return getProfilePhoto(url) ?? silhouette();
  return getProfilePhoto(stockFace(nickname)) ?? silhouette();
}

export function paintMiniSnake(pts: Point[], tint: string, scale: number): void {
  const a = getAmbience();
  if (!a?.paintSnake || pts.length < 2) return;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  c.save();
  c.scale(scale, scale);
  a.paintSnake(
    c,
    pts.map((p) => ({ x: p.x / scale, y: p.y / scale })),
    CELL,
    { tint: tint },
  );
  c.restore();
}

// Word-wrapping types used only inside paintBanner / drawPanel.
interface MeasuredToken {
  t: string;
  strong: boolean;
  l: number;
}
type WordGroup = MeasuredToken[] & { l: number; x: number };

function makeWordGroup(): WordGroup {
  return Object.assign([], { l: 0, x: 0 });
}

/** Where the donor's photo sits in the banner; the fan flight starts from exactly there. */
const AVATAR = 64;

export function paintBanner(): void {
  const s = settings as { banner?: string; donorNames?: boolean };
  const mode = s.banner;
  if (!mode || mode === 'none' || !round) return;
  const typedBodies: (Body | undefined)[] = bodies;
  const typedRound: Round = round;
  const holdActive = typedBodies.some(
    (b) => b && (b.hold ?? 0) > 0 && typedRound.state === 'playing',
  );
  if (holdActive) {
    currentAnnouncement = null;
    return;
  }
  if (!currentAnnouncement && announcements.length) {
    currentAnnouncement = announcements.shift() ?? null;
    if (currentAnnouncement) currentAnnouncement.t0 = t;
  }
  const smoothFn = (v: number): number => {
    v = Math.max(0, Math.min(1, v));
    return v * v * v * (v * (6 * v - 15) + 10);
  };
  if (currentAnnouncement && t - (currentAnnouncement.t0 ?? 0) >= BANNER_DURATION)
    currentAnnouncement = null;
  const active = currentAnnouncement,
    age = active ? t - (active.t0 ?? 0) : 0;
  const tint = active?.team ? (active.team === 'gold' ? GOLD : SHADOW) : '#e8f1dc',
    rgb = active?.team ? (active.team === 'gold' ? '242,197,124' : '180,212,222') : '232,241,220';
  const entryFade = active ? smoothFn(age / 0.55) : 0,
    exitFade = active ? smoothFn((age - (BANNER_DURATION - 0.55)) / 0.55) : 0;
  const cx = BD_CX + (mode === 'P3' ? 34 : 0),
    x = cx - BD_W / 2,
    y = BD_CY - BANNER_HEIGHT / 2;
  // Once the gift banner has popped in, a copy of the donor's photo leaves it for where the gift acts.
  if (
    active?.kind === 'gift' &&
    active.nickname &&
    s.donorNames !== false &&
    (active.pending ?? 0) > 0 &&
    age >= 0.2
  ) {
    // One photo per gift, sent a frame after the gift so its effect (a berry) is already placed.
    active.pending = (active.pending ?? 1) - 1;
    launchFromBanner(
      active.team === 'shadow' ? 1 : 0,
      active.nickname,
      active.avatar,
      active.value ?? 0,
      x + 16 + AVATAR / 2,
      BD_CY,
      AVATAR / 2,
      active.effect,
    );
  }
  // Panel and its content; reveal = fraction visible from the left (P2, P3), global alpha.
  const drawPanel = (reveal: number, alpha: number, dy: number | undefined): void => {
    if (!active) return;
    if (alpha <= 0.01 || reveal <= 0.01) return;
    const c = ctx as CanvasRenderingContext2D | null;
    if (!c) return;
    c.save();
    c.globalAlpha = alpha;
    c.translate(0, dy ?? 0);
    c.beginPath();
    c.rect(x - 4, y - 6, (BD_W + 8) * reveal, BANNER_HEIGHT + 12);
    c.clip();
    c.fillStyle = 'rgba(8,12,10,0.74)';
    c.beginPath();
    c.roundRect(x, y, BD_W, BANNER_HEIGHT, 24);
    c.fill();
    c.fillStyle = `rgba(${rgb},${(0.1 * (1 - Math.min(1, age / 1.6))).toFixed(3)})`;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = `rgba(${rgb},0.38)`;
    c.stroke();
    const AV = AVATAR,
      ax = x + 16 + AV / 2,
      pop =
        age < 0.9
          ? 1 + 0.14 * Math.sin(Math.min(1, Math.max(0, (age - 0.45) / 0.45)) * Math.PI)
          : 1;
    const showNames = s.donorNames !== false,
      displayName = showNames && active.nickname ? active.nickname.slice(0, 18) : '',
      av = displayName ? getAvatar(active.avatar, active.nickname) : null;
    // Viewer profile photo, circular, outlined in team color; snake glyph when names are hidden.
    if (av) {
      c.save();
      c.beginPath();
      c.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      c.closePath();
      c.save();
      c.clip();
      c.drawImage(av, ax - (AV / 2) * pop, BD_CY - (AV / 2) * pop, AV * pop, AV * pop);
      c.restore();
      c.lineWidth = 2.5;
      c.strokeStyle = `rgba(${rgb},0.85)`;
      c.beginPath();
      c.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    } else paintSnakeGlyph(ax, BD_CY, 17 * pop, active.team ? tint : undefined);
    // Right side: the in-game effect glyph.
    const IM = 60,
      aImg = !!active.effect;
    if (aImg) {
      c.save();
      c.translate(x + BD_W - 16 - IM / 2, BD_CY);
      c.scale(pop, pop);
      paintEffectGlyph(c, active.effect ?? '', 0, 0, 22, rgb);
      c.restore();
    }
    // Announcement text: regular words in light color, viewer name in bold team color, two lines maximum.
    const tx = ax + AV / 2 + 18,
      availableWidth = x + BD_W - (aImg ? IM + 30 : 22) - tx;
    const count = active.count ?? 1;
    const text = active.text.replace('{n}', String(active.likes ?? ''));
    const parts = (count > 1 ? `${text}  ×${String(count)}` : text).split('{name}');
    const textTokens: MeasuredToken[] = [];
    parts.forEach((m, k) => {
      if (k > 0) textTokens.push({ t: displayName || 'a viewer', strong: !!displayName, l: 0 });
      (m.match(/\S+|\s+/g) ?? []).forEach((q) => textTokens.push({ t: q, strong: false, l: 0 }));
    });
    const words: WordGroup[] = [];
    let cur: WordGroup | null = null;
    textTokens.forEach((q) => {
      if (!q.strong && /^\s+$/.test(q.t)) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = makeWordGroup();
        words.push(cur);
      }
      cur.push(q);
    });
    let fontSize = 30;
    let lines: WordGroup[][] = [];
    for (; fontSize >= 19; fontSize--) {
      const fN = `500 ${String(fontSize)}px system-ui, sans-serif`,
        fF = `800 ${String(fontSize)}px system-ui, sans-serif`;
      c.font = fN;
      const spaceWidth = c.measureText(' ').width;
      words.forEach((w) => {
        w.l = 0;
        w.forEach((q) => {
          c.font = q.strong ? fF : fN;
          q.l = c.measureText(q.t).width;
          w.l += q.l;
        });
      });
      lines = [[]];
      let lx = 0;
      words.forEach((w) => {
        if (lx > 0 && lx + spaceWidth + w.l > availableWidth) {
          lines.push([]);
          lx = 0;
        }
        if (lx > 0) lx += spaceWidth;
        w.x = lx;
        lx += w.l;
        // invariant: lines always has at least one entry (initialized to [[]] and only push appends)
        const tail = lines[lines.length - 1];
        if (tail) tail.push(w);
      });
      if (lines.length <= 2 && words.every((w) => w.l <= availableWidth)) break;
    }
    const lineHeight = fontSize * 1.22,
      y0 = BD_CY - ((lines.length - 1) * lineHeight) / 2 + 1;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    lines.slice(0, 2).forEach((li, k) => {
      li.forEach((w) => {
        let wx = tx + w.x;
        w.forEach((q) => {
          c.font = `${q.strong ? '800 ' : '500 '}${String(fontSize)}px system-ui, sans-serif`;
          c.fillStyle = q.strong ? (active.team ? tint : '#ffffff') : 'rgba(255,255,255,0.86)';
          c.fillText(q.t, wx, y0 + k * lineHeight);
          wx += q.l;
        });
      });
    });
    c.restore();
  };
  if (mode === 'P1' && active) {
    // P1 orbit: the snake circles the panel, settles, then exits erasing it.
    drawPanel(1, entryFade * (1 - exitFade), (1 - entryFade) * 10);
    const m = 13,
      rx = x - m,
      ry = y - m,
      rw = BD_W + 2 * m,
      rh = BANNER_HEIGHT + 2 * m,
      rr = 24 + m,
      perimeter = 2 * (rw + rh) - 8 * rr + 2 * Math.PI * rr;
    const progress = smoothFn(age / 1.25),
      headPos =
        perimeter * 0.08 +
        progress * perimeter +
        Math.max(0, age - 1.25) * 22 +
        exitFade * perimeter * 0.55,
      snakeLength = Math.min(170, progress * perimeter) * (1 - exitFade * 0.4);
    const pts: Point[] = [];
    for (let d = 0; d <= snakeLength; d += 7) {
      const s2 = (((headPos - d) % perimeter) + perimeter) % perimeter;
      pts.push(pointRail(rx, ry, rw, rh, rr, s2));
    }
    const c = ctx as CanvasRenderingContext2D | null;
    if (c) {
      c.save();
      c.globalAlpha = 1 - exitFade;
      paintMiniSnake(pts, tint, 0.5);
      c.restore();
    }
  }
  if (mode === 'P2' && active) {
    // P2 carrier: the snake crosses while undulating, unrolling the panel behind it.
    const hx = x - 60 + smoothFn(age / 1.1) * (BD_W + 140) + Math.max(0, age - 1.1) * 520;
    drawPanel(Math.max(0, Math.min(1, (hx - x - 10) / BD_W)), 1 - exitFade, -exitFade * 12);
    const pts: Point[] = [];
    for (let i = 0; i < 26; i++) {
      const px2 = hx - i * 7;
      pts.push({ x: px2, y: BD_CY + Math.sin(px2 * 0.03) * 15 });
    }
    if (hx < W + 220) paintMiniSnake(pts, tint, 0.5);
  }
  if (mode === 'P3') {
    // P3 mascot: a small coiled snake always present; it raises up and the panel emerges from it.
    const mx = cx - BD_W / 2 - 38,
      my = BD_CY + 6,
      raised = entryFade - exitFade,
      breathe = 1 + 0.03 * Math.sin(t * 2.2);
    if (active) drawPanel(entryFade, 1 - exitFade, 0);
    const pts: Point[] = [
      { x: mx + 6 + raised * 10, y: my - 30 - raised * 16 - 2 * Math.sin(t * 2.2) },
      { x: mx + 2 + raised * 6, y: my - 22 - raised * 9 },
      { x: mx - 2, y: my - 14 },
    ];
    for (let i = 0; i <= 19; i++) {
      const ang = -Math.PI / 2 - i * 0.4,
        rad = (27 - i * 0.35) * breathe;
      pts.push({ x: mx + Math.cos(ang) * rad * 1.2, y: my + 4 + Math.sin(ang) * rad * 0.6 });
    }
    paintMiniSnake(pts, active ? tint : '#e8f1dc', 0.42);
  }
}
