import type { App } from 'electron';

import type { Orientation } from '../config.js';
import { evaluate } from '../page/evaluate.js';
import { formatOf, json, type Diagnostic } from './context.js';

/** Seed of the page under test. Changing it changes every baseline. */
export const VISUAL_SEED = 7;

/**
 * Content size per format. Small enough to fit any CI display and any laptop screen, so the
 * window is never resized by the window manager behind the diagnostic's back.
 */
const CONTENT_SIZE: Readonly<Record<Orientation, readonly [width: number, height: number]>> = {
  portrait: [540, 960],
  landscape: [960, 540],
};

type Team = 'gold' | 'shadow';

/** What the page does before a capture. Frame counts are virtual, never wall time. */
type Action =
  /** A fresh round, reseeded, played for `frames` frames. */
  | {
      readonly kind: 'round';
      readonly weather: string;
      readonly hour: number;
      readonly frames: number;
    }
  /**
   * Gifts for both teams, `giftFrames` frames so their announcements show, then the winner's end
   * screen, played for `frames` frames.
   */
  | {
      readonly kind: 'ending';
      readonly winner: Team;
      readonly giftFrames: number;
      readonly frames: number;
    }
  /**
   * A round played for `hatchFrames` frames, then the scripted gifts all at once (the page spaces
   * their flights out), played for `frames` more frames.
   */
  | {
      readonly kind: 'gifts';
      readonly weather: string;
      readonly hour: number;
      readonly hatchFrames: number;
      readonly frames: number;
    };

interface Scene {
  /** File name of the capture, without extension. */
  readonly name: string;
  readonly orientation: Orientation;
  readonly action: Action;
}

/**
 * The scripted scenes, per format: the live board once both snakes hatched, the end screen of
 * that same round, and a second weather. Then the fan photos of a gift burst: waiting with the
 * donor's name, swooping to the head, and settled on the bodies. They come last so adding one never
 * moves the frames of the others. Software rendering costs up to a few hundred
 * milliseconds per frame, so the frame counts are as short as the animations allow.
 */
const SCENES: readonly Scene[] = [
  {
    name: 'portrait-board',
    orientation: 'portrait',
    action: { kind: 'round', weather: 'rain', hour: 0.5, frames: 120 },
  },
  {
    name: 'portrait-end-screen',
    orientation: 'portrait',
    action: { kind: 'ending', winner: 'shadow', giftFrames: 24, frames: 60 },
  },
  {
    name: 'portrait-snow',
    orientation: 'portrait',
    action: { kind: 'round', weather: 'snow', hour: 0.36, frames: 30 },
  },
  {
    name: 'landscape-board',
    orientation: 'landscape',
    action: { kind: 'round', weather: 'rain', hour: 0.5, frames: 120 },
  },
  {
    name: 'landscape-end-screen',
    orientation: 'landscape',
    action: { kind: 'ending', winner: 'gold', giftFrames: 24, frames: 60 },
  },
  {
    name: 'landscape-aurora',
    orientation: 'landscape',
    action: { kind: 'round', weather: 'aurora', hour: 0.02, frames: 30 },
  },
  {
    name: 'portrait-fans-flight',
    orientation: 'portrait',
    action: { kind: 'gifts', weather: 'rain', hour: 0.5, hatchFrames: 120, frames: 30 },
  },
  {
    name: 'portrait-fans-swoop',
    orientation: 'portrait',
    action: { kind: 'gifts', weather: 'rain', hour: 0.5, hatchFrames: 120, frames: 62 },
  },
  {
    name: 'portrait-fans-badges',
    orientation: 'portrait',
    action: { kind: 'gifts', weather: 'rain', hour: 0.5, hatchFrames: 120, frames: 240 },
  },
];

/**
 * Chromium switches that make rasterisation a pure function of the draw calls: software
 * rendering (no GPU driver in the loop), one device pixel per CSS pixel whatever the display
 * scaling, sRGB output, greyscale text anti-aliasing, and full motion whatever the host setting. Applied to this diagnostic only, before
 * the app is ready; the shipped app keeps hardware acceleration.
 */
export function useReproducibleRendering(app: App): void {
  app.disableHardwareAcceleration();
  const switches: readonly (readonly [name: string, value?: string])[] = [
    ['disable-gpu'],
    ['disable-gpu-compositing'],
    ['force-device-scale-factor', '1'],
    ['force-color-profile', 'srgb'],
    ['disable-lcd-text'],
    ['font-render-hinting', 'none'],
    // Windows Server turns animations off, which Chromium reports as reduced motion: the ambience
    // then draws fewer particles, draws fewer random numbers, and the whole round diverges.
    ['force-prefers-no-reduced-motion'],
  ];
  for (const [name, value] of switches) app.commandLine.appendSwitch(name, value);
}

/**
 * Pixel regression captures. The game page runs seeded (`?seed=`) on a virtual clock, and each
 * scene is captured after a fixed number of frames, so two runs on the same platform produce the
 * same pixels. `scripts/visual.ts` compares the PNGs with the committed baselines.
 */
