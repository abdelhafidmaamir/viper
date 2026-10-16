// The Feed the Snake window's end of its control room: settings (ambience, language) restored
// from the last session, commands applied, and the round published twice a second.

import { setBoard3d } from './board-3d.ts';
import {
  CROWD_LEVELS,
  ONCE_PER_LIVE,
  FEED_CHANNEL,
  FEED_GIFTS,
  FEED_STATE_INTERVAL_MS,
  FEED_WEATHERS,
  isFeedCommand,
  sanitizeSetting,
  type CrowdLevel,
  type FeedCommand,
  type FeedGiftLine,
  type FeedSettingName,
  type FeedSettings,
  type FeedState,
  type FeedStateMessage,
} from '../../shared/feed-protocol.ts';
import { berriesForCoins, DEFAULT_PRICING, giftCoins } from '../../shared/feed-pricing.ts';
import { setLanguage } from '../engine/i18n.ts';
import { alertSounds, alertViewer, setAlertsOn } from './alerts.ts';
import {
  crabLike,
  crabSeen,
  crabViewers,
  setLikeCount,
  setSleeperLife,
  setSleeperLook,
  setSleepers,
} from './crabs.ts';
import { setCrownStyle, setSnakeColour, setSnakeSkin } from './paint.ts';
import { setFlowerSides } from './flower.ts';
import { setTray, type TrayFly } from './gift-tray.ts';
import { note, noteJoin, noteLikes, noteViewers } from './journal.ts';
import {
  perfGift,
  perfJoin,
  perfLikes,
  perfSegments,
  perfTick,
  perfViewers,
  restorePerf,
} from './perf.ts';
import {
  claimSeed,
  lifetimeRank,
  seedSupporters,
  supporterPhoto,
  supporterSettings,
  supporter,
  supporterGift,
  supporterJoin,
  supporterKey,
  supporterLikes,
  supporterSocial,
  topSupporters,
} from './supporters.ts';
import {
  setGiftThanks,
  thankGift,
  setEntranceGap,
  skipEntrance,
  welcomeSupporter,
  type Entrance,
} from './vip.ts';
import type { AudienceEvent } from '../engine/types.ts';
import {
  PATTERNS,
  TOTAL,
  cells,
  game,
  gift,
  leaders,
  like,
  nearFull,
  newRound,
  notePhoto,
  photoOf,
  repay,
  resumeRound,
  roundSnapshot,
  type RoundSnapshot,
  setStartFill,
  unpaid,
  waiting,
  setRoundHold,
} from './state.ts';

const STORAGE_KEY = 'viper-feed-settings';
/** Berries viewers paid for and did not get yet, saved twice a second. */
const UNPAID_KEY = 'viper-feed-unpaid';

/** Gives back what the last session still owed; call once the first round has started. */
export function restoreUnpaid(storage: FeedLinkDeps['storage']): void {
  const raw = safely(() => storage.getItem(UNPAID_KEY));
  const saved = raw ? safely(() => JSON.parse(raw) as unknown) : null;
  if (!Array.isArray(saved)) return;
  repay(
    saved.flatMap((e: unknown) =>
      typeof e === 'object' &&
      e !== null &&
      'nickname' in e &&
      'n' in e &&
      typeof e.nickname === 'string' &&
      typeof e.n === 'number' &&
      e.n > 0 &&
      e.n <= 100000
        ? [{ nickname: e.nickname, n: Math.round(e.n) }]
        : [],
    ),
  );
}

export const settings: { -readonly [K in FeedSettingName]: FeedSettings[K] } = {
  weather: 'rain',
  hour: 0.06,
  dayCycle: 20,
  autoAmbience: true,
  language: 'en',
  startFill: 0,
  alerts: true,
  entranceGap: 0,
  mods: '',
  roundHold: 10,
  giftThanks: 'flower',
  giftTitles: false,
  likeCount: true,
  sleepers: 1,
  sleeperLook: 'colorFaceGreyCrab',
  sleeperLife: 'shuffle',
  crownStyle: 'classic',
  snakeSkin: 'classic',
  board3d: false,
  snakeColour: 'sand',
  rainSound: 'off',
  rankedWelcome: 0,
  pricing: DEFAULT_PRICING,
  otherGifts: false,
};

/** How each tray setting brings a row's photo down from the flower. */
const TRAY_FLY: Readonly<Record<string, TrayFly>> = {
  'tray-arc': 'arc',
  'tray-comet': 'comet',
  'tray-rings': 'portal',
  'tray-butterflies': 'carry',
};

