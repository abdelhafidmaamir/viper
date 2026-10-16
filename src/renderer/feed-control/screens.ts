/** Rehearsal and Setup screens for the Feed the Snake control room. */
import {
  CROWD_LEVELS,
  CROWN_STYLES,
  RANKED_WELCOME_LEVELS,
  RAIN_SOUNDS,
  SLEEPER_COUNTS,
  SLEEPER_LIVES,
  SLEEPER_LOOKS,
  SNAKE_COLOURS,
  SNAKE_SKINS,
  GIFT_THANKS,
  ROUND_HOLDS,
  type CrownStyle,
  type RainSound,
  type SleeperLife,
  type SleeperLook,
  type SnakeColour,
  type SnakeSkin,
  type FeedCommand,
  type GiftThanksSetting,
} from '../../shared/feed-protocol.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard, createLockBanner } from '../control/ui/components/card.ts';
import { createSegmented } from '../control/ui/components/segmented.ts';
import { createToggle } from '../control/ui/components/toggle.ts';
import { h, setText } from '../control/ui/dom.ts';
import { rehearsalReason, resolvePending, type FeedControlState } from './store.ts';
import type { FeedView } from './ui.ts';

export { createLiveScreen } from './live.ts';

type Dispatch = (cmd: FeedCommand) => void;
type Reason = () => string | null;

const CROWD_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: 'Off',
  1: 'Small',
  2: 'Medium',
  3: 'Busy',
};
const THANKS_LABELS: Record<GiftThanksSetting, string> = {
  flower: 'Around the flower',
  tray: 'Tray',
  'tray-arc': 'Tray, arc',
  'tray-comet': 'Tray, comet',
  'tray-rings': 'Tray, rings',
  'tray-butterflies': 'Tray, butterflies',
  classic: 'Entrance',
};
const CROWN_LABELS: Record<CrownStyle, string> = {
  classic: 'Crown',
  laurel: 'Laurel wreath',
  diadem: 'Leaf tiara',
  star: 'Star',
  lotus: 'Gold lotus',
};
const SKIN_LABELS: Record<SnakeSkin, string> = {
  classic: 'Bands',
  'dark-back': 'Dark back',
};
const COLOUR_LABELS: Record<SnakeColour, string> = {
  sand: 'Sand',
  leaf: 'Leaf green',
  coral: 'Coral',
  seafoam: 'Seafoam',
  lagoon: 'Lagoon',
  lavender: 'Lavender',
  rose: 'Rose',
  pearl: 'Pearl',
};
const RAIN_LABELS: Record<RainSound, string> = {
  off: 'Off',
  leaves: 'Leaves',
  window: 'Window',
  tent: 'Tent',
  pond: 'Pond',
  pad: 'Rain and pad',
};
const LOOK_LABELS: Record<SleeperLook, string> = {
  colorFaceGreyCrab: 'Face in colour, grey crab',
  colorFaceAsleepCrab: 'In colour, sunk in sand',
  nightTint: 'Night tint',
  allGrey: 'All grey',
};
const LIFE_LABELS: Record<SleeperLife, string> = {
  shuffle: 'Shuffle',
  breathe: 'Breathe',
  twitch: 'Dream twitch',
  none: 'Still',
};
const HOLD_OPTIONS = ROUND_HOLDS.map((value) => ({ value, label: `${String(value)} s` }));
const CROWD_OPTIONS = CROWD_LEVELS.map((level) => ({
  value: level,
  label: CROWD_LABELS[level],
}));

