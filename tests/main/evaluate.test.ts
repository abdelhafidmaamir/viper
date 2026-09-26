import { runInNewContext } from 'node:vm';

import type { WebContents } from 'electron';
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/main/page/evaluate.ts';
import { installPageKit, type PageKit } from '../../src/main/page/page-kit.ts';

/**
 * A WebContents stand-in that runs the shipped source in a fresh V8 context, like a page would:
 * nothing from this module's scope is reachable, so a closure over main-process values fails.
 */
function pageContents(globals: Record<string, unknown> = {}) {
  const sandbox: Record<string, unknown> = { ...globals };
  sandbox.window = sandbox;
  const contents = {
    executeJavaScript: (source: string) =>
      Promise.resolve(runInNewContext(source, sandbox) as unknown),
  } as unknown as WebContents;
  return { contents, sandbox };
}

describe('evaluate', () => {
  it('ships the function with JSON arguments and resolves its result', async () => {
    const { contents } = pageContents();
    const sum = await evaluate(contents, (a: number, b: { c: number }) => a + b.c, 2, { c: 3 });
    expect(sum).toBe(5);
  });

  it('awaits async page functions', async () => {
    const { contents } = pageContents();
    await expect(
      evaluate(contents, (label: string) => Promise.resolve(`ok:${label}`), 'x'),
    ).resolves.toBe('ok:x');
  });

  it('cannot see main-process closures, which is why page functions must be self-contained', async () => {
    const { contents } = pageContents();
    const secret = 42;
    await expect(evaluate(contents, () => secret)).rejects.toThrow(/secret is not defined/);
  });
});

describe('installPageKit', () => {
  it('is self-contained once serialised', async () => {
    const { contents, sandbox } = pageContents();
    await evaluate(contents, installPageKit);

    const kit = sandbox.__viperKit as PageKit;
    expect(Object.keys(kit).sort()).toEqual([
      'countDrawCalls',
      'environment',
      'measureFrames',
      'sceneRect',
      'startCrowd',
      'startDuel',
      'stopCrowd',
    ]);
  });

  it('starts a duel with the requested settings', async () => {
    let rounds = 0;
    const game = {
      settings: { mode: 'base', weather: 'rain' },
      newRound: () => {
        rounds++;
      },
    };
    const { contents, sandbox } = pageContents({ Viper: game });
    await evaluate(contents, installPageKit);

    (sandbox.__viperKit as PageKit).startDuel({ format: 'landscape', weather: 'snow' });

    expect(game.settings).toEqual({ mode: 'duel', weather: 'snow', format: 'landscape' });
    expect(rounds).toBe(1);
  });

  it('measures frame pacing from requestAnimationFrame timestamps', async () => {
    let now = 0;
    let frame = 0;
    const { contents, sandbox } = pageContents({
      // A steady 60 Hz display with one 50 ms hitch on the 30th frame.
      requestAnimationFrame: (callback: (time: number) => void) => {
        frame++;
        now += frame === 30 ? 50 : 1000 / 60;
        queueMicrotask(() => {
          callback(now);
        });
        return 0;
      },
    });
    await evaluate(contents, installPageKit);

    const stats = await (sandbox.__viperKit as PageKit).measureFrames(1000);

    expect(stats.frames).toBeGreaterThan(55);
    expect(stats.medianMs).toBeCloseTo(16.7, 1);
    expect(stats.worstMs).toBe(50);
    expect(stats.slowFrames).toBe(1);
  });
});
