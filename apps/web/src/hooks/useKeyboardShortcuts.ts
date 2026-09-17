import { useEffect, useEffectEvent } from 'react';
import {
  hasForeignOverlay,
  isMacPlatform,
  isTypingTarget,
  matchesShortcut,
  SHORTCUTS,
  type ShortcutId,
} from '@/utils/keyboardShortcuts';

/** Returns true when the shortcut did something, so the browser default is suppressed. */
export type ShortcutHandlers = Record<ShortcutId, () => boolean>;

/**
 * The single window-level keydown listener for global shortcuts (`SHORTCUTS`). Mount it once.
 *
 * A keydown is ignored when a closer handler already claimed it (`defaultPrevented`: Radix closing a
 * dialog or menu on Escape, a list moving its own selection), during IME composition, and for any
 * shortcut whose table row does not allow the current focus (typing) or an open foreign overlay.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const dispatch = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    const isMac = isMacPlatform();
    const shortcut = SHORTCUTS.find((item) => matchesShortcut(event, item, isMac));
    if (!shortcut) return;
    if (event.repeat && !shortcut.repeatable) {
      // Holding a toggle combo must not flicker its dialog, and the browser must not act either.
      if (shortcut.mod) event.preventDefault();
      return;
    }
    if (!shortcut.whileTyping && isTypingTarget(document.activeElement)) return;
    if (!shortcut.overDialogs && hasForeignOverlay()) {
      // A Cmd/Ctrl combo stays claimed by the app so the browser does not act behind the dialog.
      if (shortcut.mod) event.preventDefault();
      return;
    }
    const handled = handlers[shortcut.id]();
    if (handled || shortcut.mod) event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => dispatch(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
