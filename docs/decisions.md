# Decisions

Technical choices, the reason for each and what it costs. One entry per decision. An entry that
gets reversed stays here and says so.

## 1. Electron desktop app

**Context.** The game must write to disk while running, open two windows that exchange messages,
connect to a WebSocket on localhost, and be captured as a window by broadcasting software.

**Decision.** Electron, packaged as a portable folder.

**Cost.** About 150 MB per build, and Chromium's CPU use on a machine that is also encoding video.

## 2. TikFinity as the event source

**Context.** TikTok does not publish an API for live events.

**Decision.** Read events from TikFinity's local WebSocket. All knowledge of its message format is
in one adapter, `tikfinity-bridge.ts`, which emits the game's own event types.

**Cost.** A runtime dependency on a third-party app whose message format is not a contract. For
example, follows and shares can arrive both as their own event and as a generic `social` message
identified by its text, so the adapter deduplicates them over 5 s.

## 3. Local HTTP server on a fixed port

**Context.** The game window and the control room need the same origin to share a
`BroadcastChannel`, and pages loaded from `file://` cannot use it or the WebSocket reliably.

**Decision.** The main process serves the built pages on `127.0.0.1:47813`. The port is fixed
because `localStorage` is scoped per origin, port included. With a random port, settings were lost
at every launch.

**Cost.** The port can be taken. The app falls back to a free one and settings do not persist for
that session.

## 4. BroadcastChannel between windows, no preload script

**Context.** The control room sends commands; the game publishes its state twice a second.

**Decision.** Both go over a `BroadcastChannel`. Message types are defined once per mode in
`src/shared/` and validated on receipt (`isControlCommand`, `isFeedCommand`). Windows stay
sandboxed without Node access. For the few actions that need the main process (open a mode,
return to the launcher, open the journal folder), a page navigates to a reserved path such as
`/__viper/open?mode=feed`, which the main process intercepts.

**Cost.** The reserved-path mechanism is unconventional and needs this explanation. It only
carries requests, not replies.

## 5. Canvas 2D, no game engine

**Context.** The game is a grid, sprites and text.

**Decision.** Canvas 2D API, drawn in a fixed 1080x1920 coordinate frame and scaled to the window
with one transform.

**Cost.** Performance work is manual: static layers are cached in offscreen canvases, and the long
snake in Feed needed several profiling passes.

**Benefit used elsewhere.** Draw calls can be recorded, which decision 9 relies on.

## 6. A window designed for capture

**Context.** During a stream the game window is behind other windows. Windows reports it as
occluded and Chromium stops painting it. OBS and TikTok LIVE Studio also capture a frameless
Electron window as black.

**Decision.** The game window keeps its frame and a constant title. Background throttling is off
for it, and the app sets `disable-features=CalculateNativeWinOcclusion`,
`disable-renderer-backgrounding` and `disable-background-timer-throttling`.

**Cost.** The title bar has to be cropped in the capture tool. The app renders at full rate even
when nothing displays it.

## 7. Two modes with separate rules and protocols

**Context.** The two games share scenery, layout and the event adapter, and almost no rules.

**Decision.** Each mode has its own state, rules and message protocol. Shared code is limited to
rendering, layout, the adapter and control room UI parts.

**Cost.** Some duplication in the control rooms.

## 8. Streak counting differs per mode

**Context.** TikTok reports a gift streak as a cumulative counter followed by a final event. The
final event does not always arrive.

**Decision.** The Duel counts a streak once, on the final event. Feed counts the difference
between consecutive counter values as they arrive, because each unit is a berry that has to be
credited and a missing final event would otherwise drop a payment.

**Cost.** The adapter keeps the last counter per viewer and gift, and resets it when the counter
decreases or after 60 s without an update.

## 9. Headless tests on the real game code

**Context.** The code base started as a single prototype file and was split into modules
afterwards. Each step had to prove that the output did not change.

**Decision.** Tests load the real game scripts in Node against a fake canvas that records draw
calls. A golden test replays seeded rounds and compares a hash of those calls. A separate job
diffs real screenshots against baselines.

**Cost.** An intended visual change requires regenerating the hash and the baselines and reviewing
the diff. Screenshot baselines depend on Windows system fonts.

## 10. Persistence owned by the main process

**Context.** In Feed, in-memory state represents payments. A renderer can crash or be closed.

**Decision.** The main process pulls the round state from the renderer every second and writes it
atomically. On launch it restores a backup that is less than 12 hours old and not empty, without
operator action.

**Cost.** Up to one second of events can be lost. The renderer exposes a small API on `window`
for the main process to call, which is an implicit contract between the two.

## 11. Journal as CSV

**Context.** The journal is read after a stream, in a spreadsheet, by one person.

**Decision.** One CSV per stream, semicolon-separated, UTF-8 with a byte order mark. High-volume
events (likes, joins) are aggregated per 10 s.

**Cost.** No queries across streams without importing the files elsewhere.

## 12. Supporters list in Firestore, last writer wins

**Context.** The list was a local file. The app is used from several PCs, so each one had its own
partial copy.

**Decision.** Mirror the list to Firestore over its REST API, without the Firebase SDK and without
user sign-in. The access configuration is private and not part of the repository. On launch the
newer copy replaces the other.

**Cost.** Whole-list replacement is correct only when one machine runs at a time. Access without
sign-in is acceptable for a single-operator app. Both would have to change for more than one.

## 13. Smaller choices

| Choice                                      | Reason                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `userData` folder still named `Viper Duel`  | Renaming it would have reset settings and orphaned the supporters list |
| Portable folder, no installer               | An update is a folder copy                                             |
| `scripts/dev.ts` instead of `electron-vite` | `electron-vite` did not support the Vite version the project uses      |
| "Berries" on stream, never "coins"          | Displaying currency on stream risks a restriction by the platform      |
