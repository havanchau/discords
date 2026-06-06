import { MessageSquare } from 'lucide-react';
import type { AuthState, DirectMessage, User } from '../../api';
import { formatDate } from '../../helpers';
import styles from './HomePanel.module.css';

type DirectMessageTimelineProps = {
  auth: AuthState;
  dmPartner: User;
  directMessages: DirectMessage[];
};

export function DirectMessageTimeline({ auth, dmPartner, directMessages }: DirectMessageTimelineProps) {
  return (
    <div className={styles.messageList} aria-live="polite">
      {directMessages.length ? (
        directMessages.map((message) => {
          const mine = message.authorId === auth.user.id;

          return (
            <article key={message.id} className={mine ? `${styles.message} ${styles.messageMine}` : styles.message}>
              <span className={styles.messageAuthor}>{mine ? auth.user.displayName : dmPartner.displayName}</span>
              <p className={styles.messageBody}>{message.content}</p>
              <span className={styles.messageTime}>{formatDate(message.createdAt)}</span>
            </article>
          );
        })
      ) : (
        <div className={styles.statePanel}>
          <MessageSquare size={24} aria-hidden="true" />
          <span className={styles.statePanelCopy}>Start the conversation with {dmPartner.displayName}.</span>
        </div>
      )}
    </div>
  );
}
