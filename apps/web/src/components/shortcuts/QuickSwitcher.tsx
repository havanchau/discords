import {
  Hash,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Search,
  Server,
  Users,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Badge, DialogContent, DialogRoot, TextField } from '@/components/ui';
import { cn } from '@/utils/cn';
import { shortcutDialogProps } from './shortcutDialogProps';
import { filterQuickSwitcherEntries, type QuickSwitcherEntry } from './quickSwitcherEntries';
import styles from './Shortcuts.module.css';

interface QuickSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: QuickSwitcherEntry[];
  onSelect: (entry: QuickSwitcherEntry) => void;
}

export function QuickSwitcher({ open, onOpenChange, entries, onSelect }: QuickSwitcherProps) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...shortcutDialogProps}
        className={styles.dialog}
        bodyClassName={styles.body}
        title={t('shortcuts.switcher.title')}
        description={t('shortcuts.switcher.description')}
        onOpenAutoFocus={(event) => {
          // The close button comes first in the dialog; the search field is what the user wants.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Mounted only while open, so every opening starts from an empty query. */}
        <QuickSwitcherSearch inputRef={inputRef} entries={entries} onSelect={onSelect} />
      </DialogContent>
    </DialogRoot>
  );
}

interface QuickSwitcherSearchProps {
  inputRef: RefObject<HTMLInputElement | null>;
  entries: QuickSwitcherEntry[];
  onSelect: (entry: QuickSwitcherEntry) => void;
}

function QuickSwitcherSearch({ inputRef, entries, onSelect }: QuickSwitcherSearchProps) {
  const t = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => filterQuickSwitcherEntries(entries, query), [entries, query]);
  const activeEntry = results[Math.min(activeIndex, results.length - 1)];
  const optionId = (entry: QuickSwitcherEntry) => `${listId}-${entry.key}`;
  const activeOptionId = activeEntry ? optionId(activeEntry) : undefined;

  // The highlighted option follows the arrow keys while focus stays in the search field.
  useEffect(() => {
    if (activeOptionId)
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => Math.max(0, Math.min(results.length - 1, index + delta)));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeEntry) onSelect(activeEntry);
    }
  }

  return (
    <>
      <TextField
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={t('shortcuts.switcher.search')}
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('shortcuts.switcher.placeholder')}
        leadingIcon={<Search size={16} aria-hidden="true" />}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <p className={styles.visuallyHidden} aria-live="polite">
        {results.length
          ? t('shortcuts.switcher.results', { count: results.length })
          : t('shortcuts.switcher.empty')}
      </p>
      {results.length ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('shortcuts.switcher.title')}
          className={styles.results}
        >
          {results.map((entry) => (
            <li
              key={entry.key}
              id={optionId(entry)}
              role="option"
              aria-selected={entry === activeEntry}
              className={cn(styles.option, entry === activeEntry && styles.optionActive)}
              onMouseMove={() => setActiveIndex(results.indexOf(entry))}
              onClick={() => onSelect(entry)}
            >
              <span className={styles.optionIcon} aria-hidden="true">
                <EntryIcon entry={entry} />
              </span>
              <span className={styles.optionLabel}>{entry.label}</span>
              <span className={styles.optionMeta}>{entryMeta(entry, t)}</span>
              {entry.kind !== 'server' && entry.unread > 0 ? (
                <Badge aria-label={t('shortcuts.switcher.unread', { count: entry.unread })}>
                  {entry.unread}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        // The live region above already announces this.
        <p className={styles.empty} aria-hidden="true">
          {t('shortcuts.switcher.empty')}
        </p>
      )}
    </>
  );
}

function EntryIcon({ entry }: { entry: QuickSwitcherEntry }) {
  if (entry.kind === 'server') return <Server size={16} />;
  if (entry.kind === 'conversation') {
    return entry.conversation.isGroup ? <Users size={16} /> : <MessageCircle size={16} />;
  }
  if (entry.channel.type === 'ANNOUNCEMENT') return <Megaphone size={16} />;
  return entry.channel.type === 'FORUM' ? <MessagesSquare size={16} /> : <Hash size={16} />;
}

function entryMeta(entry: QuickSwitcherEntry, t: ReturnType<typeof useTranslation>) {
  if (entry.kind === 'server') return t('shortcuts.switcher.server');
  if (entry.kind === 'conversation') {
    return entry.conversation.isGroup
      ? t('shortcuts.switcher.group')
      : t('shortcuts.switcher.conversation');
  }
  return entry.channel.type === 'FORUM'
    ? t('shortcuts.switcher.forumIn', { server: entry.serverName })
    : t('shortcuts.switcher.channelIn', { server: entry.serverName });
}
