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
