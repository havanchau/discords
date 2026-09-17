import { SHORTCUT_DIALOG_ATTRIBUTE } from '@/utils/keyboardShortcuts';

/** Spread onto the shortcut dialogs so the shortcut registry does not treat them as foreign overlays. */
export const shortcutDialogProps = { [SHORTCUT_DIALOG_ATTRIBUTE]: '' } as const;