/** Tells the flower, the tray and the entrances which of them thanks a gift. */
function showGiftThanks(): void {
  const mode = settings.giftThanks,
    tray = mode.startsWith('tray');
  setGiftThanks(tray ? 'tray' : mode === 'classic' ? 'classic' : 'flower');
  setTray(TRAY_FLY[mode] ?? '', settings.giftTitles);
  setFlowerSides(mode === 'flower' ? 'cards' : mode === 'classic' ? 'text' : 'none');
}

/** The moderators named in the control room, by TikTok @handle. */
let modList = new Set<string>();

/**
 * Where a counted gift or like goes: the round (state.ts). Snake Arena points both at its own
 * board as well (src/renderer/arena/link.ts); everything else here stays the same.
 */
export const board: {
  gift: (nickname: string, avatar: string | undefined, berries: number, live?: boolean) => void;
  like: (nickname: string, avatar: string | undefined, n: number) => void;
  /** A gift at this price is something else than berries (Snake Arena's extra life). */
  instead?: (coins: number) => boolean;
  /** A gift that gives no berries, `n` of it at `coins` each: true when it was used anyway. */
  unpriced?: (nickname: string, avatar: string | undefined, coins: number, n: number) => boolean;
  /** A viewer joined the live (Snake Arena's beach shows the latest arrivals; Feed: nothing). */
  joined?: (nickname: string, avatar: string | undefined) => void;
} = { gift, like };

export interface FrameMetrics {
  readonly fps: number;
  readonly slowFrames: number;
  readonly errors: number;
}

export interface FeedLinkDeps {
  readonly bridge: TikFinityBridge;
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  readonly metrics: () => FrameMetrics;
  /** Sets the simulated audience size. */
  readonly setCrowd: (level: CrowdLevel) => void;
  readonly crowd: () => CrowdLevel;
  /** A random name for test gifts sent without one. */
  readonly someone: () => string;
  /**
   * The settings travel with the supporters list to another computer (true unless said). Snake
   * Arena keeps its own: the list carries Feed's.
   */
  readonly shareSettings?: boolean;
}

/** TikFinity is connected: a real live, where nothing fake may reach the board. */
export function isLive(bridge: TikFinityBridge): boolean {
  try {
    const state = bridge.state();
    return typeof state === 'object' && state !== null && 'connected' in state
      ? state.connected === true
      : false;
  } catch {
    return false;
  }
}

/** Rehearsal commands: refused during a real live, so a stray key can never fake a gift. */
const REHEARSAL: ReadonlySet<FeedCommand['cmd']> = new Set([
  'gift',
  'likes',
  'near-full',
  'test-entrance',
]);

/** Storage can throw (quota, disabled storage). Preferences are a convenience, never fatal. */
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

function apply(name: FeedSettingName, value: unknown): boolean {
  const clean = sanitizeSetting(name, value);
  if (clean === undefined) return false;
  Object.assign(settings, { [name]: clean });
  if (name === 'language') setLanguage(settings.language);
  if (name === 'startFill') setStartFill(settings.startFill);
  if (name === 'alerts') setAlertsOn(settings.alerts);
  if (name === 'giftThanks' || name === 'giftTitles') showGiftThanks();
  if (name === 'likeCount') setLikeCount(settings.likeCount);
  if (name === 'sleepers') setSleepers(settings.sleepers);
  if (name === 'sleeperLook') setSleeperLook(settings.sleeperLook);
  if (name === 'sleeperLife') setSleeperLife(settings.sleeperLife);
  if (name === 'crownStyle') setCrownStyle(settings.crownStyle);
  if (name === 'snakeSkin') setSnakeSkin(settings.snakeSkin);
  if (name === 'board3d') setBoard3d(settings.board3d);
  if (name === 'snakeColour') setSnakeColour(settings.snakeColour);
  if (name === 'roundHold') setRoundHold(settings.roundHold);
  if (name === 'entranceGap') {
    const gap = settings.entranceGap;
    setEntranceGap(gap < 0 ? -1 : gap >= ONCE_PER_LIVE ? Infinity : gap * 60_000);
  }
  if (name === 'mods')
    modList = new Set(
      settings.mods
        .split(/[\s,;]+/)
        .map((m) => supporterKey(m.replace(/^@/, '')))
        .filter(Boolean),
    );
  return true;
}

