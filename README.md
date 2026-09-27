# Viper Duel

[![CI](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml)

Snake duel for TikTok LIVE. Two AI snakes, Gold and Shadow, play against each other and viewers
push one side or the other with likes, shares and gifts (through TikFinity). I run the show from
a separate control room window that doesn't go on stream.

It's an Electron app for Windows. The game is 9:16 for TikTok, there's also a 16:9 mode for
YouTube where the background just extends into the sides.

## Running it

Node 24 (see `.nvmrc`). Packaging only works on Windows.

```bash
npm install
npm run dev               # dev server + hot reload
npm start                 # build and run, 9:16
npm run start:landscape   # same in 16:9
```

Other scripts:

| Script                      | What it does                                     |
| --------------------------- | ------------------------------------------------ |
| `npm test`                  | Vitest                                           |
| `npm run check`             | format, lint, typecheck, tests (same as CI)      |
| `npm run lint` / `lint:fix` | ESLint                                           |
| `npm run format`            | Prettier                                         |
| `npm run package`           | portable build in `out/ViperDuel-win32-x64`      |
| `npm run visual`            | screenshot diff against `tests/visual/baselines` |

`npm run visual -- --update` replaces the baselines when a visual change is intended.

## Diagnostics

The app can take screenshots and measure itself, also from the packaged exe:

```bash
ViperDuel.exe --diagnostic=screenshots  --out=shots
ViperDuel.exe --diagnostic=frame-timing --out=perf --all-weathers
ViperDuel.exe --diagnostic=draw-calls   --out=perf
ViperDuel.exe --diagnostic=cpu-profile  --out=perf
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
src/renderer/        game.html + control.html, built with Vite
  engine/            game modules (rules, crowd, hazards, drawing...)
  scripts/           simulation core, AI, ambience, TikFinity bridge, fake audience
  control/           control room
src/shared/          messages between the game and the control room
tests/               Vitest suites, headless game runs, visual baselines
scripts/             dev and packaging scripts
```

More in [docs/architecture.md](docs/architecture.md), and what's done / left in
[docs/roadmap.md](docs/roadmap.md).

© Abdel Maamir. All rights reserved.
