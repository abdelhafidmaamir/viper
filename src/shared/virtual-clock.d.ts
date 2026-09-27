/**
 * Driver of a seeded game page (`game.html?seed=<n>`), shared by the renderer that installs it
 * and the main-process diagnostics that drive it. Implemented in src/renderer/game/determinism.ts.
 */

interface VirtualClockControl {
  readonly seed: number;
  readonly frame: number;
  readonly time: number;
  reseed(seed: number): void;
  hold(): void;
  release(): void;
  step(frames: number): Promise<number>;
  settle(): Promise<void>;
}

interface Window {
  /** Present only on a seeded page. */
  __viperClock?: VirtualClockControl;
}
