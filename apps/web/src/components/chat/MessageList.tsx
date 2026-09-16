import { ReactNode, Ref, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Hash, Loader2, MessageSquare, Search } from 'lucide-react';
import { Channel, Message } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button } from '@/components/ui';
import styles from './MessageList.module.css';

// Typical single-line row; real heights are measured after render.
const ESTIMATED_ROW_HEIGHT = 56;
const OVERSCAN_ROWS = 8;
const JUMP_HIGHLIGHT_MS = 1400;
const JUMP_RENDER_ATTEMPTS = 10;

export interface MessageListHandle {
  /** Scrolls a message of the visible list into view, then focuses and highlights it. */
  scrollToMessage: (messageId: string) => void;
}

interface MessageListProps {
  channel: Channel | null;
  messages: Message[];
  visibleMessages: Message[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  searchQuery: string;
  loadMoreMessages: () => Promise<void>;
  renderMessage: (message: Message, index: number) => ReactNode;
  ref?: Ref<MessageListHandle>;
}

// Rows outside the overscan window are not in the DOM, so wait a few frames for the target to mount.
function focusMessageWhenRendered(messageId: string, attemptsLeft = JUMP_RENDER_ATTEMPTS) {
  const target = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!target) {
    if (attemptsLeft > 0) {
      window.requestAnimationFrame(() => focusMessageWhenRendered(messageId, attemptsLeft - 1));
    }
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
  target.dataset.jumpHighlight = 'true';
  window.setTimeout(() => {
    delete target.dataset.jumpHighlight;
  }, JUMP_HIGHLIGHT_MS);
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
  renderMessage,
  ref,
}: MessageListProps) {
  const t = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [rowsOffset, setRowsOffset] = useState(0);
  const hasSearch = Boolean(searchQuery.trim());

  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => visibleMessages[index].id,
    overscan: OVERSCAN_ROWS,
    scrollMargin: rowsOffset,
    // Keeps the row being read in place when older messages are prepended.
    anchorTo: 'end',
  });

  // The intro and "load older" row sit above the virtual rows; their height is the scroll margin.
  const hasNoMessages = visibleMessages.length === 0;
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const measure = () => setRowsOffset(rowsRef.current?.offsetTop ?? 0);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [channel?.id, hasSearch, hasMoreMessages, isLoadingMessages, hasNoMessages]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage: (messageId) => {
        const index = visibleMessages.findIndex((message) => message.id === messageId);
        if (index === -1) return;
        virtualizer.scrollToIndex(index, { align: 'center' });
        focusMessageWhenRendered(messageId);
      },
    }),
    [visibleMessages, virtualizer],
  );

  return (
    <div className={styles.messageList} data-testid="message-list" ref={scrollRef}>
      {isLoadingMessages ? (
        <div className={styles.messageSkeletonList} aria-label={t('messages.loading')}>
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
          {t('messages.selectChannel')}
        </div>
      ) : messages.length === 0 ? (
        <div className={styles.statePanel}>
          <MessageSquare size={24} aria-hidden="true" />
          <strong>{t('messages.welcome', { channel: channel.name })}</strong>
          <span>{t('messages.channelStart')}</span>
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className={styles.statePanel}>
          <Search size={24} aria-hidden="true" />
          {t('messages.noSearchMatch')}
        </div>
      ) : (
        <>
          {!hasSearch ? (
            <section className={styles.channelIntro}>
              <div className={styles.channelIntroIcon}>
                <Hash size={46} aria-hidden="true" />
              </div>
              <strong>Welcome to #{channel.name}!</strong>
              <span>
                {channel.topic ||
                  `This is the start of the #${channel.name} channel. Use this space for updates, ideas, and conversation.`}
              </span>
            </section>
          ) : null}
          {hasMoreMessages && !hasSearch && (
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
          <div
            ref={rowsRef}
            className={styles.virtualRows}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className={styles.virtualRow}
                style={{ transform: `translateY(${item.start - rowsOffset}px)` }}
              >
                {renderMessage(visibleMessages[item.index], item.index)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
