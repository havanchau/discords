import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, FileText, Pin } from 'lucide-react';
import { Channel, Message, NotificationItem } from '../../api';
import { formatDate, previewText } from '../../helpers';
import { buildMessageSearchSnippet } from '../../utils/messageSearch';
import { Button, TextField } from '../ui';
import type { ActivePanel } from './types';
import type { ParsedMessageSearch } from '../../utils/messageSearch';
import styles from './UtilityPanel.module.css';

interface UtilityPanelProps {
  activePanel: ActivePanel;
  channel: Channel | null;
  searchQuery: string;
  parsedSearch: ParsedMessageSearch;
  searchResults: Message[];
  pinnedMessages: Message[];
  notifications: NotificationItem[];
  notificationUnreadCount: number;
  isLoadingNotifications: boolean;
  isChannelEncrypted: boolean;
  setSearchQuery: (value: string) => void;
  loadNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
  configureChannelEncryption: (passphrase: string) => Promise<void>;
  clearChannelEncryption: () => void;
}

export function UtilityPanel({
  activePanel,
  channel,
  searchQuery,
  parsedSearch,
  searchResults,
  pinnedMessages,
  notifications,
  notificationUnreadCount,
  isLoadingNotifications,
  isChannelEncrypted,
  setSearchQuery,
  loadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  onJumpToMessage,
  configureChannelEncryption,
  clearChannelEncryption,
}: UtilityPanelProps) {
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const trimmedSearch = searchQuery.trim();
  const canShowSearchResults =
    trimmedSearch.length >= 2 ||
    Boolean(parsedSearch.from || parsedSearch.in || parsedSearch.before || parsedSearch.after) ||
    parsedSearch.has.length > 0;
  const renderedSearchResults = useMemo(
    () =>
      canShowSearchResults && parsedSearch.invalid.length === 0 ? searchResults.slice(0, 8) : [],
    [canShowSearchResults, parsedSearch.invalid.length, searchResults],
  );

  useEffect(() => {
    if (activePanel === 'notifications') {
      void loadNotifications();
    }
  }, [activePanel, loadNotifications]);

  useEffect(() => {
    setActiveResultIndex((index) => Math.min(index, Math.max(0, renderedSearchResults.length - 1)));
  }, [renderedSearchResults.length]);

  if (!activePanel) return null;

  function handleEncryptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void configureChannelEncryption(String(form.get('passphrase') || ''));
    event.currentTarget.reset();
  }

  function handleSearchResultKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!renderedSearchResults.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResultIndex((index) => Math.min(index + 1, renderedSearchResults.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResultIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveResultIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveResultIndex(renderedSearchResults.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      onJumpToMessage(renderedSearchResults[activeResultIndex].id);
    }
  }

  return (
    <div className={`${styles.utilityPanel} ${styles.utilityPanelOpen}`}>
      {activePanel === 'search' && (
        <div className={styles.searchPanel}>
          <TextField
            value={searchQuery}
            onChange={(event) => {
              setActiveResultIndex(0);
              setSearchQuery(event.target.value);
            }}
            label="Search messages"
            placeholder="from:chau has:link before:2026-06-01"
            data-testid="search-input"
          />
          {parsedSearch.tokens.length > 0 && (
            <div className={styles.searchFilters} aria-label="Parsed search filters">
              {parsedSearch.tokens.map((token) => (
                <span key={`${token.label}:${token.value}`} className={styles.searchFilter}>
                  <strong>{token.label}</strong>
                  {token.value}
                </span>
              ))}
            </div>
          )}
          {parsedSearch.invalid.length > 0 && (
            <div className={styles.searchInvalid} role="status">
              {parsedSearch.invalid.join('. ')}
            </div>
          )}
          {canShowSearchResults && parsedSearch.invalid.length === 0 && (
            <div className={styles.searchResults} onKeyDown={handleSearchResultKeyDown}>
              <div className={styles.searchResultsHeader}>
                <strong>Results</strong>
                <span>{searchResults.length} found</span>
              </div>
              {renderedSearchResults.length ? (
                <div
                  className={styles.searchResultList}
                  role="listbox"
                  aria-label="Message search results"
                >
                  {renderedSearchResults.map((message, index) => {
                    const snippet = buildMessageSearchSnippet(message.content, searchQuery);
                    const isActive = index === activeResultIndex;

                    return (
                      <button
                        type="button"
                        key={message.id}
                        className={`${styles.searchResultButton} ${isActive ? styles.searchResultActive : ''}`}
                        role="option"
                        aria-selected={isActive}
                        onFocus={() => setActiveResultIndex(index)}
                        onClick={() => onJumpToMessage(message.id)}
                      >
                        <span className={styles.searchResultMeta}>
                          <strong>#{channel?.name ?? 'channel'}</strong>
                          <span>{message.author.displayName}</span>
                          <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                        </span>
                        <span className={styles.searchResultSnippet}>
                          {snippet.fallback ? (
                            snippet.fallback
                          ) : (
                            <>
                              {snippet.before}
                              <mark>{snippet.match}</mark>
                              {snippet.after}
                            </>
                          )}
                        </span>
                        {message.attachments.length > 0 && (
                          <span className={styles.searchResultAttachment}>
                            <FileText size={12} aria-hidden="true" />
                            {message.attachments.length} attachment
                            {message.attachments.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.searchEmpty}>No matching messages in this channel.</div>
              )}
            </div>
          )}
        </div>
      )}

      {activePanel === 'notifications' && (
        <div className={styles.notificationPanel}>
          <div className={styles.notificationHeader}>
            <div>
              <strong>Notifications</strong>
              <span>{notificationUnreadCount} unread inbox item{notificationUnreadCount === 1 ? '' : 's'}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void markAllNotificationsRead()}
              disabled={!notificationUnreadCount}
            >
              <CheckCheck size={14} aria-hidden="true" />
              Mark all read
            </Button>
          </div>

          {isLoadingNotifications ? (
            <div className={styles.notificationEmpty}>Loading notifications…</div>
          ) : notifications.length ? (
            <div className={styles.notificationList} role="list" aria-label="Recent notifications">
              {notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={`${styles.notificationItem} ${notification.readAt ? '' : styles.notificationItemUnread}`}
                  onClick={() => {
                    void markNotificationRead(notification.id);
                    if (notification.messageId) onJumpToMessage(notification.messageId);
                  }}
                >
                  <Bell size={14} aria-hidden="true" />
                  <span className={styles.notificationText}>
                    <strong>{notification.title}</strong>
                    {notification.body && <span>{notification.body}</span>}
                    <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.notificationEmpty}>No notifications yet.</div>
          )}

          <div className={styles.pinnedSection}>
            <strong>Pinned messages</strong>
            {pinnedMessages.length ? (
              pinnedMessages.map((message) => (
                <Button
                  variant="ghost"
                  key={message.id}
                  className={styles.pinButton}
                  onClick={() => onJumpToMessage(message.id)}
                >
                  <Pin size={13} aria-hidden="true" />
                  <span>{previewText(message)}</span>
                </Button>
              ))
            ) : (
              <div className={styles.notificationEmpty}>No pinned messages in this channel.</div>
            )}
          </div>
        </div>
      )}

      {activePanel === 'encryption' && (
        <form className={styles.encryptionPanel} onSubmit={handleEncryptionSubmit}>
          <strong>{isChannelEncrypted ? 'Encrypted channel session' : 'Enable E2EE'}</strong>
          <span>
            Messages are encrypted in this browser before they are sent. Share the passphrase
            out-of-band with trusted members.
          </span>
          <TextField
            name="passphrase"
            type="password"
            minLength={8}
            placeholder="Channel passphrase"
            autoComplete="off"
            required
          />
          <div className={styles.encryptionActions}>
            <Button size="sm" type="submit">
              {isChannelEncrypted ? 'Update key' : 'Enable'}
            </Button>
            {isChannelEncrypted && (
              <Button size="sm" variant="ghost" onClick={clearChannelEncryption}>
                Forget key
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