/** The settings that travel with the supporters list to a new computer (not the ambience). */
const SHARED: readonly FeedSettingName[] = [
  'language',
  'startFill',
  'alerts',
  'entranceGap',
  'mods',
  'roundHold',
  'giftThanks',
  'giftTitles',
  'likeCount',
  'sleepers',
  'sleeperLook',
  'sleeperLife',
  'crownStyle',
  'snakeSkin',
  'board3d',
  'snakeColour',
  'rainSound',
  'rankedWelcome',
  'pricing',
  'otherGifts',
  'autoAmbience',
  'dayCycle',
];
const shared = (): Record<string, unknown> =>
  Object.fromEntries(SHARED.map((name) => [name, settings[name]]));

/** Settings that came back with the supporters list (another computer's): applied and kept. */
export function applySavedSettings(
  saved: Record<string, unknown>,
  storage: FeedLinkDeps['storage'],
): void {
  for (const name of SHARED) if (name in saved) apply(name, saved[name]);
  supporterSettings(shared());
  safely(() => {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  });
}

export function restoreSettings(storage: FeedLinkDeps['storage']): void {
  const raw = safely(() => storage.getItem(STORAGE_KEY));
  if (!raw) return;
  const saved = safely(() => JSON.parse(raw) as unknown);
  if (typeof saved !== 'object' || saved === null) return;
  for (const name of Object.keys(settings) as FeedSettingName[])
    if (name in saved) apply(name, (saved as Record<string, unknown>)[name]);
}

/** A new weather and a fitting hour each round, as in the duel. */
export function rollAmbience(rand: () => number = Math.random): void {
  if (!settings.autoAmbience) return;
  const others = FEED_WEATHERS.filter((w) => w !== settings.weather);
  settings.weather = others[Math.floor(rand() * others.length)] ?? 'rain';
  // With the day running by itself, the hour is left where the clock has brought it.
  if (settings.dayCycle > 0) return;
  const hours = [0.02, 0.22, 0.36, 0.5, 0.64, 0.78] as const;
  settings.hour =
    settings.weather === 'stars' ||
    settings.weather === 'aurora' ||
    settings.weather === 'fireflies'
      ? 0.02
      : settings.weather === 'embers'
        ? 0.78
        : settings.weather === 'spring'
          ? 0.36
          : (hours[Math.floor(rand() * hours.length)] ?? 0.22);
}

/** Every gift received, newest first, so the operator can check what each one gave. */
const GIFT_LOG = 12;
const giftLog: FeedGiftLine[] = [];

/** Berries one gift of `coins` drops under the price list set in the control room. */
const priced = (coins: number): number =>
  berriesForCoins(coins, settings.pricing, settings.otherGifts);

/**
 * Live events from the bridge: gifts feed the snake at the control room's prices, likes rank.
 * Every other event does nothing in this mode. Returns the gifts counted.
 */
