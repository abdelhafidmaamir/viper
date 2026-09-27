/**
 * Domain vocabulary of the control room: every option the operator can pick, with the labels shown
 * on screen. Values mirror the engine settings (src/renderer/scripts/game.js) and director scenes
 * (src/renderer/engine/scenes.js); the wire protocol itself is imported, never redefined.
 */
import type { GameState } from '../../shared/control-protocol.ts';

export type TabId = 'live' | 'setup' | 'rehearsal' | 'admin';

export const TABS: readonly { readonly id: TabId; readonly label: string; readonly key: string }[] =
  [
    { id: 'live', label: 'Live', key: '1' },
    { id: 'setup', label: 'Setup', key: '2' },
    { id: 'rehearsal', label: 'Rehearsal', key: '3' },
    { id: 'admin', label: 'Admin', key: '4' },
  ];

export interface Option<T> {
  readonly value: T;
  readonly label: string;
}

/** Director scenes with the engine's default durations, sent explicitly so the command type holds. */
export const SCENES = [
  { name: 'ballet', label: 'Ballet', duration: 20, key: '1', tone: 'accent' },
  { name: 'race', label: 'Berry race', duration: 15, key: '2', tone: 'accent' },
  { name: 'huntGold', label: 'Gold hunts', duration: 12, key: '3', tone: 'gold' },
  { name: 'huntShadow', label: 'Shadow hunts', duration: 12, key: '4', tone: 'shadow' },
] as const;

export type SceneName = (typeof SCENES)[number]['name'];

export function isSceneName(value: string): value is SceneName {
  return SCENES.some((scene) => scene.name === value);
}

export function sceneLabel(name: string): string {
  return SCENES.find((scene) => scene.name === name)?.label ?? name;
}

/** Settings the game echoes back in every state message. */
export const VERIFIED_SETTINGS = [
  'platform',
  'smooth',
  'donorNames',
  'advantage',
  'underdog',
  'superAi',
  'aiDebug',
  'giftFeedback',
  'banner',
  'ranking',
  'weather',
  'hour',
  'autoAmbience',
] as const satisfies readonly (keyof GameState)[];

/** Settings the game accepts but never reports: they can be sent, not confirmed. */
export const UNVERIFIED_SETTINGS = [
  'format',
  'giftDisplay',
  'scrollVisible',
  'scrollHidden',
] as const;

export type VerifiedSetting = (typeof VERIFIED_SETTINGS)[number];
export type UnverifiedSetting = (typeof UNVERIFIED_SETTINGS)[number];
export type SettingName = VerifiedSetting | UnverifiedSetting;
export type SettingValue = string | number | boolean;

export const SETTING_LABELS: Readonly<Record<SettingName, string>> = {
  platform: 'platform',
  smooth: 'smooth mode',
  donorNames: 'viewer names',
  advantage: 'advantage',
  underdog: 'underdog',
  superAi: 'super AI',
  aiDebug: 'debug overlay',
  giftFeedback: 'gift feedback',
  banner: 'activity banner',
  ranking: 'end screen ranking',
  weather: 'weather',
  hour: 'time of day',
  autoAmbience: 'auto ambience',
  format: 'image format',
  giftDisplay: 'gift display',
  scrollVisible: 'scroll visible time',
  scrollHidden: 'scroll hidden time',
};

export function isVerified(name: SettingName): name is VerifiedSetting {
  return (VERIFIED_SETTINGS as readonly string[]).includes(name);
}

export function echoOf(name: VerifiedSetting, state: GameState): SettingValue {
  return state[name];
}

/** Numbers are compared with a tolerance: the time of day drifts with the engine's day cycle. */
export function sameValue(a: SettingValue | undefined, b: SettingValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.01;
  return a === b;
}

export const PLATFORMS: readonly Option<GameSettings['platform']>[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'neutral', label: 'Neutral' },
];

export const FORMATS: readonly Option<GameSettings['format']>[] = [
  { value: 'portrait', label: 'Portrait 9:16' },
  { value: 'landscape', label: 'Landscape 16:9' },
];

export const GIFT_DISPLAYS: readonly Option<GameSettings['giftDisplay']>[] = [
  { value: 'scroll', label: 'Scroll' },
  { value: 'none', label: 'Off' },
  { value: 'full', label: 'Full (off stream)' },
];

export const SCROLL_VISIBLE: readonly number[] = [4, 6, 8, 10, 12, 15, 20];
export const SCROLL_HIDDEN: readonly number[] = [0, 6, 8, 10, 12, 15, 20, 30];

