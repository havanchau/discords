import type { MessageKey } from '@/i18n/LocaleProvider';

export type ShortcutId =
  | 'quickSwitcher'
  | 'cheatSheet'
  | 'previousChannel'
  | 'nextChannel'
  | 'previousUnread'
  | 'nextUnread'
  | 'markRead';

export type ShortcutKey = 'k' | '/' | 'ArrowUp' | 'ArrowDown' | 'Escape';

export interface ShortcutDefinition {
  id: ShortcutId;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod: boolean;
  alt: boolean;
  shift: boolean;
  /** Compared with `KeyboardEvent.key`, case-insensitively. */
  key: ShortcutKey;
  /** Layouts that need Shift to produce the key (for example `/` on a German layout) still match. */
  ignoreShift: boolean;
  descriptionKey: MessageKey;
  /** Fires while focus is in a text field. Only combos that never produce text may set this. */
  whileTyping: boolean;
  /** Fires while a dialog, popover or menu other than the shortcut dialogs is open. */
  overDialogs: boolean;
  /** Fires again for auto-repeated keydowns while the key is held. */
  repeatable: boolean;
}

/** The one table of global shortcuts. A new global shortcut is a row here, not a new listener. */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'quickSwitcher',
    mod: true,
    alt: false,
    shift: false,
    key: 'k',
    ignoreShift: false,
    descriptionKey: 'shortcuts.quickSwitcher',
    whileTyping: true,
    overDialogs: false,
    repeatable: false,
  },
  {
    id: 'cheatSheet',
    mod: true,
    alt: false,
    shift: false,
    key: '/',
    ignoreShift: true,
    descriptionKey: 'shortcuts.cheatSheet',
    whileTyping: true,
    overDialogs: true,
    repeatable: false,
  },
  {
    id: 'previousChannel',
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowUp',
    ignoreShift: false,
    descriptionKey: 'shortcuts.previousChannel',
    whileTyping: false,
    overDialogs: false,
    repeatable: true,
  },
  {
    id: 'nextChannel',
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    ignoreShift: false,
    descriptionKey: 'shortcuts.nextChannel',
    whileTyping: false,
    overDialogs: false,
    repeatable: true,
  },
  {
    id: 'previousUnread',
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowUp',
    ignoreShift: false,
    descriptionKey: 'shortcuts.previousUnread',
    whileTyping: false,
    overDialogs: false,
    repeatable: true,
  },
  {
    id: 'nextUnread',
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowDown',
    ignoreShift: false,
    descriptionKey: 'shortcuts.nextUnread',
    whileTyping: false,
    overDialogs: false,
    repeatable: true,
  },
  {
    id: 'markRead',
    mod: false,
    alt: false,
    shift: false,
    key: 'Escape',
    ignoreShift: false,
    descriptionKey: 'shortcuts.markRead',
    whileTyping: false,
    overDialogs: false,
    repeatable: false,
  },
];

/** Marks the shortcut dialogs so the overlay check does not count them as someone else's dialog. */
export const SHORTCUT_DIALOG_ATTRIBUTE = 'data-shortcut-dialog';

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition,
  isMac: boolean,
): boolean {
  const modPressed = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const noModPressed = !event.metaKey && !event.ctrlKey;
  if (shortcut.mod ? !modPressed : !noModPressed) return false;
  if (event.altKey !== shortcut.alt) return false;
  if (!shortcut.ignoreShift && event.shiftKey !== shortcut.shift) return false;
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'url',
  'tel',
  'number',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
]);

/** True when focus is somewhere keystrokes produce text or move a caret or a native selection. */
export function isTypingTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type);
  const role = element.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

/**
 * True while a dialog, popover or menu that is not one of the shortcut dialogs is open. Radix keeps
 * a closing layer mounted with `data-state="closed"` during its exit animation, so those are ignored.
 */
export function hasForeignOverlay(): boolean {
  return Boolean(
    document.querySelector(
      [
        `[role="dialog"]:not([${SHORTCUT_DIALOG_ATTRIBUTE}]):not([data-state="closed"])`,
        '[role="alertdialog"]:not([data-state="closed"])',
        '[role="menu"]:not([data-state="closed"])',
      ].join(', '),
    ),
  );
}

export interface ShortcutKeycap {
  /** What is drawn on the keycap. */
  glyph: string;
  /** Catalog key for the spoken name of the key. */
  labelKey: MessageKey;
}

export function shortcutKeycaps(shortcut: ShortcutDefinition, isMac: boolean): ShortcutKeycap[] {
  const keycaps: ShortcutKeycap[] = [];
  if (shortcut.mod) {
    keycaps.push(
      isMac
        ? { glyph: '⌘', labelKey: 'shortcuts.key.command' }
        : { glyph: 'Ctrl', labelKey: 'shortcuts.key.control' },
    );
  }
  if (shortcut.alt) {
    keycaps.push(
      isMac
        ? { glyph: '⌥', labelKey: 'shortcuts.key.option' }
        : { glyph: 'Alt', labelKey: 'shortcuts.key.alt' },
    );
  }
  if (shortcut.shift) {
    keycaps.push({ glyph: isMac ? '⇧' : 'Shift', labelKey: 'shortcuts.key.shift' });
  }
  keycaps.push(mainKeycap(shortcut.key));
  return keycaps;
}

function mainKeycap(key: ShortcutKey): ShortcutKeycap {
  switch (key) {
    case 'k':
      return { glyph: 'K', labelKey: 'shortcuts.key.k' };
    case 'ArrowUp':
      return { glyph: '↑', labelKey: 'shortcuts.key.up' };
    case 'ArrowDown':
      return { glyph: '↓', labelKey: 'shortcuts.key.down' };
    case 'Escape':
      return { glyph: 'Esc', labelKey: 'shortcuts.key.escape' };
    case '/':
      return { glyph: '/', labelKey: 'shortcuts.key.slash' };
  }
}
