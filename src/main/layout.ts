import type { Orientation } from './config.js';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Reference frame of the game, in portrait. Landscape is the same frame turned 16:9. */
const REFERENCE: Size = { width: 1080, height: 1920 };

/** Room left for the window frame and the taskbar-adjacent edge. */
const FRAME_ALLOWANCE = 80;

/**
 * Largest 9:16 (or 16:9) content size that fits the work area, capped at the reference frame.
 * Asking Windows for more than the screen holds gets an arbitrary resize instead, which makes
 * two measurement runs incomparable.
 */
export function fitContentSize(orientation: Orientation, workArea: Size): Size {
  const [aspectW, aspectH] = orientation === 'portrait' ? [9, 16] : [16, 9];
  const maxWidth = Math.min(
    workArea.width - FRAME_ALLOWANCE,
    orientation === 'portrait' ? REFERENCE.width : REFERENCE.height,
  );
  const maxHeight = Math.min(
    workArea.height - FRAME_ALLOWANCE,
    orientation === 'portrait' ? REFERENCE.height : REFERENCE.width,
  );
  const unit = Math.floor(Math.min(maxWidth / aspectW, maxHeight / aspectH));
  return { width: unit * aspectW, height: unit * aspectH };
}
