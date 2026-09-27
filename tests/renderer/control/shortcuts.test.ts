import { describe, expect, it } from 'vitest';

import {
  ADVANTAGE_STEP,
  resolveShortcut,
  type KeyInput,
  type ShortcutContext,
} from '../../../src/renderer/control/shortcuts.ts';

function key(k: string, code: string, extra: Partial<KeyInput> = {}): KeyInput {
  return {
    key: k,
    code,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    inTextField: false,
    ...extra,
  };
}

const ADMIN: ShortcutContext = { admin: true, sceneRunning: false, armed: false };
const PUBLIC: ShortcutContext = { admin: false, sceneRunning: false, armed: false };

describe('resolveShortcut', () => {
  it('maps the single keys', () => {
    expect(resolveShortcut(key('n', 'KeyN'), PUBLIC)).toEqual({ kind: 'round' });
    expect(resolveShortcut(key('N', 'KeyN'), PUBLIC)).toEqual({ kind: 'round' });
    expect(resolveShortcut(key('N', 'KeyN', { shiftKey: true }), PUBLIC)).toBeNull();
    expect(resolveShortcut(key('l', 'KeyL'), PUBLIC)).toEqual({ kind: 'toggle-log' });
    expect(resolveShortcut(key('?', 'Slash', { shiftKey: true }), PUBLIC)).toEqual({
      kind: 'help',
    });
    expect(resolveShortcut(key('u', 'KeyU'), ADMIN)).toEqual({ kind: 'toggle-underdog' });
    expect(resolveShortcut(key('s', 'KeyS'), ADMIN)).toEqual({ kind: 'toggle-super-ai' });
    expect(resolveShortcut(key('0', 'Digit0'), ADMIN)).toEqual({ kind: 'advantage-reset' });
    expect(resolveShortcut(key('[', 'BracketLeft'), ADMIN)).toEqual({
      kind: 'advantage',
      delta: -ADVANTAGE_STEP,
    });
    expect(resolveShortcut(key(']', 'BracketRight'), ADMIN)).toEqual({
      kind: 'advantage',
      delta: ADVANTAGE_STEP,
    });
  });

  it('gates director keys behind admin', () => {
    expect(resolveShortcut(key('1', 'Digit1'), PUBLIC)).toBeNull();
    expect(resolveShortcut(key('u', 'KeyU'), PUBLIC)).toBeNull();
    expect(resolveShortcut(key('[', 'BracketLeft'), PUBLIC)).toBeNull();
    expect(resolveShortcut(key('1', 'Digit1'), ADMIN)).toEqual({ kind: 'scene', name: 'ballet' });
    expect(resolveShortcut(key('4', 'Digit4'), ADMIN)).toEqual({
      kind: 'scene',
      name: 'huntShadow',
    });
  });

  it('ignores scene keys while a scene runs unless Shift is held', () => {
    const running = { ...ADMIN, sceneRunning: true };
    expect(resolveShortcut(key('2', 'Digit2'), running)).toBeNull();
    expect(resolveShortcut(key('"', 'Digit2', { shiftKey: true }), running)).toEqual({
      kind: 'scene',
      name: 'race',
    });
  });

  it('suppresses everything but Escape and Alt tabs in text fields', () => {
    const typing = { inTextField: true };
    expect(resolveShortcut(key('n', 'KeyN', typing), ADMIN)).toBeNull();
    expect(resolveShortcut(key('1', 'Digit1', typing), ADMIN)).toBeNull();
    expect(resolveShortcut(key('Enter', 'Enter', typing), { ...ADMIN, armed: true })).toBeNull();
    expect(resolveShortcut(key('Escape', 'Escape', typing), ADMIN)).toBeNull();
    expect(resolveShortcut(key('Escape', 'Escape', typing), { ...ADMIN, armed: true })).toEqual({
      kind: 'escape',
    });
    expect(resolveShortcut(key('2', 'Digit2', { ...typing, altKey: true }), ADMIN)).toEqual({
      kind: 'tab',
      tab: 'setup',
    });
  });

  it('confirms with Enter only when something is armed', () => {
    expect(resolveShortcut(key('Enter', 'Enter'), ADMIN)).toBeNull();
    expect(resolveShortcut(key('Enter', 'Enter'), { ...ADMIN, armed: true })).toEqual({
      kind: 'confirm',
    });
  });

  it('switches tabs with Alt, the admin tab only in admin mode', () => {
    expect(resolveShortcut(key('1', 'Digit1', { altKey: true }), PUBLIC)).toEqual({
      kind: 'tab',
      tab: 'live',
    });
    expect(resolveShortcut(key('4', 'Digit4', { altKey: true }), PUBLIC)).toBeNull();
    expect(resolveShortcut(key('4', 'Digit4', { altKey: true }), ADMIN)).toEqual({
      kind: 'tab',
      tab: 'admin',
    });
  });

  it('leaves Ctrl and Meta chords to the system', () => {
    expect(resolveShortcut(key('n', 'KeyN', { ctrlKey: true }), ADMIN)).toBeNull();
    expect(resolveShortcut(key('l', 'KeyL', { metaKey: true }), ADMIN)).toBeNull();
  });
});
