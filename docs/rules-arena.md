# Snake Arena: rules and settings

Several snakes on Feed's 30 by 30 board, one per viewer, driven by likes and gifts only. Comments
do nothing. Open it from the launcher (third card, key 3) or with `--mode=arena`. Code is in
`src/renderer/arena/`, the settings in `src/shared/arena-protocol.ts`.

Everything around the board is Feed's, imported as it is: the forest on the beach, the flower, the
alerts, the supporter entrances and gift thanks, the end screen with its Hall of Fame, the journal
and the supporters list. See [rules-feed.md](rules-feed.md).

## The snakes

| Element    | Rule                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Look       | Feed's snake, trace and painter at Feed's size, in one of the 8 prod colours, the viewer's photo above the head                                                                   |
| Places     | `places` snakes at once, one per colour (8 at most); wild snakes fill up to `wildSnakes`                                                                                          |
| Birth      | The Duel's egg at a free place: 3 cells or more from every body, out of reach of every head before it hatches                                                                     |
| Start      | One cell out of the egg, growing to 8; 3 s of grace, blinking                                                                                                                     |
| Speed      | `speed` cells a second, up to 15% slower at 60 cells; likes add 30% for up to `boostCap` seconds                                                                                  |
| Death      | A head into another snake's body, or the smaller head in a head-on. Never by its own body: boxed in by itself, a snake passes over itself                                         |
| Dying      | The body pops from the tail to the head in 1 s, leaving nothing to eat; the photo drops to its crab                                                                               |
| Unbeatable | A snake that ate its viewer's gift berries this round cannot die: its head turns away from whatever it meets. It looks like any other snake. A normal head still dies on its body |
| Crown      | On the biggest snake in play (never the pilot), on its head and on its crab                                                                                                       |

The brains: with `superAI` on, every snake plays the strong one (flood fill one to three moves
ahead, a food goal held to the end, other heads read a few moves ahead, cut-offs only when reached
first); off, the calm one. Both go for the snake's own berries first, by the shortest safe way.
`backing` (off by default) lets gifts this round make a snake look further ahead and be chased
less, likes-only ones look less far.

## Getting in: the beach

| Group                  | Rule                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players (left)         | One crab per snake on the board, in order of size, outlined in the snake's colour, a flag of that colour; the red arc on its outline is the likes speed gauge |
| Queue (right of a gap) | 4 spots in single file, the fullest ring first, tagged NEXT; the red arc on the outline is the entry ring                                                     |
| Sleeping crab          | Feed's, unchanged, at its place on the right                                                                                                                  |

- Each like flies in as the prod heart and fills that viewer's ring; `entryLikes` likes fill it.
- A liker without a spot takes a free one. A spot is kept while its viewer likes and freed after
  `queueIdle` seconds without a like (3 s on screen at least). Progress is kept without a spot.
- Only a crab on screen goes in: the first full ring. Its picture flies to the egg, the egg plays
  once the picture has landed, and the snake hatches with that picture.
- A full board stays full: no snake is ever put off it to make room, not a viewer's, not a wild
  one, not the pilot. A place frees only when a snake dies, with its death on screen. Then a
  waiting gifter goes in first, then viewers owed a place, then the fullest ring. A wild snake
  never takes a place someone with a full ring is waiting for.
- Crabs come up out of the sand and bury themselves to leave (Feed's crab, coming out and its
  reverse); a ranking change walks them sideways along the sand, the one moving forward stepping
  back while the other passes.

## Gifts

- A gift's berries, at the Money tab's prices, pour from the flower to the giver's snake: a trail
  straight ahead of the head, past the cells it crosses while they fall. Paid berries take the
  giver's colour wherever they show (board, flower, thanks, end screen).
- `giftBerries`: `owner` (default), only the giver's snake eats them; `shared`, any snake can.
- `giftEntry` (default on): a gift from a viewer without a snake brings it in at once. On a full
  board its ring fills at once and its crab waits at the front of the queue, NEXT, gifters first
  come, first in; its berries wait in the flower and pour once its snake is out. The life gift
  does the same.