export function receiveFeedEvent(ev: AudienceEvent | null | undefined): number {
  // A streak counts whole: Rose x500 drops 500 berries.
  const n = Math.max(1, Math.min(parseInt(String(ev?.n ?? 1)) || 1, 10000));
  // Any event carries the viewer's photo: remember it for every place their face shows.
  notePhoto(ev?.nickname ?? '', ev?.avatar === '' ? undefined : ev?.avatar);
  // Everything that comes from the live goes into the journal and the supporters list.
  const id = ev?.id ?? '',
    who = ev?.nickname ?? '';
  // A supporter imported from before, seen for the first time: their berries become theirs.
  if (id && who) claimSeed(id, who);
  if (ev?.type === 'viewers') {
    noteViewers(Math.max(0, Number(ev.total) || 0));
    perfViewers(Math.max(0, Number(ev.total) || 0));
    crabViewers(Math.max(0, Number(ev.total) || 0), ev.top);
  }
  if (ev?.type === 'like') {
    board.like(ev.nickname ?? 'viewer', ev.avatar, n);
    alertViewer('like', ev.nickname ?? '', ev.avatar, n);
    crabLike(ev.nickname ?? '', ev.avatar, n);
    noteLikes(id || who, n);
    perfLikes(n);
    supporterLikes(id, who, n);
  }
  if (ev?.type === 'join') {
    noteJoin(supporterJoin(id, who));
    perfJoin();
    welcome(ev, id, who);
    crabSeen(who, ev.avatar === '' ? undefined : ev.avatar, true);
    board.joined?.(who, ev.avatar === '' ? undefined : ev.avatar);
  }
  // Anything else they do only tells us the viewer is still here: a sleeping crab may show them.
  if (
    ev?.type === 'comment' ||
    ev?.type === 'share' ||
    ev?.type === 'follow' ||
    ev?.type === 'gift'
  )
    crabSeen(who, ev.avatar === '' ? undefined : ev.avatar, false);
  if (ev?.type === 'share' || ev?.type === 'follow') {
    note({ event: ev.type, source: 'tiktok', nickname: who, id });
    supporterSocial(ev.type, id, who);
    alertViewer(ev.type, ev.nickname ?? '', ev.avatar);
  }
  // Their latest photo, kept with them for the Hall of Fame.
  if (id) supporterPhoto(id, ev?.avatar);
  if (ev?.type !== 'gift') return 0;
  const coins = giftCoins(ev.name ?? ev.gift, ev.value),
    berries = board.instead?.(coins) ? 0 : priced(coins);
  note({
    event: 'gift',
    source: 'tiktok',
    nickname: who,
    id,
    gift: ev.name ?? ev.gift ?? '?',
    count: n,
    berries: berries * n,
    coins: coins * n,
  });
  const before = topSupporters(3).map((s) => s.id),
    first = supporterKey(id) !== '' && !supporter(id)?.berries;
  perfGift(id || who, coins * n, berries * n, n, first, coins);
  supporterGift(id, who, berries * n);
  supporterPhoto(id, ev.avatar);
  if (berries > 0 && !announcePass(id, who, ev.avatar, before))
    thank(id, who, ev.avatar, berries * n, first);
  giftLog.unshift({
    at: Date.now(),
    nickname: ev.nickname ?? 'viewer',
    name: ev.name ?? ev.gift ?? '?',
    count: n,
    berries: berries * n,
    coins: coins * n,
  });
  if (giftLog.length > GIFT_LOG) giftLog.length = GIFT_LOG;
  if (!berries) return board.unpriced?.(ev.nickname ?? 'viewer', ev.avatar, coins, n) ? n : 0;
  board.gift(ev.nickname ?? 'viewer', ev.avatar, berries * n, true);
  return n;
}

/**
 * Someone arrives: a gifter or a moderator gets their big entrance over the board (or, when the
 * control room's setting says not yet, the gold alert at the bottom); everyone else the plain one.
 */
function welcome(ev: AudienceEvent, id: string, who: string): void {
  if (!who) return;
  const mine = supporter(id),
    gave = (mine?.berries ?? 0) > 0,
    mod =
      ev.mod === true ||
      (modList.size > 0 && (modList.has(supporterKey(id)) || modList.has(supporterKey(who))));
  if (!gave && !mod) {
    // Someone who has given elsewhere on TikTok but not here yet: noticed, never rewarded. The
    // card stays well below anything a gift brings.
    const level = ev.gifterLevel ?? 0,
      ranked = settings.rankedWelcome > 0 && level >= settings.rankedWelcome;
    if (level > 0)
      note({
        event: 'gifter join',
        source: 'tiktok',
        nickname: who,
        id,
        detail: `level ${String(level)}`,
      });
    alertViewer('join', who, ev.avatar, 1, undefined, ranked);
    return;
  }
  const rank = gave ? lifetimeRank(id) : 0,
    entrance: Entrance = {
      nickname: who,
      avatar: ev.avatar === '' ? undefined : ev.avatar,
      rank,
      berries: mine?.berries ?? 0,
      mod,
    };
  if (welcomeSupporter(entrance) === 'queued') {
    alertSounds.show('join', false);
    note({
      event: 'big entrance',
      source: 'tiktok',
      nickname: who,
      id,
      detail: [rank ? `top ${String(rank)}` : 'gifter', mod ? 'moderator' : '']
        .filter(Boolean)
        .join(', '),
    });
    return;
  }
  alertViewer('join', who, ev.avatar, 1, mod && !rank ? -1 : rank);
}

/**
 * A gift is thanked by name over the board, a first gift ever more grandly. A streak arrives one
 * step at a time: it is one thanks, its count going up.
 */
function thank(
  id: string,
  who: string,
  avatar: string | undefined,
  berries: number,
  first: boolean,
): void {
  if (!who) return;
  thankGift(who, avatar, berries, first);
  if (!first) return;
  note({ event: 'first gift', source: 'tiktok', nickname: who, id });
}

