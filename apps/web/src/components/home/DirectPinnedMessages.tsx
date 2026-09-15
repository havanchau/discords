import { Loader2, Pin } from 'lucide-react';
import type { DirectMessage } from '../../api';
import { formatDate } from '../../helpers';
import { IconButton, PopoverContent, PopoverRoot, PopoverTrigger } from '../ui';
import styles from './HomePanel.module.css';

type DirectPinnedMessagesProps = {
  pinnedMessages: DirectMessage[];
  isLoading: boolean;
  error: string | null;
  onOpen: () => void;
  onJumpToMessage: (messageId: string) => void;
};

export function DirectPinnedMessages({
  pinnedMessages,
  isLoading,
  error,
  onOpen,
  onJumpToMessage,
}: DirectPinnedMessagesProps) {
  return (
    <PopoverRoot onOpenChange={(open) => open && onOpen()}>
      <PopoverTrigger asChild>
        <IconButton label="Pinned messages">
          <Pin size={18} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom">
        <div className={styles.pinnedPanel} aria-label="Pinned messages">
          <strong className={styles.pinnedTitle}>Pinned messages</strong>
          {isLoading ? (
            <p className={styles.pinnedState} role="status">
              <Loader2 className="spin" size={16} aria-hidden="true" /> Loading pinned messages
            </p>
          ) : error ? (
            <p className={styles.pinnedState} role="alert">
              {error}
            </p>
          ) : pinnedMessages.length ? (
            <ul className={styles.pinnedList}>
              {pinnedMessages.map((message) => (
                <li key={message.id}>
                  <button type="button" onClick={() => onJumpToMessage(message.id)}>
                    <strong>{message.author?.displayName ?? 'Message'}</strong>
                    <small>{formatDate(message.createdAt)}</small>
                    <span>{message.content}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.pinnedState}>No pinned messages yet.</p>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
