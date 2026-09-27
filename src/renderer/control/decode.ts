/**
 * Narrows the loosely typed parts of the game state into local view types. The protocol declares
 * `bridge`, `scene` and `crowd` as `unknown`; nothing downstream reads them without these guards.
 */
import type { GameState, GameStateMessage } from '../../shared/control-protocol.ts';

export interface BridgeView {
  readonly connected: boolean;
  readonly url: string;
  readonly events: number;
  readonly gifts: number;
  readonly last: string;
  readonly error: string;
}

export const NO_BRIDGE: BridgeView = {
  connected: false,
  url: '',
  events: 0,
  gifts: 0,
  last: '',
  error: '',
};

/** Director levers a scene applies to one team; only the known ones are kept. */
export interface SceneEffects {
  readonly stance?: string;
  readonly pA?: number;
  readonly pD?: number;
  readonly hunt?: number;
  readonly flair?: number;
  readonly recklessness?: number;
  readonly berryRace?: boolean;
  readonly lure?: boolean;
  readonly repel?: boolean;
  readonly noKill?: boolean;
  readonly encircle?: boolean;
  readonly immediateTrap?: boolean;
}

export interface SceneView {
  readonly name: string;
  readonly remaining: number;
  readonly duration: number;
  readonly gold: SceneEffects;
  readonly shadow: SceneEffects;
}

export interface CrowdView {
  readonly log: readonly string[];
  readonly gold: CrowdTeamView;
  readonly shadow: CrowdTeamView;
}

export interface CrowdTeamView {
  readonly fervor: number;
  readonly spend: number;
  readonly counts: Readonly<Record<'boost' | 'steal' | 'shield' | 'life', number>>;
}

type Rec = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function decodeBridge(value: unknown): BridgeView {
  if (!isRecord(value)) return NO_BRIDGE;
  return {
    connected: value.connected === true,
    url: str(value.url),
    events: num(value.events),
    gifts: num(value.gifts),
    last: str(value.last),
    error: str(value.error),
  };
}

const NUMERIC_EFFECTS = ['pA', 'pD', 'hunt', 'flair', 'recklessness'] as const;
const FLAG_EFFECTS = ['berryRace', 'lure', 'repel', 'noKill', 'encircle', 'immediateTrap'] as const;

export function decodeEffects(value: unknown): SceneEffects {
  if (!isRecord(value)) return {};
  const effects: Record<string, string | number | boolean> = {};
  if (typeof value.stance === 'string') effects.stance = value.stance;
  for (const key of NUMERIC_EFFECTS) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) effects[key] = field;
  }
  for (const key of FLAG_EFFECTS) if (value[key] === true) effects[key] = true;
  return effects;
}

export function decodeScene(value: unknown): SceneView | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  return {
    name: value.name,
    remaining: Math.max(0, num(value.remaining)),
    duration: Math.max(0, num(value.duration)),
    gold: decodeEffects(value.gold),
    shadow: decodeEffects(value.shadow),
  };
}

function decodeTeam(view: Rec, counts: unknown, team: Team): CrowdTeamView {
  const side = isRecord(view[team]) ? view[team] : {};
  const tally = isRecord(counts) && isRecord(counts[team]) ? counts[team] : {};
  return {
    fervor: Math.min(1, Math.max(0, num(side.fervor))),
    spend: num(side.spend),
    counts: {
      boost: num(tally.boost),
      steal: num(tally.steal),
      shield: num(tally.shield),
      life: num(tally.life),
    },
  };
}

/** Decodes the simulated crowd brain's `view()` output. */
export function decodeCrowdView(value: unknown): CrowdView | null {
  if (!isRecord(value)) return null;
  const log = Array.isArray(value.log)
    ? value.log.filter((line): line is string => typeof line === 'string')
    : [];
  return {
    log,
    gold: decodeTeam(value, value.counts, 'gold'),
    shadow: decodeTeam(value, value.counts, 'shadow'),
  };
}

function isDuel(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.t === 'number' &&
      isRecord(value.gold) &&
      isRecord(value.shadow))
  );
}

/**
 * Accepts a channel payload as a state message when its core fields have the declared types. The
 * control room also hears its own commands on the channel: those are rejected here.
 */
export function decodeStateMessage(data: unknown): GameState | null {
  if (!isRecord(data) || !isRecord(data.state)) return null;
  const state = data.state;
  if (!isDuel(state.duel) || !isRecord(state.metrics)) return null;
  if (typeof state.platform !== 'string' || typeof state.advantage !== 'number') return null;
  return (data as unknown as GameStateMessage).state;
}
