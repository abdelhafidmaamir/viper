# Feed: rules and constants

One snake on one grid. Gifts add food; the round ends when the board is full. This page lists what
the code applies. Code is in `src/renderer/feed/`; constants are in `state.ts` unless another file
is named.

## Board and route

| Element  | Behaviour                                                                                    |
| -------- | -------------------------------------------------------------------------------------------- |
| Grid     | 30 by 30, 900 cells (`grid.ts`)                                                              |
| Route    | A closed loop through every cell (a Hamiltonian cycle). The snake cannot collide with itself |
| Patterns | 5 loop layouts (seeds 7, 19, 42, 77, 123), rotated each round                                |
| Speed    | 9 cells per second, constant. No event changes it                                            |

`path.ts` contains a shortcut search towards the nearest berry. It is disabled: every call to
`nextCell` passes `loopOnly = true`.

## Round lifecycle

| Phase      | Duration or condition | Behaviour                                                                                                            |
| ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Countdown  | 3.6 s                 | No berry falls                                                                                                       |
| Opening    | Until 360 cells       | Starts at 3 cells. 12 berries placed on the route carry hidden extra growth up to 40 % of the board. Head speed x5.2 |
| Play       | Until 899 cells       | Gifts add berries, the snake eats and grows                                                                          |
| End screen | 10 s (`roundHold`)    | Rankings, then the next round starts automatically                                                                   |

The last cell stays free, which is why the round ends at 899. The opening exists to skip the
period where the board is almost empty.

Setting `startFill` to 0.5, 0.75, 0.9 or 0.95 starts the snake at that share of the board and
skips the opening. The default, 0, is the normal start described above.

## Gifts

| Gift | Coins | Berries |
| ---- | ----- | ------- |
| Rose | 1     | 1       |
| Rosa | 10    | 10      |

Defined in `src/shared/feed-protocol.ts`. When the event carries a coin value between 1 and 100,
that value is used instead of the name. Any other gift yields 0.

A streak is counted in full with no cap. In this mode the adapter counts each step of the
cumulative counter as it arrives, so berries are credited during the streak, not at its end.

Each berry falls onto a free cell chosen at random, excluding cells the head would reach before
the berry lands. The on-stream text uses "berries" only; coin values are never displayed.

## Guarantee: a paid berry is not lost

| Case                                     | Handling                                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Board fills before all berries are eaten | Remaining berries carry over to the next round                      |
| Gift arrives during the end screen       | Queued, credited when the next round opens, ranked in that round    |
| App closes or crashes                    | Round restored on next launch from the backup (see `operations.md`) |
| A gift was missed                        | Operator command `grant`: credits berries to a named viewer         |

Carried-over berries keep their donor's position in the round ranking. Berries restored after a
restart are credited but not ranked. Only gifts from a real stream are persisted; test gifts and
the simulated audience are not.

## Likes

Likes do not affect the board. They are used for:

- the per-round like ranking shown on the end screen;
- an alert under the board;
- one animal per liking viewer, at the bottom of the screen (`crabs.ts`, drawings in
  `critter-art.ts`). See below.

### Likers' animals

Each ambience has its animal: frog (rain), penguin (snow), squirrel (autumn), bee (summer), rabbit
(spring), hedgehog (storm), cat (stars), arctic fox (aurora), firefly (fireflies), salamander
(embers), owl (mist), crab (sea). The animal holds its viewer's picture.

- 5 places. A viewer who likes without having one takes the place of the viewer whose last like
  is the oldest. Nothing protects a place, whatever its holder's count.
- A like event carries a count. Each like sends up a heart (12 per event at most), and the animal
  hops 1, 2, 3 or 4 times for 1, 2 to 4, 5 to 14, 15 or more likes.
- A badge on the picture shows the viewer's likes since they got the place. Losing the place
  resets it. Setting `likeCount` (default `true`) hides the badge; crown and tiers stay.
- The viewer with the highest count, from 10 likes, wears a crown.
- At 500 likes the animal gets an ornament (only the squirrel has one so far), at 2000 the picture's
  ring and the badge turn gold.
- Poses are drawn once and replayed from a cache, emptied when the ambience changes: an idle cycle
  of 3.2 s at 10 frames a second and 18 frames for a hop.

## Alerts

One card at a time under the board (`alerts.ts`).

| Event                                      | Duration | Priority | Expires while waiting |
| ------------------------------------------ | -------- | -------- | --------------------- |
| share (a repost counts as a share)         | 4.0 s    | 1        | never                 |
| follow                                     | 3.8 s    | 1        | never                 |
| join of a returning supporter or moderator | 3.2 s    | 1        | never                 |
| like                                       | 3.8 s    | 2        | after 10 s            |
| join                                       | 3.2 s    | 3        | after 6 s             |

