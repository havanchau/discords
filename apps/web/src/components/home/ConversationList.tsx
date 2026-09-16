import { Plus, Users } from 'lucide-react';
import type { DirectConversation } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, IconButton } from '@/components/ui';
import { cn } from '@/utils/cn';
import { conversationDisplayName, conversationPartners } from './conversationDisplay';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';
import { handleListKeyboardNavigation } from './keyboardNavigation';

type ConversationListProps = {
  viewerId: string;
  conversations: DirectConversation[];
  activeConversationId?: string;
  onOpenConversation: (conversation: DirectConversation) => Promise<void>;
  onCreateGroup: () => void;
};

export function ConversationList({
  viewerId,
  conversations,
  activeConversationId,
  onOpenConversation,
  onCreateGroup,
}: ConversationListProps) {
  const t = useTranslation();
  const visibleConversations = conversations.filter(
    (conversation) => conversation.isGroup || conversationPartners(conversation, viewerId).length,
  );

  return (
    <section aria-labelledby="home-recent-dms-title">
      <h2 id="home-recent-dms-title" className={cn(styles.sectionTitle, styles.sectionTitleRow)}>
        {t('home.recentDms.title')}
        <IconButton label={t('home.recentDms.newGroup')} size="sm" onClick={onCreateGroup}>
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      </h2>
      <div className={styles.list} role="list" onKeyDown={handleListKeyboardNavigation}>
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => {
            const partners = conversationPartners(conversation, viewerId);
            const selected = activeConversationId === conversation.id;
            const lastMessage = conversation.messages[0];
            const meta = lastMessage?.deletedAt
              ? t('message.deleted')
              : (lastMessage?.content ??
                (conversation.isGroup
                  ? t('home.recentDms.memberCount', { count: partners.length + 1 })
                  : t('home.recentDms.noMessages')));

            return (
              <Button
                key={conversation.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(styles.rowButton, selected && styles.rowButtonSelected)}
                aria-current={selected ? 'page' : undefined}
                onClick={() => void onOpenConversation(conversation)}
              >
                {conversation.isGroup || !partners[0] ? (
                  <span className={styles.groupAvatar} aria-hidden="true">
                    <Users size={16} />
                  </span>
                ) : (
                  <UserAvatar user={partners[0]} />
                )}
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {conversationDisplayName(conversation, viewerId)}
                  </span>
                  <span className={styles.rowMeta}>{meta}</span>
                </span>
                {Boolean(conversation.unreadCount) && (
                  <span
                    className={styles.unreadBadge}
                    aria-label={t('home.recentDms.unread', {
                      count: conversation.unreadCount ?? 0,
                    })}
                  >
                    {conversation.unreadCount && conversation.unreadCount > 99
                      ? '99+'
                      : conversation.unreadCount}
                  </span>
                )}
              </Button>
            );
          })
        ) : (
          <p className="empty-note">{t('home.recentDms.empty')}</p>
        )}
      </div>
    </section>
  );
}