/** Snake Arena has no board to jump near full: it passes `nearFullBoard: false`. */
export function createRehearsalScreen(
  dispatch: Dispatch,
  { nearFullBoard = true }: { readonly nearFullBoard?: boolean } = {},
): FeedView {
  const lock = createLockBanner();
  const giftButtons = [
    createButton({
      label: 'Rose ×1',
      kbd: '1',
      onPress: () => {
        dispatch({ cmd: 'gift', gift: 'rose', count: 1 });
      },
    }),
    createButton({
      label: 'Rose ×5',
      kbd: '2',
      onPress: () => {
        dispatch({ cmd: 'gift', gift: 'rose', count: 5 });
      },
    }),
    createButton({
      label: 'Rosa ×1',
      kbd: '3',
      onPress: () => {
        dispatch({ cmd: 'gift', gift: 'rosa', count: 1 });
      },
    }),
    createButton({
      label: 'Rosa ×5',
      kbd: '4',
      onPress: () => {
        dispatch({ cmd: 'gift', gift: 'rosa', count: 5 });
      },
    }),
    createButton({
      label: 'Likes ×25',
      kbd: 'L',
      onPress: () => {
        dispatch({ cmd: 'likes', count: 25 });
      },
    }),
  ] as const;
  const giftsCard = createCard(
    {
      title: 'Test gifts',
      help: 'A Rose is a 1-coin gift, a Rosa a 10-coin gift, priced as in the Money tab.',
    },
    [
      lock.el,
      h(
        'div',
        { class: 'row row--wrap' },
        giftButtons.map((b) => b.el),
      ),
    ],
  );

  const crowd = createSegmented({
    label: 'Simulated audience',
    options: CROWD_OPTIONS,
    onSelect: (value) => {
      dispatch({ cmd: 'crowd', level: value });
    },
  });
  const crowdCard = createCard({ title: 'Audience' }, [crowd.el]);

  const nearFull = createButton({
    label: 'Jump near full board',
    kbd: 'F',
    onPress: () => {
      dispatch({ cmd: 'near-full' });
    },
  });
  const nearFullCard = createCard({ title: 'Board' }, [
    nearFull.el,
    h('p', { class: 'field__caption', text: 'Rehearse the end screen.' }),
  ]);

  const views: FeedView[] = [
    {
      el: giftsCard.el,
      update(state: FeedControlState) {
        const r = rehearsalReason(state);
        lock.update(r);
        for (const b of giftButtons) b.update({ reason: r });
      },
    },
    {
      el: crowdCard.el,
      update(state: FeedControlState) {
        crowd.update({ value: state.gameState?.crowd ?? 0, reason: rehearsalReason(state) });
      },
    },
  ];
  if (nearFullBoard)
    views.push({
      el: nearFullCard.el,
      update(state: FeedControlState) {
        nearFull.update({ reason: rehearsalReason(state) });
      },
    });

  return {
    el: h(
      'div',
      { class: 'screen screen--grid' },
      views.map((v) => v.el),
    ),
    update(state) {
      for (const view of views) view.update(state);
    },
  };
}

const LANGUAGE_OPTIONS = [
  { value: 'en' as const, label: 'English' },
  { value: 'fr' as const, label: 'Francais' },
];

function shortcutsText(nearFullBoard: boolean, tabCount: 3 | 4): string {
  return [
    'N  New round (two-step confirm)',
    '1  Rose x1 | 2  Rose x5',
    '3  Rosa x1 | 4  Rosa x5',
    'L  Likes x25',
    'S  Cycle audience  Off / Small / Medium / Busy',
    ...(nearFullBoard ? ['F  Jump near full board'] : []),
    tabCount === 4
      ? 'Alt+1/2/3/4  Switch tab (Live / Rehearsal / Setup / Money)'
      : 'Alt+1/2/3  Switch tab (Live / Rehearsal / Setup)',
  ].join('\n');
}

/**
 * "name ; coins" per line, optionally "; @handle" (a tab or a comma works too); lines that do not
 * read are skipped.
 */
export function parsePastSupporters(
  text: string,
): { nickname: string; berries: number; id?: string }[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const m =
      /^(.+?)\s*[;\t,]\s*([\d\s.]+?)\s*(?:pi[eè]ces?|coins?)?\s*(?:[;\t,]\s*@?([\w.]+))?\s*$/i.exec(
        line.trim(),
      );
    const berries = m ? Number((m[2] ?? '').replace(/[\s.]/g, '')) : 0;
    const nickname = (m?.[1] ?? '').trim();
    const id = m?.[3];
    if (!nickname || !(berries > 0)) return [];
    return [{ nickname: nickname.slice(0, 60), berries, ...(id ? { id } : {}) }];
  });
}

