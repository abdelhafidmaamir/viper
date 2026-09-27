/**
 * Keyboard shortcuts: single keys for the left hand, no modifiers except Alt for tabs and Shift to
 * override a running scene. Resolution is a pure function of the key and the room's context.
 */
import { SCENES, type SceneName, type TabId } from './model.ts';

export type ShortcutAction =
  | { readonly kind: 'round' }
  | { readonly kind: 'scene'; readonly name: SceneName }
  | { readonly kind: 'escape' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'advantage'; readonly delta: number }
  | { readonly kind: 'advantage-reset' }
  | { readonly kind: 'toggle-underdog' }
  | { readonly kind: 'toggle-super-ai' }
  | { readonly kind: 'toggle-log' }
  | { readonly kind: 'tab'; readonly tab: TabId }
  | { readonly kind: 'help' };

/** The parts of a KeyboardEvent the resolver reads, plus what has focus. */
export interface KeyInput {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** Focus is in a text field or a select: typing there must never trigger an action. */
  readonly inTextField: boolean;
}

export interface ShortcutContext {
  readonly admin: boolean;
  readonly sceneRunning: boolean;
  readonly armed: boolean;
}

export const ADVANTAGE_STEP = 5;

const TAB_CODES: Readonly<Record<string, TabId>> = {
  Digit1: 'live',
  Digit2: 'setup',
  Digit3: 'rehearsal',
  Digit4: 'admin',
};

const SCENE_CODES: Readonly<Record<string, SceneName>> = Object.fromEntries(
  SCENES.map((scene) => [`Digit${scene.key}`, scene.name]),
);

/** Documented shortcuts, for the help sheet and the footer strip. */
export const SHORTCUT_SHEET: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: 'N', action: 'New round (press twice)' },
  { keys: '1 2 3 4', action: 'Scenes: Ballet, Berry race, Gold hunts, Shadow hunts' },
  { keys: 'Shift + 1..4', action: 'Replace a running scene' },
  { keys: 'Esc', action: 'Cancel a confirmation, else stop the scene' },
  { keys: '[  ]', action: 'Advantage 5 toward Shadow / Gold' },
  { keys: '0', action: 'Advantage to neutral' },
  { keys: 'U', action: 'Toggle underdog' },
  { keys: 'S', action: 'Toggle super AI' },
  { keys: 'L', action: 'Show or hide the event log' },
  { keys: 'Alt + 1..4', action: 'Switch tab' },
  { keys: '?', action: 'This sheet' },
];

function resolveAdmin(input: KeyInput, context: ShortcutContext): ShortcutAction | null {
  const scene = SCENE_CODES[input.code];
  if (scene) return context.sceneRunning && !input.shiftKey ? null : { kind: 'scene', name: scene };
  if (input.shiftKey) return null;
  if (input.key === '[' || input.code === 'BracketLeft') {
    return { kind: 'advantage', delta: -ADVANTAGE_STEP };
  }
  if (input.key === ']' || input.code === 'BracketRight') {
    return { kind: 'advantage', delta: ADVANTAGE_STEP };
  }
  if (input.code === 'Digit0' || input.code === 'Numpad0') return { kind: 'advantage-reset' };
  const letter = input.key.toLowerCase();
  if (letter === 'u') return { kind: 'toggle-underdog' };
  if (letter === 's') return { kind: 'toggle-super-ai' };
  return null;
}

export function resolveShortcut(input: KeyInput, context: ShortcutContext): ShortcutAction | null {
  if (input.ctrlKey || input.metaKey) return null;
  if (input.altKey) {
    const tab = TAB_CODES[input.code];
    if (!tab || input.shiftKey || (tab === 'admin' && !context.admin)) return null;
    return { kind: 'tab', tab };
  }
  // Esc in a text field only cancels a confirmation; it never stops a scene from there.
  if (input.key === 'Escape') {
    return input.inTextField && !context.armed ? null : { kind: 'escape' };
  }
  if (input.inTextField) return null;
  if (input.key === 'Enter') return context.armed ? { kind: 'confirm' } : null;
  if (input.key === '?') return { kind: 'help' };
  const letter = input.key.toLowerCase();
  if (letter === 'n' && !input.shiftKey) return { kind: 'round' };
  if (letter === 'l' && !input.shiftKey) return { kind: 'toggle-log' };
  return context.admin ? resolveAdmin(input, context) : null;
}
