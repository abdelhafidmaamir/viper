/**
 * Deterministic mode for the game page: a seeded `Math.random` and a virtual clock.
 *
 * Everything the page shows becomes a function of the seed and of the number of frames played,
 * never of the wall clock or the machine speed. Pixel regression tests depend on it: two runs of
 * the same script must paint the same pixels.
 *
 * The clock owns `requestAnimationFrame`. Frame `n` is stamped `n * FRAME_MS`, and
 * `performance.now()` returns the current frame's time plus a tiny, fixed increment per read, so
 * time-budgeted code (the search AI) stops after a reproducible amount of work. The page starts
 * held on frame 0: nothing moves until a driver calls `step` or `release`.
 */

/** One frame at 60 Hz, in milliseconds. */
export const FRAME_MS = 1000 / 60;

/** How far `performance.now()` moves per read within a frame (same as the headless suites). */
export const READ_TICK_MS = 0.005;

/** Mulberry32: tiny, fast, and good enough to make gameplay reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reads `?seed=<n>` from a query string. Only an unsigned 32-bit integer enables the mode. */
export function seedFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const seed = Number(raw);
  return seed <= 0xffffffff ? seed : null;
}

/** The slice of an image the clock needs: whether it finished loading, and how to hear it. */
export interface LoadingImage {
  readonly complete: boolean;
  addEventListener(type: 'load' | 'error', listener: () => void, options: { once: true }): void;
}

type ImageConstructor = new (width?: number, height?: number) => LoadingImage;

/** The globals the mode replaces. `window` in the page, a fake in the unit suite. */
export interface DeterminismHost {
  Math: { random: () => number };
  performance: { now: () => number };
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  Image?: ImageConstructor;
}

export interface VirtualClock {
  readonly seed: number;
  /** Frames delivered to the page so far. */
  readonly frame: number;
  /** Virtual time of the current frame, in milliseconds. */
  readonly time: number;
  /** Restarts the generator, so a scene does not depend on what earlier scenes consumed. */
  reseed(seed: number): void;
  /** Stops delivering frames. The canvas keeps its last picture. */
  hold(): void;
  /** Plays one virtual frame per display frame, whatever the display rate. */
  release(): void;
  /**
   * Holds, then plays exactly `frames` frames back to back, as fast as the machine draws them,
   * and resolves with the new frame count. Before each frame it waits for images still loading,
   * so artwork appears on the same frame every run. Call `settle` before reading the screen.
   */
  step(frames: number): Promise<number>;
  /** Resolves after two display frames: whatever was drawn last is then on screen. */
  settle(): Promise<void>;
}

/**
 * Replaces the host's random source and timing with deterministic ones and returns the clock
 * that drives the page. Call it before any game script runs.
 */
export function installDeterminism(host: DeterminismHost, seed: number): VirtualClock {
  const nativeFrame = host.requestAnimationFrame.bind(host);
  const nativeCancel = host.cancelAnimationFrame.bind(host);
  const pendingImages = trackImages(host);

  let random = mulberry32(seed);
  let frame = 0;
  let lastRead = 0;
  let delivering = false;
  let queue = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  let running = false;
  let pump: number | null = null;
  let stepping: Promise<number> = Promise.resolve(0);

  const time = (): number => frame * FRAME_MS;

  const deliver = (): void => {
    frame++;
    const callbacks = [...queue.values()];
    queue = new Map();
    const stamp = time();
    delivering = true;
    try {
      for (const callback of callbacks) callback(stamp);
    } finally {
      delivering = false;
    }
  };

  const onDisplayFrame = (): void => {
    pump = null;
    if (!running) return;
    deliver();
    pump = nativeFrame(onDisplayFrame);
  };

  const displayFrame = (): Promise<void> =>
    new Promise((resolve) => {
      nativeFrame(() => {
        resolve();
      });
    });

  const hold = (): void => {
    running = false;
    if (pump !== null) nativeCancel(pump);
    pump = null;
  };

  host.Math.random = () => random();
  // Only reads made while a frame is delivered move the clock. Reads from wall-clock timers (the
  // control-room heartbeat, a driver between frames) come at machine-dependent moments and would
  // otherwise shift the time budget of the next search.
  host.performance.now = () => {
    if (!delivering) return Math.max(time(), lastRead);
    lastRead = Math.max(time(), lastRead + READ_TICK_MS);
    return lastRead;
  };
  host.requestAnimationFrame = (callback) => {
    const handle = nextHandle++;
    queue.set(handle, callback);
    return handle;
  };
  host.cancelAnimationFrame = (handle) => {
    queue.delete(handle);
  };

  return {
    seed,
    get frame() {
      return frame;
    },
    get time() {
      return time();
    },
    reseed(next) {
      random = mulberry32(next);
    },
    hold,
    release() {
      if (running) return;
      running = true;
      pump = nativeFrame(onDisplayFrame);
    },
    step(frames) {
      if (!Number.isInteger(frames) || frames < 0) {
        return Promise.reject(new RangeError(`step expects a whole number of frames.`));
      }
      hold();
      // Steps queue behind each other: two drivers never interleave frames.
      stepping = stepping.then(async () => {
        for (let i = 0; i < frames; i++) {
          await pendingImages();
          deliver();
        }
        return frame;
      });
      return stepping;
    },
    async settle() {
      await displayFrame();
      await displayFrame();
    },
  };
}

/**
 * Wraps the host's `Image` so every image the page creates is known, and returns a function that
 * resolves once none is still loading. Without an `Image` (workers, tests) nothing is tracked.
 */
function trackImages(host: DeterminismHost): () => Promise<void> {
  const Native = host.Image;
  if (!Native) return () => Promise.resolve();

  const loading = new Set<LoadingImage>();
  const settled = (image: LoadingImage): Promise<void> =>
    new Promise((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }
      const done = (): void => {
        resolve();
      };
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });

  host.Image = class TrackedImage extends Native {
    constructor(width?: number, height?: number) {
      super(width, height);
      loading.add(this);
    }
  };

  return async () => {
    for (const image of [...loading]) {
      await settled(image);
      if (image.complete) loading.delete(image);
    }
  };
}
