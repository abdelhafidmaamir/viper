import { describe, expect, it } from 'vitest';

import {
  FRAME_MS,
  READ_TICK_MS,
  installDeterminism,
  mulberry32,
  seedFrom,
  type DeterminismHost,
  type LoadingImage,
} from '../../src/renderer/game/determinism.ts';
import { seededRandom } from '../support/boot-game.ts';

/** A host whose display frames fire only when the test says so, with wall-clock stamps. */
function fakeHost() {
  let displayQueue = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  let wallMs = 0;

  class FakeImage implements LoadingImage {
    static created: FakeImage[] = [];
    complete = false;
    private readonly listeners: (() => void)[] = [];
    constructor() {
      FakeImage.created.push(this);
    }
    addEventListener(_type: 'load' | 'error', listener: () => void): void {
      this.listeners.push(listener);
    }
    finish(): void {
      this.complete = true;
      for (const listener of this.listeners.splice(0)) listener();
    }
  }

  const host: DeterminismHost = {
    Math: { random: () => 0.5 },
    performance: { now: () => wallMs },
    requestAnimationFrame: (callback) => {
      const handle = nextHandle++;
      displayQueue.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle) => {
      displayQueue.delete(handle);
    },
    Image: FakeImage,
  };

  return {
    host,
    FakeImage,
    pendingDisplayFrames: () => displayQueue.size,
    /** Fires one display frame after an arbitrary wall-clock gap. */
    display(gapMs = 7.3): void {
      wallMs += gapMs;
      const callbacks = [...displayQueue.values()];
      displayQueue = new Map();
      for (const callback of callbacks) callback(wallMs);
    },
  };
}

/** Lets pending promise continuations run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Drives display frames until `promise` settles. */
async function drive<T>(fake: ReturnType<typeof fakeHost>, promise: Promise<T>): Promise<T> {
  const state = { done: false };
  const result = promise.finally(() => {
    state.done = true;
  });
  for (let i = 0; i < 1000 && !state.done; i++) {
    await flush();
    fake.display();
  }
  return result;
}

describe('seedFrom', () => {
  it.each([
    ['?seed=42', 42],
    ['?seed=0', 0],
    ['?orientation=landscape&seed=7', 7],
    ['?seed=4294967295', 4294967295],
  ])('reads %s', (search, seed) => {
    expect(seedFrom(search)).toBe(seed);
  });

  it.each(['', '?seed=', '?seed=-1', '?seed=1.5', '?seed=abc', '?seed=4294967296', '?seed=1e3'])(
    'ignores %j',
    (search) => {
      expect(seedFrom(search)).toBeNull();
    },
  );
});

