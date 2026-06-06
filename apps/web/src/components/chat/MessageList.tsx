import { ReactNode } from 'react';
import { Hash, Loader2, MessageSquare, Search } from 'lucide-react';
import { Channel, Message } from '../../api';
import { Button } from '../ui';
import styles from './MessageList.module.css';

interface MessageListProps {
  channel: Channel | null;
  messages: Message[];
  visibleMessages: Message[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  searchQuery: string;
  loadMoreMessages: () => Promise<void>;
  children: ReactNode;
}

export function MessageList({
  channel,
  messages,
  visibleMessages,
  isLoadingMessages,
  isLoadingMoreMessages,
  hasMoreMessages,
  searchQuery,
  loadMoreMessages,
  children,
}: MessageListProps) {
  return (
    <div className={styles.messageList} data-testid="message-list">
      {isLoadingMessages ? (
        <div className={styles.messageSkeletonList} aria-label="Loading messages">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className={styles.messageSkeleton}>
              <span />
              <div>
                <i />
                <b />
              </div>
            </div>
          ))}
        </div>
      ) : !channel ? (
        <div className={styles.statePanel}>
          <Hash size={24} aria-hidden="true" />
          Select a channel from the sidebar.
        </div>
      ) : messages.length === 0 ? (
        <div className={styles.statePanel}>
          <MessageSquare size={24} aria-hidden="true" />
          <strong>Welcome to #{channel.name}</strong>
          <span>This is the start of the channel.</span>
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className={styles.statePanel}>
          <Search size={24} aria-hidden="true" />
          No messages match the current search.
        </div>
      ) : (
        <>
          {hasMoreMessages && !searchQuery.trim() && (
            <div className={styles.loadMoreRow}>
              <Button
                variant="ghost"
                className={styles.loadMoreButton}
                onClick={() => void loadMoreMessages()}
                disabled={isLoadingMoreMessages}
              >
                {isLoadingMoreMessages && <Loader2 className="spin" size={16} aria-hidden="true" />}
                Load older messages
              </Button>
            </div>
          )}
          {children}
        </>
      )}
    </div>
  );
}
