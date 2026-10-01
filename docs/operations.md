# Operations

What the app writes, how it recovers, and how a build is shipped. The data flow behind this page
is in [architecture.md](architecture.md), section "Persistence and sync".

## Runtime setup

| Step | Detail                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 1    | TikFinity running and connected to the account. Viper connects to `ws://localhost:21213`.                    |
| 2    | Start Viper, select a mode (or pass `--mode`).                                                               |
| 3    | Capture the game window by title: `Viper Duel` or `Viper Feed`. Crop the title bar in the capture tool.      |
| 4    | Check the connection state in the control room (`Viper Duel \| Control Room`, `Viper Feed \| Control Room`). |

Window titles are constant across versions so capture sources keep working after an update.

## Data on disk

All under `%APPDATA%\Viper Duel` (Electron `userData`; the folder keeps the app's original name).

| Path                                   | Content                                     | Write policy                       |
| -------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `feed-backup.json`                     | Feed round in progress                      | Every 1 s, atomic                  |
| `feed-supporters.json`                 | Supporters list, all streams                | Every 5 s, atomic                  |
| `journal/Viper Feed <date> <time>.csv` | Events of one Feed stream                   | Appended every 1 s when rows exist |
| Chromium `Local Storage`               | Settings, last mode, per-viewer visit count | On change, by the pages            |

Atomic: written to `<file>.tmp`, flushed with `fsync`, renamed over the target. An interrupted
write leaves the previous file intact.

`localStorage` is scoped to the page origin, port included. The app serves its pages on
`127.0.0.1:47813`. If that port is taken it falls back to a free port and logs a warning; settings
then read as defaults for that session.

## Failure modes

| Failure                  | Behaviour                                                                                               | Data lost                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------- |
| App crash or kill (Feed) | On next launch, a backup under 12 h old that contains gifts or owed berries is restored automatically   | At most the last second    |
| App crash or kill (Duel) | Nothing restored. The round restarts                                                                    | The round in progress      |
| TikFinity disconnect     | Reconnect after 1, 2, 4, 8 s, then every 10 s. Journal rows `tiktok lost` and `tiktok connected` (Feed) | Events sent during the gap |
| No network               | Supporters list stays local; pushed when Firestore is reachable again                                   | None                       |
| No sync configuration    | Cloud sync disabled, everything else unchanged                                                          | None                       |
| Port 47813 taken         | Random port                                                                                             | Settings for that session  |
| A gift not credited      | Operator credits it by hand ("Give berries back" in the Feed control room)                              | None                       |

A backup older than 12 hours is ignored and overwritten by the next round.

## Journal

One CSV per Feed stream, created on the first row. Semicolon-separated, UTF-8 with a byte order
mark, CRLF line endings, so it opens directly in Excel. The control room opens the folder
("Open journal folder").

Columns: `time`, `event`, `source`, `live`, `round`, `fill %`, `nickname`, `tiktok id`, `gift`,
`count`, `berries`, `viewers`, `detail`.

| Rows                                                            | Granularity        |
| --------------------------------------------------------------- | ------------------ |
| Gifts, follows, shares, round start and end, connection changes | One row per event  |
| Likes, joins                                                    | Summed every 10 s  |
| Viewer count                                                    | Sampled every 30 s |

`source` is `tiktok`, `manual` or `simulated`, which allows test data to be filtered out. The
renderer buffers at most 20,000 rows between two collections.

## Supporters list and cloud sync

- Local file capped at 50,000 entries. Past that, a tenth is evicted, starting with entries that
  have no berries, the fewest likes and the oldest activity.
- Pushed to Firestore at most every 15 s when changed.
- On launch, the copy with the newer `savedAt` replaces the other, whole. See "Conflict rule" in
  the architecture document for the limit of this.
- The access configuration is private and not part of the repository. Without it, sync is
  disabled and the list stays local.

**Importing earlier supporters.** Two entry points: the "Import past supporters" form in the
control room, and a private seed file read at launch. Imported entries
are stored under a key derived from the name. When a viewer with a matching name appears in a
stream, the totals move to their TikTok id and the imported entry is marked `claimed`.
Re-importing the same list does not count anyone twice.

## Command line

| Flag                                                | Effect                                  |
| --------------------------------------------------- | --------------------------------------- |
| `--mode=duel\|feed`                                 | Skips the launcher                      |
| `--orientation=portrait\|landscape`                 | Landscape is supported by the Duel only |
| `--diagnostic=<name> --out=<dir>`                   | Runs a measurement and exits            |
| `--weather`, `--hour`, `--settle`, `--all-weathers` | Diagnostic parameters                   |

The app holds a single-instance lock: a second launch focuses the existing windows. Diagnostic
runs skip the lock.

## Build and release

| Step    | What happens                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `npm run package` produces a portable folder, `out/Viper-win32-x64`. No installer                                                      |
| CI      | On each pull request: checks on Linux, packaging on Windows, screenshot diff on Windows. The packaged build is not kept as an artifact |
| Release | A `vX.Y.Z` tag runs the checks, builds on Windows, zips the folder with its SHA-256, creates the GitHub release                        |

The exe is not code-signed.
