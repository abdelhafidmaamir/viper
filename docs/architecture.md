# Architecture

## Windows

```text
+----------------------- Electron main process -----------------------+
|  local server on 127.0.0.1:47813, serves dist/renderer               |
+---------------+--------------------------------------+---------------+
                |                                      |
      +---------v---------+   BroadcastChannel   +-----v-------------+
      |   game.html       |<---- 'viper-duel' ---+  control.html     |
      |   (on stream)     |  commands in,        |  (private)        |
      |                   |  state out (2 Hz)    |                   |
      +---------+---------+                      +-------------------+
                | WebSocket ws://localhost:21213
      +---------v---------+
      | TikFinity desktop |  likes, shares, gifts, joins
      +-------------------+
```

Some things that look odd but are on purpose:

- Local HTTP server instead of `file://`: both windows need the same origin for the
  BroadcastChannel, and the TikFinity WebSocket is easier from `http:`.
- Fixed port: localStorage depends on the port. With a random port the control room forgot its
  settings on every launch. If 47813 is taken it falls back to a free one and logs a warning.
- The game window keeps its frame: OBS and TikTok LIVE Studio capture a frameless Electron
  window as black. Crop it in the capture tool.
- Background throttling is off: the game window is captured, not looked at, and Chromium drops
  hidden windows to about 1 fps.
- Both windows are sandboxed, can't navigate away, and keep their titles (capture tools pick
  windows by title). A second launch just focuses the first one.

## Engine

`scripts/game.ts` is the simulation loop and public API. The rest is split in `engine/`:

| Module               | What's in it                                    |
| -------------------- | ----------------------------------------------- |
| `rules.ts`           | speeds, hazard timings, crowd tiers, prices     |
| `crowd.ts`           | audience pace and current tier                  |
| `audience-events.ts` | live events turned into board effects           |
| `hazards.ts`         | where stones and brambles can spawn             |
| `scenes.ts`          | director scenes triggered from the control room |
| `tension.ts`         | how cornered the leading snake is               |
| `layout.ts`          | frame size, grid, safe zones, format            |
| `frame.ts`           | draws one frame                                 |
| `board-items.ts`     | berries, stones, brambles                       |
| `effects.ts`         | eggshell, halos, sparks                         |
| `duel-hud.ts`        | half rings and team columns                     |
| `scoreboard.ts`      | score bar and clock                             |
| `gift-panel.ts`      | gift legend and scrolling columns               |
| `gift-feedback.ts`   | last donor per gift line                        |
| `end-screen.ts`      | winner screen and donor ranking                 |
| `announcements.ts`   | on-stream banner                                |
| `debug-overlay.ts`   | AI debug layers (operator only)                 |
| `audio.ts`           | sound, starts on first click or key             |
| `canvas.ts`          | drawing surface                                 |
| `palette.ts`         | colours                                         |

Rule I keep: a module is the only one writing its own state. Others read it or call its
functions.

## Events

1. TikFinity sends an event over the WebSocket (`tikfinity-bridge.ts`).
2. The bridge cleans it up and calls `window.receiveEvent(event)`.
3. The gift value picks the effect (speed, steal, shield, extra life), the gift name picks the
   team.
4. The control room gets the game state twice a second and sends commands back.

The fake audience (`simulated-audience.ts`) sends the same events, so rehearsals go through the
same code as a real live.

## Drawing

- Everything is drawn in a 1080×1920 frame (16×20 grid, 47 px cells), scaled to the window with
  one `setTransform`.
- 16:9 widens the frame to 3414 and only the background draws in the extra space. Gameplay
  doesn't move.
- Heavy layers (light rays, foliage, weather) are cached in offscreen canvases.

## Tests

`tests/support/boot-game.ts` loads the real game scripts in Node with a fake canvas that records
draw calls. With that:

- a golden test replays seeded scenarios and compares a hash of every draw call, so refactors
  can't change what's on screen without me noticing;
- other suites play full duels in every weather and format, and long AI vs AI sessions.

`npm run visual` does the same check on real pixels: it opens `game.html?seed=7` (seeded random,
fake clock), captures a few scenes in software rendering and diffs them with the baselines.
Baselines are from Windows since the text uses system fonts.
