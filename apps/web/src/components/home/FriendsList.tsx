import type { FriendEntry } from '../../api';
import { Ban, MoreVertical, UserMinus } from 'lucide-react';
import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  IconButton,
} from '../ui';
import { UserAvatar } from './UserAvatar';
import { useTranslation } from '../../i18n/LocaleProvider';
import styles from './HomePanel.module.css';
import { handleListKeyboardNavigation } from './keyboardNavigation';

type FriendsListProps = {
  friends: FriendEntry[];
  onStartConversation: (userId: string) => Promise<void>;
  onRemoveFriend: (friend: FriendEntry) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
};

export function FriendsList({
  friends,
  onStartConversation,
  onRemoveFriend,
  onBlock,
}: FriendsListProps) {
  const t = useTranslation();

  return (
    <section aria-labelledby="home-friends-title">
      <h2 id="home-friends-title" className={styles.sectionTitle}>
        {t('home.friends.title')}
      </h2>
      <div className={styles.list} role="list" onKeyDown={handleListKeyboardNavigation}>
        {friends.length ? (
          friends.map((friend) => (
            <article key={friend.user.id} className={`${styles.rowButton} ${styles.friendRow}`}>
              <UserAvatar user={friend.user} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{friend.user.displayName}</span>
                <span className={styles.rowMeta}>{friend.user.status ?? 'OFFLINE'}</span>
              </span>
              <span className={styles.rowActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={styles.requestButton}
                  onClick={() => void onStartConversation(friend.user.id)}
                >
                  {t('home.friends.message')}
                </Button>
                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      label={t('home.friends.moreActions', { name: friend.user.displayName })}
                      size="sm"
                    >
                      <MoreVertical size={16} aria-hidden="true" />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem onSelect={() => void onRemoveFriend(friend)}>
                      <UserMinus size={16} aria-hidden="true" />
                      {t('home.friends.remove')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void onBlock(friend.user.id)}>
                      <Ban size={16} aria-hidden="true" />
                      {t('home.friends.block')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </span>
            </article>
          ))
        ) : (
          <p className="empty-note">{t('home.friends.empty')}</p>
        )}
      </div>
    </section>
  );
}
