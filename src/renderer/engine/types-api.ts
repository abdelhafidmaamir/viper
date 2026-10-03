/**
 * Interfaces between the engine and the scripts published on `window`: the AI players, the
 * ambience, the simulated crowd, the TikFinity bridge, the end-of-round snake and the public game
 * API. Types only, no runtime code.
 */

import type {
  AiDebug,
  AiMemory,
  AiReason,
  AudienceEvent,
  Cell,
  DeathCause,
  Direction,
  Fruit,
  Moments,
  Point,
  RoundRecord,
  RoundState,
  RoundWinner,
  SceneState,
  Settings,
  Stance,
  Team,
  TierId,
  Weather,
} from './types.ts';

// ===== AI players =====

/** Decision state built by requestAiMove (game.js) for ViperAi.choose and ViperSuperAi.choose. */
export interface AiState {
  readonly cols: number;
  readonly rows: number;
  readonly body: readonly Cell[];
  readonly dir: Direction;
  readonly fruits: readonly Fruit[];
  readonly obstacles: readonly Cell[];
  /** Crown around the opponent's head: avoided if possible, never at the cost of survival. */
  readonly avoid: readonly Cell[];
  readonly toGrow: number;
  recklessness: number;
  /** -1..1, positive favors this snake. */
  readonly advantage: number;
  /** Overwritten by forcedFlair inside the human AI. */
  flair: number;
  /** Overwritten by forcedHunt inside the human AI. */
  hunt: number;
  readonly opponent: readonly Cell[] | null;
  readonly opponentInvincible: boolean;
  readonly memory: AiMemory;
  forcedStance?: Stance;
  attackRange?: number;
  defenseRange?: number;
  forcedHunt?: number;
  forcedFlair?: number;
  berryRace?: boolean;
  immediateTrap?: boolean;
  lure?: boolean;
  repel?: boolean;
  encircle?: boolean;
  noKill?: boolean;
  /** Fill memory.debug for the overlay. */
  debug?: boolean;
  /** Super AI only: the heading already announced, kept when still sound. */
  preferred?: Direction;
  /** Human AI internal: obstacles without the avoid crown. */
  readonly obstaclesWithout?: readonly Cell[];
}

/** window.ViperAi (ai-human.js). */
export interface ViperAiApi {
  choose(state: AiState): Direction;
  /** Is step `d` still safe: free cell, and the head still reaches its tail afterwards. */
  safeStep(state: AiState, d: Direction): boolean;
}

/** window.ViperSuperAi (ai-super.js): adversarial search under a time budget (VIPER_SUPER_MS). */
export interface ViperSuperAiApi {
  choose(state: AiState): Direction;
}

// ===== Ambience =====

/** Per-frame context frame.js hands to the ambience painters. */
export interface AmbienceFrame {
  t: number;
  dt: number;
  W: number;
  H: number;
  cell: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  head: Point;
  world: number;
  worldKind: string | null;
  silence: number;
  hour: number;
  weather: Weather;
  /** Switch weather without a crossfade (start of a round with auto ambience). */
  weatherSnap: boolean;
  subStep: number;
  progression: number;
  tension: number;
  reduced: boolean;
}

/** paintSnake options: the frame plus the snake tint, or the tint alone (mini snake in the banner). */
export type SnakePaintOptions = Partial<AmbienceFrame> & { readonly tint?: string };

export type HatchPhase = 'crack' | 'birth';
export type AmbienceGiftSound = 'help' | 'hinder' | 'world';

/** A running ambient sound loop. */
export interface AmbientSoundHandle {
  stop(): void;
  /** Lower volume briefly, then restore it over `sec` seconds. */
  silence(sec: number): void;
}

