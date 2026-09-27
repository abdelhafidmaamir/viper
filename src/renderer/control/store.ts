/**
 * The control room's single store. Everything the views show derives from this state; the
 * reducer is pure and every time-dependent rule takes the time from the action.
 */
import type { ControlCommand, GameState } from '../../shared/control-protocol.ts';

import { describeCommand } from './commands.ts';
import { IDLE, expire as expireArm, type ArmState } from './confirm.ts';
import type { CrowdStatus } from './crowd-driver.ts';
import { NO_BRIDGE, decodeBridge, decodeScene, type BridgeView, type SceneView } from './decode.ts';
import {
  EMPTY_LOG,
  append,
  dismiss,
  newCrowdLines,
  type LogFilter,
  type LogInput,
  type LogState,
} from './log.ts';
import {
  DEFAULT_BRIDGE_URL,
  SETTING_LABELS,
  UNVERIFIED_SETTINGS,
  VERIFIED_SETTINGS,
  echoOf,
  sceneLabel,
  type SettingName,
  type TabId,
} from './model.ts';
import { emptySlot, expire, observe, request, type SettingSlot } from './pending.ts';

export type LinkStatus = 'waiting' | 'online' | 'stale' | 'offline';

/** Below this age of the last state message the link is online (two missed messages allowed). */
export const ONLINE_MAX_MS = 1200;
/** Up to this age it is stale; beyond, offline. */
export const STALE_MAX_MS = 3000;
/** Fire-and-forget commands must show their effect within this time, or the log says so. */
export const EFFECT_TIMEOUT_MS = 3000;

export function linkStatusOf(lastStateAt: number | null, now: number): LinkStatus {
  if (lastStateAt === null) return 'waiting';
  const age = now - lastStateAt;
  if (age < ONLINE_MAX_MS) return 'online';
  return age <= STALE_MAX_MS ? 'stale' : 'offline';
}

export type EffectKind = 'round' | 'scene' | 'sceneStop' | 'bridge-start';

export interface Effect {
  readonly kind: EffectKind;
  readonly sentAt: number;
  readonly scene?: string;
  /** Round clock when the new round was requested. */
  readonly baselineT?: number | null;
}

export interface UiState {
  readonly tab: TabId;
  readonly logFilter: LogFilter;
  readonly logOpen: boolean;
  readonly helpOpen: boolean;
  readonly bridgeUrl: string;
}

export interface ControlState {
  readonly admin: boolean;
  readonly now: number;
  readonly lastStateAt: number | null;
  readonly link: LinkStatus;
  readonly game: GameState | null;
  readonly bridge: BridgeView;
  readonly scene: SceneView | null;
  /** When `scene.remaining` was measured, to interpolate the countdown between messages. */
  readonly sceneAt: number;
  readonly settings: Readonly<Record<SettingName, SettingSlot>>;
  readonly effects: readonly Effect[];
  readonly armed: ArmState;
  readonly log: LogState;
  readonly crowd: CrowdStatus;
  /** Viewer count of the last tier test sent: the game does not report the tier. */
  readonly lastTier: number | null;
  readonly errorsRaisedAt: number | null;
  readonly ui: UiState;
}

export type Action =
  | { readonly type: 'state'; readonly state: GameState; readonly at: number }
  | { readonly type: 'tick'; readonly at: number }
  | {
      readonly type: 'sent';
      readonly command: ControlCommand;
      readonly at: number;
      readonly quiet?: boolean;
    }
  | { readonly type: 'armed'; readonly armed: ArmState }
  | { readonly type: 'crowd'; readonly crowd: CrowdStatus; readonly at: number }
  | { readonly type: 'note'; readonly entry: LogInput; readonly at: number }
  | { readonly type: 'log-dismiss'; readonly id: number }
  | { readonly type: 'log-filter'; readonly filter: LogFilter }
  | { readonly type: 'log-toggle' }
  | { readonly type: 'help'; readonly open: boolean }
  | { readonly type: 'tab'; readonly tab: TabId }
  | { readonly type: 'bridge-url'; readonly url: string };

