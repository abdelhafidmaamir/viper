// The drawing surface. Painters draw through `ctx`; pre-renders point it at an offscreen canvas
// for a moment and hand it back, which is why it is swappable.

// canvas is typed as HTMLElement (not HTMLCanvasElement) so callers can pass getElementById's
// return value directly; it is always an HTMLCanvasElement at runtime.
export let canvas: HTMLElement | null = null;
// ctx is set once by bindCanvas before the frame loop starts; all paint functions run after
// that, so ctx is never null during rendering. The initialiser satisfies the type without a
// non-null assertion: the invariant is enforced by the game-start sequence in game.ts.
export let ctx = null as unknown as CanvasRenderingContext2D;

/** Binds the on-stream canvas. Leaves the current context untouched when there is none. */
export function bindCanvas(element: HTMLElement | null): void {
  canvas = element;
  if (canvas) {
    // element is an HTMLCanvasElement at every real call site (getElementById('scene')).
    const ctx2d = (canvas as HTMLCanvasElement).getContext('2d');
    // getContext never returns null for an HTMLCanvasElement; the guard satisfies the type checker.
    if (ctx2d) ctx = ctx2d;
  }
}

/** Redirects drawing to `context` and returns the previous one, to be restored by the caller. */
export function setCtx(context: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const previous = ctx;
  ctx = context;
  return previous;
}
