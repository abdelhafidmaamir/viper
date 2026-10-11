import { describe, expect, it } from 'vitest';

import { journalName } from '../../src/main/feed-journal.ts';

describe('journalName', () => {
  it('says which mode and when the live began, and sorts by date', () => {
    const at = new Date(2026, 8, 29, 21, 4);
    expect(journalName(at)).toBe('Viper Feed 2026-09-29 21h04.csv');
    expect(journalName(at, 'Viper Arena')).toBe('Viper Arena 2026-09-29 21h04.csv');
  });
});
