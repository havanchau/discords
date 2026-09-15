import { HomeDirectMessageView } from './home/HomeDirectMessageView';
import { HomeSidebar } from './home/HomeSidebar';
import type { HomePanelProps } from './home/types';
import styles from './home/HomePanel.module.css';

export function HomePanel({ home, actions, call }: HomePanelProps) {
  return (
    <section className={styles.panel}>
      <HomeSidebar
        viewerId={home.auth.user.id}
        friendsSummary={home.friendsSummary}
        conversations={home.conversations}
        activeConversationId={home.activeConversation?.id}
        pendingAction={home.pendingAction}
        onRequestFriend={actions.requestFriend}
        onRespondFriendRequest={actions.respondFriendRequest}
        onBlockUser={actions.blockUser}
        onUnblockUser={actions.unblockUser}
        onRemoveFriend={actions.removeFriend}
        onRemoveFriendRequest={actions.removeFriendRequest}
        onOpenDirectConversation={actions.openDirectConversation}
        onStartDirectConversation={actions.startDirectConversation}
        onCreateGroup={actions.createGroupConversation}
      />
      <HomeDirectMessageView
        auth={home.auth}
        activeConversation={home.activeConversation}
        directMessages={home.directMessages}
        directMessageDraft={home.directMessageDraft}
        pendingAction={home.pendingAction}
        pins={home}
        friends={home.friendsSummary?.friends ?? []}
        replyingTo={home.replyingToDirectMessage}
        actions={actions}
        call={call}
        onSendDirectMessage={actions.sendDirectMessage}
      />
    </section>
  );
}
