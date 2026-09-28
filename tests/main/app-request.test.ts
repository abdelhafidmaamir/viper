import { describe, expect, it } from 'vitest';

import { appRequest } from '../../src/main/app-request.ts';

const ORIGIN = 'http://127.0.0.1:47813';

describe('appRequest', () => {
  it('reads a mode choice from the launcher', () => {
    expect(appRequest(`${ORIGIN}/__viper/open?mode=feed`, ORIGIN)).toEqual({
      kind: 'open',
      mode: 'feed',
    });
    expect(appRequest(`${ORIGIN}/__viper/open?mode=duel`, ORIGIN)).toEqual({
      kind: 'open',
      mode: 'duel',
    });
  });

  it('reads the way back to the launcher', () => {
    expect(appRequest(`${ORIGIN}/__viper/launcher`, ORIGIN)).toEqual({ kind: 'launcher' });
  });

  it.each([
    `${ORIGIN}/game.html`,
    `${ORIGIN}/__viper/open?mode=race`,
    `${ORIGIN}/__viper/open`,
    `${ORIGIN}/__viper/delete`,
    'http://evil.example/__viper/open?mode=feed',
    'not a url',
  ])('ignores %s', (url) => {
    expect(appRequest(url, ORIGIN)).toBeNull();
  });
});
