# Snake Arena: rules and settings

Several snakes on Feed's 30 by 30 board, one per viewer, driven by likes and gifts only. Comments
do nothing. Open it from the launcher (third card, key 3) or with `--mode=arena`. Code is in
`src/renderer/arena/`, the settings in `src/shared/arena-protocol.ts`.

Everything around the board is Feed's, imported as it is: the forest on the beach, the flower, the
alerts, the supporter entrances and gift thanks, the end screen with its Hall of Fame, the journal
and the supporters list. See [rules-feed.md](rules-feed.md).

A round is three steps and nothing else: the QUALIFYING seats the players, the BATTLE plays them,
the RESULT ranks them. Then the next qualifying opens.

## 1. The qualifying (30 s)

The board holds no snake: one egg per place (`places`, 6 by default) in two rows, ranked 1st (top
left) to last, a cut line under them and the three best challengers under it. Code:
`qualify.ts` (rules) and `qualify-paint.ts` (screen).

| Element  | Rule                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Counts   | Everyone starts at 0, last round's players and winner too. No free seat                                                              |
| Like     | A prod heart pops on the liker's badge (or over their crab on the beach); the number rolls up                                        |
| Free egg | Taken at once by the best liker without a seat                                                                                       |
| The cut  | The best liker without a seat passes the weakest like seat: the two cross the line together, at most one swap every 0.6 s            |
| Gift     | Locks a seat: the flower opens on the giver, their picture flies to an egg that turns gold. A full board: the weakest like seat goes |
| Order    | Strict at every moment: paid seats first, in the order the gifts came, then like seats, most likes first                             |
| At risk  | The weakest like seat's egg trembles and its badge pulses red when the first challenger is within 10 %                               |
| All paid | Likes can change nothing more: the qualifying ends at once                                                                           |
| Text     | Only the clock pill, "QUALIFYING 0:24" (French "QUALIFICATIONS"), smaller than the battle's; it beats in the last 5 s                |

A paid seat shows no badge: its gold egg and the gold outline on the photo say it. The beach shows
the newest likers' crabs, in one compact group; the sleeping crab (above the board, top right)
shows viewers who have not liked yet, an egg in its heart.

At 0:00 everything holds still for 0.5 s and the challengers fade; Feed's 3, 2, 1 plays over the
closed eggs and every egg bursts at GO, in one beat. Empty eggs hatch wild snakes up to
`wildSnakes`. Every snake starts the same length at the same moment.

## 2. The battle (2 min)

Only the qualified snakes play: nobody comes in during the battle and a dead snake leaves its place
empty.

| Element  | Rule                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Look     | Feed's snake in one of the 8 prod colours; the viewer's photo floats above the head, its name above it                                |
| Photo    | Follows the head through a damped spring; photos push each other apart, a smaller snake's name gives way to a bigger one's            |
| Speed    | `speed` cells a second, up to 15% slower at 60 cells                                                                                  |
| Likes    | A player's likes fill the red ring round their crab on the beach; every `entryLikes` likes (100) fire a 3 s speed boost               |
| Boost    | The snake dashes with speed streaks in its colour and a bolt by its photo; the crab runs on the spot with the same bolt               |
| Gifts    | Berries from the flower in the giver's colour, for the giver's snake (`giftBerries`): growth                                          |
| Catch-up | A gift berry grows a snake by a full cell, half a cell once it leads the second biggest by a fifth or more; plain berries a full cell |
| Food     | 3 plain berries on the board at all times, each popping up away from every head, a new one 2 s after one is eaten                     |
| Death    | A head into another snake's body, or the smaller head in a head-on. Never by its own body. A shield or the newborn's grace spares     |
| Crown    | Nobody's at GO; the first snake to eat, then the biggest viewer's snake (a tie keeps it where it is). Never a wild snake              |

Survival tiers, never shown: a player who gives during this battle plays the strongest brain and is
rarely chased (tier 1); a paid seat plays a good brain (tier 2); a like seat plays the basic brain,
sees danger late and is the preferred prey, unless it is among the two biggest (tier 3). A gift
moves a player up at once. `backing` set to strong (the default) turns the tiers on; `superAI`
gives every snake the strong brain instead.

Reserved seats: during the battle at most half the next round's seats (3 of 6) can be reserved,
first come, by anyone who gives, playing or not. Each is told once on the bottom alert card,
"{name} QUALIFIED FOR THE NEXT ROUND", and their crab waits gold on one of three small mounds on
the beach's left (a player's crab stays on the podium, gold, and its mound holds a gold egg). Once
the three are taken a gift is only a gift.

The beach during the battle: the players' crabs on a podium of sand on the right, the 1st on the
highest mound in the middle under a fixed crown, the 2nd on its left, the 3rd on its right, the
others beside it at ground level, each with a flag of its snake's colour. The order is the
board's. A fallen player's crab buries itself. The sleeping crab shows the players in turn, a bolt
in its heart: a like is speed.

The ring round the board is the clock, full at GO and emptying clockwise from the top centre.

## 3. The result

The battle ends when the clock runs out or when one viewer's snake is left. The winner is the last
one standing, else the biggest at 0:00. Feed's end screen: "{name} WINS", then this round's podium
in the result order (survivors by size, then the last to fall), each with the berries their snake
ate, 0 included; the headline counts the same berries. No berry carries over: the flower and the
board empty. The reserved givers start the next qualifying on gold eggs, then the end screen's
gifts, which lock seats as qualifying gifts do.

## Lives and the pilot

- The extra-life gift, set on the Money tab (`lifeOn`, off by default): a gift at `lifePrice`
  coins gives a life instead of berries, up to `maxLives`, shown as prod hearts by the photo and
  under the crab. A snake with a life that dies comes back from a new egg in the same colour with
  `lifeKeep` of its length.
- `pilot` (off by default): the game's own player, "Skohlds", likes a little in the qualifying
  and plays when it gets a seat. It never ranks, never wears the crown, never wins.

## Settings

`ArenaSettings`, stored under `viper-arena-game`. The Feed settings the arena uses are stored
apart, under `viper-arena-settings`, and do not travel with the supporters list.

| Setting      | Values                | Default  | Setting       | Values            | Default |
| ------------ | --------------------- | -------- | ------------- | ----------------- | ------- |
| `places`     | 4, 6, 8               | 6        | `roundLength` | 60 to 300 s       | 120     |
| `entryLikes` | 25, 50, 100, 150, 200 | 100      | `giftBerries` | `owner`, `shared` | `owner` |
| `likeBoost`  | on, off               | on       | `wildSnakes`  | 0, 2, 4, 6        | 4       |
| `boostCap`   | 3, 6, 10 s            | 6        | `speed`       | 5 to 9 cells/s    | 7       |
| `queueIdle`  | 3, 5, 10, 15 s        | 5        | `superAI`     | on, off           | off     |
| `backing`    | off, light, strong    | `strong` | `pilot`       | on, off           | off     |

`entryLikes` is now the likes for one speed boost; `queueIdle` the time a qualifying liker's crab
stays on the beach without a like. `giftEntry`, `plainEvery` and `plainAmount` are kept in the
protocol but no longer used by the arena.

The simulated audience (Rehearsal tab) is 10, 100 or 700 made-up viewers liking and giving at
rates that scale with the room; during the qualifying it gives about one gift for a medium room.