describe('mulberry32', () => {
  it('matches the generator of the headless suites', () => {
    const page = mulberry32(1234);
    const suites = seededRandom(1234);
    for (let i = 0; i < 100; i++) expect(page()).toBe(suites());
  });

  it('stays in [0, 1)', () => {
    const next = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('installDeterminism', () => {
  it('seeds Math.random, and reseed restarts the sequence', () => {
    const { host } = fakeHost();
    const clock = installDeterminism(host, 5);
    const expected = mulberry32(5);
    const first = [host.Math.random(), host.Math.random()];
    expect(first).toEqual([expected(), expected()]);
    clock.reseed(5);
    expect([host.Math.random(), host.Math.random()]).toEqual(first);
  });

  it('starts held: page frames wait for a driver', () => {
    const fake = fakeHost();
    installDeterminism(fake.host, 1);
    let calls = 0;
    fake.host.requestAnimationFrame(() => calls++);
    fake.display();
    fake.display();
    expect(calls).toBe(0);
    expect(fake.pendingDisplayFrames()).toBe(0);
  });

  it('steps exactly n frames stamped n * FRAME_MS, whatever the wall clock does', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    const stamps: number[] = [];
    const loop = (time: number): void => {
      stamps.push(time);
      fake.host.requestAnimationFrame(loop);
    };
    fake.host.requestAnimationFrame(loop);

    await expect(drive(fake, clock.step(3))).resolves.toBe(3);
    expect(stamps).toEqual([FRAME_MS, 2 * FRAME_MS, 3 * FRAME_MS]);
    expect(clock.frame).toBe(3);
    expect(clock.time).toBe(3 * FRAME_MS);

    // Held again: more display frames change nothing.
    fake.display();
    fake.display();
    expect(stamps).toHaveLength(3);
  });

  it('runs every callback queued for a frame and honours cancellation', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    const seen: string[] = [];
    fake.host.requestAnimationFrame(() => seen.push('a'));
    const cancelled = fake.host.requestAnimationFrame(() => seen.push('b'));
    fake.host.requestAnimationFrame(() => seen.push('c'));
    fake.host.cancelAnimationFrame(cancelled);

    await drive(fake, clock.step(1));
    expect(seen).toEqual(['a', 'c']);
  });

  it('serialises concurrent steps', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    const first = clock.step(2);
    const second = clock.step(3);
    await expect(drive(fake, second)).resolves.toBe(5);
    await expect(first).resolves.toBe(2);
  });

  it('rejects a fractional or negative step', async () => {
    const { host } = fakeHost();
    const clock = installDeterminism(host, 1);
    await expect(clock.step(1.5)).rejects.toThrow(RangeError);
    await expect(clock.step(-1)).rejects.toThrow(RangeError);
  });

  it('advances performance.now per read inside a frame, and freezes it outside', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    // Outside a frame (timers, the diagnostics driver) reads do not move the clock.
    expect(fake.host.performance.now()).toBe(0);
    expect(fake.host.performance.now()).toBe(0);

    const inFrame: number[] = [];
    let reads = 0;
    fake.host.requestAnimationFrame(() => {
      inFrame.push(fake.host.performance.now(), fake.host.performance.now());
      // A budgeted search reading the clock in a loop terminates after a fixed number of reads.
      const deadline = fake.host.performance.now() + 5;
      while (fake.host.performance.now() < deadline) reads++;
    });
    await drive(fake, clock.step(2));
    expect(inFrame[0]).toBe(FRAME_MS);
    expect(inFrame[1]).toBeCloseTo(FRAME_MS + READ_TICK_MS, 9);
    expect(reads).toBe(Math.round(5 / READ_TICK_MS));

    // Monotonic: after the frame, reads never go back, and stay frozen until the next one.
    const after = fake.host.performance.now();
    expect(after).toBe(2 * FRAME_MS);
    expect(fake.host.performance.now()).toBe(after);
  });

  it('release plays one virtual frame per display frame, and hold stops it', () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    const stamps: number[] = [];
    const loop = (time: number): void => {
      stamps.push(time);
      fake.host.requestAnimationFrame(loop);
    };
    fake.host.requestAnimationFrame(loop);

    clock.release();
    clock.release();
    fake.display(3);
    fake.display(40);
    expect(stamps).toEqual([FRAME_MS, 2 * FRAME_MS]);

    clock.hold();
    fake.display();
    expect(stamps).toHaveLength(2);
    expect(fake.pendingDisplayFrames()).toBe(0);
  });

  it('waits for images still loading before the next frame', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    const ImageClass = fake.host.Image;
    if (!ImageClass) throw new Error('Image expected on the fake host');

    let calls = 0;
    const loop = (): void => {
      calls++;
      fake.host.requestAnimationFrame(loop);
    };
    fake.host.requestAnimationFrame(loop);
    const image = new ImageClass();
    expect(fake.FakeImage.created).toContain(image);

    let done = false;
    const stepping = clock.step(1).then(() => (done = true));
    for (let i = 0; i < 5; i++) {
      await flush();
      fake.display();
    }
    expect(done).toBe(false);
    expect(calls).toBe(0);

    fake.FakeImage.created[0]?.finish();
    await drive(fake, stepping);
    expect(calls).toBe(1);
  });

  it('settle resolves after two display frames without playing any', async () => {
    const fake = fakeHost();
    const clock = installDeterminism(fake.host, 1);
    let settled = false;
    const settling = clock.settle().then(() => (settled = true));
    await flush();
    fake.display();
    await flush();
    expect(settled).toBe(false);
    fake.display();
    await settling;
    expect(settled).toBe(true);
    expect(clock.frame).toBe(0);
  });
});
