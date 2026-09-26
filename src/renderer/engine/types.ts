/**
 * Data shapes shared across the renderer engine modules (src/renderer/engine, src/renderer/scripts).
 * Types only, no runtime code. Derived from how the code creates and mutates each object.
 * Window globals, the public game API, AI, ambience and bridge interfaces live in types-api.ts.
 */

// ===== Geometry =====

/** One of the two duelling camps. */
export type Team = 'gold' | 'shadow';

/** Who took a round: a team, or nobody. */
export type RoundWinner = Team | 'draw';

/** A board cell, in grid coordinates. Cells are replaced, never mutated. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A position in canvas pixels (trace points, halo and spark centers). */
export interface Point {
  x: number;
  y: number;
}

/** A unit grid step, {x, y} each in -1..1 with exactly one non-zero component (not enforced). */
export interface Direction {
  readonly x: number;
  readonly y: number;
}

// ===== AI stance and memory =====

export type Stance = 'attack' | 'defense' | 'neutral';

/** Why the AI took its last step (ai-human.js, ai-super.js); shown by the debug overlay. */
export type AiReason =
  | 'attire'
  | 'race'
  | 'trap'
  | 'piege!'
  | 'berry'
  | 'barrage'
  | 'attrition'
  | 'waiting'
  | 'position'
  | 'position(baie sans route sure)'
  | `super p${number}`;

/** Verdict per candidate step, keyed "dx,dy": a positional score, or a refusal. */
export type AiStepScore = number | 'ok' | 'refused';

/** Extra overlay data filled by the adversarial search AI. */
export interface SuperAiDebug {
  readonly value: number;
  readonly depth: number;
  readonly nodes: number;
  readonly ownTerritory: number;
  readonly rivalTerritory: number;
  readonly rival: Cell[];
  readonly voronoi: number[];
}

/** AI decision overlay (memory.debug), filled only while settings.aiDebug is on. */
export interface AiDebug {
  scores: Record<string, AiStepScore>;
  route?: Cell[] | null;
  target?: Fruit | null;
  trap?: number | null;
  pocket?: number;
  choice?: Direction | null;
  stance?: Stance;
  reason?: AiReason | '';
  attackRange?: number;
  defenseRange?: number;
  superAi?: SuperAiDebug;
}

/** Cell-transition flash for the debug overlay: did the re-decision change the heading. */
export interface AiDebugFlash {
  readonly t: number;
  readonly change: boolean;
  readonly x: number;
  readonly y: number;
}

/** Per-snake AI memory, reset to {} at every hatch. Every field starts absent. */
export interface AiMemory {
  stance?: Stance | null;
  activeStance?: Stance;
  stanceTime?: number;
  attackTime?: number;
  fatigue?: number;
  pocketRef?: number;
  reason?: AiReason | null;
  /** "x,y" of the nearest target berry, or '' when none. */
  key?: string;
  waiting?: number;
  repel?: boolean;
  debug?: AiDebug;
  dbgAvoid?: readonly Cell[];
  dbgFlash?: AiDebugFlash;
}

/** A berry as the AI sees it (hazards.js allFruits). */
export interface Fruit {
  readonly x: number;
  readonly y: number;
  readonly gifted: boolean;
}

// ===== Bodies =====

export type DeathCause = 'wall' | 'self' | 'stone' | 'bramble' | 'headOn' | 'adverse';

/** The hatching shell a body is born from; while present the body does not move. */
export interface Egg {
  t: number;
  readonly x: number;
  readonly y: number;
  readonly keep: boolean;
  readonly dir0: Direction | null;
  emerged?: boolean;
}

/** One pending gulp on the duel ring gauge (duel-hud.js). */
export interface GaugeEvent {
  q: number;
  done: boolean;
  readonly gain: number;
}

/** One snake. game.js loads a body into module variables, works on them, then stores it back. */
export interface Body {
  readonly team: Team;
  /** CSS color of the snake. */
  readonly tint: string;
  flair: number;
  hunt: number;
  readonly x0: number;
  readonly y0: number;
  readonly dir0: Direction;
  snake: Cell[];
  positionHistory: Cell[];
  dir: Direction;
  nextDir: Direction;
  subStep: number;
  grew: boolean;
  aiMemory: AiMemory;
  trace: Point[];
  toPush: number;
  egg: Egg | null;
  boostTime: number;
  invincibleTime: number;
  cutTime: number;
  recoilTime: number;
  likeCredit: number;
  ring: number;
  ringPeak: number;
  shieldTime: number;
  lives: number;
  parryTime: number;
  deathCause?: DeathCause;
  /** Seconds the full ring has been held. */
  hold?: number;
  adult?: boolean;
  reprieve?: boolean;
  lifeBy?: string;
  lifeAvatar?: string | undefined;
  shieldBy?: string;
  shieldAvatar?: string | undefined;
  gaugeLevel?: number;
  gaugeVelocity?: number;
  gaugeEvents?: GaugeEvent[];
  gaugeLength?: number;
}