- A snake the control room takes off (the pilot switched off) hands its paid berries back to the
  flower, as a death does: no paid berry lies on the board without its giver's snake.
- `shieldGift`: one gift worth this many berries gives 10 s of shield (default 0, never).
- The extra-life gift, set on the control room's Money tab (`lifeOn`, off by default): a gift at
  `lifePrice` coins gives a life instead of berries, up to `maxLives`. The flower opens on the
  giver's picture as for any gift, a heart in place of the berry, and drops one prod heart per
  life to the giver's snake's picture (or their crab while they wait), where it joins their hearts.
- Lives show as prod hearts, 32 px, in a row beside the snake's picture on the board.
- A snake with a life that dies pops as at a death (its berries go back to the flower), its last
  heart drops and fades, and its picture flies from where it died to a new egg at a safe place; it
  hatches in the same colour with `lifeKeep` of its length.
- A dead snake's own berries fade off the board and go back to the flower in the giver's name; they
  pour again when the viewer's next snake is out.

## The round

- `roundLength` seconds after GET READY. The ring round the board is the clock: full at the start,
  empty at 0:00, in the crown holder's colour, the time left at its top; the last 20 s pulse.
- At 0:00 the end screen comes at once ("TIME'S UP!" or the winner), the snakes moving under it.
- Paid berries not eaten (in the flower, falling or on the board), and gifts during the end screen,
  carry over: their givers come in first next round and the berries pour to their new snake.
- Plain berries are rare: a drip every `plainEvery` seconds (give or take a fifth) of 1 to
  `plainAmount`, never more than 4 lying. Gifts are what make a snake big.

## The pilot player

`pilot` (off by default): the game's own player, "Skohlds", picture the prod initials "S". Its ring
fills by itself in about 20 s, it goes in and plays like any snake, and comes back after a death.
It never ranks, never wears the crown, never wins, and gets no thanks, alert, journal row or
supporters entry. Off, its crab and snake go at once.

## Settings

`ArenaSettings`, stored under `viper-arena-game`. The Feed settings the arena uses are stored
apart, under `viper-arena-settings`, and do not travel with the supporters list.

Arena card, Setup tab:

| Setting      | Values                 | Default | Setting       | Values            | Default |
| ------------ | ---------------------- | ------- | ------------- | ----------------- | ------- |
| `places`     | 4, 6, 8                | 6       | `roundLength` | 60 to 300 s       | 180     |
| `entryLikes` | 25, 50, 100, 150, 200  | 100     | `giftBerries` | `owner`, `shared` | `owner` |
| `giftEntry`  | on, off                | on      | `wildSnakes`  | 0, 2, 4, 6        | 4       |
| `likeBoost`  | on, off                | on      | `speed`       | 5 to 9 cells/s    | 7       |
| `boostCap`   | 3, 6, 10 s             | 6       | `plainEvery`  | 15, 25, 40, 60 s  | 25      |
| `shieldGift` | 0, 10, 30, 100 berries | 0       | `plainAmount` | 1, 2, 3, 5        | 1       |
| `queueIdle`  | 3, 5, 10, 15 s         | 5       | `superAI`     | on, off           | on      |
| `backing`    | off, light, strong     | off     | `pilot`       | on, off           | off     |

Extra life card, Money tab (next to the gift prices, which it leaves alone):

| Setting     | Values                    | Default |
| ----------- | ------------------------- | ------- |
| `lifeOn`    | on, off                   | off     |
| `lifePrice` | 10, 20, 30, 99, 199 coins | 30      |
| `maxLives`  | 1, 2, 3, 5                | 3       |
| `lifeKeep`  | 25%, 50%, 75%, 100%       | 50%     |

The simulated audience (Rehearsal tab) is 10, 100 or 700 made-up viewers liking and giving at
rates that scale with the room, each with a made-up picture.
