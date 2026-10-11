# Snake Arena: rules and settings

One snake per viewer on a shared board. Likes bring a viewer's snake in and speed it up, gifts
feed it. Comments do nothing. This page is a stub: the board is a placeholder for now (one snake
looping round the board), and the rules below are the settings the game will read.

Open it from the launcher (third card, key 3) or with `--mode=arena`. Code is in
`src/renderer/arena/`, the settings in `src/shared/arena-protocol.ts`.

## What it shares with Feed

Everything around the board is Feed's, imported as it is: the forest (on the beach by default),
the ring, the flower, the likers' animals, the alerts, the supporter entrances and gift thanks, the
end screen, the journal and the supporters list. See [rules-feed.md](rules-feed.md). The
differences:

| Element      | Feed                          | Snake Arena                                             |
| ------------ | ----------------------------- | ------------------------------------------------------- |
| Round end    | Board full                    | Time up (`roundLength`)                                 |
| Ring         | How full the board is         | How much of the round has gone, pulses in its last 10 s |
| Flower       | Drips each berry on the board | Shows the gift; its berries reach the board at once     |
| Weather      | `rain`, new one each round    | `sea`, kept until changed in the control room           |
| Crash backup | Round restored on launch      | None yet                                                |
| Journal file | `Viper Feed <date>.csv`       | `Viper Arena <date>.csv`                                |

Gifts are priced from the same kind of list as Feed's (Money tab), kept separately. The supporters
list is the same one for both modes.

## Where likes and gifts go

Every like and gift Feed's link counts (from TikFinity, a test button, the simulated audience or
"Give berries back") goes to the round, for the flower and the end screen's rankings, and to the
board through `arenaLike` and `arenaGift` (`arena.ts`). During a real live, test gifts and the
simulated audience are refused, as in Feed.

## Settings

`ArenaSettings` (`src/shared/arena-protocol.ts`), set in the control room's Arena card and stored
in `localStorage` under `viper-arena-game`:

| Setting       | Values                           | Default | Meaning                                                  |
| ------------- | -------------------------------- | ------- | -------------------------------------------------------- |
| `places`      | 4, 6, 8, 10, 12                  | `8`     | Snakes on the board at once                              |
| `entryLikes`  | 10, 25, 50, 100, 200             | `50`    | Likes that fill a viewer's entry ring                    |
| `boostCap`    | 1, 1.25, 1.5, 2                  | `1.5`   | Fastest a snake goes on likes, times its normal speed    |
| `shieldGift`  | 0, 5, 10, 30, 100 (berries)      | `10`    | One gift of at least this buys a shield; 0 never does    |
| `roundLength` | 60, 120, 180, 300, 600 (seconds) | `180`   | Round length, applies from the next round                |
| `giftBerries` | `owner`, `shared`                | `owner` | A gift's berries are for the giver's snake, or stealable |
| `wildSnakes`  | 0, 2, 3, 4, 6                    | `3`     | Wild snakes keep this many on the board while few play   |

The Feed settings the arena uses (ambience, alerts, entrances, gift thanks, prices, end screen
duration) are stored under `viper-arena-settings`, apart from Feed's, and do not travel with the
supporters list.