// ===== Round =====

export type RoundState = 'playing' | 'over';

export type EndCause = 'place' | 'ring' | 'timeScale' | 'test' | 'unknown';

/** The running round (game.js newRound). */
export interface Round {
  t: number;
  state: RoundState;
  sun: number;
  moon: number;
  moonEvents: number;
  winner: RoundWinner | null;
  /** Seconds since the round ended. */
  end: number;
  skySun: number;
  skyMoon: number;
  topSun: number;
  topMoon: number;
  pulseSun: number;
  pulseMoon: number;
  target: number;
  harvest: number;
}

/** A finished round, appended to the rounds log. */
export interface RoundRecord {
  readonly team: RoundWinner;
  readonly cause: EndCause;
  readonly duration: number;
  readonly length: number;
  readonly sun: number;
  readonly moon: number;
  readonly skySun: number;
  readonly skyMoon: number;
  readonly target: number;
  readonly harvest: number;
  readonly mode: GameMode;
  readonly tier: TierId;
}

/** Engagement-moment counters. */
export interface Moments {
  holds: number;
  reprieve: number;
  parries: number;
  rounds: number;
}

// ===== Crowd tiers =====

export type TierId = 'empty' | 'quiet' | 'busy' | 'crowd';

/** A crowd tier (rules.js TIERS). The bench API retunes the mutable fields in place. */
export interface Tier {
  readonly id: TierId;
  /** Smoothed events per minute from which the tier applies. */
  readonly min: number;
  hit: number;
  readonly wild: number;
  target: number;
  skySun: number;
  skyMoon: number;
  readonly maxBerries: number;
  maxStones: number;
  readonly perBerry: number;
  readonly perStone: number;
  readonly nature: number;
  readonly maxLength: number;
}

// ===== Settings =====

export type GameMode = 'base' | 'duel';
export type Format = 'portrait' | 'landscape';
export type Platform = 'tiktok' | 'neutral';
export type GiftDisplay = 'scroll' | 'full' | 'none';
export type GiftFeedbackMode = 'none' | 'G1' | 'G2' | 'G3' | 'G4';
export type BannerMode = 'none' | 'P1' | 'P2' | 'P3';
export type RankingMode = 'none' | 'C1' | 'C2' | 'C3' | 'M1' | 'M2' | 'M3';
export type Weather =
  | 'rain'
  | 'snow'
  | 'autumn'
  | 'summer'
  | 'spring'
  | 'storm'
  | 'stars'
  | 'aurora'
  | 'fireflies'
  | 'embers'
  | 'mist';

/** The live settings object (game.js), written by the control room and the harnesses. */
export interface Settings {
  ai: boolean;
  mockup: boolean;
  timeScale: number;
  recklessness: number;
  zones: boolean;
  duration: number;
  duelDuration: number;
  wild: number;
  mode: GameMode;
  /** Day cycle length in seconds; 0 freezes the hour. */
  cycle: number;
  /** Time of day, 0..1. */
  hour: number;
  caps: boolean;
  /** -100 favors shadow, +100 favors gold. */
  advantage: number;
  underdog: boolean;
  platform: Platform;
  giftFeedback: GiftFeedbackMode;
  giftDisplay: GiftDisplay;
  scrollVisible: number;
  scrollHidden: number;
  donorNames: boolean;
  weather: Weather;
  autoAmbience: boolean;
  format: Format;
  banner: BannerMode;
  ranking: RankingMode;
  smooth: boolean;
  /** true for both teams, or a single team (harness tournaments). */
  superAi: boolean | Team;
  aiDebug: boolean;
  /** Harness override of the ambience progression. */
  forcedStep?: number;
}

// ===== Board items =====

/** A gifted seed, germinating into a berry after SEED_GROW_TIME. */
export interface Seed {
  readonly x: number;
  readonly y: number;
  readonly nickname: string;
  t: number;
  readonly team: Team;
  /** Only this team may eat the berry. */
  readonly owner: Team;
}

/** An edible berry. `wild` marks the forest's own; a berry without team is neutral green. */
export interface Berry {
  readonly x: number;
  readonly y: number;
  readonly nickname: string;
  t: number;
  readonly wild?: boolean;
  readonly team?: Team | null;
  readonly owner?: Team | null;
}

/** A stone: shadow while t < STONE_WARNING, solid after, gone at STONE_LIFE. */
export interface Stone {
  readonly x: number;
  readonly y: number;
  t: number;
}

export interface BrambleSegment {
  readonly x: number;
  readonly y: number;
  t: number;
}

/** A creeping bramble closing a lane (hazards.js plantBramble). */
export interface Bramble {
  seg: BrambleSegment[];
  /** Growth axis, perpendicular to the snake's course. */
  readonly ax: Direction;
  direction: 1 | -1;
  t: number;
  step: number;
  readonly nickname: string;
  /** Render cache (board-items.js). */
  sig?: string;
  sprite?: HTMLCanvasElement;
}

