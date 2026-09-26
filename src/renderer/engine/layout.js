// Frame geometry: the 1080x1920 reference frame, the 16x20 grid, the TikTok LIVE safe zones and
// the anchors that move with the 9:16 / 16:9 format. Every binding here is written only by
// changerFormat; other modules read them as live bindings.

export let W = 1080,
  H = 1920;
export const COLS = 16,
  ROWS = 20;
// TikTok LIVE safe zone. A LIVE stream does NOT have the like/share/comment column of the feed view,
// so the sides are free. What actually overlaps: the top overlay (LIVE badge, nickname, viewers) and
// the entire bottom (comment thread left, input bar and gift button). A large gift animates over
// everything; nothing can be done about that.
// Zones measured from a real live capture as a fraction of screen height, mapped to 1080x1920.
// Only the TikTok chrome is retained; the camera and game layout of that stream belonged to that
// streamer's arrangement, not to the interface.
// Top 0-260, comment thread from 1237: safe height is 977, not 1130.
export let SR_X = 0,
  SR_Y = 260,
  SR_W = 1080,
  SR_H = 977;
// The other chrome zones, for the guide overlay and the mockup.
export const Z_GIFTS = { x: 702, y: 392, w: 340, h: 343 }; // gift widget column, right side
export const Z_BANNER = { x: 45, y: 1133, w: 595, h: 98 }; // "someone gifted x15" banner
export const Z_COMMENTS = { x: 0, y: 1237, w: 780, h: 478 }; // comment thread
export const Z_INPUT = { x: 0, y: 1751, w: 1080, h: 98 }; // input bar and buttons
// The board fits in the real safe height. 20 rows of 47 px plus the ring make 968 px for 977
// available; at 52 it required 1068 and the top 91 px disappeared under the host bar during live.
// The 16x20 grid is unchanged, so no rule, trajectory or balance changes: this is a scale change,
// not a board change.
export const CELL = 47;
export let X0 = 164,
  Y0 = 278;
// Portrait 9:16 (TikTok) or landscape 16:9 (YouTube). The board keeps its grid and 47 px cells in
// both formats; only its origin and the HUD anchors change. In landscape the HUD shifts to the flanks:
// gold on the left, shadow on the right.
const FORMATS = {
  portrait: {
    ox: 0,
    WF: 1080,
    W: 1080,
    H: 1920,
    X0: 164,
    Y0: 278,
    scCy: 1276,
    bdCx: 540,
    bdW: 600,
    bdCy: 154,
    legY: 1372,
    legCxG: 320,
    legCxD: 760,
    scrollRowY: 1330,
    scrollLeftX: 528,
    scrollRightX: 794,
    baseEnd: 1206,
    srY: 260,
    srH: 977,
  },
  // Landscape: the portrait composition is drawn as-is at the center of a 16:9 frame (3414 x 1920);
  // only the ambience extends into the sides.
  landscape: {
    ox: 1167,
    WF: 3414,
    W: 1080,
    H: 1920,
    X0: 164,
    Y0: 278,
    scCy: 1276,
    bdCx: 540,
    bdW: 600,
    bdCy: 154,
    legY: 1372,
    legCxG: 320,
    legCxD: 760,
    scrollRowY: 1330,
    scrollLeftX: 528,
    scrollRightX: 794,
    baseEnd: 1206,
    srY: 260,
    srH: 977,
  },
};
export let L = FORMATS.portrait,
  OX = 0,
  WF = 1080; // OX: left margin of the frame, WF: total frame width

export let SC_CY = 1276; // center line of the score bar, with some space below the ring
export let BD_W = 600,
  BD_CY = 154,
  BD_CX = 540; // Positioned higher, away from the timer.

/** Applies a format. Returns false when it is already active, so callers can skip re-layout. */
export function setFormat(format) {
  const f = FORMATS[format] || FORMATS.portrait;
  if (L === f) return false;
  L = f;
  OX = f.ox;
  WF = f.WF;
  W = f.W;
  H = f.H;
  X0 = f.X0;
  Y0 = f.Y0;
  SC_CY = f.scCy;
  BD_CX = f.bdCx;
  BD_W = f.bdW;
  BD_CY = f.bdCy;
  SR_W = f.W;
  SR_Y = f.srY;
  SR_H = f.srH;
  return true;
}