/** A visual and sound ambience registered on window.AMBIENCES (forest-ambience.ts). */
export interface Ambience {
  readonly id: string;
  /** Note frequencies (Hz) the bite sound walks through. */
  readonly scale: readonly number[];
  paintBack(g: CanvasRenderingContext2D, e: AmbienceFrame): void;
  paintFront(g: CanvasRenderingContext2D, e: AmbienceFrame): void;
  paintSnake(
    g: CanvasRenderingContext2D,
    pts: readonly Point[],
    cell: number,
    e: SnakePaintOptions,
  ): void;
  paintFruit(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    cell: number,
    e: AmbienceFrame,
    f?: { readonly nickname?: string },
  ): void;
  paintObstacle(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    cell: number,
    e: AmbienceFrame,
    o?: { readonly kind?: string },
  ): void;
  update(dt: number, e: AmbienceFrame): void;
  ambientSound(
    ac: AudioContext,
    destination: AudioNode,
    opts?: { readonly externalMusic?: boolean },
  ): AmbientSoundHandle;
  biteSound(ac: AudioContext, destination: AudioNode, freq: number): void;
  /** Optional: game.js checks for it before playing the hatch. */
  hatchSound?(ac: AudioContext, destination: AudioNode, phase: HatchPhase): void;
  giftSound(ac: AudioContext, destination: AudioNode, type: AmbienceGiftSound): void;
}

// ===== Simulated crowd =====

export type CrowdPurchase = 'rose' | 'boost' | 'steal' | 'shield' | 'life';
/** Crowd density level, 0 (off) to 3. */
export type CrowdDensity = 0 | 1 | 2 | 3;

/** One team as the simulated crowd reads it. */
export interface CrowdTeamInput {
  readonly L: number;
  readonly head: Cell | null;
  readonly shieldTime: number;
  readonly hold: number;
  readonly lives: number;
  readonly boostTime: number;
  readonly invincibleTime: number;
}

/** Game snapshot fed to the simulated crowd (ViperCrowd.readState). */
export interface CrowdInput {
  readonly t: number;
  readonly duration: number;
  readonly inProgress: boolean;
  readonly gold: CrowdTeamInput;
  readonly shadow: CrowdTeamInput;
  readonly berries: readonly Cell[];
}

export type CrowdCounts = Record<CrowdPurchase, number>;

export interface CrowdTeamView {
  readonly fervor: number;
  readonly purse: number;
  readonly spend: number;
  readonly last: CrowdPurchase | '';
}

/** Control-room view of the simulated crowd. */
export interface CrowdView {
  readonly density: number;
  readonly log: string[];
  readonly counts: { readonly gold: CrowdCounts; readonly shadow: CrowdCounts };
  readonly gold: CrowdTeamView;
  readonly shadow: CrowdTeamView;
}

/** One simulated audience instance. */
export interface SimulatedCrowd {
  configure(level: CrowdDensity): void;
  tick(state: CrowdInput | null, dt: number): AudienceEvent[];
  view(): CrowdView;
}

/** window.ViperCrowd (simulated-audience.js). */
export interface ViperCrowdApi {
  create(): SimulatedCrowd;
  readState(game: ViperApi): CrowdInput | null;
  readonly PRICES: Readonly<Record<CrowdPurchase, number>>;
}

// ===== TikFinity bridge =====

export type TikFinityEventName =
  'chat' | 'gift' | 'share' | 'follow' | 'like' | 'roomUser' | 'subscribe' | 'member' | 'join';

/** Payload fields the bridge reads (TikTok-Live-Connector format). */
export interface TikFinityPayload {
  /** 'social' messages: what the viewer did, e.g. "pm_main_follow_message_viewer_2". */
  readonly displayType?: string;
  readonly label?: string;
  readonly uniqueId?: string;
  /** TikTok-Live-Connector: the viewer moderates this live. */
  readonly isModerator?: boolean;
  /** TikTok-Live-Connector: the badges shown next to the name; a moderator's names itself. */
  readonly userBadges?: readonly { readonly type?: string; readonly name?: string }[];
  /** TikTok-Live-Connector: the viewer's gifter level across all of TikTok. */
  readonly gifterLevel?: number | string;
  readonly nickname?: string;
  readonly profilePictureUrl?: string;
  readonly likeCount?: number | string;
  readonly viewerCount?: number | string;
  readonly giftType?: number;
  readonly giftName?: string;
  readonly repeatEnd?: boolean;
  readonly repeatCount?: number | string;
  readonly diamondCount?: number | string;
  readonly gift?: { readonly gift_type?: number; readonly repeat_end?: number };
}

