import type { FormEvent } from 'react';
import { MessageSquare } from 'lucide-react';
import type { AuthState, DirectConversation, DirectMessage } from '../../api';
import { cn } from '../../utils/cn';
import { DirectMessageComposer } from './DirectMessageComposer';
import { DirectMessageTimeline } from './DirectMessageTimeline';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';

type HomeDirectMessageViewProps = {
  auth: AuthState;
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  pendingAction: string | null;
  onSendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function HomeDirectMessageView({
  auth,
  activeConversation,
  directMessages,
  pendingAction,
  onSendDirectMessage,
}: HomeDirectMessageViewProps) {
  const dmPartner = activeConversation?.members[0]?.user;

  return (
    <main className={cn(styles.chat, !dmPartner && styles.chatEmpty)} aria-label="Direct message thread">
      {activeConversation && dmPartner ? (
        <>
          <header className={styles.chatHeader}>
            <UserAvatar user={dmPartner} />
            <span className={styles.headerText}>
              <strong className={styles.headerName}>{dmPartner.displayName}</strong>
              <span className={styles.headerHandle}>@{dmPartner.username}</span>
            </span>
          </header>
          <DirectMessageTimeline auth={auth} dmPartner={dmPartner} directMessages={directMessages} />
          <DirectMessageComposer
            username={dmPartner.username}
            pendingAction={pendingAction}
            onSendDirectMessage={onSendDirectMessage}
          />
        </>
      ) : (
        <div className={styles.statePanel}>
          <MessageSquare size={28} aria-hidden="true" />
          <strong className={styles.statePanelTitle}>Your direct messages</strong>
          <span className={styles.statePanelCopy}>Add a friend or select a recent DM.</span>
        </div>
      )}
    </main>
  );
}
