import { useTranslation } from '@/i18n/LocaleProvider';
import { DialogContent, DialogRoot } from '@/components/ui';
import { isMacPlatform, SHORTCUTS, shortcutKeycaps } from '@/utils/keyboardShortcuts';
import { shortcutDialogProps } from './shortcutDialogProps';
import styles from './Shortcuts.module.css';

interface ShortcutCheatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read-only list of every row in `SHORTCUTS`, with the key names spoken rather than the glyphs. */
export function ShortcutCheatSheet({ open, onOpenChange }: ShortcutCheatSheetProps) {
  const t = useTranslation();
  const isMac = isMacPlatform();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...shortcutDialogProps}
        className={styles.dialog}
        title={t('shortcuts.cheatSheet.title')}
        description={t('shortcuts.cheatSheet.description')}
      >
        <ul className={styles.shortcutList}>
          {SHORTCUTS.map((shortcut) => {
            const keycaps = shortcutKeycaps(shortcut, isMac);
            return (
              <li key={shortcut.id} className={styles.shortcutRow}>
                <span className={styles.shortcutDescription}>{t(shortcut.descriptionKey)}</span>
                <span className={styles.visuallyHidden}>
                  {keycaps.map((keycap) => t(keycap.labelKey)).join(' + ')}
                </span>
                <span className={styles.keycaps} aria-hidden="true">
                  {keycaps.map((keycap) => (
                    <kbd key={keycap.labelKey} className={styles.keycap}>
                      {keycap.glyph}
                    </kbd>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </DialogRoot>
  );
}
