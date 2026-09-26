# Viper Duel

[![CI](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml)

An interactive snake duel built for TikTok LIVE. Two AI-driven snakes, **Gold** and **Shadow**,
fight in a forest arena while viewers tip the balance in real time with likes, shares and gifts.
The streamer runs the show from a private control room that never appears on stream.

Viper ships as a portable Windows desktop app (Electron). It renders natively in 9:16 for TikTok
and can switch to 16:9 for YouTube by extending the ambience into the side bars. Gameplay pixels
stay untouched.

## Highlights

- **Two-window architecture.** A capturable game window (the only thing on stream) and a control
  room that drives it over a same-origin `BroadcastChannel`.
- **Live event ingestion.** A WebSocket bridge to TikFinity's Event API, with automatic reconnect
  and a simulated audience for offline rehearsal.
- **Two AI tiers.** A human-like heuristic AI, and an adversarial search AI (iterative deepening
  under a time budget) that can take over both sides.
- **Canvas 2D renderer** on a fixed 1080×1920 reference frame, with pre-rendered layers, weather,
  time of day and an effect-driven gift display designed to stay within TikTok LIVE guidelines.
- **Headless test harness.** The real update and draw loops run in Node against a recording fake
  canvas, so every render path is exercised on CI without a browser.

## Quick start

Requirements: Node.js 24 (see `.nvmrc`), and Windows for packaging.

```bash
npm install
npm run dev               # Vite dev server with hot reload + the app
npm start                 # production build, game window + control room, 9:16
npm run start:landscape   # same, 16:9 for YouTube
```

## Scripts

| Script                            | What it does                                            |
| --------------------------------- | ------------------------------------------------------- |
| `npm run dev`                     | Renderer on the Vite dev server with hot reload         |
| `npm start`                       | Production build of main and renderer, then launch      |
| `npm run build`                   | `tsc` for the main process, Vite for the renderer       |
| `npm test`                        | Unit, render and simulation suites (Vitest)             |
| `npm run check`                   | Everything CI runs: format, lint, typecheck, test       |
| `npm run lint` / `lint:fix`       | ESLint with type-aware `typescript-eslint` strict rules |
| `npm run format` / `format:check` | Prettier                                                |
| `npm run typecheck`               | TypeScript, strict                                      |
| `npm run package`                 | Portable Windows build in `out/ViperDuel-win32-x64`     |

## Diagnostics

The app doubles as its own measurement harness, in development and in the packaged build. Each
run writes its artefacts, exits with a status code, and can be scripted.

```bash
ViperDuel.exe --diagnostic=screenshots  --out=shots           # board, announcement, end screen, both formats
ViperDuel.exe --diagnostic=frame-timing --out=perf --all-weathers
ViperDuel.exe --diagnostic=draw-calls   --out=perf            # canvas calls per frame and per call site
ViperDuel.exe --diagnostic=cpu-profile  --out=perf            # open cpu.cpuprofile in DevTools
```

Options: `--orientation=portrait|landscape`, `--weather=<name>`, `--hour=<0..1>`,
`--settle=<seconds>`. In development: `npm run diagnose -- screenshots --out=shots`.

## Project layout

```text
src/
  main/                  Electron main process (TypeScript, strict)
    index.ts             Bootstrap: flags, config, server, windows
    config.ts            Typed command-line parsing
    static-server.ts     Loopback-only static server for the renderer
    windows.ts           Game and control windows, locked down
    diagnostics/         Screenshots, frame timing, draw calls, CPU profile
    page/                Typed page-side toolkit shipped into the renderer
    renderer-host.ts     Serves the built renderer on a stable origin with a CSP
  renderer/              Built by Vite
    game.html            On-stream game window
    game/                Typed entry and control-room link
    control.html         Private control room
    control/             Entry, styles and the legacy control-room script
    scripts/             Game engine, AI, ambience, TikFinity bridge, simulated audience
    public/assets/gifts/ Gift artwork, copied as-is
  shared/                Control-room protocol and the legacy globals contract
tests/                   Unit suites (main, renderer) and headless game suites
scripts/                 dev.ts (Vite + Electron) and package.ts
docs/                    Architecture and roadmap
```

## Documentation

- [Architecture](docs/architecture.md): process model, event flow, rendering pipeline, testing.
- [Roadmap](docs/roadmap.md): the staged migration to typed ES modules, and how each step is
  proven to preserve behaviour.

## Status

Viper is live-tested. The codebase is being migrated in place from its prototype form (one large
engine file with French identifiers) to typed, English, modular code. Every step keeps the game
playable and is gated by the test suite. See the roadmap for what is done and what comes next.

© Abdel Maamir. All rights reserved.
