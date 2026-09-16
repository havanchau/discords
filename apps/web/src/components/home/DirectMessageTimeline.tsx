import { MessageSquare } from 'lucide-react';
import type { AuthState, DirectMessage, PublicUser } from '@/api';
import { DirectMessageRow, type DirectMessageRowActions } from './DirectMessageRow';
import styles from './HomePanel.module.css';

type DirectMessageTimelineProps = {
  auth: AuthState;
  emptyStateName: string;
  members: PublicUser[];
  directMessages: DirectMessage[];
  actions: DirectMessageRowActions;
};

export function DirectMessageTimeline({
  auth,
  emptyStateName,
  members,
  directMessages,
  actions,
}: DirectMessageTimelineProps) {
  function authorName(message: DirectMessage) {
    if (message.authorId === auth.user.id) return auth.user.displayName;
    return (
      message.author?.displayName ??
      members.find((member) => member.id === message.authorId)?.displayName ??
      'Unknown user'
    );
  }

  return (
    <div className={styles.messageList} aria-live="polite">
      {directMessages.length ? (
        directMessages.map((message) => (
          <DirectMessageRow
            key={message.id}
            message={message}
            viewerId={auth.user.id}
            accessToken={auth.accessToken}
            authorName={authorName(message)}
            actions={actions}
          />
        ))
      ) : (
        <div className={styles.statePanel}>
          <MessageSquare size={24} aria-hidden="true" />
          <span className={styles.statePanelCopy}>
            Start the conversation with {emptyStateName}.
          </span>
        </div>
      )}
    </div>
  );
}

/** Scrolls a rendered direct message into view and briefly highlights it. */
export function jumpToDirectMessage(messageId: string) {
  const target = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
  target.dataset.jumpHighlight = 'true';
  window.setTimeout(() => {
    delete target.dataset.jumpHighlight;
  }, 1400);
}
