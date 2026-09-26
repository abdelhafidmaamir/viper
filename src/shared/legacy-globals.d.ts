/**
 * Globals the legacy renderer scripts publish on `window`, and the slice of them that typed code
 * relies on. Names stay French until the engine is migrated (docs/roadmap.md); this file is the
 * single place that knows them.
 */

type Team = 'gold' | 'shadow';

interface GameSettings {
  mode: 'base' | 'duel';
  format: 'portrait' | 'landscape';
  giftDisplay: 'scroll' | 'full' | 'none';
  scrollVisible: number;
  scrollHidden: number;
  platform: 'tiktok' | 'neutral';
  weather: string;
  hour: number;
  cycle: number;
  autoAmbience: boolean;
  duelDuration: number;
  advantage: number;
  underdog: boolean;
  superAi: boolean;
  aiDebug: boolean;
  smooth: boolean;
  donorNames: boolean;
  giftFeedback: string;
  banner: string;
  ranking: string;
}

interface GameMetrics {
  errors: number;
  lastError: string | null;
  t: number;
}

interface DuelSnapshot {
  t: number;
  winner: Team | 'draw' | null;
  gold?: { length: number };
  shadow?: { length: number };
}

interface GameApi {
  settings: GameSettings;
  newRound(): void;
  setHour(hour: number): void;
  launchScene(name: string, seconds: number): void;
  stopScene(): void;
  scene(): unknown;
  endTest?(team: Team): void;
  metrics(): GameMetrics;
  duel(): DuelSnapshot | null;
}

interface AudienceEvent {
  type: 'gift' | 'like' | 'share' | 'join' | 'follow' | 'comment' | 'viewers';
  n?: number;
  value?: number;
  name?: string;
  team?: Team;
  nickname?: string;
}

interface SimulatedCrowd {
  configure(level: number): void;
  tick(state: unknown, dt: number): AudienceEvent[];
}

interface TikFinityBridge {
  start(url?: string): void;
  stop(): void;
  process(message: unknown): void;
  state(): unknown;
}

interface Window {
  Viper: GameApi;
  ViperCrowd: { create(): SimulatedCrowd; readState(game: GameApi): unknown };
  TikFinityBridge: TikFinityBridge;
  receiveEvent(event: AudienceEvent): number;
}
