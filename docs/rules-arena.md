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

Nothing on screen presses a viewer: no time in digits, no tick, no seat shown at risk, no card
announcing a reward. While gifts buy seats (Money tab, off by default: see "Gifts buy seats"), it
opens with the next batch of the paid queue (see below), as many as the places, on gold eggs in
queue order: each picture flies from the flower to its egg, one after the other. The seats left
follow the rules here.

| Element  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counts   | Everyone starts at 0, last round's players and winner too. No free seat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Like     | Prod hearts pop round the liker's photo, 1 to 3 a like event (more for a burst), at most 4 at once for one viewer (on the beach, over their crab); the number in their badge rolls up                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Free egg | Taken at once by the best liker without a seat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The cut  | The best liker without a seat passes the weakest like seat: the two cross the line together, at most one swap every 0.6 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Gift     | While gifts buy seats: locks a seat. The flower opens on the giver (a gold egg on its card, where Feed shows the berry), their picture flies to a free egg, or to the weakest like seat, whose holder crosses down to the first challenger's place as in any swap; the egg turns gold. Every seat paid, or the clock out: the giver joins the paid queue. With a seat price set, only the seat gift does this (see "The seat gift"); any other gift gets the flower's thanks with its berry, and its berries wait for the battle. While gifts buy no seats (the default): every gift gets the flower's thanks with its berry, and its berries wait for the battle |
| Order    | Strict at every moment: paid seats first, in the order the gifts came, then like seats, most likes first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| No risk  | No seat is ever shown at risk: no trembling egg, no red badge. The cut line stays the same to the end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| All paid | Likes can change nothing more: the qualifying ends at once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Text     | Only the pill at the ring's top, "QUALIFYING" (French "QUALIFICATIONS"), with no time in it: the ring round the board shows the time left, emptying calmly, with no beat, tick or change of colour at the end                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

A seat's badge (and a challenger's) is the number of likes in a small dark pill, with no icon.
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
lifts their tier; a non-player's gets the flower's thanks and nothing more. While gifts buy seats,
the giver also joins the paid queue (below) and a non-player's card shows a gold egg (it bought a
place in line). No seat is shown or held during the battle. With a seat price set, only the seat
gift buys the place in line, and gives no berries; any other gift gives berries to a player's
snake, and a non-player's gets the flower's thanks with its berry, no place in line. While gifts
buy no seats (the default), no gift buys a place in line.

The beach during the battle: the players' crabs on a podium of sand in the beach's right part, the
1st on the right on the highest mound under a fixed crown, the 2nd in the middle on a lower mound,
the 3rd on its left lower still, the others at ground level further left, the ranking going on
right to left (4th, 5th, ...), each with a flag of its snake's colour. The order is the board's,
re-sorted at most once a second, every move eased over 0.6 s. TikTok's comments cover the screen's
lower left up to about 81 % of its width: the 1st and the 2nd stand right of that line, and with 8
players no two crabs touch (smaller crabs when needed). A fallen player's crab buries itself. The
sleeping crab shows the players in turn, a bolt in its heart: a like is speed.

## Gifts buy seats

`giftSeats`, the Money tab's "Gifts buy seats" switch, above the seat price: off by default. Off,
no gift ever buys a seat or a place in the paid queue: the qualifying goes by likes alone, a gift
during it from a viewer without a seat gets the flower's thanks with its berry (its berries wait
for the battle), a player's gift in the battle gives berries as usual, the seat gift is a gift like
any other (priced in berries), the paid queue is empty (switching off empties it) and its card in
the control room is hidden, and the seat price is greyed. On, everything below works as built:
seat price, paid queue, gold eggs.

## The paid queue

Seats are bought in the qualifying, or in line for the next rounds. Whoever gives outside the
qualifying (the battle, its countdown, the end screen, or a qualifying where every seat is already
paid) joins the paid queue (with a seat price set, only the seat gift's giver): one place per viewer, first come first served, no limit; more gifts do
not move them. Each round takes the next batch from its front, as many as the places (4, 6 or 8),
and opens its qualifying with them on gold eggs; the rest waits for the following rounds. A batch
that fills every seat ends the qualifying at once (the "All paid" rule).

No alert card announces a place in line: the flower thanks the giver as for any gift, its card
showing a gold egg. The queue lasts the session and survives a reload of the game window (stored
under `viper-arena-paid-queue`, read back only while gifts buy seats); a viewer who left the live
keeps their place and their snake plays as any snake. The control room lists it read only (Setup
tab, "Paid queue" card, hidden while gifts buy no seats): position and name, the next round's
batch marked.

## The seat gift

`seatPrice`, set on the Money tab ("Seat price", a coin value typed like the gift price rows),
used only while gifts buy seats (greyed otherwise): 0, the default, and any gift buys a seat or a
place in line, as above. Above 0, only a gift worth
exactly that many coins does, one place per viewer, a streak of it included. It is an entry and
nothing else, as the extra-life gift is only a life: it never drops berries, even from a player in
the battle, whatever the gift prices say. In the qualifying it locks a seat (the flower's card
shows a gold egg, "x1"); outside it the giver joins the paid queue and the flower shows a gold egg for
a moment, first in turn. Every other gift does what a gift does without
a seat: berries from the price list, the flower's thanks with its berry. At the extra-life gift's
price the life wins: that gift gives a life, never a seat, and the Money tab says so. With a seat
price set the extra-life gift buys no seat, and neither do berries given by hand (Live tab). An
empty or wrong entry (not a whole number from 0 to 50000) keeps the value in use. The Test button
next to it sends a rehearsal gift at that value.

The ring round the board is the clock, full at GO and emptying clockwise from the top centre: the
only clock on screen. The battle has no time pill and no digits, and nothing beats, ticks or turns
gold near the end.

## Alerts and the like strip

The alert card sits under the board, a small gap below the like strip, the size of Feed's (790 by
114, photo 86, text 38). A game card reads on one row: its words shrink to fit down to 30, then the
name is cut. Its order of importance: an elimination, which never expires; then a speed boost, shown only
when none waits and dropped after 3 s waiting (its gold chip showed it); then the stream's (follows, shares, returning supporters, welcomes); then likes ("{name}
dropped 20 likes, thank you!"), during the qualifying only and when nothing else waits. During
the battle likes are never on the card: the strip shows them. When the battle ends, its cards go
at once (an elimination, a speed boost, waiting or on screen) and the strip with them: nothing of
the battle shows over the end screen.