/** A TikFinity Event API message. */
export interface TikFinityMessage {
  readonly event: TikFinityEventName;
  readonly data?: TikFinityPayload;
}

/** Connection state exposed to the control room. */
export interface TikFinityState {
  readonly connected: boolean;
  readonly url: string;
  readonly events: number;
  readonly gifts: number;
  readonly last: string;
  /** Last raw message, truncated; absent before the first message on the change callback. */
  readonly raw?: string;
  readonly error: string;
}

/** window.TikFinityBridge (tikfinity-bridge.js). */
export interface TikFinityBridgeApi {
  start(url?: string): void;
  stop(): void;
  /** Handles one message; returns receiveEvent's result, or null when nothing was forwarded. */
  process(message: unknown): number | null;
  /** Count each step of a streak at once (Feed) instead of waiting for the final message. */
  liveStreaks(on: boolean): void;
  /** The first message of each kind, as received, for the journal; each is handed over once. */
  takeSamples?(): string[];
  state(): TikFinityState & { readonly raw: string };
  /** Change listener (accessor pair). */
  surChangement: ((state: TikFinityState) => void) | null;
}

// ===== End-of-round snake =====

export interface TeamColors {
  /** CSS color. */
  readonly tint: string;
  /** "r,g,b". */
  readonly rgb: string;
}

/** Options for SnakeEnding.paint (end-screen.js builds and mutates it). */
export interface EndingOptions {
  state: 'happy' | 'sad';
  t: number;
  cx: number;
  cy: number;
  R: number;
  u: number;
  tint?: string;
  rgb?: string;
}

export interface EndingDrawOptions extends EndingOptions {
  readonly gold?: TeamColors;
  readonly shadow?: TeamColors;
}

/** window.SnakeEnding (snake-ending.js). */
export interface SnakeEndingApi {
  paint(g: CanvasRenderingContext2D, o: EndingOptions): void;
  paintDraw?(g: CanvasRenderingContext2D, o: EndingDrawOptions): void;
}

// ===== Public game API (window.Viper) =====

export interface TierSnapshot {
  readonly id: TierId;
  readonly cadence: number;
  readonly topSun: number;
  readonly topMoon: number;
}

export interface RoundSnapshot {
  readonly state: RoundState;
  readonly t: number;
  readonly sun: number;
  readonly moon: number;
  readonly winner: RoundWinner | null;
  readonly skySun: number;
  readonly skyMoon: number;
  readonly harvest: number;
  readonly target: number;
}

export interface GameMetrics {
  readonly length: number;
  readonly berriesEaten: number;
  readonly deaths: number;
  readonly errors: number;
  readonly lastError: string | null;
  readonly t: number;
  readonly turns: number;
  readonly staircases: number;
  readonly avoidable: number;
  readonly deathLengths: readonly number[];
  readonly giftsSpawned: number;
  readonly giftsEaten: number;
  readonly berries: number;
}

export interface DuelTeamSnapshot {
  readonly length: number;
  readonly stance: Stance;
  readonly reason: AiReason | null | undefined;
  readonly hold: number;
  readonly shieldTime: number;
  readonly lives: number;
  readonly boostTime: number;
  readonly invincibleTime: number;
  readonly cutTime: number;
  readonly recoilTime: number;
}

/** Duel snapshot; t and winner are null before the first round. */
export interface DuelSnapshot {
  readonly t: number | null;
  readonly winner: RoundWinner | null;
  readonly gold: DuelTeamSnapshot | null;
  readonly shadow: DuelTeamSnapshot | null;
}

export interface InternalBody {
  readonly team: Team;
  readonly length: number;
  readonly head: Cell | null;
  readonly snake: readonly Cell[];
  readonly dir: Direction;
  readonly invincibleTime: number;
  readonly deathCause: DeathCause | null;
  readonly debug: AiDebug | null;
}

