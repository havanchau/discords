import type { FriendRequestEntry } from '../../api';
import { Button } from '../ui';
import styles from './HomePanel.module.css';

type FriendRequestListProps = {
  requests: FriendRequestEntry[];
  title?: string;
  mode?: 'incoming' | 'outgoing' | 'blocked';
  onRespond: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED',
  ) => Promise<void>;
  onRemove?: (request: FriendRequestEntry) => Promise<void>;
};

export function FriendRequestList({
  requests,
  title = 'Requests',
  mode = 'incoming',
  onRespond,
  onRemove,
}: FriendRequestListProps) {
  if (!requests.length) return null;

  return (
    <section aria-labelledby={`home-${mode}-requests-title`}>
      <h2 id={`home-${mode}-requests-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      <div className={styles.list} role="list">
        {requests.map((request) => (
          <article key={request.id} className={styles.requestCard}>
            <span className={styles.requestName}>
              {mode === 'outgoing'
                ? (request.receiver?.displayName ?? 'Outgoing request')
                : (request.requester?.displayName ??
                  request.receiver?.displayName ??
                  'Friend request')}
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
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.requestButton}
                    onClick={() => void onRespond(request, 'REJECTED')}
                  >
                    Decline
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.requestButton}
                    onClick={() => void onRespond(request, 'BLOCKED')}
                  >
                    Block
                  </Button>
                </>
              ) : null}
              {mode !== 'incoming' && onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.requestButton}
                  onClick={() => void onRemove(request)}
                >
                  {mode === 'blocked' ? 'Unblock' : 'Cancel'}
                </Button>
              ) : null}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
