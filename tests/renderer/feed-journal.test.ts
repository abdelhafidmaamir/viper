import { beforeEach, describe, expect, it } from 'vitest';

import { receiveFeedEvent } from '../../src/renderer/feed/control-link.ts';
import {
  COLUMNS,
  cell,
  drainJournal,
  note,
  resetJournal,
} from '../../src/renderer/feed/journal.ts';
import { newRound } from '../../src/renderer/feed/state.ts';
import {
  resetSupporters,
  restoreSupporters,
  supporter,
  supporterJoin,
  supportersText,
} from '../../src/renderer/feed/supporters.ts';

const rowsOf = (text: string): string[][] =>
  text ? text.split('\n').map((line) => line.split(';')) : [];
const col = (name: (typeof COLUMNS)[number]): number => COLUMNS.indexOf(name);

beforeEach(() => {
  resetJournal();
  resetSupporters();
  newRound();
  drainJournal(false, 0);
});

describe('live journal', () => {
  it('writes one row per gift, with the TikTok id and the berries it gave', () => {
    receiveFeedEvent({
      type: 'gift',
      name: 'Rosa',
      value: 10,
      n: 3,
      nickname: 'Lina',
      id: 'lina.snx',
    });
    receiveFeedEvent({
      type: 'gift',
      name: 'Galaxy',
      value: 1000,
      n: 1,
      nickname: 'Moe',
      id: 'moe_88',
    });
    const rows = rowsOf(drainJournal(true, 1000));
    const gifts = rows.filter((r) => r[col('event')] === 'gift');
    expect(gifts).toHaveLength(2);
    expect(gifts[0]?.[col('tiktok id')]).toBe('lina.snx');
    expect(gifts[0]?.[col('berries')]).toBe('30');
    expect(gifts[0]?.[col('source')]).toBe('tiktok');
    // A gift that does not feed the snake is still noted, at 0 berries.
    expect(gifts[1]?.[col('berries')]).toBe('0');
    expect(rows.every((r) => r.length === COLUMNS.length)).toBe(true);
  });

  it('sums likes and joins every 10 seconds instead of a row each', () => {
    for (let i = 0; i < 50; i++)
      receiveFeedEvent({
        type: 'like',
        n: 2,
        nickname: `v${String(i % 5)}`,
        id: `v${String(i % 5)}`,
      });
    receiveFeedEvent({ type: 'join', nickname: 'New', id: 'new_one' });
    expect(
      rowsOf(drainJournal(false, 5000)).filter((r) => r[col('event')] === 'likes'),
    ).toHaveLength(0);
    const rows = rowsOf(drainJournal(false, 10_000));
    const likes = rows.find((r) => r[col('event')] === 'likes');
    expect(likes?.[col('count')]).toBe('100');
    expect(likes?.[col('detail')]).toBe('5 viewers');
    expect(rows.find((r) => r[col('event')] === 'joins')?.[col('detail')]).toBe('1 first time');
  });

  it('notes TikFinity dropping out and coming back, and the viewer count', () => {
    drainJournal(true, 1000);
    receiveFeedEvent({ type: 'viewers', total: 240 });
    const lost = rowsOf(drainJournal(false, 40_000));
    expect(lost.map((r) => r[col('event')])).toContain('tiktok lost');
    expect(lost.find((r) => r[col('event')] === 'viewers')?.[col('viewers')]).toBe('240');
  });

  it('does not call a round picked back up after a restart a new round', () => {
    newRound();
    note({ event: 'round restored' });
    const events = rowsOf(drainJournal(false, 1000)).map((r) => r[col('event')]);
    expect(events).toEqual(['round restored']);
  });

  it('never lets a nickname run as a spreadsheet formula', () => {
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('+33 6')).toBe("'+33 6");
    expect(cell('a;b')).toBe('"a;b"');
    expect(cell('Léa 🌸')).toBe('Léa 🌸');
    note({ event: 'gift', nickname: '-1+1' });
    expect(drainJournal(false, 1000)).toContain("'-1+1");
  });
});

describe('lifetime supporters', () => {
  it('counts gifts, likes and visits by TikTok id, whatever the display name', () => {
    receiveFeedEvent({
      type: 'gift',
      name: 'Rose',
      value: 1,
      n: 5,
      nickname: 'Lina',
      id: 'Lina.SNX',
    });
    receiveFeedEvent({ type: 'like', n: 12, nickname: 'Lina 🌸', id: 'lina.snx' });
    receiveFeedEvent({ type: 'join', nickname: 'Lina 🌸', id: 'lina.snx' });
    receiveFeedEvent({ type: 'join', nickname: 'Lina 🌸', id: 'lina.snx' });
    const s = supporter('lina.snx');
    expect(s).toMatchObject({ berries: 5, likes: 12, visits: 1, nickname: 'Lina 🌸' });
  });

  it('only counts what came from TikTok, never a viewer without an id', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rosa', value: 10, n: 1, nickname: 'Ghost' });
    expect(supportersText()).toBeNull();
  });

  it('comes back after a restart, adding what arrived before the file was read', () => {
    receiveFeedEvent({
      type: 'gift',
      name: 'Rosa',
      value: 10,
      n: 2,
      nickname: 'Moe',
      id: 'moe_88',
    });
    const saved = supportersText();
    expect(saved).not.toBeNull();
    resetSupporters();
    receiveFeedEvent({ type: 'like', n: 3, nickname: 'Moe', id: 'moe_88' });
    expect(restoreSupporters(saved ?? '')).toBe(1);
    expect(supporter('moe_88')).toMatchObject({ berries: 20, likes: 3 });
    expect(restoreSupporters('not json')).toBe(0);
  });

  it('knows a first visit from a return', () => {
    expect(supporterJoin('capy', 'Capy')).toBe(true);
    resetSupporters();
    restoreSupporters(JSON.stringify({ supporters: [{ id: 'capy', likes: 4 }] }));
    expect(supporterJoin('capy', 'Capy')).toBe(false);
  });
});
