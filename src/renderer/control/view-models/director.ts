/** View models of the Director column: scenes with their countdown, advantage, assists. */
import type { SceneEffects } from '../decode.ts';
import { SCENES, sceneLabel, type SceneName } from '../model.ts';
import type { ControlState } from '../store.ts';

export type BadgeTone = 'hot' | 'cold' | 'plain';

export interface Badge {
  readonly text: string;
  readonly tone: BadgeTone;
}

export interface SceneButtonVm {
  readonly name: SceneName;
  readonly label: string;
  readonly key: string;
  readonly tone: 'accent' | 'gold' | 'shadow';
  readonly active: boolean;
  /** Share of the scene left, 0 to 1, for the drain gauge. */
  readonly fraction: number;
  readonly countdown: string;
}

export interface SceneCardVm {
  readonly buttons: readonly SceneButtonVm[];
  readonly running: boolean;
  readonly status: string;
  readonly effects: { readonly gold: readonly Badge[]; readonly shadow: readonly Badge[] } | null;
}

const pct = (value: number): string => `${String(Math.round(value * 100))}%`;

/** Human-readable levers a scene applies to one team. */
export function badgesFor(effects: SceneEffects): Badge[] {
  const badges: Badge[] = [];
  if (effects.stance === 'attack') badges.push({ text: 'attack', tone: 'hot' });
  else if (effects.stance === 'defense') badges.push({ text: 'defense', tone: 'cold' });
  else if (effects.stance === 'neutral') badges.push({ text: 'neutral', tone: 'plain' });
  if (effects.pA !== undefined || effects.pD !== undefined) {
    badges.push({
      text: `range ${String(effects.pA ?? 12)}/${String(effects.pD ?? 10)}`,
      tone: 'plain',
    });
  }
  if (effects.hunt !== undefined) badges.push({ text: `hunt ${pct(effects.hunt)}`, tone: 'hot' });
  if (effects.flair !== undefined)
    badges.push({ text: `flair ${pct(effects.flair)}`, tone: 'plain' });
  if (effects.recklessness !== undefined) {
    badges.push({
      text: `recklessness ${String(Math.round(effects.recklessness * 100))}`,
      tone: 'plain',
    });
  }
  if (effects.berryRace) badges.push({ text: 'berry race', tone: 'cold' });
  if (effects.lure) badges.push({ text: 'targets opponent head', tone: 'hot' });
  if (effects.repel) badges.push({ text: 'flees opponent head', tone: 'cold' });
  if (effects.noKill) badges.push({ text: 'no lethal blow', tone: 'cold' });
  if (effects.encircle) badges.push({ text: 'orbit at 2', tone: 'hot' });
  if (effects.immediateTrap) badges.push({ text: 'trap', tone: 'hot' });
  return badges;
}

/** Seconds left in the running scene, interpolated from the last state message. */
export function sceneRemaining(state: ControlState): number {
  if (!state.scene) return 0;
  return Math.max(0, state.scene.remaining - (state.now - state.sceneAt) / 1000);
}

export function sceneCardVm(state: ControlState): SceneCardVm {
  const { scene } = state;
  const remaining = sceneRemaining(state);
  const fraction = scene && scene.duration > 0 ? Math.min(1, remaining / scene.duration) : 0;
  const underdog = state.game?.underdog === true;
  const buttons = SCENES.map((entry) => {
    const active = scene?.name === entry.name;
    return {
      name: entry.name,
      label: entry.label,
      key: entry.key,
      tone: entry.tone,
      active,
      fraction: active ? fraction : 0,
      countdown: active ? `${String(Math.ceil(remaining))}s` : '',
    };
  });
  const status = scene
    ? `${sceneLabel(scene.name)} active, ${String(Math.ceil(remaining))} s left`
    : underdog
      ? 'No active scene, underdog running'
      : 'No active scene';
  return {
    buttons,
    running: scene !== null,
    status,
    effects: scene ? { gold: badgesFor(scene.gold), shadow: badgesFor(scene.shadow) } : null,
  };
}

export const ADVANTAGE_LIMIT = 100;

export function clampAdvantage(value: number): number {
  return Math.max(-ADVANTAGE_LIMIT, Math.min(ADVANTAGE_LIMIT, Math.round(value)));
}

export interface AdvantageVm {
  readonly value: number;
  readonly text: string;
  readonly valueText: string;
  readonly leaning: Team | null;
}

export function advantageVm(value: number): AdvantageVm {
  const v = clampAdvantage(value);
  if (v === 0) return { value: 0, text: 'Neutral', valueText: 'Neutral', leaning: null };
  const team = v > 0 ? 'Gold' : 'Shadow';
  const amount = String(Math.abs(v));
  return {
    value: v,
    text: `${team} +${amount}`,
    valueText: `${team} plus ${amount}`,
    leaning: v > 0 ? 'gold' : 'shadow',
  };
}
