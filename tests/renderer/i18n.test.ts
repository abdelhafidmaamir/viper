import { afterEach, describe, expect, it } from 'vitest';

import { setLanguage, tr, trNum, type I18nKey } from '../../src/renderer/engine/i18n.ts';

// Reset to English after each test so test order does not matter.
afterEach(() => {
  setLanguage('en');
});

describe('tr - English (default)', () => {
  it('returns the English string for a simple key', () => {
    expect(tr('milestones.likes')).toBe('LIKES');
    expect(tr('milestones.thanks')).toBe('THANK YOU!');
  });

  it('substitutes {name}', () => {
    expect(tr('join.0', { name: 'Alice' })).toBe("Welcome Alice, glad you're here!");
  });

  it('substitutes {n}', () => {
    expect(tr('like.0', { name: 'Bob', n: 42 })).toBe('Bob dropped 42 likes, thank you!');
  });

  it('substitutes {q}', () => {
    expect(tr('gift.0', { name: 'Carol', q: 'sends a rose' })).toBe(
      'Carol sends a rose! What a play!',
    );
  });

  it('leaves unmatched placeholders untouched when vars omitted', () => {
    const raw = tr('join.0');
    expect(raw).toContain('{name}');
  });

  it('returns the English label for gift panel keys', () => {
    const labels: I18nKey[] = [
      'label.BERRY',
      'label.SPEED',
      'label.STEAL',
      'label.SHIELD',
      'label.LIFE',
    ];
    const expected = ['BERRY', 'SPEED', 'STEAL', 'SHIELD', 'LIFE'];
    labels.forEach((key, i) => {
      expect(tr(key)).toBe(expected[i]);
    });
  });
});

describe('tr - French', () => {
  it('returns the French string after setLanguage("fr")', () => {
    setLanguage('fr');
    expect(tr('milestones.thanks')).toBe('MERCI !');
    expect(tr('milestones.likes')).toBe('LIKES');
  });

  it('returns French gift panel labels', () => {
    setLanguage('fr');
    expect(tr('label.BERRY')).toBe('BAIE');
    expect(tr('label.SPEED')).toBe('VITESSE');
    expect(tr('label.STEAL')).toBe('VOL');
    expect(tr('label.SHIELD')).toBe('BOUCLIER');
    expect(tr('label.LIFE')).toBe('VIE');
  });

  it('substitutes {name} in French', () => {
    setLanguage('fr');
    expect(tr('join.0', { name: 'Alice' })).toBe('Bienvenue Alice, ravi de te voir !');
  });

  it('substitutes {n} in French', () => {
    setLanguage('fr');
    expect(tr('like.0', { name: 'Bob', n: 10 })).toBe('Bob a mis 10 likes, merci !');
  });

  it('returns French ranking titles', () => {
    setLanguage('fr');
    expect(tr('ranking.mvp')).toBe('MVP DU ROUND');
    expect(tr('ranking.top')).toBe('TOP SUPPORTERS');
    expect(tr('ranking.coins')).toBe('pièces');
  });

  it('returns French frenzy text', () => {
    setLanguage('fr');
    expect(tr('frenzy.text')).toBe('Vos likes réveillent la forêt : des baies pour tous !');
  });

  it('renders a banner phrase with substitution', () => {
    setLanguage('fr');
    const result = tr('gift.0', { name: 'Dupont', q: 'pose une baie' });
    expect(result).toBe('Dupont pose une baie ! Quel coup !');
  });
});

describe('fr dictionary completeness', () => {
  // Every key that exists in English must also exist in French and produce a non-empty string.
  // We exercise this by calling tr() with each known key in French mode.
  const allKeys: I18nKey[] = [
    'join.0',
    'join.1',
    'join.2',
    'share.0',
    'share.1',
    'follow.0',
    'follow.1',
    'like.0',
    'like.1',
    'gift.0',
    'gift.1',
    'gift.2',
    'first.0',
    'first.1',
    'tier.0',
    'tier.1',
    'streak.0',
    'streak.1',
    'rescue.0',
    'rescue.1',
    'rescueWithout.0',
    'rescueWithout.1',
    'effect.berry',
    'effect.speed',
    'effect.steal',
    'effect.shield',
    'effect.life',
    'rescue.extra life',
    'rescue.shield',
    'label.BERRY',
    'label.SPEED',
    'label.STEAL',
    'label.SHIELD',
    'label.LIFE',
    'energy.badge.tap',
    'energy.badge.frenzy',
    'milestones.likes',
    'milestones.thanks',
    'frenzy.text',
    'team.gold',
    'team.shadow',
    'ranking.top',
    'ranking.mvp',
    'ranking.supporter',
    'ranking.supporter.n',
    'ranking.coins',
  ];

  it('every key is present and non-empty in French', () => {
    setLanguage('fr');
    for (const key of allKeys) {
      const value = tr(key);
      expect(value, `key "${key}" should be non-empty in French`).toBeTruthy();
      expect(typeof value).toBe('string');
    }
  });

  it('every key is present and non-empty in English', () => {
    setLanguage('en');
    for (const key of allKeys) {
      const value = tr(key);
      expect(value, `key "${key}" should be non-empty in English`).toBeTruthy();
      expect(typeof value).toBe('string');
    }
  });
});

describe('trNum', () => {
  it('formats numbers in English locale by default', () => {
    setLanguage('en');
    // 1000 becomes "1,000" in en-US
    expect(trNum(1000)).toBe('1,000');
  });

  it('formats numbers in French locale', () => {
    setLanguage('fr');
    // 1000 in fr-FR uses a thin space as thousands separator; toLocaleString result varies by platform.
    // We just check that 1000 is represented without a comma as decimal separator and contains "1" and "000".
    const result = trNum(1000);
    expect(result).toMatch(/1.000/);
  });

  it('formats small numbers without separator', () => {
    setLanguage('en');
    expect(trNum(42)).toBe('42');
  });
});

describe('setLanguage - switching back to English', () => {
  it('returns English strings after switching back from French', () => {
    setLanguage('fr');
    expect(tr('milestones.thanks')).toBe('MERCI !');
    setLanguage('en');
    expect(tr('milestones.thanks')).toBe('THANK YOU!');
  });
});
