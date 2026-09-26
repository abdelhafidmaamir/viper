# Roadmap

The game was prototyped fast and is live-tested. The migration keeps it shippable at every step.
Each step lands as its own pull request. It must keep `npm run check` green and, for anything that
renders, pass a side-by-side `--diagnostic=screenshots` run against the previous build.

## Done

- [x] **Foundation.** Private repository, English file layout, ESLint, Prettier, EditorConfig,
      Vitest headless suites, GitHub Actions (checks on Linux, packaging on Windows), Dependabot,
      pre-commit hook.
- [x] **Source parity.** The imported sources were verified byte for byte against the shipped
      build (`dist64`) before any change. The only edits since are file paths and a Prettier
      pass, which does not change program semantics.
- [x] **Main process in TypeScript.** Strict TypeScript with type-aware `typescript-eslint`,
      split into config, static server, windows, layout and diagnostics. Seven ad hoc environment
      variables and their string-built page scripts became four typed diagnostics behind one
      command-line interface. Windows are hardened (sandbox, navigation lock, single instance).

## Next

1. **Renderer build pipeline.** Vite for the renderer, scripts as ES modules instead of
   shared-window globals, and a typed message contract for the control-room channel.
   `electron-vite` is not used: its current release supports Vite 7 at most.
2. **Split the engine.** `game.js` (about 7,000 lines) becomes modules: config, state, rules,
   gifts, announcements, AI bridge, render layers, layout and format.
3. **English identifiers.** Rename per module (`VipereBase` becomes `Viper`, `reglages` becomes
   `settings`), with a compatibility shim for the control-room protocol until both sides move.
4. **Strict TypeScript everywhere**, and zero lint warnings (27 legacy warnings are tracked today).
5. **Deterministic visual regression.** Inject a seeded RNG and clock so screenshots can be
   pixel-diffed on CI.
6. **Releases.** Signed, versioned GitHub releases.

## Toolchain notes

- TypeScript is pinned to 6.0: TypeScript 7 does not expose the compiler API yet, and
  `typescript-eslint` requires `<6.1`. Dependabot will surface the upgrade.

## Known debt

- Renderer identifiers, comments and the control-room UI are still in French.
- Lint rules for `src/renderer/**` are relaxed to warnings on purpose (see `eslint.config.js`).
