import type { FriendRequestEntry } from '../../api';
import { Button } from '../ui';
import styles from './HomePanel.module.css';

type FriendRequestListProps = {
  requests: FriendRequestEntry[];
  onRespond: (request: FriendRequestEntry, status: 'ACCEPTED' | 'REJECTED') => Promise<void>;
};

export function FriendRequestList({ requests, onRespond }: FriendRequestListProps) {
  if (!requests.length) return null;

  return (
    <section aria-labelledby="home-requests-title">
      <h2 id="home-requests-title" className={styles.sectionTitle}>
        Requests
      </h2>
      <div className={styles.list} role="list">
        {requests.map((request) => (
          <article key={request.id} className={styles.requestCard}>
            <span className={styles.requestName}>{request.requester?.displayName ?? 'Friend request'}</span>
            <span className={styles.requestActions}>
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
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