The like strip, in the battle only: one row of compact chips just under the board's bottom line,
centred, one for every living player from GO (the pilot included), an empty ring included, in
the qualifying's seat order for the whole battle (likes never reshuffle it). A player who falls
loses their chip, eased out, and the others slide together. A chip is 1.2 times the base chip
(104 by 86: the ringed photo's box, 76, with 14 each side); 6 chips make a row narrower than the
board; with 8 every chip shrinks evenly so the row fits the screen less 20 each side, its top kept
under the line. A chip holds the player's photo (outlined in their snake's light colour) in the
red ring of their likes toward the next speed boost (`entryLikes`, 100), and nothing else: no
number, no word. The goal is a bolt badge on the ring at the photo's upper right: the ring starts
just past it and runs clockwise back to it. When the ring fills the chip turns gold, the badge
lights and a big lit bolt shows over the photo's lower right for about 1.5 s, while the card shows
"{name} ⚡ SPEED BOOST" (French "{name} ⚡ BOOST DE VITESSE"), no number: the photo in a full gold
ring, the name in the snake's colour, a lit bolt for the "⚡", "SPEED BOOST" in gold, gold bolts
around it; then the ring starts again from what was left over. Small hearts pop over a chip at
each like. The strip is painted over the card's particles, which rise behind it. Code:
`strip.ts`, the card in `feed/alerts.ts` (Arena-only paths).

## 3. The result

The battle ends when the clock runs out or when one viewer's snake is left. The winner is the last
one standing, else the biggest at 0:00. Feed's end screen: "{name} WINS", then this round's podium
in the result order (survivors by size, then the last to fall), each with the berries their snake
ate, 0 included; the headline counts the same berries. No berry carries over: the flower and the
board empty. A gift during the end screen locks nothing: while gifts buy seats, its giver joins
the paid queue (with a seat price set, only the seat gift's giver).

## Lives and the pilot

- The extra-life gift, set on the Money tab (`lifeOn`, off by default): a gift at `lifePrice`
  coins gives a life instead of berries, up to `maxLives`, shown as prod hearts by the photo and
  under the crab. A snake with a life that dies comes back from a new egg in the same colour with
  `lifeKeep` of its length. It buys a seat as any gift does while gifts buy seats and `seatPrice`
  is 0, never once a seat price is set.
- `pilot` (off by default): the game's own player, "Skohlds", likes as an engaged viewer does
  (`PILOT_LIKES` in `entry.ts`): in the qualifying bursts of 5 to 15 likes every 0.5 to 1 s; in the
  battle a burst every 0.5 to 1 s, sized to fire a speed boost every 15 to 25 s, whatever
  `entryLikes` is. Its likes go the way a viewer's do: hearts round its photo and the like card in
  the qualifying, its ring and chip in the battle, where its boosts dash, grow its snake and show
  the SPEED BOOST card under its name. It plays when it gets a seat. It never ranks, never wears
  the crown, never wins, and has no journal row or supporters list entry.

## Settings

`ArenaSettings`, stored under `viper-arena-game`. The Feed settings the arena uses are stored
apart, under `viper-arena-settings`, and do not travel with the supporters list.

| Setting      | Values                | Default  | Setting       | Values                    | Default |
| ------------ | --------------------- | -------- | ------------- | ------------------------- | ------- |
| `places`     | 4, 6, 8               | 6        | `roundLength` | 60 to 300 s               | 120     |
| `entryLikes` | 25, 50, 100, 150, 200 | 100      | `giftBerries` | `owner`, `shared`         | `owner` |
| `likeBoost`  | on, off               | on       | `wildSnakes`  | 0, 2, 4, 6                | 4       |
| `boostCap`   | 3, 6, 10 s            | 6        | `speed`       | 5 to 9 cells/s            | 7       |
| `queueIdle`  | 3, 5, 10, 15 s        | 5        | `superAI`     | on, off                   | off     |
| `backing`    | off, light, strong    | `strong` | `pilot`       | on, off                   | off     |
| `seatPrice`  | 0 to 50000 coins      | 0        | `lifePrice`   | 10, 20, 30, 99, 199 coins | 30      |
| `giftSeats`  | on, off               | off      |               |                           |         |

`entryLikes` is now the likes for one speed boost; `queueIdle` the time a qualifying liker's crab
stays on the beach without a like. `giftEntry`, `plainEvery` and `plainAmount` are kept in the
protocol but no longer used by the arena.

The simulated audience (Rehearsal tab) is 10, 100 or 700 made-up viewers liking and giving at
rates that scale with the room; during the qualifying it gives about one gift for a medium room.
