/**
 * Drives the simulated crowd. Two modes:
 * - Team Battle: the crowd brain (simulated-audience.js) watches each game state and decides what
 *   each fan team buys. It only advances when a state message arrives.
 * - Random: a blind draw every 250 ms, about 5 % of the level's events being gifts.
 * Clock, randomness, timer and brain are injected so the logic runs in tests without a browser.
 */
import { decodeCrowdView, type CrowdView } from './decode.ts';
import { DENSITY_LEVELS, type CrowdMode } from './model.ts';

export interface CrowdBrain {
  readonly configure: (level: number) => void;
  readonly tick: (state: unknown, dt: number) => readonly AudienceEvent[];
  readonly view: () => unknown;
}

export interface CrowdDriverDeps {
  readonly brain: CrowdBrain | null;
  readonly now: () => number;
  readonly random: () => number;
  /** Starts a repeating timer and returns its canceller. */
  readonly every: (ms: number, run: () => void) => () => void;
  readonly emit: (event: AudienceEvent) => void;
}

export interface CrowdStatus {
  readonly density: number;
  readonly mode: CrowdMode;
  /** Mode actually running: Team Battle falls back to random without a brain. */
  readonly effectiveMode: CrowdMode;
  readonly sentGifts: number;
  readonly view: CrowdView | null;
}

export interface CrowdDriver {
  configure(density: number, mode: CrowdMode): void;
  onState(crowdState: unknown): void;
  status(): CrowdStatus;
}

export const RANDOM_TICK_MS = 250;
const GIFT_SHARE = 0.05;
/** Longest step fed to the brain: a stale link must not produce a burst of catch-up gifts. */
const MAX_BRAIN_STEP_S = 1.5;

const GIFT_NAMES: Readonly<Record<number, readonly [string, string]>> = {
  1: ['rose', 'rosa'],
  10: ['rose 10', 'dyno'],
  20: ['bouquet', 'perfume'],
  30: ['bagel', 'capybara'],
  100: ['teddy bear', 'hand heart'],
};

const NICKNAMES = [
  'lea_m',
  'karim.dz',
  'nox',
  'mimi92',
  'sacha',
  'yuna',
  'tom_tom',
  'aya',
  'lucas.b',
  'ines',
  'pablo',
  'zoe',
  'rayan',
  'emma',
  'kenji',
  'nora',
] as const;

/** Gift value by rarity: 1 in 60 is worth 100, 1 in 30 is 30, 1 in 15 is 20, 1 in 8 is 10. */
export function giftValue(roll: number): number {
  if (roll < 1 / 60) return 100;
  if (roll < 1 / 30) return 30;
  if (roll < 1 / 15) return 20;
  if (roll < 1 / 8) return 10;
  return 1;
}

/** One random-mode tick: a gift or nothing. */
export function randomGift(perMinute: number, random: () => number): AudienceEvent | null {
  const ticksPerMinute = 60_000 / RANDOM_TICK_MS;
  const team: Team = random() < 0.5 ? 'gold' : 'shadow';
  const nickname = NICKNAMES[Math.floor(random() * NICKNAMES.length)] ?? 'viewer';
  if (random() >= (perMinute * GIFT_SHARE) / ticksPerMinute) return null;
  const value = giftValue(random());
  const names = GIFT_NAMES[value] ?? ['rose', 'rosa'];
  return {
    type: 'gift',
    n: 1,
    value,
    name: team === 'gold' ? names[0] : names[1],
    nickname,
    team,
  };
}

export function createCrowdDriver(deps: CrowdDriverDeps): CrowdDriver {
  let density = 0;
  let mode: CrowdMode = 'battle';
  let sentGifts = 0;
  let lastTickAt: number | null = null;
  let cancelTimer: (() => void) | null = null;
  let view: CrowdView | null = null;

  const effectiveMode = (): CrowdMode => (mode === 'battle' && deps.brain ? 'battle' : 'random');

  function emit(event: AudienceEvent): void {
    if (event.type === 'gift') sentGifts += 1;
    deps.emit(event);
  }

  return {
    configure(nextDensity, nextMode) {
      cancelTimer?.();
      cancelTimer = null;
      density = Math.max(0, Math.min(DENSITY_LEVELS.length - 1, Math.round(nextDensity)));
      mode = nextMode;
      sentGifts = 0;
      lastTickAt = null;
      view = null;
      const battle = effectiveMode() === 'battle';
      deps.brain?.configure(battle ? density : 0);
      const perMinute = DENSITY_LEVELS[density]?.perMinute ?? 0;
      if (battle || perMinute === 0) return;
      cancelTimer = deps.every(RANDOM_TICK_MS, () => {
        const event = randomGift(perMinute, deps.random);
        if (event) emit(event);
      });
    },

    onState(crowdState) {
      const brain = deps.brain;
      if (!brain || density === 0 || effectiveMode() !== 'battle') return;
      const now = deps.now();
      const dt = lastTickAt === null ? 0.5 : Math.min(MAX_BRAIN_STEP_S, (now - lastTickAt) / 1000);
      lastTickAt = now;
      for (const event of brain.tick(crowdState, dt)) emit(event);
      view = decodeCrowdView(brain.view());
    },

    status: () => ({ density, mode, effectiveMode: effectiveMode(), sentGifts, view }),
  };
}
