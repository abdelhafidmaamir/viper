# Roadmap

The game started as a quick prototype (one big JS file, French names). I've been cleaning it up
step by step without breaking it, one PR at a time, with `npm run check` green each time.

## Done

- [x] Repo setup: ESLint, Prettier, Vitest, GitHub Actions, Dependabot, pre-commit hook
- [x] Checked the imported sources against the shipped build (`dist64`) before touching anything
- [x] Main process rewritten in TypeScript, env var hacks replaced by `--diagnostic` flags
- [x] Vite build for both pages, `npm run dev`, CSP on served pages. Fixed on the way: settings
      lost on every launch (random port), and a `__proto__` setting name bug
- [x] Golden test: seeded replays hashed draw call by draw call
- [x] Old solo mode moved out to the `wip/solo-mode` branch (it wasn't reachable anymore)
- [x] `game.js` split into engine modules
- [x] Everything renamed to English. Old saved settings still load
- [x] Tag-based releases
- [x] Whole renderer in strict TypeScript
- [x] Control room redone: tabs, status bar, event log, shortcuts, confirmations
- [x] Pixel diff test (`npm run visual`), runs on CI too

## Branches

`main` should always work. Features go through short branches and PRs. Unfinished experiments
stay on `wip/*`.

## Maybe next

- send tier and format in the game state so the control room can show them
- code signing for releases

## Notes

- No `electron-vite`: it only supports Vite 7. `scripts/dev.ts` runs Vite and Electron itself.
- TypeScript stays on 6.0 until `typescript-eslint` supports 7.
