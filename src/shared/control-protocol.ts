/**
 * Messages exchanged between the control room and the game window over `BroadcastChannel`.
 *
 * The wire format (French keys) is what the shipped control room speaks; it is renamed together
 * with the engine (docs/roadmap.md, step 3). Everything else goes through these types.
 */

export const CONTROL_CHANNEL = 'vipere-duel';

/** How often the game publishes its state to the control room. */
export const STATE_INTERVAL_MS = 500;

export type ControlCommand =
  | { readonly cmd: 'evenement'; readonly ev?: AudienceEvent }
  /** A raw TikFinity Event API message, injected through the same path as the WebSocket. */
  | { readonly cmd: 'brut'; readonly message?: unknown }
  | { readonly cmd: 'pont-demarrer'; readonly url?: string }
  | { readonly cmd: 'pont-arreter' }
  | { readonly cmd: 'manche' }
  | { readonly cmd: 'reglage'; readonly nom: string; readonly valeur: unknown }
  | { readonly cmd: 'scene'; readonly nom: string; readonly duree: number }
  | { readonly cmd: 'sceneStop' }
  | { readonly cmd: 'finTest'; readonly camp: Team };

export interface GameState {
  readonly pont: unknown;
  readonly avantage: number;
  readonly underdog: boolean;
  readonly foule: unknown;
  readonly plateforme: GameSettings['plateforme'];
  readonly fluide: boolean;
  readonly retourCadeau: string;
  readonly bandeau: string;
  readonly classement: string;
  readonly meteo: string;
  readonly ambianceAuto: boolean;
  readonly heure: number;
  readonly nomsDonateurs: boolean;
  readonly superIA: boolean;
  readonly debugIA: boolean;
  readonly scene: unknown;
  readonly duel: {
    readonly t: number;
    readonly vainqueur: DuelSnapshot['vainqueur'];
    readonly or: { readonly longueur: number | undefined };
    readonly ombre: { readonly longueur: number | undefined };
  } | null;
  readonly mesures: { readonly erreurs: number };
}

export interface GameStateMessage {
  readonly etat: GameState;
}

const COMMANDS: ReadonlySet<string> = new Set<ControlCommand['cmd']>([
  'evenement',
  'brut',
  'pont-demarrer',
  'pont-arreter',
  'manche',
  'reglage',
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
