/**
 * Command builders. Every message the control room sends is assembled here, so the wire shapes
 * live in one tested place and the views only name intentions.
 */
import type { ControlCommand } from '../../shared/control-protocol.ts';

import {
  SCENES,
  TEST_EVENTS,
  type GiftButton,
  type SceneName,
  type SettingName,
  type SettingValue,
  type TestEventId,
} from './model.ts';

/** The TikFinity user id stamped on simulator messages. */
const SIMULATOR_ID = 'control-room';

export const round = (): ControlCommand => ({ cmd: 'round' });
export const sceneStop = (): ControlCommand => ({ cmd: 'sceneStop' });
export const bridgeStop = (): ControlCommand => ({ cmd: 'bridge-stop' });

export function setting(name: SettingName, value: SettingValue): ControlCommand {
  return { cmd: 'setting', name, value };
}

export function scene(name: SceneName): ControlCommand {
  const duration = SCENES.find((entry) => entry.name === name)?.duration ?? 15;
  return { cmd: 'scene', name, duration };
}

/** An empty URL lets the game use its default bridge address. */
export function bridgeStart(url: string): ControlCommand {
  const trimmed = url.trim();
  return trimmed ? { cmd: 'bridge-start', url: trimmed } : { cmd: 'bridge-start' };
}

export function testEvent(id: TestEventId): ControlCommand {
  return { cmd: 'event', ev: TEST_EVENTS[id].event };
}

export function audienceEvent(event: AudienceEvent): ControlCommand {
  return { cmd: 'event', ev: event };
}

export function likes(count = 50): ControlCommand {
  return {
    cmd: 'raw',
    message: { event: 'like', data: { likeCount: count, uniqueId: SIMULATOR_ID } },
  };
}

function giftMessage(button: GiftButton, repeatCount: number, repeatEnd: boolean): ControlCommand {
  return {
    cmd: 'raw',
    message: {
      event: 'gift',
      data: {
        giftName: button.name,
        diamondCount: button.diamonds,
        giftType: 1,
        repeatCount,
        repeatEnd,
        uniqueId: SIMULATOR_ID,
      },
    },
  };
}

/**
 * A TikTok gift as TikFinity reports it. A streak arrives as an intermediate message followed by
 * the final one, which carries the full count.
 */
export function giftStreak(button: GiftButton): readonly ControlCommand[] {
  const final = giftMessage(button, button.repeat, true);
  if (button.repeat <= 1) return [final];
  return [giftMessage(button, Math.max(1, button.repeat - 2), false), final];
}

export interface ScheduledCommand {
  readonly delayMs: number;
  readonly command: ControlCommand;
}

const RANKING_GIFTS: readonly (readonly [Team, number, string, string])[] = [
  ['gold', 100, 'teddy bear', 'karim.or'],
  ['gold', 30, 'bagel', 'lea_gold'],
  ['shadow', 20, 'perfume', 'nox'],
  ['shadow', 100, 'hand heart', 'zoe_moon'],
  ['shadow', 30, 'capybara', 'zoe_moon'],
  ['gold', 10, 'rose 10', 'soleil92'],
];

/** The end screen ranking test: six donors, then a forced Shadow win 1.5 s later. */
export function testRankingPlan(): readonly ScheduledCommand[] {
  const gifts = RANKING_GIFTS.map(([team, value, name, nickname]) => ({
    delayMs: 0,
    command: audienceEvent({ type: 'gift', n: 1, value, name, team, nickname }),
  }));
  return [...gifts, { delayMs: 1500, command: { cmd: 'endTest', team: 'shadow' } }];
}

/** One line for the event log describing a command the operator sent. */
export function describeCommand(command: ControlCommand): string {
  switch (command.cmd) {
    case 'round':
      return 'New round';
    case 'scene':
      return `Scene ${command.name} (${String(command.duration)} s)`;
    case 'sceneStop':
      return 'Stop scene';
    case 'bridge-start':
      return `Connect TikFinity ${command.url ?? '(default URL)'}`;
    case 'bridge-stop':
      return 'Disconnect TikFinity';
    case 'setting':
      return `Set ${command.name} = ${JSON.stringify(command.value)}`;
    case 'event':
      return `Test event ${command.ev?.type ?? 'unknown'}${command.ev?.nickname ? ` from ${command.ev.nickname}` : ''}`;
    case 'raw':
      return 'Simulated TikFinity message';
    case 'endTest':
      return `End test round, ${command.team} wins`;
  }
}
