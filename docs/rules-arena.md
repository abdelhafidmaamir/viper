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

The board holds no snake: one egg per place (`places`, 6 by default) in two rows (3 and 3; with 8
places 4 and 4, 7 cells apart), ranked 1st (top left) to last, evenly spaced between the clock's pill and a cut line, and
the three best challengers under the line, spread across the board. A name is cut to its column.
Code: `qualify.ts` (rules) and `qualify-paint.ts` (screen).

It opens with the next batch of the paid queue (see below), as many as the places, on gold eggs in
queue order: each picture flies from the flower to its egg, one after the other. The seats left
follow the rules here.

| Element  | Rule                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Counts   | Everyone starts at 0, last round's players and winner too. No free seat                                                                                                                                                                                      |
| Like     | A prod heart pops on the liker's badge (or over their crab on the beach); the number rolls up                                                                                                                                                                |
| Free egg | Taken at once by the best liker without a seat                                                                                                                                                                                                               |
| The cut  | The best liker without a seat passes the weakest like seat: the two cross the line together, at most one swap every 0.6 s                                                                                                                                    |
| Gift     | Locks a seat: the flower opens on the giver (a gold egg on its card, where Feed shows the berry), their picture flies to an egg that turns gold. A full board: the weakest like seat goes. Every seat paid, or the clock out: the giver joins the paid queue |
| Order    | Strict at every moment: paid seats first, in the order the gifts came, then like seats, most likes first                                                                                                                                                     |
| At risk  | The weakest like seat's egg trembles and its badge pulses red when the first challenger is within 10 %                                                                                                                                                       |
| All paid | Likes can change nothing more: the qualifying ends at once                                                                                                                                                                                                   |
| Text     | Only the clock pill, "QUALIFYING 0:24" (French "QUALIFICATIONS"), smaller than the battle's; it beats in the last 5 s                                                                                                                                        |

A paid seat shows no badge: its gold egg and the gold outline on the photo say it. The beach shows
the newest likers' crabs, in one compact group; the sleeping crab (above the board, top right)
shows viewers who have not liked yet, an egg in its heart.

At 0:00 everything holds still for 0.5 s and the challengers fade; Feed's 3, 2, 1 plays over the
closed eggs and every egg bursts at GO, in one beat. Empty eggs hatch wild snakes up to
`wildSnakes`. Every snake starts the same length at the same moment.

## 2. The battle (2 min)

Only the qualified snakes play: nobody comes in during the battle and a dead snake leaves its place
empty.

| Element  | Rule                                                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Look     | Feed's snake in one of the 8 prod colours; the viewer's photo floats above the head, its name above it                                                                                                                                                                                                                       |
| Photo    | Follows the head through a damped spring; photos push each other apart, a smaller snake's name gives way to a bigger one's. Photos, stems and names lie over the bodies, and every head with its first neck segment over the photos, so where a snake is and goes always shows; the crown and the boost bolt over everything |
| Speed    | `speed` cells a second, up to 15% slower at 60 cells                                                                                                                                                                                                                                                                         |
| Likes    | A player's likes fill the red ring round their crab on the beach; every `entryLikes` likes (100) fire a 4 s speed boost and grow the snake by 3 cells                                                                                                                                                                        |
| Boost    | The snake dashes with speed streaks in its colour and a bolt by its photo; the crab runs on the spot with the same bolt                                                                                                                                                                                                      |
| Gifts    | Berries from the flower in the giver's colour, for the giver's snake (`giftBerries`): growth                                                                                                                                                                                                                                 |
| Catch-up | A gift berry grows a snake by a full cell, half a cell once it leads the second biggest by a fifth or more; plain berries a full cell                                                                                                                                                                                        |
| Food     | 3 plain berries on the board at all times, each popping up away from every head, a new one 2 s after one is eaten                                                                                                                                                                                                            |
| Death    | A head into another snake's body, or the smaller head in a head-on. Never by its own body. A shield or the newborn's grace turns a head away from a body while it has another way; cornered with only another snake's body to go, it dies there (trapped): nothing ever passes through another snake                         |
| Crown    | Nobody's at GO; the first snake to eat, then the biggest viewer's snake (a tie keeps it where it is). Never a wild snake                                                                                                                                                                                                     |

Survival tiers, never shown: a player who gives during this battle plays the strongest brain and is
rarely chased (tier 1); a paid seat plays a good brain (tier 2); a like seat plays the basic brain,
sees danger late and is the preferred prey, unless it is among the two biggest (tier 3). A gift
moves a player up at once. `backing` set to strong (the default) turns the tiers on; `superAI`
gives every snake the strong brain instead.

