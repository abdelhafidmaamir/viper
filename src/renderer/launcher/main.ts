// Launcher: pick a game mode, then navigate to open it.
import './launcher.css';
import { h } from '../control/ui/dom.ts';
import { mountDuelPreview, mountFeedPreview } from './previews.ts';

type Mode = 'duel' | 'feed';

interface CardDef {
  readonly mode: Mode;
  readonly title: string;
  readonly desc: string;
  readonly key: string;
}

const CARDS: readonly CardDef[] = [
  {
    mode: 'duel',
    title: 'Duel',
    desc: 'Two snakes, two teams. Roses feed Gold, every other gift feeds Shadow.',
    key: '1',
  },
  {
    mode: 'feed',
    title: 'Feed the Snake',
    desc: 'The whole room feeds one snake until it fills the board. Rose = 1 berry, Rosa = 10.',
    key: '2',
  },
];

function readLastMode(): Mode | null {
  try {
    const v = localStorage.getItem('viper-last-mode');
    if (v === 'duel' || v === 'feed') return v;
  } catch {
    // storage may be unavailable
  }
  return null;
}

function saveLastMode(mode: Mode): void {
  try {
    localStorage.setItem('viper-last-mode', mode);
  } catch {
    // ignore
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let activated = false;

function openMode(mode: Mode, allBtns: HTMLButtonElement[], chosenBtn: HTMLButtonElement): void {
  if (activated) return;
  activated = true;
  for (const btn of allBtns) {
    btn.disabled = true;
  }
  const label = chosenBtn.textContent;
  chosenBtn.textContent = 'Opening…';
  saveLastMode(mode);
  location.assign(`/__viper/open?mode=${mode}`);
  // The launcher closes once the mode is open; if it is still here, opening failed: allow a retry.
  setTimeout(() => {
    activated = false;
    for (const btn of allBtns) btn.disabled = false;
    chosenBtn.textContent = label;
  }, 10000);
}

interface CardEntry {
  card: HTMLElement;
  canvas: HTMLCanvasElement;
  btn: HTMLButtonElement;
  mode: Mode;
}

function buildCard(
  def: CardDef,
  isLast: boolean,
  isHighlighted: boolean,
  reducedMotion: boolean,
  onChoose: (btn: HTMLButtonElement) => void,
): CardEntry {
  const canvas = document.createElement('canvas');

  const previewWrap = h('div', { class: 'preview-wrap' });
  previewWrap.append(canvas);

  if (isLast) {
    const badge = h('div', { class: 'last-badge', text: 'Last played' });
    previewWrap.append(badge);
  }

  const titleRow = h('div', { class: 'card-title-row' }, [
    h('h2', { class: 'card-title', text: def.title }),
    h('kbd', { text: def.key }),
  ]);

  const desc = h('p', { class: 'card-desc', text: def.desc });

  const btn = document.createElement('button');
  btn.className = 'play-btn';
  btn.textContent = 'Play';
  btn.addEventListener('click', () => {
    onChoose(btn);
  });

  const cardBody = h('div', { class: 'card-body' }, [titleRow, desc, btn]);

  const card = h('article', { class: `mode-card${isHighlighted ? ' highlighted' : ''}` }, [
    previewWrap,
    cardBody,
  ]);

  if (isHighlighted) {
    card.dataset.keyhl = '1';
  }

  if (!reducedMotion) {
    card.addEventListener('mouseenter', () => {
      card.classList.add('highlighted');
    });
    card.addEventListener('mouseleave', () => {
      // only remove if not the keyboard-highlighted one
      if (card.dataset.keyhl !== '1') {
        card.classList.remove('highlighted');
      }
    });
  }

  return { card, canvas, btn, mode: def.mode };
}

function mount(root: HTMLElement): void {
  const lastMode = readLastMode();
  const reducedMotion = prefersReducedMotion();

  const defaultHighlight: Mode = lastMode ?? 'duel';

  const header = h('header', { class: 'launcher-header' }, [
    h('h1', { class: 'wordmark', text: 'VIPER' }),
    h('p', { class: 'subtitle', text: 'Choose a game mode' }),
  ]);

  const entries: CardEntry[] = [];
  const allBtns: HTMLButtonElement[] = [];
  const cardsRow = h('div', { class: 'cards' });

  for (const def of CARDS) {
    const isLast = def.mode === lastMode;
    const isHighlighted = def.mode === defaultHighlight;
    const entry = buildCard(def, isLast, isHighlighted, reducedMotion, (b) => {
      openMode(def.mode, allBtns, b);
    });
    entries.push(entry);
    allBtns.push(entry.btn);
    cardsRow.append(entry.card);
  }

  const footer = h('footer', { class: 'launcher-footer' }, [
    h('p', { text: 'Close this window to quit.' }),
  ]);

  root.append(header, cardsRow, footer);

  // Mount canvas previews
  for (const entry of entries) {
    if (entry.mode === 'duel') {
      mountDuelPreview(entry.canvas, reducedMotion);
    } else {
      mountFeedPreview(entry.canvas, reducedMotion);
    }
  }

  // Keyboard navigation
  let highlightIdx = entries.findIndex((e) => e.mode === defaultHighlight);
  if (highlightIdx < 0) highlightIdx = 0;

  function updateHighlight(idx: number): void {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const on = i === idx;
      entry.card.classList.toggle('highlighted', on);
      entry.card.dataset.keyhl = on ? '1' : '0';
    }
    highlightIdx = idx;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === '1') {
      event.preventDefault();
      updateHighlight(0);
      const e = entries[0];
      if (e) openMode('duel', allBtns, e.btn);
    } else if (event.key === '2') {
      event.preventDefault();
      updateHighlight(1);
      const e = entries[1];
      if (e) openMode('feed', allBtns, e.btn);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      updateHighlight((highlightIdx - 1 + entries.length) % entries.length);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      updateHighlight((highlightIdx + 1) % entries.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[highlightIdx];
      if (entry) openMode(entry.mode, allBtns, entry.btn);
    }
  });

  // Set initial focus on highlighted card's button
  const focusTarget = entries[highlightIdx]?.btn;
  if (focusTarget) {
    requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
    });
  }
}

const root = document.getElementById('app');
if (root) mount(root);
