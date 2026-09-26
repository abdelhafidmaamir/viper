// The drawing surface. Painters draw through `ctx`; pre-renders point it at an offscreen canvas
// for a moment and hand it back, which is why it is swappable.

export let canvas = null;
export let ctx = null;

/** Binds the on-stream canvas. Leaves the current context untouched when there is none. */
export function lierCanvas(element) {
  canvas = element;
  if (canvas) ctx = canvas.getContext('2d');
}

/** Redirects drawing to `context` and returns the previous one, to be restored by the caller. */
export function setCtx(context) {
  const avant = ctx;
  ctx = context;
  return avant;
}
