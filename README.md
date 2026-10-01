# Viper

[![CI](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelhafidmaamir/viper/actions/workflows/ci.yml)

This started as a small test: reproduce Snake. Then it got out of hand.

Around the same time I kept seeing interactive games on TikTok lives, games the audience plays
through the stream itself, and TikTok launched its own. I wanted to build one on my side and use
it to learn. So the snake went on a live, and it worked better than I expected: the
audience engaged with it right away. A 30-minute test stream even brought in $5 in gifts, which I
hadn't planned for. A nice surprise, not the reason I keep working on it.

So now it's a desktop app that runs a snake game on a live stream. Nobody holds a controller. The
viewers are the input: their likes, follows and gifts arrive as events, and the game turns them
into something on screen.

It's a learning project first. The docs explain the reasons and not only the result, because the
reasons are what I wanted to understand.

<p align="center">
  <img src="docs/images/feed.png" alt="Feed mode" width="280">
  &nbsp;&nbsp;
  <img src="docs/images/duel.png" alt="Duel mode" width="280">
</p>

## What it does

There are two games, and a launcher to pick one.

The Duel was first: two snakes, Gold and Shadow, both played by the computer. A viewer picks a
side by the gift they send, and the gift does something to the fight. Likes speed both snakes up.

Feed came later, and most of the work moved to it once tests showed clearly better engagement.
One snake, one board, and every coin a viewer
gives is one berry for it to eat. When the board is full the round ends, the people who gave are
thanked by name, and it starts again.

Viper never talks to TikTok. A third-party app, TikFinity, connects to the live and repeats its
events on a local WebSocket, and Viper listens to that. It doesn't broadcast anything either: OBS
or TikTok LIVE Studio captures the game window like a screen recorder would.

I'd like to replace TikFinity with a bridge of my own at some point. TikTok has no public API
for live events, so every tool that does this, TikFinity included, relies on an unofficial
connection that TikTok can break whenever it changes something. Writing my own today would mean
chasing those changes myself, on top of the game, and that's a maintenance job I don't want yet.
So for now somebody else carries it, and all Viper knows about TikFinity sits in one file.

What an in-house bridge would buy: one less program to start and keep alive during a live, no
dependency on a message format that was never promised to me, a say in what happens to events
sent while the connection is down (today they're just gone), and the same event stream for any
other game I build after this one.

## What's in here

- `src/main` is the Electron main process. It serves the pages, opens the windows, and does all
  the writing to disk. That last part is there because a gift is somebody's money: the round is
  saved every second, by the process least likely to crash, and picked up by itself on the next
  launch.
- `src/renderer/feed` and `src/renderer/engine` are the two games. They share the scenery and
  nothing else. Trying to make one set of rules do both would have meant flags everywhere.
- `src/renderer/scripts` has the simulation loop of the Duel, its two AIs (the stronger one is a
  minimax search), the scenery, and the one file that knows what TikFinity's messages look like.
  It's one file on purpose. That format isn't a contract and it will change under me some day.
- `src/renderer/control` and `feed-control` are the control rooms: a second window, for me only,
  with the settings and a fake audience so the game can be rehearsed without going live. The fake
  audience shuts itself off when a real live is connected, because the one thing worse than a bug
  on stream is a fake gift on stream.
- `src/shared` is the list of messages the game and its control room are allowed to exchange.
- `tests` runs the real game without a screen, on a fake canvas that writes down every draw call.
  A test replays a few seeded rounds and compares a hash of all of it, so a refactor that changes
  one pixel gets caught. This is what made it possible to turn one big prototype file into
  modules without breaking the game on the way.
- `docs` has the details. `decisions.md` is the one I'd read first.

The supporters list, who gave what across all my lives, started as a file on disk. That stopped
working once I used more than one PC: each had its own copy and none of them was complete. So the
list is now also kept in a Firestore database, and whichever PC I start from picks it up.

## Running it

Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev               # dev server and hot reload
npm start                 # build and run
```

`--mode=duel` or `--mode=feed` skips the launcher. You don't need TikFinity or a TikTok account
to try it: open the control room and turn on the fake audience.

I've only ever run it on Windows, because that's what I stream from. Nothing in the code is
Windows-specific and the tests run on Linux in CI, so it _should_ work elsewhere, but the
packaging script only builds the Windows exe and I haven't tried.

```bash
npm run check             # format, lint, typecheck, tests
npm run visual            # screenshot diff against the baselines
npm run package           # portable build in out/Viper-win32-x64
```

The packaged exe can also measure itself (`--diagnostic=frame-timing`, `cpu-profile`,
`draw-calls`, `screenshots`, `feed-timing`, with `--out=<dir>`). That exists because the machine
that streams is not the machine I develop on, and performance problems only showed up there.

## Things that didn't survive

- A solo mode, from before the Duel. It wasn't reachable anymore and now lives on a `wip` branch.
- Shortcuts for the Feed snake, cutting across the board towards the nearest berry. Clever, and
  jerky to watch. The code is still in `path.ts`, switched off.
- A per-audience-size cap on snake length in the Duel. Two long snakes on a small board just trap
  themselves. The table is still in `rules.ts`, unused.
- Showing coin values on stream. The game says berries. A live that talks about money gets
  restricted.

## What's still not good, and why it's still like that

- **The online supporters list is last-save-wins.** If two machines ran at the same time, one
  would overwrite the other. I use several PCs but one at a time, so the simple rule was enough
  to ship. The real fix is merging per viewer, and it becomes necessary the day two run together.
- **The key to that database ships inside the build.** I didn't want a login screen in the
  control room in the middle of a live. That's acceptable while I'm the only one holding a build,
  and has to change before anyone else gets one.
- **The Duel has no crash recovery.** Feed got it first because that's where gifts turn into
  something a viewer waits for. In the Duel a gift acts at once and a round is two minutes.
- **It uses more CPU than a snake game should**, on a machine that is also encoding video. The
  cost is in drawing, not in the rules. I'd rather cut draw calls than cut how it looks, which is
  slower work.
- **The exe isn't signed**, so Windows complains the first time. A certificate costs money every
  year and I'm the only user.

## Releases

A `vX.Y.Z` tag builds the Windows zip and publishes a GitHub release.

```bash
npm version minor
git push --follow-tags
```

A minor is something viewers can see, a patch is a fix. 1.0.0 is for the first version that gets
through a whole live without me touching it.

## Docs

- [docs/decisions.md](docs/decisions.md): each technical choice, why, and what it costs
- [docs/architecture.md](docs/architecture.md): processes, windows, modules, persistence
- [docs/operations.md](docs/operations.md): data files, what happens in a crash, sync, release
- [docs/rules-duel.md](docs/rules-duel.md), [docs/rules-feed.md](docs/rules-feed.md): the rules,
  with the numbers
- [docs/concepts.md](docs/concepts.md): glossary, if TikTok LIVE vocabulary means nothing to you
- [docs/roadmap.md](docs/roadmap.md): done and next

© Abdel Maamir. All rights reserved.