export const visual: Diagnostic = async ({ game, write }) => {
  const contents = game.webContents;
  const seed = await evaluate(contents, async () => {
    await document.fonts.ready;
    return window.__viperClock?.seed ?? null;
  });
  if (seed !== VISUAL_SEED) {
    throw new Error(
      `The game page is not seeded with ${String(VISUAL_SEED)} (got ${String(seed)}).`,
    );
  }

  /** `wallSeconds` is for the operator only: it varies between runs, the pixels do not. */
  const captures: {
    name: string;
    frame: number;
    width: number;
    height: number;
    wallSeconds: number;
  }[] = [];
  let orientation: Orientation | null = null;

  for (const scene of SCENES) {
    const started = performance.now();
    if (scene.orientation !== orientation) {
      orientation = scene.orientation;
      const [width, height] = CONTENT_SIZE[orientation];
      // Minimized by the desktop mid-run (focus change, show desktop), the window ignores its new
      // size and the page reads a stale viewport: bring it back before resizing.
      if (game.isMinimized()) game.restore();
      game.setContentSize(width, height);
      await evaluate(contents, waitForViewport, width, height);
    }

    const settings: Partial<GameSettings> = {
      format: formatOf(scene.orientation),
      giftDisplay: 'scroll',
      scrollHidden: 0,
      autoAmbience: false,
      cycle: 0,
      platform: 'tiktok',
    };
    const frame = await evaluate(contents, play, VISUAL_SEED, settings, scene.action);

    const rect = await evaluate(contents, () => window.__viperKit.sceneRect());
    await write(`${scene.name}.png`, (await contents.capturePage(rect)).toPNG());
    captures.push({
      name: scene.name,
      frame,
      width: rect.width,
      height: rect.height,
      wallSeconds: Number(((performance.now() - started) / 1000).toFixed(1)),
    });
  }

  const metrics = await evaluate(contents, () => window.Viper.metrics());
  await write(
    'visual.json',
    json({
      seed: VISUAL_SEED,
      captures,
      engineErrors: metrics.errors,
      lastError: metrics.lastError,
    }),
  );
  if (metrics.errors > 0) {
    throw new Error(
      `Engine reported ${String(metrics.errors)} error(s): ${String(metrics.lastError)}`,
    );
  }
};

/** Page side: waits for the window resize to reach the page, then for it to be painted. */
async function waitForViewport(width: number, height: number): Promise<void> {
  const clock = window.__viperClock;
  if (!clock) throw new Error('No virtual clock on the page.');
  for (let i = 0; i < 200 && (innerWidth !== width || innerHeight !== height); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (innerWidth !== width || innerHeight !== height) {
    throw new Error(
      `Viewport is ${String(innerWidth)}x${String(innerHeight)}, expected ${String(width)}x${String(height)}.`,
    );
  }
  await clock.settle();
}

/** Page side: runs one scene action on the virtual clock and returns the frame it stopped on. */
async function play(
  seed: number,
  settings: Partial<GameSettings>,
  action: Action,
): Promise<number> {
  const clock = window.__viperClock;
  if (!clock) throw new Error('No virtual clock on the page.');
  clock.hold();

  let frame: number;
  switch (action.kind) {
    case 'round':
      clock.reseed(seed);
      window.__viperKit.startDuel({ ...settings, weather: action.weather });
      window.Viper.setHour(action.hour);
      // A format change resizes the canvas, which clears it. Let that layout land first, or it
      // wipes the last frame during the final settle.
      await clock.settle();
      frame = await clock.step(action.frames);
      break;
    case 'gifts': {
      clock.reseed(seed);
      window.__viperKit.startDuel({ ...settings, weather: action.weather });
      window.Viper.setHour(action.hour);
      await clock.settle();
      await clock.step(action.hatchFrames);
      const gifts = [
        ['gold', 1, 'rose', 'soleil92'],
        ['shadow', 1, 'rose', 'zoe_moon'],
        ['gold', 30, 'capybara', 'karim.or'],
        ['shadow', 100, 'teddy', 'nuit.blanche'],
        ['gold', 5, 'finger heart', 'lea_b'],
        ['shadow', 5, 'finger heart', 'Mo'],
      ] as const;
      for (const [team, value, name, nickname] of gifts) {
        window.receiveEvent({ type: 'gift', n: 1, value, name, team, nickname });
      }
      frame = await clock.step(action.frames);
      break;
    }
    case 'ending': {
      const gifts = [
        ['gold', 100, 'teddy', 'karim.or'],
        ['shadow', 30, 'capybara', 'zoe_moon'],
        ['gold', 10, 'rose 10', 'soleil92'],
      ] as const;
      for (const [team, value, name, nickname] of gifts) {
        window.receiveEvent({ type: 'gift', n: 1, value, name, team, nickname });
      }
      await clock.step(action.giftFrames);
      window.Viper.endTest?.(action.winner);
      frame = await clock.step(action.frames);
      break;
    }
  }
  await clock.settle();
  return frame;
}
