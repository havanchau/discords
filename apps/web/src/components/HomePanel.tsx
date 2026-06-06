import { HomeDirectMessageView } from './home/HomeDirectMessageView';
import { HomeSidebar } from './home/HomeSidebar';
import type { HomePanelProps } from './home/types';
import styles from './home/HomePanel.module.css';

export function HomePanel({
  auth,
  friendsSummary,
  conversations,
  activeConversation,
  directMessages,
  pendingAction,
  requestFriend,
  respondFriendRequest,
  openDirectConversation,
  startDirectConversation,
  sendDirectMessage,
}: HomePanelProps) {
  return (
    <section className={styles.panel}>
      <HomeSidebar
        friendsSummary={friendsSummary}
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        pendingAction={pendingAction}
        onRequestFriend={requestFriend}
        onRespondFriendRequest={respondFriendRequest}
        onOpenDirectConversation={openDirectConversation}
        onStartDirectConversation={startDirectConversation}
      />
      <HomeDirectMessageView
        auth={auth}
        activeConversation={activeConversation}
        directMessages={directMessages}
        pendingAction={pendingAction}
        onSendDirectMessage={sendDirectMessage}
      />
    </section>
  );
}