export const GIFT_FEEDBACK: readonly Option<string>[] = [
  { value: 'none', label: 'None' },
  { value: 'G1', label: 'G1 lit row' },
  { value: 'G2', label: 'G2 ring' },
  { value: 'G3', label: 'G3 counter' },
  { value: 'G4', label: 'G4 donor' },
];

export const BANNERS: readonly Option<string>[] = [
  { value: 'none', label: 'None' },
  { value: 'P1', label: 'P1 orbit' },
  { value: 'P2', label: 'P2 carrier' },
  { value: 'P3', label: 'P3 mascot' },
];

export const RANKINGS: readonly Option<string>[] = [
  { value: 'none', label: 'None' },
  { value: 'C1', label: 'C1 podium' },
  { value: 'C2', label: 'C2 two teams' },
  { value: 'C3', label: 'C3 MVP' },
  { value: 'M1', label: 'M1 crown' },
  { value: 'M2', label: 'M2 snake' },
  { value: 'M3', label: 'M3 podium' },
];

export const WEATHERS: readonly Option<string>[] = [
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'summer', label: 'Summer' },
  { value: 'spring', label: 'Spring' },
  { value: 'storm', label: 'Storm' },
  { value: 'stars', label: 'Shooting stars' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'fireflies', label: 'Fireflies' },
  { value: 'embers', label: 'Embers' },
  { value: 'mist', label: 'Mist' },
];

export const HOURS: readonly Option<number>[] = [
  { value: 0.02, label: 'Night' },
  { value: 0.22, label: 'Sunrise' },
  { value: 0.5, label: 'Day' },
  { value: 0.78, label: 'Sunset' },
];

/** The preset closest to a drifting hour, if it is within half an hour of game time. */
export function nearestHour(hour: number): number | undefined {
  const match = HOURS.find((preset) => Math.abs(preset.value - hour) <= 1 / 48);
  return match?.value;
}

export interface GiftButton {
  readonly team: Team;
  readonly name: string;
  readonly diamonds: number;
  readonly repeat: number;
  readonly label: string;
}

const gift = (
  team: Team,
  name: string,
  diamonds: number,
  repeat = 1,
  label?: string,
): GiftButton => ({
  team,
  name,
  diamonds,
  repeat,
  label: label ?? `${name} ${String(diamonds)}`,
});

export const GIFTS: readonly GiftButton[] = [
  gift('gold', 'Rose', 1),
  gift('gold', 'Rose', 1, 5, 'Rose x5 streak'),
  gift('gold', 'Rose', 10),
  gift('gold', 'Bouquet', 20),
  gift('gold', 'Bagel', 30),
  gift('gold', 'Teddy Bear', 100, 1, 'Teddy 100'),
  gift('shadow', 'Rosa', 1),
  gift('shadow', 'Rosa', 1, 5, 'Rosa x5 streak'),
  gift('shadow', 'Dyno', 10),
  gift('shadow', 'Perfume', 20),
  gift('shadow', 'Capybara', 30),
  gift('shadow', 'Hand Heart', 100),
];

export const TEST_EVENTS = {
  join: { label: 'Join', event: { type: 'join', nickname: 'lea_gold' } },
  giftGold: {
    label: 'Gold gift',
    event: { type: 'gift', n: 1, value: 30, name: 'bagel', team: 'gold', nickname: 'karim.or' },
  },
  giftShadow: {
    label: 'Shadow gift',
    event: {
      type: 'gift',
      n: 1,
      value: 100,
      name: 'hand heart',
      team: 'shadow',
      nickname: 'zoe_moon',
    },
  },
  like: { label: 'Likes', event: { type: 'like', n: 50, nickname: 'soleil92' } },
  share: { label: 'Share', event: { type: 'share', nickname: 'nox' } },
  tier: { label: '50 viewers', event: { type: 'viewers', total: 52 } },
} as const satisfies Record<string, { label: string; event: AudienceEvent & { total?: number } }>;

export type TestEventId = keyof typeof TEST_EVENTS;

export type CrowdMode = 'battle' | 'random';

/** Simulated crowd levels: events per minute at rest (5 % of them gifts in random mode). */
export const DENSITY_LEVELS: readonly { readonly label: string; readonly perMinute: number }[] = [
  { label: 'None', perMinute: 0 },
  { label: 'Quiet', perMinute: 12 },
  { label: 'Lively', perMinute: 100 },
  { label: 'Crowd', perMinute: 550 },
];

export const DEFAULT_BRIDGE_URL = 'ws://localhost:21213/';
