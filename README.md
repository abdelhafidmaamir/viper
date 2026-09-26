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
npm start                 # game window + control room, 9:16
npm run start:landscape   # same, 16:9 for YouTube
```

## Scripts

| Script                            | What it does                                        |
| --------------------------------- | --------------------------------------------------- |
| `npm start`                       | Launch the app in development                       |
| `npm test`                        | Headless render and simulation suites (Vitest)      |
| `npm run check`                   | Everything CI runs: format, lint, typecheck, test   |
| `npm run lint` / `lint:fix`       | ESLint (flat config)                                |
| `npm run format` / `format:check` | Prettier                                            |
| `npm run typecheck`               | TypeScript over JSDoc-typed tooling and tests       |
| `npm run package`                 | Portable Windows build in `out/ViperDuel-win32-x64` |

## Project layout

```text
src/
  main/main.js           Electron main process: local HTTP server, windows, capture tools
  renderer/
    game.html            On-stream game window
    control.html         Private control room
    scripts/             Game engine, AI, ambience, TikFinity bridge, simulated audience
    assets/gifts/        Gift artwork
tests/                   Headless render and duel simulation suites
scripts/package.js       Packaging entry point
docs/                    Architecture and migration roadmap
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