/**
 * A gift lifted its giver past someone in the all-time top three: they knock them off the spot.
 * True when it did.
 */
function announcePass(
  id: string,
  who: string,
  avatar: string | undefined,
  before: string[],
): boolean {
  const k = supporterKey(id);
  if (!k) return false;
  const now = topSupporters(3).findIndex((s) => s.id === k) + 1,
    was = before.indexOf(k) + 1 || 99;
  if (now <= 0 || now >= was) return false;
  const passedId = before[now - 1];
  if (!passedId || passedId === k) return false;
  const passed = supporter(passedId)?.nickname ?? passedId;
  welcomeSupporter({
    nickname: who,
    avatar: avatar === '' ? undefined : avatar,
    rank: now,
    berries: supporter(id)?.berries ?? 0,
    passed: { nickname: passed, avatar: photoOf(passed) },
  });
  alertSounds.show('follow', false);
  note({
    event: 'pass',
    source: 'tiktok',
    nickname: who,
    id,
    detail: `#${String(now)}, passes ${passed}`,
  });
  return true;
}

let tests = 0;

const count = (value: number): number => Math.max(1, Math.min(100, Math.round(value) || 1));

/** The round as the app saves it every second (see src/main/feed-backup.ts). */
type SavedRound = (RoundSnapshot | { readonly ended: true; readonly round: number }) & {
  readonly savedAt: number;
  readonly owed?: readonly { nickname: string; n: number }[];
};

/** What the app saves every second: the round in progress, or what is owed on an end screen. */
export function backupText(): string {
  const round = roundSnapshot(),
    owedNow = unpaid();
  return JSON.stringify(
    round
      ? { ...round, savedAt: Date.now(), owed: owedNow }
      : { ended: true, round: game.round, fans: [], queue: [], savedAt: Date.now(), owed: owedNow },
  );
}

/**
 * On launch the app hands over last run's saved round and the game picks it up by itself: the
 * same round goes on (route, snake, leaderboard, crown, berries owed), or, if it had stopped on
 * an end screen, a new round opens with everything still owed. Returns whether anything came back.
 */
export function restoreBackup(text: string): boolean {
  let saved: SavedRound;
  try {
    saved = JSON.parse(text) as SavedRound;
  } catch {
    return false;
  }
  if (typeof saved.savedAt !== 'number') return false;
  if ('ended' in saved) {
    if (!saved.owed?.length) return false;
    newRound();
    repay(saved.owed, true);
  } else resumeRound(saved);
  note({
    event: 'round restored',
    detail: `after a restart, ${String((saved.owed ?? []).reduce((sum, o) => sum + o.n, 0))} berries owed`,
  });
  giftLog.unshift({
    at: Date.now(),
    nickname: 'Backup',
    name: 'Round restored after a restart',
    count: 1,
    berries: (saved.owed ?? []).reduce((sum, o) => sum + o.n, 0),
  });
  return true;
}

