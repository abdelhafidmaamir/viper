# Architecture

## Process model

```text
+----------------------- Electron main process -----------------------+
|  HTTP server on 127.0.0.1:<random port>, serves src/renderer only    |
|  (path traversal refused, no-store caching)                          |
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

**Why no frameless window?** OBS and TikTok LIVE Studio capture a frameless Electron window as
black. The frame is cropped in the capture tool instead.

**Why background throttling is disabled.** The game window is captured, not looked at. Chromium
throttles occluded windows (measured down to 1 fps), which drops frames on stream. The app turns
off renderer backgrounding, background timer throttling and native window occlusion.

## Event flow

1. TikFinity pushes a JSON event over the WebSocket (`tikfinity-bridge.js`).
2. The bridge normalises it and calls `window.recevoirEvenement(event)`.
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

`tests/support/boot-game.js` loads the real renderer scripts in Node with a fake canvas that
records every draw call. The suites then:

- play duels at 60 fps in both formats, in every weather and every gift-panel mode, under a
  steady stream of audience events, and assert that the engine reports zero errors;
- run 30 simulated minutes of AI versus AI and check that rounds chain on their own, every
  outcome is valid and the on-screen score matches the round log.
