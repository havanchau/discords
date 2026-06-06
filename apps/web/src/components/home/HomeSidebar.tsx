import type { FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import type { DirectConversation, FriendRequestEntry, FriendsSummary } from '../../api';
import { Button, TextField } from '../ui';
import { ConversationList } from './ConversationList';
import { FriendRequestList } from './FriendRequestList';
import { FriendsList } from './FriendsList';
import styles from './HomePanel.module.css';

type HomeSidebarProps = {
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversationId?: string;
  pendingAction: string | null;
  onRequestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRespondFriendRequest: (request: FriendRequestEntry, status: 'ACCEPTED' | 'REJECTED') => Promise<void>;
  onOpenDirectConversation: (conversation: DirectConversation) => Promise<void>;
  onStartDirectConversation: (userId: string) => Promise<void>;
};

export function HomeSidebar({
  friendsSummary,
  conversations,
  activeConversationId,
  pendingAction,
  onRequestFriend,
  onRespondFriendRequest,
  onOpenDirectConversation,
  onStartDirectConversation,
}: HomeSidebarProps) {
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

      <FriendsList friends={friendsSummary?.friends ?? []} onStartConversation={onStartDirectConversation} />
      <FriendRequestList requests={friendsSummary?.pendingIncoming ?? []} onRespond={onRespondFriendRequest} />
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onOpenConversation={onOpenDirectConversation}
      />
    </aside>
  );
}
