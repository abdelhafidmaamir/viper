/** Rehearsal and Setup screens for the Feed the Snake control room. */
import { CROWD_LEVELS, type FeedCommand } from '../../shared/feed-protocol.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard, createLockBanner } from '../control/ui/components/card.ts';
import { createSegmented } from '../control/ui/components/segmented.ts';
import { createToggle } from '../control/ui/components/toggle.ts';
import { h } from '../control/ui/dom.ts';
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
  const shortcutText = h('pre', { class: 'card__line', text: SHORTCUTS_TEXT });
  const helpCard = createCard({ title: 'Keyboard shortcuts' }, [shortcutText]);

  return {
    el: h('div', { class: 'screen screen--grid' }, [langCard.el, alertsCard.el, helpCard.el]),
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
    },
  };
}
