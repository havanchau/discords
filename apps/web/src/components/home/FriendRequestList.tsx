import type { FriendRequestEntry } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button } from '@/components/ui';
import styles from './HomePanel.module.css';

type FriendRequestListProps = {
  requests: FriendRequestEntry[];
  title?: string;
  mode?: 'incoming' | 'outgoing';
  onRespond: (request: FriendRequestEntry, status: 'ACCEPTED' | 'REJECTED') => Promise<void>;
  onBlock?: (userId: string) => Promise<void>;
  onRemove?: (request: FriendRequestEntry) => Promise<void>;
};

export function FriendRequestList({
  requests,
  title,
  mode = 'incoming',
  onRespond,
  onBlock,
  onRemove,
}: FriendRequestListProps) {
  const t = useTranslation();

  if (!requests.length) return null;

  return (
    <section aria-labelledby={`home-${mode}-requests-title`}>
      <h2 id={`home-${mode}-requests-title`} className={styles.sectionTitle}>
        {title ?? t('home.requests.title')}
      </h2>
      <div className={styles.list} role="list">
        {requests.map((request) => (
          <article key={request.id} className={styles.requestCard}>
            <span className={styles.requestName}>
              {mode === 'outgoing'
                ? (request.receiver?.displayName ?? t('home.requests.outgoingFallback'))
                : (request.requester?.displayName ?? t('home.requests.incomingFallback'))}
            </span>
            <span className={styles.requestActions}>
              {mode === 'incoming' ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={styles.requestButton}
                    onClick={() => void onRespond(request, 'ACCEPTED')}
                  >
                    {t('home.requests.accept')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.requestButton}
                    onClick={() => void onRespond(request, 'REJECTED')}
                  >
                    {t('home.requests.decline')}
                  </Button>
                  {onBlock ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={styles.requestButton}
                      onClick={() => void onBlock(request.requesterId)}
                    >
                      {t('home.friends.block')}
                    </Button>
                  ) : null}
                </>
              ) : null}
              {mode === 'outgoing' && onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.requestButton}
                  onClick={() => void onRemove(request)}
                >
                  {t('common.cancel')}
                </Button>
              ) : null}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