/** Board internals for probes and harnesses (Viper.internal). */
export interface InternalSnapshot {
  readonly snake: readonly Cell[];
  readonly dir: Direction;
  readonly stones: readonly { readonly x: number; readonly y: number; readonly t: number }[];
  readonly brambles: readonly {
    readonly t: number;
    readonly seg: readonly { readonly x: number; readonly y: number; readonly t: number }[];
  }[];
  readonly warning: number;
  readonly speed: number;
  readonly brambleWarning: number;
  readonly brambleMax: number;
  readonly berries: readonly {
    readonly x: number;
    readonly y: number;
    readonly team: Team | null;
  }[];
  readonly seeds: readonly Cell[];
  readonly body: readonly InternalBody[];
}

/** window.Viper (game.js): control room, harness and probe entry points. */
export interface ViperApi {
  readonly settings: Settings;
  spawn(keep?: boolean, x0?: number, y0?: number, dir0?: Direction): void;
  advance(dt: number): void;
  toggleSound(): boolean;
  newRound(): void;
  tension(): number;
  scene(): SceneState | null;
  /** Unknown names are ignored; duration falls back to the scene's own. */
  launchScene(name: string, duration?: number): void;
  stopScene(): void;
  endTest(team?: RoundWinner): void;
  soundOn(): boolean;
  tier(): TierSnapshot;
  round(): RoundSnapshot | null;
  rounds(): readonly RoundRecord[];
  score(): { readonly snake: number; readonly viewers: number };
  resetScore(): void;
  shake(): { readonly adjustments: number; readonly holds: number };
  metrics(): GameMetrics;
  duel(): DuelSnapshot;
  setSky(id: TierId, sun?: number, moon?: number): void;
  setTarget(id: TierId, target: number): void;
  setMaxLength(length: number): void;
  setMaxStones(id: TierId, value: number): void;
  setHit(id: TierId, value: number): void;
  setFlair(team: Team, value: number): void;
  setHoldSeconds(seconds: number): void;
  moments(): Moments;
  resetMoments(): void;
  setHunt(team: Team, value: number): void;
  setHour(hour: number): void;
  egg(): { readonly t: number; readonly duration: number } | null;
  plantBramble(): boolean;
  internal(): InternalSnapshot;
}

/** Entry point for every audience event; returns the number of effects applied. */
export type ReceiveEvent = (event: AudienceEvent | null | undefined) => number;

// ===== Window globals =====

/**
 * Every global the renderer reads or publishes. Viper, ViperCrowd, TikFinityBridge and
 * receiveEvent are still declared on Window by src/shared/legacy-globals.d.ts with looser types;
 * they join the `declare global` block below once that file is retired.
 */
export interface ViperWindowGlobals {
  Viper: ViperApi;
  ViperCrowd: ViperCrowdApi;
  TikFinityBridge: TikFinityBridgeApi;
  receiveEvent: ReceiveEvent;
  ViperAi?: ViperAiApi;
  ViperSuperAi?: ViperSuperAiApi;
  SnakeEnding?: SnakeEndingApi;
  AMBIENCES?: Ambience[];
  VIPER_ALWAYS_REDECIDE?: boolean;
  VIPER_NO_BLOCKING?: boolean;
  /** Super AI time budget per decision, in ms (default 5). */
  VIPER_SUPER_MS?: number;
  __crowdState?: (crowd: CrowdInput | null) => void;
  __syncThumb?: (advantage: number) => void;
  __syncSuper?: (on: boolean) => void;
  __syncScene?: (scene: SceneState | null, underdog: boolean) => void;
}

declare global {
  interface Window {
    ViperAi?: ViperAiApi;
    ViperSuperAi?: ViperSuperAiApi;
    SnakeEnding?: SnakeEndingApi;
    AMBIENCES?: Ambience[];
    VIPER_ALWAYS_REDECIDE?: boolean;
    VIPER_NO_BLOCKING?: boolean;
    VIPER_SUPER_MS?: number;
    __crowdState?: (crowd: CrowdInput | null) => void;
    __syncThumb?: (advantage: number) => void;
    __syncSuper?: (on: boolean) => void;
    __syncScene?: (scene: SceneState | null, underdog: boolean) => void;
  }
}