- The queue is ordered by priority and holds 5 cards.
- A card on screen is cut short when a higher-priority one is waiting, once it has been up for
  1.2 s. Cards of the same priority never cut each other.
- More likes from the same viewer extend their card only while nothing waits, and no longer once
  the card has been up 6 s.
- With 2 or more cards waiting, the next card stays 70 % of its duration.
- A plain `join` is dropped when 2 cards are already waiting.

Setting `alerts` turns the feature off.

## Supporter entrances

When a viewer with past gifts, or a moderator, joins, an entrance is drawn over the board
(`vip.ts`).

| Case                                | Duration |
| ----------------------------------- | -------- |
| Past supporter                      | 4.2 s    |
| Moderator                           | 4.8 s    |
| All-time top 3                      | 5.6 s    |
| A gift moves someone into the top 3 | 6.6 s    |

Setting `entranceGap` limits how often one viewer gets the entrance: `0` every arrival (default),
`5`, `15`, `30` minutes, `9999` once per stream, `-1` never. When the entrance is withheld the
viewer gets a highlighted alert instead. A top-3 change is always shown. The operator can skip the
current entrance.

## Gift thanks

Every gift that feeds the snake is thanked on the canvas, whether it comes from the stream, the
simulated audience or a test button. The text only thanks, it never asks for anything.

A viewer's first gift ever gets an entrance over the board (`FIRST GIFT`, 5 s), whatever
`entranceGap` says. A streak that continues adds to the entrance already on screen.

Gifts from someone who has given before follow the `giftThanks` setting:

| Value                                                      | Where the thanks is drawn                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `flower` (default)                                         | Two cards around the flower: name and title on the left, the count on the right, with rays and particles (`flower.ts`) |
| `tray`                                                     | A row in the board's lower left corner, up to 3 rows, 5 s each (`gift-tray.ts`)                                        |
| `tray-arc`, `tray-comet`, `tray-rings`, `tray-butterflies` | Same row, the photo first travels down from the flower                                                                 |
| `classic`                                                  | An entrance over the board (3.4 s, at most 9 s for a streak)                                                           |

The flower's cards scale with the gift: 5, 10, 30 and 100 berries each add rays and particles, gold
from 30. Particles are capped at 260 and nothing is drawn while no gift is pouring. `giftTitles`
adds the title of the day to the tray rows.

A gift that moves its giver into the top 3 gets that entrance instead of the thanks.

## Rankings

The end screen (`leaderboard.ts`) has three sections:

| Section      | Content                                         | Source          |
| ------------ | ----------------------------------------------- | --------------- |
| This round   | Top 3 by berries given this round               | Round state     |
| Top likes    | Top 3 by likes this round                       | Round state     |
| Hall of fame | Top 3 by berries across all streams, then likes | Supporters list |

The supporters list (`supporters.ts`) stores per TikTok id: nickname, berries, likes, visits,
follows, shares, first and last seen, last avatar URL, berries per day.

## Ambience

Twelve weathers: `rain`, `snow`, `autumn`, `summer`, `spring`, `storm`, `stars`, `aurora`,
`fireflies`, `embers`, `mist`, `sea`. They do not affect rules.

| Setting           | Values                      | Default        | Behaviour                                             |
| ----------------- | --------------------------- | -------------- | ----------------------------------------------------- |
| `autoAmbience`    | boolean                     | `true`         | Picks a different weather at each round start         |
| `dayCycle`        | 0, 10, 20, 30, 60 (minutes) | `20`           | Duration of a full day. 0 keeps the time of day fixed |
| `weather`, `hour` | weather name, 0 to 1        | `rain`, `0.06` | Used when the two settings above are off              |

## Commands refused during a real stream

While TikFinity is connected, the commands `gift`, `likes`, `near-full` and `test-entrance` are
ignored and the simulated audience is set to 0 (`control-link.ts`, `main.ts`). `grant` stays
available.

## Settings

`FeedSettings` (`src/shared/feed-protocol.ts`), stored in `localStorage`:

| Setting        | Default  | Setting       | Default |
| -------------- | -------- | ------------- | ------- |
| `weather`      | `rain`   | `startFill`   | `0`     |
| `hour`         | `0.06`   | `alerts`      | `true`  |
| `dayCycle`     | `20`     | `entranceGap` | `0`     |
| `autoAmbience` | `true`   | `mods`        | empty   |
| `language`     | `en`     | `roundHold`   | `10`    |
| `giftThanks`   | `flower` | `giftTitles`  | `false` |

`roundHold` is the end screen's duration in seconds: 5 to 30 in steps of 5.
