/** Money screen: the gift price list, and the advisor that reads past lives to tune it. */
import {
  cellsToFill,
  formatPricing,
  normalizePricing,
  panelText,
  parsePricing,
  pricingWarnings,
  PRICE_TIERS_MAX,
  PRICING_PRESETS,
  type PriceTier,
} from '../../shared/feed-pricing.ts';
import type { FeedCommand } from '../../shared/feed-protocol.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard } from '../control/ui/components/card.ts';
import { createToggle } from '../control/ui/components/toggle.ts';
import { h, setHidden, setText } from '../control/ui/dom.ts';
import { advisorCard } from './advisor-card.ts';
import { controlsReason, rehearsalReason, resolvePending, type FeedControlStore } from './store.ts';
import type { FeedView } from './ui.ts';

type Dispatch = (cmd: FeedCommand) => void;

const pct = (share: number): string =>
  share < 0.01
    ? `${(share * 100).toFixed(1)}% of a round`
    : share >= 1
      ? `ends the round (x${share.toFixed(1)})`
      : `${String(Math.round(share * 100))}% of a round`;

/** One editable line of the list: a price in coins and the berries it drops. */
function tierRow(dispatch: Dispatch): {
  el: HTMLElement;
  coins: HTMLInputElement;
  berries: HTMLInputElement;
  info: HTMLElement;
  test: ReturnType<typeof createButton>;
} {
  const coins = h('input', {
    class: 'input',
    attrs: { type: 'number', min: '1', max: '50000', placeholder: 'coins', 'aria-label': 'Coins' },
  });
  const berries = h('input', {
    class: 'input',
    attrs: {
      type: 'number',
      min: '0',
      max: '100000',
      placeholder: 'berries',
      'aria-label': 'Berries',
    },
  });
  const info = h('span', { class: 'field__caption tier__info' });
  // A rehearsal gift at this line's price, to see it drop.
  const test = createButton({
    label: 'Test',
    variant: 'secondary',
    onPress: () => {
      const price = Math.round(Number(coins.value));
      if (price >= 1) dispatch({ cmd: 'gift', gift: 'rose', count: 1, coins: price });
    },
  });
  const el = h('div', { class: 'tier' }, [
    coins,
    h('span', { class: 'field__caption', text: 'coins  →' }),
    berries,
    h('span', { class: 'field__caption', text: 'berries' }),
    test.el,
    info,
  ]);
  return { el, coins, berries, info, test };
}

function pricingCard(store: FeedControlStore, dispatch: Dispatch): FeedView {
  const rows = Array.from({ length: PRICE_TIERS_MAX }, () => tierRow(dispatch));
  /** The operator is typing: the fields stop following the game until applied or reset. */
  let editing = false;
  let shown = '';
  const status = h('p', { class: 'field__caption', attrs: { role: 'status' } });
  const warnings = h('p', { class: 'card__line tone-warn' });

  const typed = (): PriceTier[] | null => {
    const lines = rows
      .filter((r) => r.coins.value.trim() !== '' || r.berries.value.trim() !== '')
      .map((r) => `${r.coins.value.trim()}:${r.berries.value.trim()}`);
    return parsePricing(lines.join(','));
  };
  const fill = (pricing: string): void => {
    const tiers = parsePricing(pricing) ?? [];
    rows.forEach((r, i) => {
      const t = tiers[i];
      r.coins.value = t ? String(t.coins) : '';
      r.berries.value = t ? String(t.berries) : '';
    });
    shown = pricing;
    editing = false;
  };
  const send = (pricing: string): void => {
    const clean = normalizePricing(pricing);
    if (!clean) return;
    dispatch({ cmd: 'setting', name: 'pricing', value: clean });
    fill(clean);
  };
  for (const r of rows) {
    for (const input of [r.coins, r.berries])
      input.addEventListener('input', () => {
        editing = true;
      });
  }

  const apply = createButton({
    label: 'Apply price list',
    variant: 'primary',
    onPress: () => {
      const tiers = typed();
      if (!tiers) {
        setText(status, 'A line is not right: whole numbers, coins from 1, at most 4 lines.');
        return;
      }
      send(formatPricing(tiers));
    },
  });
  const reset = createButton({
    label: 'Undo edits',
    variant: 'secondary',
    onPress: () => {
      fill(store.get().gameState?.settings.pricing ?? '');
    },
  });
  const presets = PRICING_PRESETS.map((p) =>
    createButton({
      label: p.label,
      variant: 'secondary',
      onPress: () => {
        send(p.pricing);
      },
    }),
  );
  const presetHint = h(
    'div',
    {},
    PRICING_PRESETS.map((p) =>
      h('p', { class: 'field__caption', text: `${p.label} (${p.pricing}): ${p.hint}` }),
    ),
  );
  const others = createToggle({
    label: 'Other gifts count too',
    caption: 'A gift at a price not in the list drops berries at the closest lower line’s rate.',
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'otherGifts', value });
    },
  });

  const card = createCard({ title: 'Gift prices' }, [
    h('p', {
      class: 'field__caption',
      text: 'Gift price in coins → berries it drops. Applies to the next gift, live or not. Change the LIVE Studio gift panel text at the same time.',
    }),
    h(
      'div',
      { class: 'row row--wrap' },
      presets.map((b) => b.el),
    ),
    presetHint,
    ...rows.map((r) => r.el),
    h('div', { class: 'row' }, [apply.el, reset.el]),
    status,
    warnings,
    others.el,
  ]);

  return {
    el: card.el,
    update(state) {
      const lock = controlsReason(state),
        rehearsal = rehearsalReason(state),
        s = state.gameState?.settings;
      apply.update({ reason: lock });
      reset.update({ reason: lock });
      for (const b of presets) b.update({ reason: lock });
      const p = resolvePending(s?.pricing, state.pending.pricing, state.now);
      const live = typeof s?.pricing === 'string' ? s.pricing : '';
      if (!editing && live && live !== shown && p.status === 'idle') fill(live);
      const o = resolvePending(s?.otherGifts, state.pending.otherGifts, state.now);
      others.update({ on: o.value === true, status: o.status, reason: lock });

      const tiers = parsePricing(live) ?? [];
      const toFill = cellsToFill(state.gameState?.total ?? 900, s?.startFill ?? 0);
      rows.forEach((r, i) => {
        const t = tiers[i];
        r.test.update({ reason: rehearsal ?? (r.coins.value ? null : 'Empty line') });
        setText(
          r.info,
          t && !editing
            ? `${(t.berries / t.coins).toFixed(1)}/coin · ${pct(t.berries / toFill)} · panel: “${panelText(t.berries)}”`
            : '',
        );
      });
      setText(
        status,
        p.status === 'pending'
          ? 'Sending…'
          : p.status === 'error'
            ? 'The game did not take it.'
            : editing
              ? 'Edited, not applied yet.'
              : `In use: ${live || '…'} · a round needs ${String(toFill)} berries at this start length.`,
      );
      const w = pricingWarnings(tiers);
      setText(warnings, w.join(' '));
      setHidden(warnings, w.length === 0);
    },
  };
}

export function createMoneyScreen(store: FeedControlStore, dispatch: Dispatch): FeedView {
  const pricing = pricingCard(store, dispatch);
  const advisor = advisorCard(dispatch);
  return {
    el: h('div', { class: 'screen screen--money' }, [pricing.el, advisor.el]),
    update(state) {
      pricing.update(state);
      advisor.update(state);
    },
  };
}
