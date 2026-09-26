# Architecture

## Process model

```text
+----------------------- Electron main process -----------------------+
|  Static server on 127.0.0.1:47813, serves dist/renderer (Vite build) |
|  GET/HEAD only, traversal refused, CSP on pages, no-store, nosniff   |
+---------------+--------------------------------------+---------------+
                | loadURL                              | loadURL
      +---------v---------+   BroadcastChannel   +-----v-------------+
      |   game.html       |<---- 'vipere-duel' --+  control.html     |
      |   (on stream)     |  commands in,        |  (private)        |
      |                   |  state out (2 Hz)    |                   |
      +---------+---------+                      +-------------------+
                | WebSocket ws://localhost:21213
      +---------v---------+
      | TikFinity desktop |  TikTok LIVE events: likes, shares, gifts, joins
      +-------------------+
```

**Why a local HTTP server instead of `file://`?** Both windows need the same origin for
`BroadcastChannel`, and an `http:` page can open the TikFinity WebSocket without file-origin
restrictions.

**Why a fixed port?** Web storage is keyed by origin, port included. The control room saves the
platform, donor names and fluid mode in `localStorage`; on a random port each launch got a new,
empty storage. The server binds 47813 and falls back to a free port, with a warning, only when it
is taken. In development the Vite dev server is the origin instead.

**Why no frameless window?** OBS and TikTok LIVE Studio capture a frameless Electron window as
black. The frame is cropped in the capture tool instead.

**Why background throttling is disabled.** The game window is captured, not looked at. Chromium
throttles occluded windows (measured down to 1 fps), which drops frames on stream. The app turns
off renderer backgrounding, background timer throttling and native window occlusion.

**Window hardening.** Both windows run with `contextIsolation`, `sandbox` and no Node
integration, stated explicitly in `windows.ts`. Navigation away from the local origin and
`window.open` are refused, and page titles cannot rename the windows, because capture tools select
a window by its title. A second launch focuses the running instance instead of starting a competing
server.

## Main process

| Module               | Owns                                                  |
| -------------------- | ----------------------------------------------------- |
| `rules.js`           | Board speed, hazard timings, crowd tiers, gift prices |
| `crowd.js`           | Audience cadence and the tier it selects              |
| `audience-events.js` | Live events turned into board effects                 |
| `hazards.js`         | Where stones and brambles may appear                  |
| `scenes.js`          | Director scenes from the control room                 |
| `tension.js`         | How cornered the leading snake is                     |
| `layout.js`          | Frame geometry, grid, safe zones, format              |
| `frame.js`           | One frame, composed in draw order                     |
| `board-items.js`     | Berries, stones and brambles                          |
| `effects.js`         | Eggshell, halos and sparks                            |
| `duel-hud.js`        | Half-rings and team status columns                    |
| `scoreboard.js`      | Score bar and round clock                             |
| `gift-panel.js`      | Gift legend and scrolling columns                     |
| `gift-feedback.js`   | Latest donor per gift line                            |
| `end-screen.js`      | Winner veil and donor ranking                         |
| `announcements.js`   | On-stream banner and its phrasing                     |
| `debug-overlay.js`   | Operator-only AI and safe-zone layers                 |
| `audio.js`           | Sound, armed on first gesture                         |
| `canvas.js`          | The drawing surface                                   |
| `palette.js`         | Team and effect colours                               |

A module owns the bindings it writes and exports them read-only; other modules change them
through the owner's functions, so every write to a piece of state is found in one file.

## Event flow

1. TikFinity pushes a JSON event over the WebSocket (`tikfinity-bridge.js`).
2. The bridge normalises it and calls `window.receiveEvent(event)`.
3. The engine applies the effect. The gift value selects the effect (speed boost, steal, shield,
   extra life) and the gift name selects the team.
4. The control room receives a state snapshot twice per second and sends commands back (new
   round, settings, staged scenes, test endings).

The simulated audience (`simulated-audience.js`) emits the same event shapes, so rehearsal and
live share one code path.

## Rendering

- Fixed reference frame of 1080×1920 on a 16×20 grid of 47 px cells. The canvas backing store is
  mapped to the window with a single `setTransform`.
- 16:9 mode is a letterbox fill: the frame widens to 3414 units with a 1167 offset, and only the
  ambience layer draws into the extra width. Gameplay coordinates never change.
- Expensive layers (light rays, foreground foliage, weather sprites) are pre-rendered into
  offscreen canvases and invalidated when the frame changes.

## Testing strategy

`tests/support/boot-game.ts` loads the real renderer scripts in Node with a fake canvas that
records every draw call. The suites then:

- play duels at 60 fps in both formats, in every weather and every gift-panel mode, under a
  steady stream of audience events, and assert that the engine reports zero errors;
- run 30 simulated minutes of AI versus AI and check that rounds chain on their own, every
  outcome is valid and the on-screen score matches the round log.

Main-process modules have unit suites of their own: config parsing, the static server over real
HTTP (including traversal attempts that `fetch` would normalise away), window sizing, and page
function serialisation.