export function createSetupScreen(
  dispatch: Dispatch,
  reason: Reason,
  {
    nearFullBoard = true,
    snakeAppearance = true,
    tabCount = 3,
  }: {
    readonly nearFullBoard?: boolean;
    readonly snakeAppearance?: boolean;
    readonly tabCount?: 3 | 4;
  } = {},
): FeedView {
  const language = createSegmented({
    label: 'Game language',
    options: LANGUAGE_OPTIONS,
    caption: 'Language of the text drawn on the stream.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'language', value });
    },
  });
  const langCard = createCard({ title: 'Language' }, [language.el]);
  const alerts = createToggle({
    label: 'Viewer alerts under the board',
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'alerts', value });
    },
  });
  const likeCount = createToggle({
    label: "Like count on the likers' animals",
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'likeCount', value });
    },
  });
  const sleepers = createSegmented({
    label: 'Sleeping crabs',
    options: SLEEPER_COUNTS.map((value) => ({ value, label: String(value) })),
    caption:
      'Sea only. Asleep on the right of the beach, each shows a viewer who has not liked yet; their like wakes them up.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'sleepers', value });
    },
  });
  const sleeperLook = createSegmented({
    label: 'Sleeping crabs look',
    options: SLEEPER_LOOKS.map((value) => ({ value, label: LOOK_LABELS[value] })),
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'sleeperLook', value });
    },
  });
  const sleeperLife = createSegmented({
    label: 'In their sleep',
    options: SLEEPER_LIVES.map((value) => ({ value, label: LIFE_LABELS[value] })),
    caption: 'Now and then, never a hop: a hop means a like.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'sleeperLife', value });
    },
  });
  const rankedWelcome = createSegmented({
    label: 'Welcome TikTok gifters',
    options: RANKED_WELCOME_LEVELS.map((value) => ({
      value,
      label: value === 0 ? 'Off' : `Level ${String(value)}+`,
    })),
    caption:
      'For a viewer who has not given here yet: a thin gold edge on their arrival card and a little more time on screen. The level itself never shows.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'rankedWelcome', value });
    },
  });
  const alertsCard = createCard({ title: 'Alerts' }, [
    alerts.el,
    h('p', {
      class: 'field__caption',
      text: 'Joins, likes, shares and follows, each with its own little animation and sound.',
    }),
    likeCount.el,
    sleepers.el,
    sleeperLook.el,
    sleeperLife.el,
    rankedWelcome.el,
  ]);
  const thanks = createSegmented({
    label: 'A gift is thanked',
    options: GIFT_THANKS.map((value) => ({ value, label: THANKS_LABELS[value] })),
    caption:
      'For someone who has given before. A first gift ever always gets the big entrance over the board.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'giftThanks', value });
    },
  });
  const thanksTitles = createToggle({
    label: 'Tray rows show the title of the day',
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'giftTitles', value });
    },
  });
  const thanksCard = createCard({ title: 'Gift thanks' }, [thanks.el, thanksTitles.el]);
  const hold = createSegmented({
    label: 'End screen stays',
    options: HOLD_OPTIONS,
    caption: 'How long the leaderboard shows before the next round starts.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'roundHold', value });
    },
  });
  const holdCard = createCard({ title: 'Round end' }, [hold.el]);
  const crownStyle = createSegmented({
    label: 'Top giver wears',
    options: CROWN_STYLES.map((value) => ({ value, label: CROWN_LABELS[value] })),
    caption: 'Over their photo on the snake, the podium, the entrances and the likers.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'crownStyle', value });
    },
  });
  const snakeSkin = createSegmented({
    label: 'Snake skin',
    options: SNAKE_SKINS.map((value) => ({ value, label: SKIN_LABELS[value] })),
    caption: 'Both keep the chevrons. Dark back trades the bands for a line down the back.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'snakeSkin', value });
    },
  });
  const board3d = createToggle({
    label: '3D board',
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'board3d', value });
    },
  });
  const snakeColour = createSegmented({
    label: 'Snake colour',
    options: SNAKE_COLOURS.map((value) => ({ value, label: COLOUR_LABELS[value] })),
    caption: 'The skin keeps its marks, in a darker shade of the colour.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'snakeColour', value });
    },
  });
  const rainSound = createSegmented({
    label: 'Rain',
    options: RAIN_SOUNDS.map((value) => ({ value, label: RAIN_LABELS[value] })),
    caption:
      'Plays while the weather is rain, under the game: it dips for every bite, gift and alert.',
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'rainSound', value });
    },
  });
  const ambienceSoundCard = createCard({ title: 'Ambience sound' }, [rainSound.el]);
  const crownCard = createCard(
    { title: 'Look' },
    snakeAppearance
      ? [
          snakeColour.el,
          snakeSkin.el,
          board3d.el,
          h('p', {
            class: 'field__caption',
            text: 'The snake and the berries in relief, with their shadows. Everything else stays as is.',
          }),
          crownStyle.el,
        ]
      : [crownStyle.el],
  );
  const journal = createButton({
    label: 'Open journal folder',
    variant: 'secondary',
    onPress: () => {
      location.assign('/__viper/journal');
    },
  });
  const journalCard = createCard({ title: 'Live journal' }, [
    h('p', {
      class: 'field__caption',
      text: 'Every live writes a spreadsheet file: each gift, follow, share and round, likes and joins every 10 s, viewers every 30 s. Open it in Excel to compare lives.',
    }),
    journal.el,
  ]);
  // Moderators TikTok does not flag: their @handles, so they get their entrance too.
  const mods = h('input', {
    class: 'input',
    attrs: {
      type: 'text',
      placeholder: '@handle, @handle',
      maxlength: '600',
      'aria-label': 'Moderators',
    },
  });
  const saveMods = createButton({
    label: 'Save moderators',
    variant: 'secondary',
    onPress: () => {
      dispatch({ cmd: 'setting', name: 'mods', value: mods.value });
    },
  });
  let modsShown = false;
  const modsCard = createCard({ title: 'Moderators' }, [
    h('p', {
      class: 'field__caption',
      text: 'Recognised by themselves when TikTok says so. Add here the @handles it misses.',
    }),
    h('div', { class: 'row row--wrap' }, [mods, saveMods.el]),
  ]);
  // Supporters from before the game kept count, pasted from TikTok's top viewers list.
  const past = h('textarea', {
    class: 'input',
    attrs: {
      rows: '6',
      placeholder: 'MAPLE482 ; 210\nriverfox ; 194',
      'aria-label': 'Past supporters',
    },
  });
  const pastDone = h('p', { class: 'field__caption' });
  const importPast = createButton({
    label: 'Import',
    variant: 'secondary',
    onPress: () => {
      const lines = parsePastSupporters(past.value);
      if (!lines.length) {
        setText(pastDone, 'One per line: name ; coins');
        return;
      }
      dispatch({ cmd: 'seed-supporters', lines });
      setText(pastDone, `${String(lines.length)} supporters imported.`);
    },
  });
  const pastCard = createCard({ title: 'Import past supporters' }, [
    h('p', {
      class: 'field__caption',
      text: "From TikTok's top viewers list (most gifts): one per line, name ; coins, and ; @handle when you know it. 1 coin = 1 berry. Without a handle, each is matched to their account by name the first time they come to a live. Importing again adds nothing twice.",
    }),
    past,
    importPast.el,
    pastDone,
  ]);
  const shortcutText = h('pre', {
    class: 'card__line',
    text: shortcutsText(nearFullBoard, tabCount),
  });
  const helpCard = createCard({ title: 'Keyboard shortcuts' }, [shortcutText]);

  return {
    el: h('div', { class: 'screen screen--grid' }, [
      langCard.el,
      alertsCard.el,
      thanksCard.el,
      holdCard.el,
      crownCard.el,
      ambienceSoundCard.el,
      modsCard.el,
      pastCard.el,
      journalCard.el,
      helpCard.el,
    ]),
    update(state) {
      const r = reason();
      const lang = resolvePending(
        state.gameState?.settings.language,
        state.pending.language,
        state.now,
      );
      language.update({
        value: lang.value as 'en' | 'fr' | undefined,
        status: lang.status,
        reason: r,
      });
      const al = resolvePending(state.gameState?.settings.alerts, state.pending.alerts, state.now);
      alerts.update({ on: al.value !== false, status: al.status, reason: r });
      const th = resolvePending(
        state.gameState?.settings.giftThanks,
        state.pending.giftThanks,
        state.now,
      );
      thanks.update({
        value: typeof th.value === 'string' ? th.value : undefined,
        status: th.status,
        reason: r,
      });
      const tt = resolvePending(
        state.gameState?.settings.giftTitles,
        state.pending.giftTitles,
        state.now,
      );
      thanksTitles.update({ on: tt.value === true, status: tt.status, reason: r });
      const lc = resolvePending(
        state.gameState?.settings.likeCount,
        state.pending.likeCount,
        state.now,
      );
      likeCount.update({ on: lc.value !== false, status: lc.status, reason: r });
      const sl = resolvePending(
        state.gameState?.settings.sleepers,
        state.pending.sleepers,
        state.now,
      );
      sleepers.update({
        value: typeof sl.value === 'number' ? sl.value : undefined,
        status: sl.status,
        reason: r,
      });
      const lk = resolvePending(
        state.gameState?.settings.sleeperLook,
        state.pending.sleeperLook,
        state.now,
      );
      sleeperLook.update({
        value: typeof lk.value === 'string' ? lk.value : undefined,
        status: lk.status,
        reason: r,
      });
      const lf = resolvePending(
        state.gameState?.settings.sleeperLife,
        state.pending.sleeperLife,
        state.now,
      );
      sleeperLife.update({
        value: typeof lf.value === 'string' ? lf.value : undefined,
        status: lf.status,
        reason: r,
      });
      const ho = resolvePending(
        state.gameState?.settings.roundHold,
        state.pending.roundHold,
        state.now,
      );
      hold.update({
        value: typeof ho.value === 'number' ? ho.value : undefined,
        status: ho.status,
        reason: r,
      });
      const cs = resolvePending(
        state.gameState?.settings.crownStyle,
        state.pending.crownStyle,
        state.now,
      );
      crownStyle.update({
        value: typeof cs.value === 'string' ? cs.value : undefined,
        status: cs.status,
        reason: r,
      });
      if (snakeAppearance) {
        const sk = resolvePending(
          state.gameState?.settings.snakeSkin,
          state.pending.snakeSkin,
          state.now,
        );
        snakeSkin.update({
          value: typeof sk.value === 'string' ? sk.value : undefined,
          status: sk.status,
          reason: r,
        });
        const sc = resolvePending(
          state.gameState?.settings.snakeColour,
          state.pending.snakeColour,
          state.now,
        );
        snakeColour.update({
          value: typeof sc.value === 'string' ? sc.value : undefined,
          status: sc.status,
          reason: r,
        });
        const b3 = resolvePending(
          state.gameState?.settings.board3d,
          state.pending.board3d,
          state.now,
        );
        board3d.update({ on: b3.value === true, status: b3.status, reason: r });
      }
      const rs = resolvePending(
        state.gameState?.settings.rainSound,
        state.pending.rainSound,
        state.now,
      );
      rainSound.update({
        value: typeof rs.value === 'string' ? rs.value : undefined,
        status: rs.status,
        reason: r,
      });
      const rw = resolvePending(
        state.gameState?.settings.rankedWelcome,
        state.pending.rankedWelcome,
        state.now,
      );
      rankedWelcome.update({
        value: typeof rw.value === 'number' ? rw.value : undefined,
        status: rw.status,
        reason: r,
      });
      saveMods.update({ reason: r });
      importPast.update({ reason: r });
      // Fill the field once with what the game remembers, then leave it to the operator.
      const saved = state.gameState?.settings.mods;
      if (!modsShown && typeof saved === 'string') {
        mods.value = saved;
        modsShown = true;
      }
    },
  };
}
