# Duel: rules and constants

Two AI-driven snakes, Gold and Shadow, on one grid. Viewer events modify the simulation. This page
lists what the code applies. Constants are in `src/renderer/engine/rules.ts` unless another file
is named; the simulation loop is `src/renderer/scripts/game.ts`.

## Board

| Element | Behaviour                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------- |
| Grid    | 16 columns by 20 rows (`engine/layout.ts`)                                                      |
| Berry   | Eaten: +1 segment. With no gifts, one spawns about every 8 s (`FOREST_BERRY_INTERVAL`)          |
| Stone   | 1.3 s warning, then solid for 45 s                                                              |
| Bramble | Grows across a lane, one segment per 0.75 s, up to 4 segments, lasts 20 s (`engine/hazards.ts`) |

## Round lifecycle

1. Both snakes start at 5 segments from the centre, Gold heading left, Shadow heading right.
2. The round runs for 120 s by default (`duelDuration`, adjustable from the control room).
3. It ends on the first of:

| Cause    | Condition                                                                                 |
| -------- | ----------------------------------------------------------------------------------------- |
| Ring     | A snake reaches 40 segments (`TARGET_LENGTH`) and keeps it for 5 s (`HOLD_SECONDS`)       |
| Knockout | An adult snake (it has reached 10 segments) falls below 3 segments. The other side wins.  |
| Clock    | Longer snake wins. Equal length, or both at 5 segments or fewer, is a draw with no point. |

4. The end screen stays 8 s, then the next round starts. The score is the number of rounds won
   per team and persists across rounds, not across launches.

## Collisions

A collision does not end the round by itself.

| Case                                        | Result                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Shield active                               | No loss                                                             |
| Wall or own body                            | No loss, 1.5 s of invincibility                                     |
| Rival's body, head-on, or cornered by rival | Keeps `max(3, floor(length / 2))` segments; the rest become berries |

"Cornered" means the rival has a segment within 2 cells of the head: a wall or self collision in
that situation is attributed to the rival. A snake that has not yet reached 10 segments keeps at
least 2 segments and cannot be knocked out.

## Gifts

The team comes from the gift name, the effect from its value (`engine/audience-events.ts`).

**Team.** A command from the control room can set the team explicitly. Otherwise:

- value under 10 coins: Gold if the name is `rose`, `rose red` or `rose rouge`, else Shadow;
- value of 10 coins or more: Gold if the name contains `rose`, `bouquet`, `bagel`, `donut`,
  `doughnut`, `teddy` or `bear`, else Shadow;
- no name (simulated audience): random, 50/50.

Note that the TikTok gift named "Rosa" is the white rose and goes to Shadow.

The reference set shown in the on-stream gift panel (`engine/gift-panel.ts`):

| Value | Gold     | Shadow     |
| ----- | -------- | ---------- |
| 1     | Red rose | White rose |
| 10    | Rose 10  | Dyno       |
| 20    | Bouquet  | Perfume    |
| 30    | Bagel    | Capybara   |
| 100   | Teddy    | Hand heart |

**Effect**, by value, applied once per gift in a streak:

| Value         | Effect                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| 1 to 9        | Plants berries on the team's side of the board                                            |
| 10 to 19      | Speed x1.2 for 10 s, durations add up                                                     |
| 20 to 29      | Steal: removes 15 % of the rival's length (at least 1 segment) and gives it to this snake |
| 30 to 99      | Shield for 15 s, durations add up                                                         |
| 100 and above | +1 life: a cut that would knock the snake out leaves it at 3 segments instead             |

In the Duel a streak is counted once, on TikTok's end-of-streak event.

## Likes

Likes are not attributed to a team (`engine/crowd-energy.ts`).

- They feed a shared pool with a 15 s half-life, so the level follows the recent rate, not the
  total.
- The pool level scales the speed of both snakes, up to +15 %.
- At 97 % of the pool a frenzy starts: 8 s, a further +15 % speed, a neutral berry every 1.6 s,
  then a 45 s cooldown.
- Every 1,000 cumulative likes triggers a visual effect with no effect on the simulation.

## Other events

| Event                        | Effect                                           |
| ---------------------------- | ------------------------------------------------ |
| `join`                       | Plants one berry and shows an arrival banner     |
| `follow`, `share`, `comment` | None on the board. Counted in the activity level |

## Activity tiers

`engine/crowd.ts` keeps a count of recent events that decays over 60 s; a gift weighs 3, any other
event 1. The count selects a tier, and the tier caps the number of berries and stones on the
board.

| Tier  | From | Max berries | Max stones |
| ----- | ---- | ----------- | ---------- |
| empty | 0    | 3           | 4          |
| quiet | 6    | 3           | 5          |
| busy  | 60   | 4           | 4          |
| crowd | 250  | 5           | 5          |

The tier table also carries a per-tier length cap (34 to 120). It is not applied: `maxLength()`
returns the fixed target of 40 unless the operator forces a value.

## AI

| Player  | Method                                                                                                                     | File                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Default | Plans a path to the nearest berry, checks for an exit after eating, falls back to following its tail                       | `scripts/ai-human.ts` |
| Super   | Minimax with alpha-beta pruning, iterative deepening under a time budget; evaluation on territory, length and encirclement | `scripts/ai-super.ts` |

The super AI can be enabled for both teams or one. It is suspended while a scene runs.

## Operator controls that change the rules

| Control          | Effect                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Scenes           | Timed AI behaviours (`engine/scenes.ts`): ballet 20 s, race 15 s, hunt by one side 12 s |
| Advantage        | Biases the quality of one AI. Reset every round                                         |
| Underdog         | Helps the shorter snake                                                                 |
| Round parameters | Round duration, hold time, forced length cap, stone cap                                 |
