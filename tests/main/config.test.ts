import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from '../../src/main/config.ts';

describe('parseConfig', () => {
  it('defaults to a portrait live session', () => {
    expect(parseConfig([])).toEqual({
      orientation: 'portrait',
      mode: null,
      rendererOrigin: null,
      diagnostic: null,
    });
  });

  it('opens a mode directly, or leaves the choice to the launcher', () => {
    expect(parseConfig(['--mode=feed']).mode).toBe('feed');
    expect(parseConfig(['--mode=duel']).mode).toBe('duel');
    expect(parseConfig(['--mode=arena']).mode).toBe('arena');
    expect(parseConfig([]).mode).toBeNull();
  });

  it('accepts landscape', () => {
    expect(parseConfig(['--orientation=landscape']).orientation).toBe('landscape');
  });

  it('ignores switches it does not own, such as the ones Chromium forwards', () => {
    expect(parseConfig(['--enable-logging', '--no-sandbox', 'some-positional'])).toEqual({
      orientation: 'portrait',
      mode: null,
      rendererOrigin: null,
      diagnostic: null,
    });
  });

  it('accepts a loopback dev server and keeps only its origin', () => {
    expect(parseConfig(['--renderer-url=http://127.0.0.1:5173/']).rendererOrigin).toBe(
      'http://127.0.0.1:5173',
    );
    expect(parseConfig(['--renderer-url=http://localhost:5174/game.html']).rendererOrigin).toBe(
      'http://localhost:5174',
    );
  });

  it('builds a diagnostic with defaults', () => {
    expect(parseConfig(['--diagnostic=frame-timing']).diagnostic).toEqual({
      name: 'frame-timing',
      options: {
        outDir: 'diagnostics',
        weather: 'rain',
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
      '--weather=snow',
      '--hour',
      '0.36',
      '--settle=5',
      '--all-weathers',
    ]);
    expect(config.diagnostic).toEqual({
      name: 'cpu-profile',
      options: {
        outDir: 'perf',
        weather: 'snow',
        hour: 0.36,
        settleSeconds: 5,
        allWeathers: true,
      },
    });
  });

  it.each([
    [['--mode=race'], /--mode must be one of duel, feed, arena/],
    [['--orientation=sideways'], /--orientation must be one of portrait, landscape/],
    [['--diagnostic=benchmark'], /--diagnostic must be one of/],
    [['--renderer-url=https://example.com'], /must be an http loopback URL/],
    [['--renderer-url=http://192.168.1.10:5173'], /must be an http loopback URL/],
    [['--renderer-url=not a url'], /--renderer-url must be a URL/],
    [['--diagnostic=screenshots', '--hour=1.5'], /--hour must be a number in \[0, 1\]/],
    [['--diagnostic=screenshots', '--settle=soon'], /--settle must be a number/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseConfig(argv)).toThrow(ConfigError);
    expect(() => parseConfig(argv)).toThrow(message);
  });
});
