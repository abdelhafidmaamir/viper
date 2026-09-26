import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from '../../src/main/config.ts';

describe('parseConfig', () => {
  it('defaults to a portrait live session', () => {
    expect(parseConfig([])).toEqual({ orientation: 'portrait', diagnostic: null });
  });

  it('accepts landscape', () => {
    expect(parseConfig(['--orientation=landscape']).orientation).toBe('landscape');
  });

  it('ignores switches it does not own, such as the ones Chromium forwards', () => {
    expect(parseConfig(['--enable-logging', '--no-sandbox', 'some-positional'])).toEqual({
      orientation: 'portrait',
      diagnostic: null,
    });
  });

  it('builds a diagnostic with defaults', () => {
    expect(parseConfig(['--diagnostic=frame-timing']).diagnostic).toEqual({
      name: 'frame-timing',
      options: {
        outDir: 'diagnostics',
        weather: 'pluie',
        hour: 0.5,
        settleSeconds: 25,
        allWeathers: false,
      },
    });
  });

  it('reads every diagnostic option, in both flag syntaxes', () => {
    const config = parseConfig([
      '--diagnostic',
      'cpu-profile',
      '--out=perf',
      '--weather=neige',
      '--hour',
      '0.36',
      '--settle=5',
      '--all-weathers',
    ]);
    expect(config.diagnostic).toEqual({
      name: 'cpu-profile',
      options: {
        outDir: 'perf',
        weather: 'neige',
        hour: 0.36,
        settleSeconds: 5,
        allWeathers: true,
      },
    });
  });

  it.each([
    [['--orientation=sideways'], /--orientation must be one of portrait, landscape/],
    [['--diagnostic=benchmark'], /--diagnostic must be one of/],
    [['--diagnostic=screenshots', '--hour=1.5'], /--hour must be a number in \[0, 1\]/],
    [['--diagnostic=screenshots', '--settle=soon'], /--settle must be a number/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseConfig(argv)).toThrow(ConfigError);
    expect(() => parseConfig(argv)).toThrow(message);
  });
});
