import {
  ReactNode,
  Ref,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
// How close to the bottom counts as "read the latest message", for both the auto-scroll-on-new-message
// check and the mark-as-read check.
const NEAR_BOTTOM_THRESHOLD_PX = 250;

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
  firstUnreadMessageId?: string | null;
  searchQuery: string;
  loadMoreMessages: () => Promise<void>;
  renderMessage: (message: Message, index: number) => ReactNode;
  /** Marks the channel read up to the newest loaded message; called once the user is at (or reaches) the bottom. */
  onMarkRead: (lastMessageId?: string) => void;
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
  firstUnreadMessageId,
  searchQuery,
  loadMoreMessages,
  renderMessage,
  onMarkRead,
  ref,
}: MessageListProps) {
  const t = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [rowsOffset, setRowsOffset] = useState(0);
  const hasSearch = Boolean(searchQuery.trim());
  const hasInitialScrolledRef = useRef(false);
  // Avoids re-marking read for the same message every time this runs (scroll, resize, new message).
  const lastMarkedReadIdRef = useRef<string | null>(null);

  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => visibleMessages[index].id,
    overscan: OVERSCAN_ROWS,
    scrollMargin: rowsOffset,
    // Keeps the row being read in place when older messages are prepended.
    anchorTo: 'end',
    // Avoids the "flushSync was called from inside a lifecycle method" warning: scrollToIndex runs
    // from a useLayoutEffect above, and this render doesn't need the flush to be synchronous.
    useFlushSync: false,
  });

  // Reset initial scroll tracking on channel change
  useLayoutEffect(() => {
    hasInitialScrolledRef.current = false;
    lastMarkedReadIdRef.current = null;
  }, [channel?.id]);

  // Marks the channel read once the user is at (or reaches) the bottom, or the page fits without
  // scrolling — never on channel open itself, so switching away while scrolled up leaves it unread.
  const markReadIfAtBottom = useEffectEvent(() => {
    if (!channel || messages.length === 0) return;
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const distanceFromBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    const contentFits = scrollElement.scrollHeight <= scrollElement.clientHeight;
    if (!contentFits && distanceFromBottom > NEAR_BOTTOM_THRESHOLD_PX) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMarkedReadIdRef.current === lastMessage.id) return;
    lastMarkedReadIdRef.current = lastMessage.id;
    onMarkRead(lastMessage.id);
  });

  // Covers the "content fits without scrolling" case and new messages arriving while at the bottom.
  useLayoutEffect(() => {
    if (isLoadingMessages) return;
    markReadIfAtBottom();
  }, [isLoadingMessages, visibleMessages.length, channel?.id]);

  // Covers the user scrolling down to the bottom themselves.
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const handleScroll = () => markReadIfAtBottom();
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [channel?.id]);

  // Scroll to oldest unread message or default to bottom (newest message) on initial load
  useLayoutEffect(() => {
    if (hasInitialScrolledRef.current || isLoadingMessages || visibleMessages.length === 0) return;

    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    if (firstUnreadMessageId) {
      const index = visibleMessages.findIndex((message) => message.id === firstUnreadMessageId);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'start' });
        window.requestAnimationFrame(() => {
          virtualizer.scrollToIndex(index, { align: 'start' });
        });
        hasInitialScrolledRef.current = true;
        return;
      }
    }

    // Default: scroll to the newest message at the bottom
    virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end' });
    scrollElement.scrollTop = scrollElement.scrollHeight;

    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    window.requestAnimationFrame(() => {
      scrollToBottom();
      window.requestAnimationFrame(scrollToBottom);
    });

    hasInitialScrolledRef.current = true;
  }, [channel?.id, firstUnreadMessageId, visibleMessages, isLoadingMessages, virtualizer]);

  // Auto-scroll to bottom when new messages arrive while near bottom
  const prevVisibleCountRef = useRef(visibleMessages.length);
  useLayoutEffect(() => {
    if (!hasInitialScrolledRef.current) {
      prevVisibleCountRef.current = visibleMessages.length;
      return;
    }

    if (visibleMessages.length > prevVisibleCountRef.current) {
      const scrollElement = scrollRef.current;
      if (scrollElement) {
        const distanceFromBottom =
          scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
        if (distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
          window.requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          });
        }
      }
    }
    prevVisibleCountRef.current = visibleMessages.length;
  }, [visibleMessages.length]);

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
              <strong>{t('messages.channelIntro.title', { channel: channel.name })}</strong>
              <span>
                {channel.topic || t('messages.channelIntro.description', { channel: channel.name })}
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
            {virtualizer.getVirtualItems().map((item) => {
              const message = visibleMessages[item.index];
              const isFirstUnread = message?.id === firstUnreadMessageId;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className={styles.virtualRow}
                  style={{ transform: `translateY(${item.start - rowsOffset}px)` }}
                >
                  {isFirstUnread && (
                    <div className={styles.unreadDivider} data-testid="unread-divider">
                      <span>{t('message.unreadDivider')}</span>
                    </div>
                  )}
                  {renderMessage(message, item.index)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
