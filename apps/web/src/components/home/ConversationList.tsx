import type { DirectConversation } from '../../api';
import { Button, Banner } from '../ui';
import { cn } from '../../utils/cn';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';
import { handleListKeyboardNavigation } from './keyboardNavigation';

type ConversationListProps = {
  conversations: DirectConversation[];
  activeConversationId?: string;
  onOpenConversation: (conversation: DirectConversation) => Promise<void>;
};

export function ConversationList({ conversations, activeConversationId, onOpenConversation }: ConversationListProps) {
  const visibleConversations = conversations.filter((conversation) => conversation.members[0]?.user);

  return (
    <section aria-labelledby="home-recent-dms-title">
      <h2 id="home-recent-dms-title" className={styles.sectionTitle}>
        Recent DMs
      </h2>
      <div className={styles.list} role="list" onKeyDown={handleListKeyboardNavigation}>
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => {
            const partner = conversation.members[0].user;
            const selected = activeConversationId === conversation.id;

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
                <UserAvatar user={partner} />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{partner.displayName}</span>
                  <span className={styles.rowMeta}>{conversation.messages[0]?.content ?? 'No messages yet'}</span>
                </span>
                {Boolean(conversation.unreadCount) && (
                  <span
                    className={styles.unreadBadge}
                    aria-label={`${conversation.unreadCount} unread direct messages`}
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
          <Banner className={styles.emptyBanner} variant="info">No direct messages yet.</Banner>
        )}
      </div>
    </section>
  );
}