export function initialState(admin: boolean, now: number): ControlState {
  const settings = {} as Record<SettingName, SettingSlot>;
  for (const name of VERIFIED_SETTINGS) settings[name] = emptySlot(true);
  for (const name of UNVERIFIED_SETTINGS) settings[name] = emptySlot(false);
  return {
    admin,
    now,
    lastStateAt: null,
    link: 'waiting',
    game: null,
    bridge: NO_BRIDGE,
    scene: null,
    sceneAt: now,
    settings,
    effects: [],
    armed: IDLE,
    log: EMPTY_LOG,
    crowd: { density: 0, mode: 'battle', effectiveMode: 'battle', sentGifts: 0, view: null },
    lastTier: null,
    errorsRaisedAt: null,
    ui: {
      tab: 'live',
      logFilter: 'all',
      logOpen: false,
      helpOpen: false,
      bridgeUrl: DEFAULT_BRIDGE_URL,
    },
  };
}

const EFFECT_LABELS: Readonly<Record<EffectKind, string>> = {
  round: 'new round',
  scene: 'scene start',
  sceneStop: 'scene stop',
  'bridge-start': 'TikFinity connection',
};

function effectOf(command: ControlCommand, state: ControlState, at: number): Effect | null {
  switch (command.cmd) {
    case 'round':
      return { kind: 'round', sentAt: at, baselineT: state.game?.duel?.t ?? null };
    case 'scene':
      return { kind: 'scene', sentAt: at, scene: command.name };
    case 'sceneStop':
      return { kind: 'sceneStop', sentAt: at };
    case 'bridge-start':
      return { kind: 'bridge-start', sentAt: at };
    case 'bridge-stop':
    case 'event':
    case 'raw':
    case 'setting':
    case 'endTest':
      return null;
  }
}

function effectSeen(effect: Effect, game: GameState, bridge: BridgeView): boolean {
  switch (effect.kind) {
    case 'round':
      if (!game.duel) return false;
      return effect.baselineT === null || effect.baselineT === undefined
        ? true
        : game.duel.t < effect.baselineT;
    case 'scene':
      return decodeScene(game.scene)?.name === effect.scene;
    case 'sceneStop':
      return decodeScene(game.scene) === null;
    case 'bridge-start':
      return bridge.connected || bridge.error !== '';
  }
}

function onSent(
  state: ControlState,
  command: ControlCommand,
  at: number,
  quiet: boolean,
): ControlState {
  const notes: LogInput[] = quiet
    ? []
    : [{ source: 'cmd', level: 'info', text: describeCommand(command) }];
  let { settings, scene, lastTier } = state;
  if (command.cmd === 'setting' && command.name in settings) {
    const name = command.name as SettingName;
    const value = command.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      settings = { ...settings, [name]: request(settings[name], value, at) };
    }
  }
  // Stopping clears the scene at once instead of waiting up to 500 ms for the next state.
  if (command.cmd === 'sceneStop') scene = null;
  if (command.cmd === 'event' && command.ev?.type === 'viewers') {
    const total = (command.ev as { total?: unknown }).total;
    if (typeof total === 'number') lastTier = total;
  }
  const effect = effectOf(command, state, at);
  const effects = effect
    ? [...state.effects.filter((pending) => pending.kind !== effect.kind), effect]
    : state.effects;
  return { ...state, settings, scene, lastTier, effects, log: append(state.log, at, notes) };
}

function onState(state: ControlState, game: GameState, at: number): ControlState {
  const notes: LogInput[] = [];
  const bridge = decodeBridge(game.bridge);
  if (bridge.connected !== state.bridge.connected) {
    notes.push(
      bridge.connected
        ? {
            source: 'bridge',
            level: 'info',
            text: `TikFinity connected to ${bridge.url || 'default URL'}`,
          }
        : { source: 'bridge', level: 'warn', text: 'TikFinity disconnected' },
    );
  }
  if (bridge.error && bridge.error !== state.bridge.error) {
    notes.push({ source: 'bridge', level: 'error', text: `TikFinity error: ${bridge.error}` });
  }
  if (state.link !== 'online') {
    notes.push({ source: 'link', level: 'info', text: 'Game window online' });
  }
  const previousErrors = state.game?.metrics.errors ?? 0;
  const raised = game.metrics.errors > previousErrors;
  if (raised) {
    notes.push({
      source: 'link',
      level: 'error',
      text: `Engine errors: ${String(game.metrics.errors)}`,
    });
  }

  const settings = { ...state.settings };
  for (const name of VERIFIED_SETTINGS) {
    const before = settings[name];
    const after = observe(before, echoOf(name, game), at);
    if (after.status === 'error' && before.status !== 'error') {
      notes.push({ source: 'cmd', level: 'error', text: `Not applied: ${SETTING_LABELS[name]}` });
    }
    settings[name] = after;
  }

  const effects = state.effects.filter((effect) => {
    if (!effectSeen(effect, game, bridge)) return true;
    const what =
      effect.kind === 'scene' && effect.scene
        ? `scene ${sceneLabel(effect.scene)}`
        : EFFECT_LABELS[effect.kind];
    notes.push({ source: 'cmd', level: 'info', text: `Confirmed: ${what}` });
    return false;
  });

  return {
    ...state,
    now: at,
    lastStateAt: at,
    link: 'online',
    game,
    bridge,
    scene: decodeScene(game.scene),
    sceneAt: at,
    settings,
    effects,
    errorsRaisedAt: raised ? at : state.errorsRaisedAt,
    log: append(state.log, at, notes),
  };
}

