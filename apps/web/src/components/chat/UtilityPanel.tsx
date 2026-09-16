import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link,
  Pin,
} from 'lucide-react';
import { Channel, Message, NotificationItem } from '@/api';
import { previewText } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { buildMessageSearchSnippet } from '@/utils/messageSearch';
import { Button, TextField } from '@/components/ui';
import { buildMediaCollections } from '@/utils/mediaCollections';
import type { ActivePanel } from './types';
import type { ParsedMessageSearch } from '@/utils/messageSearch';
import styles from './UtilityPanel.module.css';
import { formText } from '@/utils/formText';

const MEDIA_TAB_LABEL_KEYS = {
  media: 'media.tab.media',
  files: 'media.tab.files',
  links: 'media.tab.links',
} as const;

const MEDIA_TAB_EMPTY_KEYS = {
  media: 'media.empty.media',
  files: 'media.empty.files',
  links: 'media.empty.links',
} as const;

interface UtilityPanelProps {
  activePanel: ActivePanel;
  channel: Channel | null;
  searchQuery: string;
  parsedSearch: ParsedMessageSearch;
  searchResults: Message[];
  pinnedMessages: Message[];
  mediaMessages: Message[];
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
  mediaMessages,
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
  const t = useTranslation();
  const dates = useDateFormat();
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
  const mediaCollections = useMemo(() => buildMediaCollections(mediaMessages), [mediaMessages]);
  const [mediaTab, setMediaTab] = useState<'media' | 'files' | 'links'>('media');
  const activeMediaItems = mediaCollections[mediaTab];

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
    void configureChannelEncryption(formText(form, 'passphrase'));
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
            label={t('search.label')}
            placeholder={t('search.placeholder')}
            data-testid="search-input"
          />
          {parsedSearch.tokens.length > 0 && (
            <div className={styles.searchFilters} aria-label={t('search.filtersLabel')}>
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
                <strong>{t('search.results')}</strong>
                <span>{t('search.found', { count: searchResults.length })}</span>
              </div>
              {renderedSearchResults.length ? (
                <div
                  className={styles.searchResultList}
                  role="listbox"
                  aria-label={t('search.resultsLabel')}
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
                          <strong>#{channel?.name ?? t('search.fallbackChannel')}</strong>
                          <span>{message.author.displayName}</span>
                          <time dateTime={message.createdAt}>
                            {dates.dateTime(message.createdAt)}
                          </time>
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
                            {message.attachments.length === 1
                              ? t('search.attachmentCountOne')
                              : t('search.attachmentCount', { count: message.attachments.length })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.searchEmpty}>{t('search.empty')}</div>
              )}
            </div>
          )}
        </div>
      )}

      {activePanel === 'media' && (
        <div className={styles.mediaPanel}>
          <div className={styles.mediaHeader}>
            <strong>{t('media.title')}</strong>
            <span>{t('media.subtitle')}</span>
          </div>
          <div className={styles.mediaTabs} role="tablist" aria-label={t('media.tabsLabel')}>
            {(['media', 'files', 'links'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mediaTab === tab}
                className={mediaTab === tab ? styles.mediaTabActive : ''}
                onClick={() => setMediaTab(tab)}
              >
                {t(MEDIA_TAB_LABEL_KEYS[tab])}
              </button>
            ))}
          </div>
          {activeMediaItems.length ? (
            <div className={mediaTab === 'media' ? styles.mediaGrid : styles.mediaRows}>
              {activeMediaItems.slice(0, 18).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mediaTab === 'media' ? styles.mediaTile : styles.mediaRow}
                  onClick={() => onJumpToMessage(item.messageId)}
                  aria-label={t('media.jumpTo', {
                    category: item.category,
                    author: item.author.displayName,
                  })}
                >
                  {item.attachment && (item.category === 'image' || item.category === 'video') ? (
                    <span className={styles.mediaThumb}>
                      {item.category === 'image' ? (
                        <img src={item.attachment.url} alt={item.attachment.fileName} />
                      ) : (
                        <ImageIcon size={18} aria-hidden="true" />
                      )}
                    </span>
                  ) : item.category === 'link' ? (
                    <Link size={15} aria-hidden="true" />
                  ) : (
                    <FileText size={15} aria-hidden="true" />
                  )}
                  <span>
                    <strong>{item.attachment?.fileName ?? item.hostname ?? item.url}</strong>
                    <small>
                      {item.author.displayName} · {dates.dateTime(item.createdAt)}
                    </small>
                  </span>
                  {item.url ? <ExternalLink size={13} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.notificationEmpty}>{t(MEDIA_TAB_EMPTY_KEYS[mediaTab])}</div>
          )}
        </div>
      )}

      {activePanel === 'notifications' && (
        <div className={styles.notificationPanel}>
          <div className={styles.notificationHeader}>
            <div>
              <strong>{t('notifications.title')}</strong>
              <span>
                {notificationUnreadCount === 1
                  ? t('notifications.unreadCountOne')
                  : t('notifications.unreadCount', { count: notificationUnreadCount })}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void markAllNotificationsRead()}
              disabled={!notificationUnreadCount}
            >
              <CheckCheck size={14} aria-hidden="true" />
              {t('notifications.markAllRead')}
            </Button>
          </div>

          {isLoadingNotifications ? (
            <div className={styles.notificationEmpty}>{t('notifications.loading')}</div>
          ) : notifications.length ? (
            <div
              className={styles.notificationList}
              role="list"
              aria-label={t('notifications.listLabel')}
            >
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
                    <time dateTime={notification.createdAt}>
                      {dates.dateTime(notification.createdAt)}
                    </time>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.notificationEmpty}>{t('notifications.empty')}</div>
          )}

          <div className={styles.pinnedSection}>
            <strong>{t('pinned.title')}</strong>
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
              <div className={styles.notificationEmpty}>{t('pinned.channelEmpty')}</div>
            )}
          </div>
        </div>
      )}

      {activePanel === 'encryption' && (
        <form className={styles.encryptionPanel} onSubmit={handleEncryptionSubmit}>
          <strong>
            {isChannelEncrypted ? t('encryption.titleActive') : t('encryption.titleInactive')}
          </strong>
          <span>{t('encryption.hint')}</span>
          <TextField
            name="passphrase"
            type="password"
            minLength={8}
            placeholder={t('encryption.passphrasePlaceholder')}
            autoComplete="off"
            required
          />
          <div className={styles.encryptionActions}>
            <Button size="sm" type="submit">
              {isChannelEncrypted ? t('encryption.action.update') : t('encryption.action.enable')}
            </Button>
            {isChannelEncrypted && (
              <Button size="sm" variant="ghost" onClick={clearChannelEncryption}>
                {t('encryption.action.forget')}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
