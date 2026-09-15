import type { BlockedUserEntry } from '../../api';
import { Button } from '../ui';
import styles from './HomePanel.module.css';

type BlockedUsersListProps = {
  blocked: BlockedUserEntry[];
  pendingAction: string | null;
  onUnblock: (userId: string) => Promise<void>;
};

export function BlockedUsersList({ blocked, pendingAction, onUnblock }: BlockedUsersListProps) {
  if (!blocked.length) return null;

  return (
    <section aria-labelledby="home-blocked-title">
      <h2 id="home-blocked-title" className={styles.sectionTitle}>
        Blocked
      </h2>
      <div className={styles.list} role="list">
        {blocked.map((entry) => (
          <article key={entry.user.id} className={styles.requestCard}>
            <span className={styles.requestName}>{entry.user.displayName}</span>
            <span className={styles.requestActions}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.requestButton}
                disabled={pendingAction === `unblock-${entry.user.id}`}
                onClick={() => void onUnblock(entry.user.id)}
              >
                Unblock
              </Button>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