During the battle a gift is just a gift on the board: a player's gives berries to their snake and
lifts their tier; a non-player's gets the flower's thanks (a gold egg on its card: it bought a place in line) and nothing more. Either way the giver
joins the paid queue (below). No seat is shown or held during the battle.

The beach during the battle: the players' crabs on a podium of sand in the beach's right part, the
1st on the right on the highest mound under a fixed crown, the 2nd in the middle on a lower mound,
the 3rd on its left lower still, the others at ground level further left, the ranking going on
right to left (4th, 5th, ...), each with a flag of its snake's colour. The order is the board's,
re-sorted at most once a second, every move eased over 0.6 s. TikTok's comments cover the screen's
lower left up to about 81 % of its width: the 1st and the 2nd stand right of that line, and with 8
players no two crabs touch (smaller crabs when needed). A fallen player's crab buries itself. The
sleeping crab shows the players in turn, a bolt in its heart: a like is speed.

## The paid queue

Seats are bought in the qualifying, or in line for the next rounds. Whoever gives outside the
qualifying (the battle, its countdown, the end screen, or a qualifying where every seat is already
paid) joins the paid queue: one place per viewer, first come first served, no limit; more gifts do
not move them. Each round takes the next batch from its front, as many as the places (4, 6 or 8),
and opens its qualifying with them on gold eggs; the rest waits for the following rounds. A batch
that fills every seat ends the qualifying at once (the "All paid" rule).

The only signal is the alert card, once, at the gift: "{name} has a seat in the next round" with a
gold "#3" badge and a small gold egg on the photo while the place is within the next batch;
after it, "{name} is #12 in line: plays in 2 rounds", the rounds counted from the places (a
place in the next batch never reads "in 1 rounds": it gets the first text). French "{name} a sa
place à la prochaine manche", "{name} est #12 dans la file : joue dans 2 manches". Gold eggs
around it. The flower's card for that gift shows a gold egg. The queue lasts the session and survives a
reload of the game window (stored under `viper-arena-paid-queue`); a viewer who left the live keeps
their place and their snake plays as any snake. The control room lists it read only (Setup tab,
"Paid queue" card): position and name, the next round's batch marked.

The ring round the board is the clock, full at GO and emptying clockwise from the top centre.

## Alerts and the like strip

The alert card sits under the board, a small gap below the like strip, the size of Feed's (790 by
114, photo 86, text 38). A game card reads on one row: its words shrink to fit down to 30, then the
name is cut. Its order of importance, money first: an elimination and a place in the paid queue, which never expire; then a
speed boost, shown only when neither waits and dropped after 3 s waiting (its gold chip showed
it); then the stream's (follows, shares, returning supporters, welcomes); then likes ("{name}
dropped 20 likes, thank you!"), during the qualifying only and when nothing else waits. During
the battle likes are never on the card: the strip shows them. When the battle ends, its cards go
at once (an elimination, a speed boost, a place in the paid queue, waiting or on screen) and the
strip with them: nothing of the battle shows over the end screen. A gift during the end screen
still shows its place: it belongs to the next round.

The like strip, in the battle only: one row of compact chips just under the board's bottom line,
centred, one for every living player from GO, 0 % included, in the qualifying's seat order for the
whole battle (likes never reshuffle it). A player who falls loses their chip, eased out, and the
others slide together. A chip is 1.2 times the base chip (77 high); 6 chips make a row a little
wider than the board, inside the screen less 20 each side; with 7 or 8 every chip shrinks evenly
so the row fits that width, its top kept under the line. A chip holds the player's photo (outlined in
their snake's light colour) in the red ring of their likes toward the next speed boost
(`entryLikes`, 100), and the percentage. The goal is a bolt badge on the ring at the photo's upper
right: the ring starts just past it and runs clockwise back to it. At 100 % the chip turns gold,
the badge lights and a big lit bolt replaces the number for about 1.5 s, while the card shows
"{name} hit 100 likes: SPEED BOOST" and a lit bolt (French "{name} a atteint 100 likes : SPEED
BOOST", 100 being `entryLikes`): the photo in a full gold ring, the name in the snake's colour,
"SPEED BOOST" in gold, gold bolts around it; then the ring starts again from what was left
over. Small hearts pop over a chip at each like. The strip is painted over the card's particles,
which rise behind it. Code: `strip.ts`, the card in `feed/alerts.ts` (Arena-only paths).

## 3. The result

The battle ends when the clock runs out or when one viewer's snake is left. The winner is the last
one standing, else the biggest at 0:00. Feed's end screen: "{name} WINS", then this round's podium
in the result order (survivors by size, then the last to fall), each with the berries their snake
ate, 0 included; the headline counts the same berries. No berry carries over: the flower and the
board empty. A gift during the end screen locks nothing: its giver joins the paid queue.

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
