import {
  CONTROL_CHANNEL,
  isControlCommand,
  STATE_INTERVAL_MS,
  type ControlCommand,
  type GameState,
  type GameStateMessage,
} from '../../shared/control-protocol.ts';

export interface GameLinkDeps {
  readonly game: GameApi;
  readonly bridge: TikFinityBridge;
  readonly receiveEvent: (event: AudienceEvent) => unknown;
  readonly readCrowd: () => unknown;
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
}

type PersistedSetting = 'platform' | 'donorNames' | 'smooth';

/**
 * Settings that survive a restart. Decoding is deliberately one-sided: only a value that departs
 * from the engine default is applied. `legacyKey` is where builds before the English rename
 * stored the same choice, read once when the current key is empty so existing installs keep it.
 */
const PERSISTED: Readonly<
  Record<
    PersistedSetting,
    {
      readonly key: string;
      readonly legacyKey: string;
      readonly encode: (value: unknown) => string;
      readonly decode: (stored: string | null) => GameSettings[PersistedSetting] | undefined;
    }
  >
> = {
  platform: {
    key: 'viper-platform',
    legacyKey: 'vipere-plateforme',
    encode: String,
    decode: (stored) =>
      stored === 'neutral' || stored === 'neutre'
        ? 'neutral'
        : stored === 'tiktok'
          ? stored
          : undefined,
  },
  donorNames: {
    key: 'viper-donor-names',
    legacyKey: 'vipere-noms',
    encode: (value) => (value ? '1' : '0'),
    decode: (stored) => (stored === '0' ? false : undefined),
  },
  smooth: {
    key: 'viper-smooth',
    legacyKey: 'vipere-fluide',
    encode: (value) => (value ? '1' : '0'),
    decode: (stored) => (stored === '1' ? true : undefined),
  },
};

const isPersisted = (name: string): name is PersistedSetting => name in PERSISTED;

/** Storage can throw (quota, disabled storage). Preferences are a convenience, never fatal. */
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

export function restorePreferences({ game, storage }: GameLinkDeps): void {
  for (const name of Object.keys(PERSISTED) as PersistedSetting[]) {
    const { key, legacyKey, decode } = PERSISTED[name];
    const stored = safely(() => storage.getItem(key) ?? storage.getItem(legacyKey)) ?? null;
    const value = decode(stored);
    if (value !== undefined) Object.assign(game.settings, { [name]: value });
  }
}

export function applyCommand(command: ControlCommand, deps: GameLinkDeps): void {
  const { game, bridge } = deps;
  switch (command.cmd) {
    case 'event':
      deps.receiveEvent(command.ev ?? ({} as AudienceEvent));
      return;
    case 'raw':
      bridge.process(command.message ?? null);
      return;
    case 'bridge-start':
      bridge.start(command.url);
      return;
    case 'bridge-stop':
      bridge.stop();
      return;
    case 'round':
      game.settings.mode = 'duel';
      game.newRound();
      return;
    case 'setting': {
      const { name, value } = command;
      // Own keys only: `in` would accept inherited names such as __proto__.
      if (!Object.hasOwn(game.settings, name)) return;
      Object.assign(game.settings, { [name]: value });
      if (isPersisted(name)) {
        const { key, encode } = PERSISTED[name];
        safely(() => {
          deps.storage.setItem(key, encode(value));
        });
      }
      return;
    }
    case 'scene':
      game.launchScene(command.name, command.duration);
      return;
    case 'sceneStop':
      game.stopScene();
      return;
    case 'endTest':
      game.endTest?.(command.team);
      return;
  }
}

export function snapshot({ game, bridge, readCrowd }: GameLinkDeps): GameState {
  const settings = game.settings;
  const duel = game.duel();
  return {
    bridge: bridge.state(),
    advantage: settings.advantage || 0,
    underdog: settings.underdog,
    crowd: readCrowd(),
    platform: settings.platform,
    smooth: settings.smooth,
    giftFeedback: settings.giftFeedback,
    banner: settings.banner,
    ranking: settings.ranking,
    weather: settings.weather,
    autoAmbience: settings.autoAmbience,
    hour: settings.hour,
    donorNames: settings.donorNames,
    superAi: settings.superAi,
    aiDebug: settings.aiDebug,
    scene: game.scene(),
    duel: duel
      ? {
          t: duel.t,
          winner: duel.winner,
          gold: { length: duel.gold?.length },
          shadow: { length: duel.shadow?.length },
        }
      : null,
    metrics: { errors: game.metrics().errors },
  };
}

export interface ChannelLike {
  readonly postMessage: (message: GameStateMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  readonly close: () => void;
}

/**
 * Wires the game window to the control room: restores preferences, applies incoming commands and
 * publishes state twice per second. Returns a disposer.
 */
export function linkControlRoom(
  deps: GameLinkDeps,
  channel: ChannelLike = new BroadcastChannel(CONTROL_CHANNEL),
): () => void {
  restorePreferences(deps);

  channel.addEventListener('message', ({ data }) => {
    if (!isControlCommand(data)) return;
    try {
      applyCommand(data, deps);
    } catch (error) {
      // A bad command from the control room must never stop the show.
      console.error(`[control] "${data.cmd}" failed`, error);
    }
  });

  const timer = setInterval(() => {
    channel.postMessage({ state: snapshot(deps) });
  }, STATE_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    channel.close();
  };
}
