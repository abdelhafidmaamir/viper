/** Rehearsal and Setup screens for the Feed the Snake control room. */
import { CROWD_LEVELS, type FeedCommand } from '../../shared/feed-protocol.ts';
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
const CROWD_OPTIONS = CROWD_LEVELS.map((level) => ({
  value: level,
  label: CROWD_LABELS[level],
}));

export function createRehearsalScreen(dispatch: Dispatch): FeedView {
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
      help: 'Only Rose (1 berry) and Rosa (10 berries) feed the snake.',
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
    {
      el: nearFullCard.el,
      update(state: FeedControlState) {
        nearFull.update({ reason: rehearsalReason(state) });
      },
    },
  ];

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

const SHORTCUTS_TEXT = [
  'N  New round (two-step confirm)',
  '1  Rose x1 | 2  Rose x5',
  '3  Rosa x1 | 4  Rosa x5',
  'L  Likes x25',
  'S  Cycle audience  Off / Small / Medium / Busy',
  'F  Jump near full board',
  'Alt+1/2/3  Switch tab (Live / Rehearsal / Setup)',
].join('\n');

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

export function createSetupScreen(dispatch: Dispatch, reason: Reason): FeedView {
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
  const alertsCard = createCard({ title: 'Alerts' }, [
    alerts.el,
    h('p', {
      class: 'field__caption',
      text: 'Joins, likes, shares and follows, each with its own little animation and sound.',
    }),
  ]);
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
      placeholder: 'KAPACH971 ; 210\nskohlds ; 194',
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
  const shortcutText = h('pre', { class: 'card__line', text: SHORTCUTS_TEXT });
  const helpCard = createCard({ title: 'Keyboard shortcuts' }, [shortcutText]);

  return {
    el: h('div', { class: 'screen screen--grid' }, [
      langCard.el,
      alertsCard.el,
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
