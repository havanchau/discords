import { HomeDirectMessageView } from './home/HomeDirectMessageView';
import { HomeSidebar } from './home/HomeSidebar';
import type { HomePanelProps } from './home/types';
import styles from './home/HomePanel.module.css';

export function HomePanel({
  home,
  actions,
}: HomePanelProps) {
  return (
    <section className={styles.panel}>
      <HomeSidebar
        friendsSummary={home.friendsSummary}
        conversations={home.conversations}
        activeConversationId={home.activeConversation?.id}
        pendingAction={home.pendingAction}
        onRequestFriend={actions.requestFriend}
        onRespondFriendRequest={actions.respondFriendRequest}
        onOpenDirectConversation={actions.openDirectConversation}
        onStartDirectConversation={actions.startDirectConversation}
      />
      <HomeDirectMessageView
        auth={home.auth}
        activeConversation={home.activeConversation}
        directMessages={home.directMessages}
        directMessageDraft={home.directMessageDraft}
        pendingAction={home.pendingAction}
        onSendDirectMessage={actions.sendDirectMessage}
        onDirectMessageDraftChange={actions.setDirectMessageDraft}
      />
    </section>
  );
}
