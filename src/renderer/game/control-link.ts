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

type PersistedSetting = 'plateforme' | 'nomsDonateurs' | 'fluide';

/**
 * Settings that survive a restart. The storage keys and encodings are those of the shipped
 * build, so existing installs keep their choices. Decoding is deliberately one-sided: only a
 * value that departs from the engine default is applied.
 */
const PERSISTED: Readonly<
  Record<
    PersistedSetting,
    {
      readonly key: string;
      readonly encode: (value: unknown) => string;
      readonly decode: (stored: string | null) => GameSettings[PersistedSetting] | undefined;
    }
  >
> = {
  plateforme: {
    key: 'vipere-plateforme',
    encode: String,
    decode: (stored) => (stored === 'neutre' || stored === 'tiktok' ? stored : undefined),
  },
  nomsDonateurs: {
    key: 'vipere-noms',
    encode: (value) => (value ? '1' : '0'),
    decode: (stored) => (stored === '0' ? false : undefined),
  },
  fluide: {
    key: 'vipere-fluide',
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
    const { key, decode } = PERSISTED[name];
    const value = decode(safely(() => storage.getItem(key)) ?? null);
    if (value !== undefined) Object.assign(game.reglages, { [name]: value });
  }
}

export function applyCommand(command: ControlCommand, deps: GameLinkDeps): void {
  const { game, bridge } = deps;
  switch (command.cmd) {
    case 'evenement':
      deps.receiveEvent(command.ev ?? ({} as AudienceEvent));
      return;
    case 'brut':
      bridge.traiter(command.message ?? null);
      return;
    case 'pont-demarrer':
      bridge.demarrer(command.url);
      return;
    case 'pont-arreter':
      bridge.arreter();
      return;
    case 'manche':
      game.reglages.mode = 'duel';
      game.nouvelleManche();
      return;
    case 'reglage': {
      const { nom, valeur } = command;
      // Own keys only: `in` would accept inherited names such as __proto__.
      if (!Object.hasOwn(game.reglages, nom)) return;
      Object.assign(game.reglages, { [nom]: valeur });
      if (isPersisted(nom)) {
        const { key, encode } = PERSISTED[nom];
        safely(() => {
          deps.storage.setItem(key, encode(valeur));
        });
      }
      return;
    }
    case 'scene':
      game.lancerScene(command.nom, command.duree);
      return;
    case 'sceneStop':
      game.stopScene();
      return;
    case 'finTest':
      game.finirTest?.(command.camp);
      return;
  }
}

export function snapshot({ game, bridge, readCrowd }: GameLinkDeps): GameState {
  const settings = game.reglages;
  const duel = game.duel();
  return {
    pont: bridge.etat(),
    avantage: settings.avantage || 0,
    underdog: settings.underdog,
    foule: readCrowd(),
    plateforme: settings.plateforme,
    fluide: settings.fluide,
    retourCadeau: settings.retourCadeau,
    bandeau: settings.bandeau,
    classement: settings.classement,
    meteo: settings.meteo,
    ambianceAuto: settings.ambianceAuto,
    heure: settings.heure,
    nomsDonateurs: settings.nomsDonateurs,
    superIA: settings.superIA,
    debugIA: settings.debugIA,
    scene: game.scene(),
    duel: duel
      ? {
          t: duel.t,
          vainqueur: duel.vainqueur,
          or: { longueur: duel.or?.longueur },
          ombre: { longueur: duel.ombre?.longueur },
        }
      : null,
    mesures: { erreurs: game.mesures().erreurs },
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
    channel.postMessage({ etat: snapshot(deps) });
  }, STATE_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    channel.close();
  };
}
