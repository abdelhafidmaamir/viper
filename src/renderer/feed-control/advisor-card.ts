/** The advisor card: this live's earnings, then what to change, each with a one-click Apply. */
import { advise, type Advice } from '../../shared/feed-advisor.ts';
import { totals } from '../../shared/feed-perf.ts';
import type { FeedCommand } from '../../shared/feed-protocol.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard } from '../control/ui/components/card.ts';
import { h, setText } from '../control/ui/dom.ts';
import { decodeBridge } from '../control/decode.ts';
import { controlsReason, type FeedControlState } from './store.ts';
import type { FeedView } from './ui.ts';

type Dispatch = (cmd: FeedCommand) => void;

const TONE_CLASS: Record<Advice['tone'], string> = {
  do: 'tone-live',
  warn: 'tone-warn',
  info: '',
};
const TONE_LABEL: Record<Advice['tone'], string> = { do: 'Do', warn: 'Check', info: 'Note' };

const fmt = (n: number, digits = 0): string =>
  n.toLocaleString('en-GB', { maximumFractionDigits: digits });

export function advisorCard(dispatch: Dispatch): FeedView {
  const summary = h('p', { class: 'card__line' });
  const history = h('p', { class: 'field__caption' });
  const list = h('div', { class: 'advice' });
  let shownKey = '';
  let buttons: ReturnType<typeof createButton>[] = [];

  const render = (advice: readonly Advice[]): void => {
    list.replaceChildren();
    buttons = [];
    if (advice.length === 0)
      list.append(
        h('p', { class: 'card__line', text: 'Nothing to change: keep this set-up running.' }),
      );
    for (const a of advice) {
      const apply = a.apply
        ? createButton({
            label: 'Apply',
            variant: a.tone === 'do' ? 'primary' : 'secondary',
            onPress: () => {
              for (const act of a.apply ?? [])
                dispatch({ cmd: 'setting', name: act.name, value: act.value });
            },
          })
        : null;
      if (apply) buttons.push(apply);
      list.append(
        h('div', { class: 'advice__item' }, [
          h('p', {
            class: `card__line ${TONE_CLASS[a.tone]}`,
            text: `${TONE_LABEL[a.tone]}: ${a.title}`,
          }),
          h('p', { class: 'field__caption', text: a.detail }),
          ...(apply ? [apply.el] : []),
        ]),
      );
    }
  };

  const card = createCard({ title: 'Advisor' }, [
    summary,
    history,
    list,
    h('p', {
      class: 'field__caption',
      text: 'Read from your own lives only. Change one setting at a time, then let it run a few hours before judging.',
    }),
  ]);

  return {
    el: card.el,
    update(state: FeedControlState) {
      const g = state.gameState,
        lock = controlsReason(state);
      for (const b of buttons) b.update({ reason: lock });
      if (!g) {
        setText(summary, 'Waiting for the game');
        return;
      }
      const segments = g.perf ?? [];
      const live = decodeBridge(g.bridge).connected;
      const last = segments[segments.length - 1];
      if (live && last) {
        const t = totals([last]);
        setText(
          summary,
          `On air with this set-up: ${fmt(t.hours * 60)} min · ${fmt(t.coins)} coins · ${fmt(t.donors)} givers · ${fmt(t.hours > 0 ? t.viewerHours / t.hours : 0, 1)} viewers avg`,
        );
      } else setText(summary, 'Off air: the advisor records while TikFinity is live.');
      const all = totals(segments);
      setText(
        history,
        `Recorded: ${fmt(all.hours, 1)} h on air · ${fmt(all.coins)} coins · ${fmt(all.moments)} giving moments · ${fmt(all.donors)} givers`,
      );
      // Advice is worked out again only when the data or the set-up changed (each minute at most).
      const s = g.settings;
      const key = `${String(segments.length)}|${String(Math.floor((last?.end ?? 0) / 60_000))}|${String(last?.moments ?? 0)}|${s.pricing}|${String(s.startFill)}|${String(s.otherGifts)}`;
      if (key === shownKey) return;
      shownKey = key;
      render(
        advise({
          segments,
          pricing: s.pricing,
          startFill: s.startFill,
          otherGifts: s.otherGifts,
          total: g.total,
        }),
      );
      for (const b of buttons) b.update({ reason: lock });
    },
  };
}