export function applyFeedCommand(command: FeedCommand, deps: FeedLinkDeps): void {
  const live = isLive(deps.bridge);
  if (live && REHEARSAL.has(command.cmd)) return;
  switch (command.cmd) {
    case 'gift':
      if (!(command.gift in FEED_GIFTS)) return;
      {
        const nickname = command.nickname ?? deps.someone(),
          coins = giftCoins(undefined, command.coins) || FEED_GIFTS[command.gift],
          berries = (board.instead?.(coins) ? 0 : priced(coins)) * count(command.count);
        if (!berries) {
          board.unpriced?.(nickname, undefined, coins, count(command.count));
          return;
        }
        board.gift(nickname, undefined, berries);
        thankGift(nickname, undefined, berries);
        note({
          event: 'gift',
          source: 'manual',
          nickname,
          gift: command.gift,
          count: count(command.count),
          berries,
        });
      }
      return;
    case 'likes': {
      const who = command.nickname ?? deps.someone();
      board.like(who, undefined, count(command.count));
      crabLike(who, undefined, count(command.count));
      return;
    }
    case 'bridge-start':
      deps.bridge.start(command.url);
      return;
    case 'bridge-stop':
      deps.bridge.stop();
      return;
    case 'round':
      note({ event: 'new round by hand', source: 'manual' });
      newRound();
      return;
    case 'near-full':
      nearFull();
      return;
    case 'crowd':
      if (CROWD_LEVELS.includes(command.level)) deps.setCrowd(live ? 0 : command.level);
      return;
    case 'grant': {
      // Making up for a loss: berries in a viewer's name, ranked like a gift. Allowed on a live.
      const nickname = command.nickname.trim().slice(0, 40),
        n = Math.max(1, Math.min(10000, Math.round(command.count) || 0));
      if (!nickname) return;
      board.gift(nickname, photoOf(nickname), n, true);
      thankGift(nickname, photoOf(nickname), n);
      giftLog.unshift({ at: Date.now(), nickname, name: 'Given by hand', count: 1, berries: n });
      note({ event: 'given back', source: 'manual', nickname, berries: n });
      if (giftLog.length > GIFT_LOG) giftLog.length = GIFT_LOG;
      return;
    }
    case 'seed-supporters':
      if (!Array.isArray(command.lines)) return;
      seedSupporters(
        command.lines.slice(0, 500).flatMap((l: unknown) =>
          typeof l === 'object' &&
          l !== null &&
          'nickname' in l &&
          'berries' in l &&
          typeof l.nickname === 'string' &&
          typeof l.berries === 'number'
            ? [
                {
                  nickname: l.nickname.slice(0, 60),
                  berries: l.berries,
                  id: 'id' in l && typeof l.id === 'string' ? l.id.slice(0, 40) : undefined,
                },
              ]
            : [],
        ),
      );
      note({ event: 'past supporters imported', source: 'manual', count: command.lines.length });
      return;
    case 'skip-entrance':
      skipEntrance();
      return;
    case 'test-entrance': {
      const rank = Math.max(0, Math.min(3, Math.round(command.rank ?? 0))),
        outcome = welcomeSupporter({
          nickname: `${deps.someone()} ${String(++tests)}`,
          rank,
          berries: rank ? ([0, 4820, 2310, 1175][rank] ?? 42) : 42,
          mod: command.mod === true,
          ...(command.first === true ? { first: true } : {}),
        });
      if (outcome === 'queued') alertSounds.show('join', false);
      return;
    }
    case 'setting':
      if (!Object.hasOwn(settings, command.name) || !apply(command.name, command.value)) return;
      note({
        event: 'setting',
        source: 'manual',
        detail: `${command.name} = ${String(settings[command.name])}`,
      });
      if (deps.shareSettings !== false) supporterSettings(shared());
      safely(() => {
        deps.storage.setItem(STORAGE_KEY, JSON.stringify(settings));
      });
      return;
  }
}

export function feedSnapshot(deps: FeedLinkDeps): FeedState {
  const m = deps.metrics();
  let likes = 0;
  for (const l of game.likes.values()) likes += l.likes;
  return {
    bridge: deps.bridge.state(),
    phase: game.full >= 0 ? 'full' : game.ready >= 0 ? 'ready' : 'playing',
    round: game.round,
    pattern: ((game.round - 1) % PATTERNS.length) + 1,
    fill: Math.min(1, game.len / TOTAL),
    cells: cells(),
    total: TOTAL,
    berries: game.berries.size,
    waiting: waiting(),
    eaten: game.eaten,
    leaders: leaders(5).map((f) => ({ nickname: f.nickname, coins: f.coins })),
    likes,
    gifts: [...giftLog],
    crowd: deps.crowd(),
    settings: { ...settings },
    perf: perfSegments(),
    fps: m.fps,
    slowFrames: m.slowFrames,
    errors: m.errors,
  };
}

export interface FeedChannel {
  readonly postMessage: (message: FeedStateMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  readonly close: () => void;
}

/** Restores the settings, applies incoming commands and publishes state. Returns a disposer. */
export function linkFeedControl(
  deps: FeedLinkDeps,
  channel: FeedChannel = new BroadcastChannel(FEED_CHANNEL),
): () => void {
  restoreSettings(deps.storage);
  restorePerf(deps.storage);
  channel.addEventListener('message', ({ data }) => {
    if (!isFeedCommand(data)) return;
    try {
      applyFeedCommand(data, deps);
    } catch (error) {
      // A bad command from the control room must never stop the show.
      console.error(`[feed control] "${data.cmd}" failed`, error);
    }
  });
  const timer = setInterval(() => {
    perfTick(Date.now(), isLive(deps.bridge), settings, game.full >= 0, deps.storage);
    channel.postMessage({ feed: feedSnapshot(deps) });
  }, FEED_STATE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    channel.close();
  };
}