export type SparkTint = 'gift-gold' | 'gift-shadow' | 'neutral-burst' | 'shell' | 'dust' | 'gifted';
export type HaloTint = 'nature' | 'gift-gold' | 'gift-shadow' | 'gifted';

/** A burst particle (game.js burst). */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  readonly duration: number;
  readonly tint: SparkTint;
  readonly r: number;
  /** Gravity. */
  readonly g: number;
  readonly a: number;
  /** Drag. */
  readonly k: number;
}

/** Tuning for burst(); every field falls back to a default. */
export interface BurstOptions {
  readonly v0?: number;
  readonly v1?: number;
  readonly top?: number;
  readonly g?: number;
  readonly frein?: number;
  readonly r?: number;
  readonly a?: number;
  readonly duration?: number;
}

/** The glow left where a berry was eaten. */
export interface Halo {
  readonly x: number;
  readonly y: number;
  t: number;
  readonly duration: number;
  readonly tint: HaloTint;
}

// ===== Scenes =====

export type SceneName = 'ballet' | 'race' | 'huntGold' | 'huntShadow';

/** AI levers a scene forces on one team. */
export interface SceneLevers {
  readonly stance?: Stance;
  /** Attack range. */
  readonly pA?: number;
  /** Defense range. */
  readonly pD?: number;
  readonly hunt?: number;
  readonly flair?: number;
  readonly recklessness?: number;
  readonly berryRace?: boolean;
  readonly immediateTrap?: boolean;
  readonly lure?: boolean;
  readonly repel?: boolean;
  readonly encircle?: boolean;
  readonly noKill?: boolean;
}

/** A scene template (scenes.js SCENES). */
export interface SceneDefinition {
  readonly duration: number;
  readonly gold?: SceneLevers;
  readonly shadow?: SceneLevers;
}

/** The running scene. */
export interface Scene {
  readonly name: SceneName;
  remaining: number;
  readonly gold: SceneLevers;
  readonly shadow: SceneLevers;
}

/** Snapshot of the running scene for the control room (sceneState). */
export interface SceneState {
  readonly name: SceneName;
  readonly remaining: number;
  readonly duration: number | undefined;
  readonly gold: SceneLevers;
  readonly shadow: SceneLevers;
}

// ===== Announcements and gift feedback =====

export type AnnouncementKind =
  'tier' | 'join' | 'share' | 'follow' | 'like' | 'gift' | 'rescue' | 'streak';

/** On-screen effect label (gift-panel.js EFFECT_LABEL values). */
export type EffectLabel = 'BERRY' | 'SPEED' | 'STEAL' | 'SHIELD' | 'LIFE';

/** Gift effect text (gift-panel.js DUEL_GIFTS effect). */
export type GiftEffect = '+1' | 'speed 10s' | 'steal 15%' | 'shield 15s' | '+1 life';

export type RescueKind = 'shield' | 'life';

/** A queued activity-banner message. */
export interface Announcement {
  readonly kind: AnnouncementKind;
  readonly nickname: string;
  readonly text: string;
  readonly avatar?: string | undefined;
  readonly team?: Team;
  readonly effect?: EffectLabel;
  /** Jumps the queue like a gift. */
  readonly ahead?: boolean;
  /** Game time the banner started showing. */
  t0?: number;
}

/** A gift line in the legend. */
export interface DuelGift {
  readonly img: string;
  readonly price: number;
  readonly effect: GiftEffect;
}

/** Latest donor per team and gift line: giftFeedback[team][line]. */
export interface GiftFeedbackEntry {
  t: number;
  nickname: string;
  n: number;
}

/** Per-team gift rows, sparse by line index 0..4 (berry, speed, steal, shield, life). */
export type GiftFeedbackTable = [
  (GiftFeedbackEntry | undefined)[],
  (GiftFeedbackEntry | undefined)[],
];

/** Donor banner above a team column. */
export interface GiftBanner {
  readonly t: number;
  readonly text: string;
}

/** One donor's total for the current round (end-of-round ranking). */
export interface RoundDonation {
  team: Team;
  total: number;
  avatar?: string;
}

// ===== Audience events =====

export type AudienceEventType =
  'gift' | 'like' | 'share' | 'join' | 'follow' | 'comment' | 'viewers';

/** An audience event from TikFinity, the control room or the simulated crowd (receiveEvent). */
export interface AudienceEvent {
  readonly type: AudienceEventType;
  /** Repeat count, clamped to 1..20. */
  readonly n?: number;
  /** Gift price in coins, per unit. */
  readonly value?: number;
  /** Gift name; decides the team when `team` is absent. */
  readonly name?: string;
  readonly gift?: string;
  readonly team?: Team;
  readonly nickname?: string;
  readonly avatar?: string;
  /** Viewer count ('viewers' events). */
  readonly total?: number;
}
