# Viper

[![CI](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml)

Snake games for TikTok LIVE. When the app starts, a small launcher asks which mode to open:

- **Duel**: two AI snakes, Gold and Shadow, play against each other and viewers push one side or
  the other with likes, shares and gifts (through TikFinity).
- **Feed the Snake**: the whole room feeds one snake that follows a fixed route until it fills the
  board. A Rose drops 1 berry, a Rosa drops 10, nothing else counts. Likes only rank.

Each mode opens its own game window and its own control room, which doesn't go on stream. Both
share the forest ambiences. "Change mode" in a control room goes back to the launcher.

It's an Electron app for Windows. The game is 9:16 for TikTok, there's also a 16:9 mode for
YouTube where the background just extends into the sides.

## Running it

Node 24 (see `.nvmrc`). Packaging only works on Windows.

```bash
npm install
npm run dev               # dev server + hot reload
npm start                 # build and run, 9:16
npm run start:landscape   # same in 16:9 (Duel only)
```

`--mode=duel` or `--mode=feed` skips the launcher.

Other scripts:

| Script                      | What it does                                     |
| --------------------------- | ------------------------------------------------ |
| `npm test`                  | Vitest                                           |
| `npm run check`             | format, lint, typecheck, tests (same as CI)      |
| `npm run lint` / `lint:fix` | ESLint                                           |
| `npm run format`            | Prettier                                         |
| `npm run package`           | portable build in `out/Viper-win32-x64`          |
| `npm run visual`            | screenshot diff against `tests/visual/baselines` |

`npm run visual -- --update` replaces the baselines when a visual change is intended.

## Diagnostics

The app can take screenshots and measure itself, also from the packaged exe:

```bash
Viper.exe --diagnostic=screenshots  --out=shots
Viper.exe --diagnostic=frame-timing --out=perf --all-weathers
Viper.exe --diagnostic=draw-calls   --out=perf
Viper.exe --diagnostic=cpu-profile  --out=perf
Viper.exe --diagnostic=feed-timing  --out=perf
```

Options: `--orientation=portrait|landscape`, `--weather=<name>`, `--hour=<0..1>`,
`--settle=<seconds>`. In dev: `npm run diagnose -- screenshots --out=shots`.

## Releases

Pushing a version tag builds the Windows zip and creates the GitHub release. The tag has to match
`package.json`.

```bash
npm version minor
git push --follow-tags
```

The exe isn't signed yet, so SmartScreen will complain the first time.

## Layout

```text
src/main/            Electron main process, local server, windows, diagnostics
src/renderer/        one page per window, built with Vite
  launcher/          first screen, picks the mode
  game/              Duel page entry
  engine/            Duel modules (rules, crowd, hazards, drawing...)
  scripts/           simulation core, AI, ambience, TikFinity bridge, fake audience
  control/           Duel control room, and the UI parts both control rooms share
  feed/              Feed the Snake
  feed-control/      Feed the Snake control room
src/shared/          messages between the game and the control room
tests/               Vitest suites, headless game runs, visual baselines
scripts/             dev and packaging scripts
```

More in [docs/architecture.md](docs/architecture.md), and what's done / left in
[docs/roadmap.md](docs/roadmap.md).

© Abdel Maamir. All rights reserved.
