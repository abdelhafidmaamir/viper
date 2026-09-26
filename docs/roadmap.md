# Roadmap

The game was prototyped fast and is live-tested. The migration keeps it shippable at every step.
Each step lands as its own pull request. It must keep `npm run check` green and, for anything that
renders, pass a side-by-side capture against the previous build (`VIPERE_CAPTURE`).

## Done

- [x] **Foundation.** Private repository, English file layout, ESLint flat config, Prettier,
      EditorConfig, Vitest headless suites, GitHub Actions (checks on Linux, packaging on
      Windows), Dependabot, pre-commit hook (lint-staged).
- [x] **Source parity.** The imported sources were verified byte for byte against the shipped
      build (`dist64`) before any change. The only edits since are file paths and a Prettier
      pass, which does not change program semantics.

## Next

1. **Main process in TypeScript.** Move the capture and profiling tools out of `main.ts` into
   `dev-tools.ts`, with a typed environment config and strict mode.
2. **Build pipeline.** electron-vite, a preload script with `contextIsolation`, and renderer
   scripts as ES modules instead of shared-window globals.
3. **Split the engine.** `game.js` (about 7,000 lines) becomes modules: config, state, rules,
   gifts, announcements, AI bridge, render layers, layout and format.
4. **English identifiers.** Rename per module (`VipereBase` becomes `Viper`, `reglages` becomes
   `settings`), with a compatibility shim for the control-room protocol until both sides move.
5. **Strict TypeScript everywhere**, and zero lint warnings (27 legacy warnings are tracked today).
6. **Deterministic visual regression.** Inject a seeded RNG and clock so captures can be
   pixel-diffed on CI.
7. **Releases.** electron-builder, signed and versioned GitHub releases.

## Known debt

- Renderer identifiers, comments and the control-room UI are still in French.
- Lint rules for `src/renderer/**` are relaxed to warnings on purpose (see `eslint.config.js`).
- The `biomes` capture mode in `main.js` reads ambience files that are not part of this repo.
