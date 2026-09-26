# Viper, instructions for Claude

- Everything in this repo is in English: code, comments, commits, docs.
- Never remove the AI auto-play (both AI tiers). It is the main test tool.
- Behaviour-preserving changes only, unless the owner approved a gameplay or visual change.
- Before any commit, `npm run check` must pass. For rendering changes, also compare a
  `VIPERE_CAPTURE` run against the previous build.
- Follow `docs/roadmap.md`: one migration step per branch and pull request.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`).
