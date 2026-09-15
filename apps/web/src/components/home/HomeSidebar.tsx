import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import type {
  DirectConversation,
  FriendEntry,
  FriendRequestEntry,
  FriendsSummary,
} from '../../api';
import { Button, TextField } from '../ui';
import { BlockedUsersList } from './BlockedUsersList';
import { CreateGroupDialog } from './CreateGroupDialog';
import { ConversationList } from './ConversationList';
import { FriendRequestList } from './FriendRequestList';
import { FriendsList } from './FriendsList';
import styles from './HomePanel.module.css';

type HomeSidebarProps = {
  viewerId: string;
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversationId?: string;
  pendingAction: string | null;
  onRequestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRespondFriendRequest: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED',
  ) => Promise<void>;
  onBlockUser: (userId: string) => Promise<void>;
  onUnblockUser: (userId: string) => Promise<void>;
  onRemoveFriend: (friend: FriendEntry) => Promise<void>;
  onRemoveFriendRequest: (request: FriendRequestEntry) => Promise<void>;
  onOpenDirectConversation: (conversation: DirectConversation) => Promise<void>;
  onStartDirectConversation: (userId: string) => Promise<void>;
  onCreateGroup: (userIds: string[], name: string) => Promise<boolean>;
};

export function HomeSidebar({
  viewerId,
  friendsSummary,
  conversations,
  activeConversationId,
  pendingAction,
  onRequestFriend,
  onRespondFriendRequest,
  onBlockUser,
  onUnblockUser,
  onRemoveFriend,
  onRemoveFriendRequest,
  onOpenDirectConversation,
  onStartDirectConversation,
  onCreateGroup,
}: HomeSidebarProps) {
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  return (
    <aside className={styles.sidebar} aria-label="Direct messages navigation">
      <header className={styles.sidebarHeader}>
        <strong className={styles.sidebarTitle}>Direct Messages</strong>
        <span className={styles.sidebarKicker}>Friends and private chats</span>
      </header>
      <form className={styles.addFriendForm} onSubmit={onRequestFriend}>
        <TextField
          className={styles.addFriendInput}
          name="usernameOrEmail"
          placeholder="Username or email"
          minLength={3}
          required
          aria-label="Username or email"
        />
        <Button
          type="submit"
          className={styles.addFriendButton}
          disabled={pendingAction === 'friend-request'}
        >
          <UserPlus size={15} aria-hidden="true" />
          Add
        </Button>
      </form>

      <FriendsList
        friends={friendsSummary?.friends ?? []}
        onStartConversation={onStartDirectConversation}
        onRemoveFriend={onRemoveFriend}
        onBlock={onBlockUser}
      />
      <FriendRequestList
        requests={friendsSummary?.pendingIncoming ?? []}
        onRespond={onRespondFriendRequest}
        onBlock={onBlockUser}
      />
      <FriendRequestList
        title="Pending sent"
        mode="outgoing"
        requests={friendsSummary?.pendingOutgoing ?? []}
        onRespond={onRespondFriendRequest}
        onRemove={onRemoveFriendRequest}
      />
      <BlockedUsersList
        blocked={friendsSummary?.blocked ?? []}
        pendingAction={pendingAction}
        onUnblock={onUnblockUser}
      />
      <ConversationList
        viewerId={viewerId}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onOpenConversation={onOpenDirectConversation}
        onCreateGroup={() => setIsCreateGroupOpen(true)}
      />
      <CreateGroupDialog
        open={isCreateGroupOpen}
        friends={friendsSummary?.friends ?? []}
        pendingAction={pendingAction}
        onOpenChange={setIsCreateGroupOpen}
        onCreate={onCreateGroup}
      />
    </aside>
  );
}
