import type { FriendRequestEntry } from '../../api';
import { Button } from '../ui';
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
  title = 'Requests',
  mode = 'incoming',
  onRespond,
  onBlock,
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
                : (request.requester?.displayName ?? 'Friend request')}
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
                  {onBlock ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={styles.requestButton}
                      onClick={() => void onBlock(request.requesterId)}
                    >
                      Block
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
                  Cancel
                </Button>
              ) : null}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
