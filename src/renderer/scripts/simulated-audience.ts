// Simulated audience for the duel control room. Two fake viewer teams, gold and shadow,
// WATCH the match and spend their coins like real fans supporting their snake:
// shield when threatened, boost when racing for a berry, steal when the opponent is
// long or when the round is close, life after a big hit, roses to feed it.
// Each team has a FERVOR that rises (hit absorbed, big gift from the opponent, falling behind,
// end of round) and decays; it controls the coin rate. Both teams share the same rules and budget:
// decisions depend on game state only, never on which team is acting.
// Interface: ViperCrowd.readState(B) -> state; ViperCrowd.create() -> {configure(density), tick(state,dt) -> [events], view()}

import type { AudienceEvent, Cell } from '../engine/types.ts';
import type {
  ViperApi,
  CrowdInput,
  CrowdTeamInput,
  CrowdDensity,
  CrowdPurchase,
  CrowdView,
  SimulatedCrowd,
} from '../engine/types-api.ts';

const PRICES: Record<CrowdPurchase, number> = {
  rose: 1,
  boost: 10,
  steal: 20,
  shield: 30,
  life: 100,
};
const NAMES: Record<CrowdPurchase, [string, string]> = {
  rose: ['rose', 'rosa'],
  boost: ['rose 10', 'dyno'],
  steal: ['bouquet', 'perfume'],
  shield: ['bagel', 'capybara'],
  life: ['teddy bear', 'hand heart'],
};
// coins per minute per team at rest (fervor multiplies from 0.6 to 1.8)
const RATES: [number, number, number, number] = [0, 30, 110, 320];
const NICKNAMES: Record<'gold' | 'shadow', string[]> = {
  gold: [
    'lea_gold',
    'karim.or',
    'soleil92',
    'mimi_dore',
    'sacha_or',
    'yuna.sun',
    'tom_gold',
    'aya_or',
  ],
  shadow: [
    'nox',
    'lucas.shadow',
    'ines_ombre',
    'pablo.nuit',
    'zoe_moon',
    'rayan.dark',
    'emma_ombre',
    'kenji.night',
  ],
};
// Caps per round per team, with long cooldowns: a shield or life must stay a notable
// event, not a permanent state.
const CAPS: Partial<Record<CrowdPurchase, number>> = { boost: 5, steal: 3, shield: 1, life: 1 }; // at crowd density a second shield is allowed (see buy)
const COOLDOWNS: Partial<Record<CrowdPurchase, number>> = {
  boost: 8,
  steal: 14,
  shield: 35,
  life: 60,
};
const abs = Math.abs;

type TeamKey = 'gold' | 'shadow';

interface CooldownMap {
  boost: number;
  steal: number;
  shield: number;
  life: number;
  rose: number;
}
interface CountMap {
  boost: number;
  steal: number;
  shield: number;
  life: number;
  rose: number;
}

interface InternalTeamState {
  team: TeamKey;
  fervor: number;
  purse: number;
  spend: number;
  last: CrowdPurchase | '';
  cooldown: CooldownMap;
  count: CountMap;
  lengthBefore: number | null;
  rose: number;
  hit: number;
}

function readState(B: ViperApi): CrowdInput | null {
  const d = B.duel();
  const it = B.internal();
  const m = B.round();
  if (!d.gold || !d.shadow) return null;
  const makeTeamState = function (c: NonNullable<typeof d.gold>, k: 0 | 1): CrowdTeamInput {
    const bodyK = it.body[k];
    return {
      L: c.length,
      head: bodyK !== undefined ? bodyK.head : null,
      shieldTime: c.shieldTime || 0,
      hold: c.hold || 0,
      lives: c.lives || 0,
      boostTime: c.boostTime || 0,
      invincibleTime: c.invincibleTime || 0,
    };
  };
  return {
    t: d.t ?? 0,
    duration: B.settings.duelDuration || 120,
    inProgress: m?.state === 'playing',
    gold: makeTeamState(d.gold, 0),
    shadow: makeTeamState(d.shadow, 1),
    berries: it.berries.map(function (b): Cell {
      return { x: b.x, y: b.y };
    }),
  };
}

