import type { FriendEntry } from '../../api';
import { Button, Banner } from '../ui';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';
import { handleListKeyboardNavigation } from './keyboardNavigation';

type FriendsListProps = {
  friends: FriendEntry[];
  onStartConversation: (userId: string) => Promise<void>;
  onRemoveFriend: (friend: FriendEntry) => Promise<void>;
};

export function FriendsList({ friends, onStartConversation, onRemoveFriend }: FriendsListProps) {
  return (
    <section aria-labelledby="home-friends-title">
      <h2 id="home-friends-title" className={styles.sectionTitle}>
        Friends
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
                  Message
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.requestButton}
                  onClick={() => void onRemoveFriend(friend)}
                >
                  Remove
                </Button>
              </span>
            </article>
          ))
        ) : (
          <Banner className={styles.emptyBanner} variant="info">
            No friends yet.
          </Banner>
        )}
      </div>
    </section>
  );
}
