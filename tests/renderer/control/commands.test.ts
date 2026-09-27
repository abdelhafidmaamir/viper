import { describe, expect, it } from 'vitest';

import {
  bridgeStart,
  describeCommand,
  giftStreak,
  likes,
  scene,
  setting,
  testEvent,
  testRankingPlan,
} from '../../../src/renderer/control/commands.ts';
import { GIFTS } from '../../../src/renderer/control/model.ts';

describe('command builders', () => {
  it('sends scenes with the engine default duration', () => {
    expect(scene('ballet')).toEqual({ cmd: 'scene', name: 'ballet', duration: 20 });
    expect(scene('race')).toEqual({ cmd: 'scene', name: 'race', duration: 15 });
    expect(scene('huntGold')).toEqual({ cmd: 'scene', name: 'huntGold', duration: 12 });
  });

  it('sends a single gift as one final message', () => {
    const rose = GIFTS[0];
    expect(rose?.repeat).toBe(1);
    const messages = rose ? giftStreak(rose) : [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      cmd: 'raw',
      message: { event: 'gift', data: { giftName: 'Rose', repeatCount: 1, repeatEnd: true } },
    });
  });

  it('sends a streak as an intermediate message, then the final count', () => {
    const streak = GIFTS.find((gift) => gift.repeat === 5);
    const messages = streak ? giftStreak(streak) : [];
    expect(messages.map((m) => (m.cmd === 'raw' ? m.message : null))).toEqual([
      {
        event: 'gift',
        data: {
          giftName: 'Rose',
          diamondCount: 1,
          giftType: 1,
          repeatCount: 3,
          repeatEnd: false,
          uniqueId: 'control-room',
        },
      },
      {
        event: 'gift',
        data: {
          giftName: 'Rose',
          diamondCount: 1,
          giftType: 1,
          repeatCount: 5,
          repeatEnd: true,
          uniqueId: 'control-room',
        },
      },
    ]);
  });

  it('trims the bridge URL and omits an empty one', () => {
    expect(bridgeStart('  ws://localhost:21213/ ')).toEqual({
      cmd: 'bridge-start',
      url: 'ws://localhost:21213/',
    });
    expect(bridgeStart('   ')).toEqual({ cmd: 'bridge-start' });
  });

  it('builds likes, settings and test events', () => {
    expect(likes()).toEqual({
      cmd: 'raw',
      message: { event: 'like', data: { likeCount: 50, uniqueId: 'control-room' } },
    });
    expect(setting('smooth', true)).toEqual({ cmd: 'setting', name: 'smooth', value: true });
    expect(testEvent('tier')).toEqual({ cmd: 'event', ev: { type: 'viewers', total: 52 } });
  });

  it('plans the ranking test as six gifts, then the end of the round', () => {
    const plan = testRankingPlan();
    expect(plan).toHaveLength(7);
    expect(
      plan.slice(0, 6).every((step) => step.delayMs === 0 && step.command.cmd === 'event'),
    ).toBe(true);
    expect(plan[6]).toEqual({ delayMs: 1500, command: { cmd: 'endTest', team: 'shadow' } });
  });

  it('describes commands for the log', () => {
    expect(describeCommand({ cmd: 'round' })).toBe('New round');
    expect(describeCommand(scene('race'))).toBe('Scene race (15 s)');
    expect(describeCommand(setting('platform', 'neutral'))).toBe('Set platform = "neutral"');
    expect(describeCommand(testEvent('join'))).toBe('Test event join from lea_gold');
  });
});