function create(): SimulatedCrowd {
  let density: CrowdDensity = 0;
  const history: string[] = [];
  const teams: Record<TeamKey, InternalTeamState> = {} as Record<TeamKey, InternalTeamState>;
  (['gold', 'shadow'] as const).forEach(function (c: TeamKey) {
    teams[c] = {
      team: c,
      fervor: 0.25,
      purse: 0,
      spend: 0,
      last: '',
      cooldown: { boost: 0, steal: 0, shield: 0, life: 0, rose: 0 },
      count: { boost: 0, steal: 0, shield: 0, life: 0, rose: 0 },
      lengthBefore: null,
      rose: 0,
      hit: 0,
    };
  });
  let prevTime = 0;
  // Natural pacing: two viewers never send a gift at the same instant. After each gift,
  // a short random gap (across both teams) passes before the next.
  let horloge = 0;
  let libre = 0;
  function configure(i: CrowdDensity): void {
    density = i;
    if (!i)
      (['gold', 'shadow'] as const).forEach(function (c: TeamKey) {
        teams[c].purse = 0;
        teams[c].fervor = 0.25;
      });
  }
  function record(team: TeamKey, what: string, why: string): void {
    history.unshift((team === 'gold' ? 'Gold' : 'Shadow') + ': ' + what + ' (' + why + ')');
    if (history.length > 6) history.pop();
  }

  function tick(e: CrowdInput | null, dt: number): AudienceEvent[] {
    const ev: AudienceEvent[] = [];
    if (!density || !e?.inProgress) {
      (['gold', 'shadow'] as const).forEach(function (c: TeamKey) {
        teams[c].lengthBefore = null;
      });
      return ev;
    }
    const remaining = e.duration - e.t;
    const bigGiftSent: Record<TeamKey, boolean> = { gold: false, shadow: false };
    if (e.t < prevTime)
      (['gold', 'shadow'] as const).forEach(function (c: TeamKey) {
        teams[c].count = { boost: 0, steal: 0, shield: 0, life: 0, rose: 0 };
        teams[c].lengthBefore = null;
      }); // new round
    prevTime = e.t;
    horloge += dt;
    // team order is randomized each tick: neither team always acts first
    (Math.random() < 0.5 ? (['gold', 'shadow'] as const) : (['shadow', 'gold'] as const)).forEach(
      function (team: TeamKey) {
        const Q = teams[team];
        const mine = e[team];
        const opponent = e[team === 'gold' ? 'shadow' : 'gold'];
        const idx: 0 | 1 = team === 'gold' ? 0 : 1;
        const buy = function (what: CrowdPurchase, why: string, urgence?: boolean): boolean {
          if (horloge < libre || Q.purse < PRICES[what]) return false;
          const cap =
            (CAPS[what] ?? 0) + (what === 'shield' && density >= 3 ? 1 : 0) + (urgence ? 2 : 0);
          const capLimit = CAPS[what];
          if (capLimit && (Q.count[what] >= cap || (!urgence && Q.cooldown[what] > 0)))
            return false;
          libre =
            horloge + (what === 'rose' ? 0.35 + Math.random() * 0.5 : 0.9 + Math.random() * 1.3);
          Q.count[what]++;
          const cd = COOLDOWNS[what];
          if (cd) Q.cooldown[what] = cd;
          Q.purse -= PRICES[what];
          Q.spend += PRICES[what];
          Q.last = what;
          const nicknames = NICKNAMES[team];
          const nickname = nicknames[Math.floor(Math.random() * nicknames.length)] ?? '';
          const nameArr = NAMES[what];
          ev.push({
            type: 'gift',
            n: 1,
            value: PRICES[what],
            name: nameArr[idx],
            team,
            nickname,
          });
          if (what !== 'rose') {
            record(team, what, why);
            if (PRICES[what] >= 20) bigGiftSent[team] = true;
          }
          return true;
        };
        // fervor: decays toward 0.25, rises on a hit taken, when behind, and near the end of a round
        Q.fervor += (0.25 - Q.fervor) * Math.min(1, dt / 9);
        if (Q.lengthBefore !== null && mine.L <= Q.lengthBefore - 2) {
          Q.fervor = Math.min(1, Q.fervor + 0.45);
          Q.hit = 2.5;
        }
        if (opponent.L - mine.L >= 3) Q.fervor = Math.min(1, Q.fervor + 0.05 * dt);
        if (remaining <= 20) Q.fervor = Math.max(Q.fervor, 0.8);
        Q.hit = Math.max(0, Q.hit - dt);
        Q.purse = Math.min(140, Q.purse + (RATES[density] / 60) * (0.6 + 1.2 * Q.fervor) * dt);
        for (const r in Q.cooldown) {
          const key = r as CrowdPurchase;
          Q.cooldown[key] = Math.max(0, Q.cooldown[key] - dt);
        }
        if (!mine.head || !opponent.head) {
          Q.lengthBefore = mine.L;
          return;
        }
        const headDist = abs(mine.head.x - opponent.head.x) + abs(mine.head.y - opponent.head.y);
        const reflex = Math.random() < dt * 2.2; // human pace: reactions take half a second, not a millisecond

        // 0. Full ring: if the opponent is HOLDING the ring, break the hold with a steal, urgency mode
        //    (bypasses cooldown, allows two extra steals over cap). If they have a shield, nothing to do.
        //    The team whose snake is holding the ring shields it if a shield is still available.
        if (
          opponent.hold > 0 &&
          opponent.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('steal', `holding the ring for ${opponent.hold.toFixed(1)} s`, true)
        ) {
          /* buy dispatched */
        } else if (
          mine.hold > 0 &&
          mine.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('shield', 'protect the ring hold')
        ) {
          /* buy dispatched */
        }
        // 1. life: right after a big hit, if the purse allows it
        else if (
          reflex &&
          Q.hit > 0 &&
          mine.lives === 0 &&
          !Q.cooldown.life &&
          opponent.L - mine.L >= 3 &&
          buy('life', `big hit, trailing by ${String(opponent.L - mine.L)}`)
        ) {
          /* buy dispatched */
        }
        // 2. shield: opponent head very close, or snake on its last legs
        else if (
          reflex &&
          mine.shieldTime <= 0.5 &&
          !Q.cooldown.shield &&
          (headDist <= 3 || mine.L < 5 || Q.hit > 0) &&
          buy(
            'shield',
            headDist <= 3
              ? `opponent head ${String(headDist)} cells away`
              : mine.L < 5
                ? 'snake on last legs'
                : 'just took a hit',
          )
        ) {
          /* buy dispatched */
        }
        // 3. steal: never against a shielded opponent; when they are long or to flip a close endgame
        else if (
          reflex &&
          opponent.shieldTime <= 0 &&
          opponent.invincibleTime <= 0 &&
          !Q.cooldown.steal &&
          ((opponent.L >= 10 && opponent.L >= mine.L) ||
            (remaining <= 20 && opponent.L >= mine.L && opponent.L - mine.L <= 4)) &&
          buy(
            'steal',
            remaining <= 20
              ? `end of round, gap of ${String(opponent.L - mine.L)}`
              : `opponent is long (${String(opponent.L)})`,
          )
        ) {
          /* buy dispatched */
        }
        // 4. boost: a berry both snakes can reach, the race is on
        else if (reflex && mine.boostTime <= 1 && !Q.cooldown.boost) {
          for (const berry of e.berries) {
            const dm = abs(berry.x - mine.head.x) + abs(berry.y - mine.head.y);
            const dl = abs(berry.x - opponent.head.x) + abs(berry.y - opponent.head.y);
            if (dm <= 12 && dm >= 3 && dm <= dl + 2 && dl <= dm + 5) {
              buy('boost', `berry race, ${String(dm)} vs ${String(dl)} cells`);
              break;
            }
          }
        }
        // 5. roses: feed the snake, especially when the board is empty or it is behind; keep a reserve
        Q.rose -= dt;
        const reserve = remaining <= 20 ? 0 : 22;
        if (Q.rose <= 0 && Q.purse > reserve + 1 && e.berries.length < 5) {
          if (buy('rose', ''))
            Q.rose =
              (e.berries.length < 2 || opponent.L > mine.L ? 0.9 : 2.2) *
              (0.6 + Math.random() * 0.8);
        }
        Q.lengthBefore = mine.L;
      },
    );
    // a big gift from one team spikes the other's fervor: they respond
    if (bigGiftSent.gold) teams.shadow.fervor = Math.min(1, teams.shadow.fervor + 0.25);
    if (bigGiftSent.shadow) teams.gold.fervor = Math.min(1, teams.gold.fervor + 0.25);
    return ev;
  }
  function view(): CrowdView {
    return {
      density,
      log: history.slice(),
      counts: { gold: teams.gold.count, shadow: teams.shadow.count },
      gold: {
        fervor: teams.gold.fervor,
        purse: teams.gold.purse,
        spend: teams.gold.spend,
        last: teams.gold.last,
      },
      shadow: {
        fervor: teams.shadow.fervor,
        purse: teams.shadow.purse,
        spend: teams.shadow.spend,
        last: teams.shadow.last,
      },
    };
  }
  return { configure, tick, view };
}
/* legacy-globals.d.ts types ViperCrowd with the loose GameApi; at runtime B is always ViperApi */
const crowdApi = { readState, create, PRICES };
window.ViperCrowd = crowdApi as unknown as typeof window.ViperCrowd;
