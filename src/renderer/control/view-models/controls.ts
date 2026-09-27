/** View models shared by the setting controls: locks, optimistic state, confirmations, crowd. */
import { isArmed, remainingFraction, type ConfirmKey } from '../confirm.ts';
import { DENSITY_LEVELS, type SettingName, type SettingValue } from '../model.ts';
import { displayed, type SlotStatus } from '../pending.ts';
import type { ControlState } from '../store.ts';

export interface LocksVm {
  readonly onAir: boolean;
  /** Reason test injections are refused, or null when they are allowed. */
  readonly injectionLock: string | null;
  /** Reason live actions are refused, or null when the game can hear them. */
  readonly linkLock: string | null;
}

export const ON_AIR_LOCK = 'Locked while ON AIR: TikFinity is connected';
export const LINK_LOCK = 'Game window not responding';

export function locksVm(state: ControlState): LocksVm {
  const down = state.link === 'offline' || state.link === 'waiting';
  const linkLock = down ? LINK_LOCK : null;
  return {
    onAir: state.bridge.connected,
    injectionLock: state.bridge.connected ? ON_AIR_LOCK : linkLock,
    linkLock,
  };
}

export interface SettingVm {
  readonly value: SettingValue | undefined;
  readonly status: SlotStatus;
}

export function settingVm(state: ControlState, name: SettingName): SettingVm {
  const slot = state.settings[name];
  return { value: displayed(slot), status: slot.status };
}

export interface ArmVm {
  readonly armed: boolean;
  readonly fraction: number;
}

export function armVm(state: ControlState, key: ConfirmKey): ArmVm {
  const armed = isArmed(state.armed, key, state.now);
  return { armed, fraction: armed ? remainingFraction(state.armed, state.now) : 0 };
}

export interface CrowdTeamVm {
  readonly fervor: number;
  readonly line: string;
}

export interface CrowdVm {
  readonly density: number;
  readonly mode: 'battle' | 'random';
  readonly status: string;
  readonly showTeams: boolean;
  /** The Team Battle crowd only advances on game updates: say so when they stop. */
  readonly paused: boolean;
  readonly gold: CrowdTeamVm;
  readonly shadow: CrowdTeamVm;
}

const EMPTY_TEAM: CrowdTeamVm = { fervor: 0.25, line: '0 coins' };

export function crowdVm(state: ControlState): CrowdVm {
  const { crowd } = state;
  const level = DENSITY_LEVELS[crowd.density] ?? { label: 'None', perMinute: 0 };
  const battle = crowd.effectiveMode === 'battle';
  const sent = `Sent: ${String(crowd.sentGifts)} gifts.`;
  let status = 'None: no simulated viewer.';
  if (level.perMinute > 0) {
    status = battle
      ? `${level.label}: two fan teams back their snake. ${sent}`
      : `${level.label} (random): about ${String(Math.round(level.perMinute * 0.05))} gifts per minute. ${sent}`;
  }
  const team = (side: 'gold' | 'shadow'): CrowdTeamVm => {
    const view = crowd.view?.[side];
    if (!view) return EMPTY_TEAM;
    const { boost, steal, shield, life } = view.counts;
    return {
      fervor: view.fervor,
      line: `${String(Math.round(view.spend))} coins | boost ${String(boost)}, steal ${String(steal)}, shield ${String(shield)}, life ${String(life)}`,
    };
  };
  return {
    density: crowd.density,
    mode: crowd.mode,
    status,
    showTeams: battle && crowd.density > 0,
    paused: battle && crowd.density > 0 && state.link !== 'online',
    gold: team('gold'),
    shadow: team('shadow'),
  };
}
