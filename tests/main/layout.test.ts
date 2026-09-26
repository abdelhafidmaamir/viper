import { describe, expect, it } from 'vitest';

import { fitContentSize } from '../../src/main/layout.ts';

describe('fitContentSize', () => {
  it('fits portrait to the height of a 1080p work area', () => {
    expect(fitContentSize('portrait', { width: 1920, height: 1032 })).toEqual({
      width: 531,
      height: 944,
    });
  });

  it('fits landscape to the height of a 1080p work area', () => {
    expect(fitContentSize('landscape', { width: 1920, height: 1032 })).toEqual({
      width: 1680,
      height: 945,
    });
  });

  it('never exceeds the 1080x1920 reference frame on a large screen', () => {
    expect(fitContentSize('portrait', { width: 3840, height: 2160 })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(fitContentSize('landscape', { width: 3840, height: 2160 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('keeps an exact aspect ratio', () => {
    for (const height of [720, 900, 1032, 1400]) {
      const { width, height: h } = fitContentSize('portrait', { width: 2560, height });
      expect(width * 16).toBe(h * 9);
    }
  });
});