const LINK_NOTES: Readonly<Record<LinkStatus, LogInput | null>> = {
  waiting: null,
  online: null,
  stale: { source: 'link', level: 'warn', text: 'Game link stale: no update for over a second' },
  offline: { source: 'link', level: 'error', text: 'Game window not responding' },
};

function onTick(state: ControlState, at: number): ControlState {
  const notes: LogInput[] = [];
  const link = linkStatusOf(state.lastStateAt, at);
  const linkNote = LINK_NOTES[link];
  if (link !== state.link && linkNote) notes.push(linkNote);
  const frozen = link !== 'online';

  let settingsChanged = false;
  const settings = { ...state.settings };
  for (const name of VERIFIED_SETTINGS) {
    const before = settings[name];
    const after = expire(before, at, frozen);
    if (after !== before) {
      settingsChanged = true;
      notes.push({ source: 'cmd', level: 'error', text: `Not applied: ${SETTING_LABELS[name]}` });
      settings[name] = after;
    }
  }

  const effects = frozen
    ? state.effects
    : state.effects.filter((effect) => {
        if (at - effect.sentAt < EFFECT_TIMEOUT_MS) return true;
        notes.push({
          source: 'cmd',
          level: 'warn',
          text: `No effect seen: ${EFFECT_LABELS[effect.kind]}`,
        });
        return false;
      });

  return {
    ...state,
    now: at,
    link,
    settings: settingsChanged ? settings : state.settings,
    effects: effects.length === state.effects.length ? state.effects : effects,
    armed: expireArm(state.armed, at),
    log: append(state.log, at, notes),
  };
}

function onCrowd(state: ControlState, crowd: CrowdStatus, at: number): ControlState {
  const lines = newCrowdLines(state.crowd.view?.log ?? [], crowd.view?.log ?? []);
  const notes = lines.map((text): LogInput => ({ source: 'crowd', level: 'info', text }));
  return { ...state, crowd, log: append(state.log, at, notes) };
}

export function reduce(state: ControlState, action: Action): ControlState {
  switch (action.type) {
    case 'state':
      return onState(state, action.state, action.at);
    case 'tick':
      return onTick(state, action.at);
    case 'sent':
      return onSent(state, action.command, action.at, action.quiet === true);
    case 'armed':
      return { ...state, armed: action.armed };
    case 'crowd':
      return onCrowd(state, action.crowd, action.at);
    case 'note':
      return { ...state, log: append(state.log, action.at, [action.entry]) };
    case 'log-dismiss':
      return { ...state, log: dismiss(state.log, action.id) };
    case 'log-filter':
      return { ...state, ui: { ...state.ui, logFilter: action.filter } };
    case 'log-toggle':
      return { ...state, ui: { ...state.ui, logOpen: !state.ui.logOpen } };
    case 'help':
      return { ...state, ui: { ...state.ui, helpOpen: action.open } };
    case 'tab':
      return action.tab === 'admin' && !state.admin
        ? state
        : { ...state, ui: { ...state.ui, tab: action.tab } };
    case 'bridge-url':
      return { ...state, ui: { ...state.ui, bridgeUrl: action.url } };
  }
}

export interface Store {
  get(): ControlState;
  dispatch(action: Action): void;
  subscribe(listener: (state: ControlState) => void): () => void;
}

export function createStore(initial: ControlState): Store {
  let current = initial;
  const listeners = new Set<(state: ControlState) => void>();
  return {
    get: () => current,
    dispatch(action) {
      const next = reduce(current, action);
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener(current);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
