import type { BlockedUserEntry } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button } from '@/components/ui';
import styles from './HomePanel.module.css';

type BlockedUsersListProps = {
  blocked: BlockedUserEntry[];
  pendingAction: string | null;
  onUnblock: (userId: string) => Promise<void>;
};

export function BlockedUsersList({ blocked, pendingAction, onUnblock }: BlockedUsersListProps) {
  const t = useTranslation();

  if (!blocked.length) return null;

  return (
    <section aria-labelledby="home-blocked-title">
      <h2 id="home-blocked-title" className={styles.sectionTitle}>
        {t('home.blocked.title')}
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
                {t('home.blocked.unblock')}
              </Button>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
