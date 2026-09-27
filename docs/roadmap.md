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
- [x] **Control room rebuilt.** A typed store, controller and view models drive four tabs (Live,
      Setup, Rehearsal, Admin), a persistent status bar, an event log, keyboard shortcuts,
      confirmation of disruptive actions and stale-link detection. The legacy script is gone.
- [x] **Visual regression.** `game.html?seed=<n>` runs on a seeded random source and a virtual
      clock; `npm run visual` captures six scenes in software rendering and compares them pixel
      for pixel with Windows baselines, on CI too.
- [x] **Renderer in strict TypeScript.** Engine and game scripts are typed under the same strict
      settings, with zero lint warnings; the golden master replays every scenario unchanged.
- [x] **Main process in TypeScript.** Strict TypeScript with type-aware `typescript-eslint`,
      split into config, static server, windows, layout and diagnostics. Seven ad hoc environment
      variables and their string-built page scripts became four typed diagnostics behind one
      command-line interface. Windows are hardened (sandbox, navigation lock, single instance).
- [x] **Renderer build pipeline.** Vite builds both pages; engine scripts load as ES modules;
      inline scripts and styles left the HTML; a typed control-room protocol with a unit-tested
      link; `npm run dev` with hot reload; a Content-Security-Policy on served pages. Two bugs
      found on the way: saved settings were lost on every launch (random port, so a new origin
      and empty storage), and a `__proto__` setting name could replace the settings prototype.

- [x] **Golden-master net.** A seeded, deterministic replay of nine scenarios digests every
      canvas call and the game state; it is identical on Windows and Linux.
- [x] **Solo mode out of `main`.** The legacy solo mode (snake against the audience, prowler,
      rocks, grades) was unreachable from the shipped app. It lives on `wip/solo-mode` and comes
      back through a pull request if it is revived. The engine lost 815 lines and its lint warnings
      with every golden digest unchanged.

- [x] **Engine split.** `game.js` went from 7,077 to 1,455 lines. Rules, crowd pacing, audience
      events, hazards, director scenes, tension, layout, sound and every painter are modules that
      own their state. Dead code from removed modes went with them, and every golden digest
      stayed identical at each step.

- [x] **English codebase.** Every binding, object field, protocol command, setting value and
      control-room id is English. Bindings were renamed through the TypeScript language service
      with a check that every identifier still resolves to the same declaration; fields and values
      went through a golden-master bisection that caught a broken prefix test. Preferences saved
      under the old storage keys are still read.

- [x] **Releases.** A version tag verifies, packages and publishes a GitHub release with a
      checksum; the executable carries the version and product metadata. Code signing is open.

## Branching

`main` is always shippable. Work happens on short-lived branches merged through pull requests;
experiments that are not shipping yet live on `wip/*` branches and never block `main`.

## Next

Nothing scheduled. Candidates: tier and format in the control protocol, and the dead code found
during the TypeScript migration (unused fruit and stone paths).

## Toolchain notes

- `electron-vite` is not used: its current release supports Vite 7 at most. `scripts/dev.ts`
  drives the Vite dev server and Electron directly instead.
- TypeScript is pinned to 6.0: TypeScript 7 does not expose the compiler API yet, and
  `typescript-eslint` requires `<6.1`. Dependabot will surface the upgrade.

## Known debt

- Lint rules for `src/renderer/**` are relaxed to warnings on purpose (see `eslint.config.js`).
