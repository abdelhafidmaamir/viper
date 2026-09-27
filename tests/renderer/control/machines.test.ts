import { describe, expect, it } from 'vitest';

import {
  ARM_WINDOW_MS,
  IDLE,
  expire as expireArm,
  isArmed,
  press,
  remainingFraction,
} from '../../../src/renderer/control/confirm.ts';
import {
  PENDING_TIMEOUT_MS,
  displayed,
  emptySlot,
  expire,
  observe,
  request,
  retryValue,
} from '../../../src/renderer/control/pending.ts';

describe('pending setting', () => {
  it('shows the target at once and confirms on echo', () => {
    const sent = request(emptySlot(true), 'neutral', 1000);
    expect(sent.status).toBe('pending');
    expect(displayed(sent)).toBe('neutral');

    const confirmed = observe(sent, 'neutral', 1500);
    expect(confirmed.status).toBe('idle');
    expect(confirmed.confirmed).toBe('neutral');
    expect(displayed(confirmed)).toBe('neutral');
  });

  it('stays pending just before the timeout and fails at it', () => {
    const sent = request(observe(emptySlot(true), 'tiktok', 0), 'neutral', 1000);
    expect(observe(sent, 'tiktok', 1000 + PENDING_TIMEOUT_MS - 1).status).toBe('pending');
    const failed = observe(sent, 'tiktok', 1000 + PENDING_TIMEOUT_MS);
    expect(failed.status).toBe('error');
    expect(displayed(failed)).toBe('tiktok');
    expect(retryValue(failed)).toBe('neutral');
  });

  it('expires on the clock alone, unless the link is down', () => {
    const sent = request(emptySlot(true), true, 0);
    expect(expire(sent, PENDING_TIMEOUT_MS, true).status).toBe('pending');
    expect(expire(sent, PENDING_TIMEOUT_MS, false).status).toBe('error');
  });

  it('confirms a drifting number within tolerance', () => {
    const sent = request(emptySlot(true), 0.5, 0);
    expect(observe(sent, 0.503, 500).status).toBe('idle');
  });

  it('keeps an unverifiable setting as last sent', () => {
    const sent = request(emptySlot(false), 'landscape', 0);
    expect(sent.status).toBe('unverified');
    expect(displayed(sent)).toBe('landscape');
    expect(observe(sent, 'portrait', 5000)).toBe(sent);
    expect(expire(sent, 5000, false)).toBe(sent);
  });

  it('has nothing to retry unless in error', () => {
    expect(retryValue(request(emptySlot(true), 1, 0))).toBeUndefined();
  });
});

describe('arm-confirm', () => {
  it('arms on the first press and fires on the second', () => {
    const first = press(IDLE, 'round', 0);
    expect(first.fire).toBe(false);
    expect(isArmed(first.state, 'round', 10)).toBe(true);
    const second = press(first.state, 'round', 2000);
    expect(second.fire).toBe(true);
    expect(second.state).toBe(IDLE);
  });

  it('re-arms instead of firing once the window has passed', () => {
    const first = press(IDLE, 'round', 0);
    const late = press(first.state, 'round', ARM_WINDOW_MS);
    expect(late.fire).toBe(false);
    expect(isArmed(late.state, 'round', ARM_WINDOW_MS)).toBe(true);
  });

  it('never fires a different action', () => {
    const first = press(IDLE, 'round', 0);
    const other = press(first.state, 'bridge-stop', 100);
    expect(other.fire).toBe(false);
    expect(isArmed(other.state, 'round', 100)).toBe(false);
    expect(isArmed(other.state, 'bridge-stop', 100)).toBe(true);
  });

  it('expires and drains', () => {
    const armed = press(IDLE, 'round', 0).state;
    expect(remainingFraction(armed, 0)).toBe(1);
    expect(remainingFraction(armed, ARM_WINDOW_MS / 2)).toBeCloseTo(0.5);
    expect(expireArm(armed, ARM_WINDOW_MS - 1)).toBe(armed);
    expect(expireArm(armed, ARM_WINDOW_MS)).toBe(IDLE);
    expect(remainingFraction(IDLE, 0)).toBe(0);
  });
});
