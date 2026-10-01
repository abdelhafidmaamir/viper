import { beforeEach, describe, expect, it } from 'vitest';

import {
  alertViewer,
  alertsState,
  resetAlerts,
  setAlertsOn,
  updateAlerts,
} from '../../src/renderer/feed/alerts.ts';
import { resetVisits, visitNumber } from '../../src/renderer/feed/welcome.ts';

describe('feed viewer alerts', () => {
  beforeEach(() => {
    setAlertsOn(true);
    resetAlerts();
    resetVisits();
  });

  it('shows one alert at a time, shares and follows before likes, joins last', () => {
    alertViewer('join', 'a', undefined);
    alertViewer('like', 'b', undefined, 5);
    alertViewer('share', 'c', undefined);
    updateAlerts(0.016);
    expect(alertsState().current?.kind).toBe('share');
    expect(alertsState().queued).toBe(2);
  });

  it('a follow cuts a join short once it has been readable', () => {
    alertViewer('join', 'a', undefined);
    updateAlerts(0.016);
    alertViewer('follow', 'b', undefined);
    updateAlerts(0.5);
    expect(alertsState().current?.kind).toBe('join');
    updateAlerts(0.8);
    updateAlerts(0.4);
    expect(alertsState().current?.kind).toBe('follow');
  });

  it('a card is not cut by one of the same importance', () => {
    alertViewer('share', 'a', undefined);
    updateAlerts(0.016);
    alertViewer('follow', 'b', undefined);
    updateAlerts(2);
    expect(alertsState().current?.kind).toBe('share');
  });

  it('a fast tapper does not hold the card while a follow waits', () => {
    alertViewer('like', 'dan', undefined, 5);
    updateAlerts(0.016);
    alertViewer('follow', 'eve', undefined);
    for (let t = 0; t < 2.5; t += 0.25) {
      alertViewer('like', 'dan', undefined, 5);
      updateAlerts(0.25);
    }
    expect(alertsState().current?.kind).toBe('follow');
  });

  it('a like card kept up by more likes still ends', () => {
    alertViewer('like', 'dan', undefined, 5);
    updateAlerts(0.016);
    let longest = 0;
    for (let t = 0; t < 12; t += 0.25) {
      alertViewer('like', 'dan', undefined, 5);
      updateAlerts(0.25);
      longest = Math.max(longest, alertsState().current?.shown ?? 0);
    }
    expect(longest).toBeLessThan(11);
  });

  it('a waiting join expires, a waiting follow does not', () => {
    alertViewer('share', 'a', undefined);
    updateAlerts(0.016);
    alertViewer('follow', 'b', undefined);
    alertViewer('join', 'c', undefined);
    expect(alertsState().queued).toBe(2);
    updateAlerts(3.9);
    updateAlerts(0.2);
    expect(alertsState().current?.kind).toBe('follow');
    updateAlerts(3);
    updateAlerts(1);
    expect(alertsState().current).toBeNull();
    expect(alertsState().queued).toBe(0);
  });

  it('a returning supporter is not skipped by the join wave and goes before likes', () => {
    alertViewer('like', 'a', undefined, 3);
    updateAlerts(0.016);
    alertViewer('like', 'b', undefined, 3);
    alertViewer('like', 'c', undefined, 3);
    alertViewer('join', 'plain', undefined);
    alertViewer('join', 'vip', undefined, 1, 0);
    expect(alertsState().queued).toBe(3);
    updateAlerts(1.3);
    updateAlerts(0.4);
    expect(alertsState().current?.nickname).toBe('vip');
  });

  it('the same viewer liking again keeps one card and counts every like', () => {
    alertViewer('like', 'dan', undefined, 20);
    updateAlerts(0.016);
    alertViewer('like', 'dan', undefined, 37);
    expect(alertsState().queued).toBe(0);
    expect(alertsState().current?.likes).toBe(57);
  });

  it('greets a first visit differently from a return', () => {
    expect(visitNumber('maya')).toBe(1);
    expect(visitNumber('maya')).toBe(1);
    resetVisits();
    alertViewer('join', 'lou', undefined);
    updateAlerts(0.016);
    expect(alertsState().current?.phrase).toBe('welcome.new');
  });

  it('shows nothing when the control room turns alerts off', () => {
    setAlertsOn(false);
    alertViewer('share', 'c', undefined);
    updateAlerts(0.016);
    expect(alertsState().current).toBeNull();
  });
});
