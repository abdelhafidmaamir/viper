# Glossary

Terms used in the code and the other documents. The left column is the word as it appears in the
code; the definition says what it means for the system.

## Input events

All input comes from a TikTok live through TikFinity. The adapter
(`src/renderer/scripts/tikfinity-bridge.ts`) maps it to these event types:

| Event     | Trigger                    | Paid | Notes                                                    |
| --------- | -------------------------- | ---- | -------------------------------------------------------- |
| `join`    | A viewer opens the stream  | no   | High volume at the start of a stream                     |
| `like`    | A viewer taps the screen   | no   | Highest volume; arrives batched with a count             |
| `follow`  | A viewer follows           | no   | Can arrive twice in two formats; deduplicated over 5 s   |
| `share`   | A viewer shares the stream | no   | Same as `follow`                                         |
| `gift`    | A viewer sends a gift      | yes  | Carries a gift name, a value in coins and a repeat count |
| `viewers` | Periodic audience size     | no   | Sampled, not an action                                   |

## Terms

| Term               | Meaning                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewer             | A member of the audience. Identified by a TikTok id (stable) and a nickname (not stable).                                                                                                                |
| Gift               | A paid item a viewer sends during a stream. From the system's point of view: a payment event that must produce a visible result and must not be lost.                                                    |
| Coin               | The unit a gift is priced in. Used as the value of a gift event. Never displayed on stream.                                                                                                              |
| Rose, Rosa         | Two gift names. In Feed, the only two that count: 1 coin and 10 coins.                                                                                                                                   |
| Streak             | The same gift sent repeatedly by one viewer. Reported as a cumulative counter (`x1`, `x2`, ...) followed by a final event. Counting it needs either the final event or the difference between two steps. |
| Berry              | The game's unit of food. One berry grows a snake by one cell. In Feed, one coin is one berry.                                                                                                            |
| Supporter          | A viewer with at least one counted gift, in this stream or an earlier one.                                                                                                                               |
| Supporters list    | Persistent per-viewer totals across streams, keyed by TikTok id. Stored locally and mirrored to Firestore. It also holds viewers who never gave (likes, visits).                                         |
| Moderator          | A viewer flagged as such by TikTok, or listed by hand in the control room.                                                                                                                               |
| Round              | One run of a simulation from start to end screen. Rounds chain automatically.                                                                                                                            |
| Mode               | One of the two games, Duel or Feed. One runs at a time.                                                                                                                                                  |
| Game window        | The renderer window that is captured and broadcast.                                                                                                                                                      |
| Control room       | The operator's renderer window. Sends commands to the game window, receives its state.                                                                                                                   |
| Simulated audience | An event generator in the control room, used for development and rehearsal. Disabled while a real stream is connected.                                                                                   |
| TikFinity          | Third-party desktop app that exposes a stream's events on `ws://localhost:21213`.                                                                                                                        |
| Capture            | The broadcasting tool (OBS, TikTok LIVE Studio) recording the game window as its video source.                                                                                                           |
| Ambience           | Background scenery: a weather and a time of day. No effect on rules.                                                                                                                                     |
| Journal            | Append-only CSV of the events of one Feed stream.                                                                                                                                                        |
