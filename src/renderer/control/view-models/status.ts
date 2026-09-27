/** View model of the top status bar: link health, on-air state, round clock and score. */
import { FORMATS, PLATFORMS } from '../model.ts';
import type { ControlState } from '../store.ts';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'live' | 'info';

export interface PillVm {
  readonly tone: Tone;
  readonly label: string;
  readonly metric: string;
  readonly title: string;
}

export interface StatusBarVm {
  readonly game: PillVm;
  readonly bridge: PillVm;
  readonly onAir: boolean;
  readonly clock: string;
  /** The clock and score are the last values received, not live ones. */
  readonly lastKnown: boolean;
  readonly gold: number;
  readonly shadow: number;
  readonly leader: Team | null;
  readonly winner: string | null;
  readonly winnerTeam: Team | null;
  readonly errors: number;
  readonly errorsPulse: boolean;
  readonly output: string;
  readonly outputUnverified: boolean;
  readonly tier: string;
  readonly debugOverlay: boolean;
}

/** `mm:ss` from seconds, floored, never negative. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function ageText(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

export function gamePill(state: ControlState): PillVm {
  const age = state.lastStateAt === null ? 0 : state.now - state.lastStateAt;
  switch (state.link) {
    case 'online':
      return {
        tone: 'ok',
        label: 'Game online',
        metric: ageText(age),
        title: 'Game window is sending updates',
      };
    case 'stale':
      return {
        tone: 'warn',
        label: 'Game stale',
        metric: ageText(age),
        title: 'No update from the game window for over a second',
      };
    case 'offline':
      return {
        tone: 'danger',
        label: 'Game offline',
        metric: ageText(age),
        title: 'The game window is not responding: open the game window',
      };
    case 'waiting':
      return {
        tone: 'danger',
        label: 'Game offline',
        metric: 'waiting',
        title: 'No message from the game window yet: open the game window',
      };
  }
}

export function bridgePill(state: ControlState): PillVm {
  const { bridge } = state;
  if (bridge.connected) {
    return {
      tone: 'live',
      label: 'TikFinity live',
      metric: `${bridge.events.toLocaleString('en-US')} ev / ${bridge.gifts.toLocaleString('en-US')} gifts`,
      title: `Connected to ${bridge.url}`,
    };
  }
  if (bridge.error) {
    return { tone: 'danger', label: 'TikFinity error', metric: '', title: bridge.error };
  }
  return {
    tone: 'neutral',
    label: 'TikFinity off',
    metric: '',
    title: 'TikFinity bridge disconnected',
  };
}

function labelOf(
  options: readonly { readonly value: unknown; readonly label: string }[],
  value: unknown,
): string | undefined {
  return options.find((option) => option.value === value)?.label;
}

export function winnerText(winner: Team | 'draw' | null): string | null {
  if (winner === 'gold') return 'Gold wins';
  if (winner === 'shadow') return 'Shadow wins';
  if (winner === 'draw') return 'Draw';
  return null;
}

export function statusBarVm(state: ControlState): StatusBarVm {
  const { game } = state;
  const duel = game?.duel ?? null;
  const gold = duel?.gold.length ?? 0;
  const shadow = duel?.shadow.length ?? 0;
  const platform = labelOf(PLATFORMS, game?.platform) ?? 'Platform ?';
  const formatSlot = state.settings.format;
  const format = labelOf(FORMATS, formatSlot.confirmed);
  const winner = duel?.winner ?? null;
  return {
    game: gamePill(state),
    bridge: bridgePill(state),
    onAir: state.bridge.connected,
    clock: duel ? formatClock(duel.t) : 'No duel',
    lastKnown: state.link !== 'online' && game !== null,
    gold,
    shadow,
    leader: gold === shadow ? null : gold > shadow ? 'gold' : 'shadow',
    winner: winnerText(winner),
    winnerTeam: winner === 'gold' || winner === 'shadow' ? winner : null,
    errors: game?.metrics.errors ?? 0,
    errorsPulse: state.errorsRaisedAt !== null && state.now - state.errorsRaisedAt < 1000,
    output: format ? `${platform} ${format}` : platform,
    outputUnverified: format !== undefined,
    tier:
      state.bridge.connected || state.lastTier === null
        ? 'n/a'
        : `${String(state.lastTier)} (test)`,
    debugOverlay: game?.aiDebug === true,
  };
}
