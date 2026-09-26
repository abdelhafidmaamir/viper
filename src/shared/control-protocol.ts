/**
 * Messages exchanged between the control room and the game window over `BroadcastChannel`.
 *
 * The wire format (French keys) is what the shipped control room speaks; it is renamed together
 * with the engine (docs/roadmap.md, step 3). Everything else goes through these types.
 */

export const CONTROL_CHANNEL = 'viper-duel';

/** How often the game publishes its state to the control room. */
export const STATE_INTERVAL_MS = 500;

export type ControlCommand =
  | { readonly cmd: 'event'; readonly ev?: AudienceEvent }
  /** A raw TikFinity Event API message, injected through the same path as the WebSocket. */
  | { readonly cmd: 'raw'; readonly message?: unknown }
  | { readonly cmd: 'bridge-start'; readonly url?: string }
  | { readonly cmd: 'bridge-stop' }
  | { readonly cmd: 'round' }
  | { readonly cmd: 'setting'; readonly name: string; readonly value: unknown }
  | { readonly cmd: 'scene'; readonly name: string; readonly duration: number }
  | { readonly cmd: 'sceneStop' }
  | { readonly cmd: 'finTest'; readonly team: Team };

export interface GameState {
  readonly pont: unknown;
  readonly advantage: number;
  readonly underdog: boolean;
  readonly crowd: unknown;
  readonly platform: GameSettings['platform'];
  readonly smooth: boolean;
  readonly giftFeedback: string;
  readonly banner: string;
  readonly ranking: string;
  readonly weather: string;
  readonly autoAmbience: boolean;
  readonly hour: number;
  readonly donorNames: boolean;
  readonly superAi: boolean;
  readonly aiDebug: boolean;
  readonly scene: unknown;
  readonly duel: {
    readonly t: number;
    readonly winner: DuelSnapshot['winner'];
    readonly gold: { readonly length: number | undefined };
    readonly shadow: { readonly length: number | undefined };
  } | null;
  readonly metrics: { readonly errors: number };
}

export interface GameStateMessage {
  readonly state: GameState;
}

const COMMANDS: ReadonlySet<string> = new Set<ControlCommand['cmd']>([
  'event',
  'raw',
  'bridge-start',
  'bridge-stop',
  'round',
  'setting',
  'scene',
  'sceneStop',
  'finTest',
]);

/** Narrows an untrusted channel payload to a command envelope with a known `cmd`. */
export function isControlCommand(value: unknown): value is ControlCommand {
  return (
    typeof value === 'object' &&
    value !== null &&
    'cmd' in value &&
    typeof value.cmd === 'string' &&
    COMMANDS.has(value.cmd)
  );
}
