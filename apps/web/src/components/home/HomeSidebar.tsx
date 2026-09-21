import { useState, type FormEvent } from 'react';
import { Menu, UserPlus } from 'lucide-react';
import type { DirectConversation, FriendEntry, FriendRequestEntry, FriendsSummary } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, IconButton, TextField, Tooltip } from '@/components/ui';
import { useWorkspace } from '@/contexts/WorkspaceContext';
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
  const t = useTranslation();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const { openMobileNav } = useWorkspace();

  return (
    <aside className={styles.sidebar} aria-label={t('home.nav.label')}>
      <header className={styles.sidebarHeader}>
        <Tooltip content={t('chatHeader.openMenu')}>
          <IconButton
            label={t('chatHeader.openMenu')}
            className={styles.menuButton}
            onClick={openMobileNav}
            data-testid="home-nav-button"
          >
            <Menu size={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <strong className={styles.sidebarTitle}>{t('home.title')}</strong>
        <span className={styles.sidebarKicker}>{t('home.kicker')}</span>
      </header>
      <form className={styles.addFriendForm} onSubmit={(event) => void onRequestFriend(event)}>
        <TextField
          className={styles.addFriendInput}
          name="usernameOrEmail"
          placeholder={t('home.addFriend.placeholder')}
          minLength={3}
          required
          aria-label={t('home.addFriend.placeholder')}
        />
        <Button
          type="submit"
          className={styles.addFriendButton}
          disabled={pendingAction === 'friend-request'}
        >
          <UserPlus size={15} aria-hidden="true" />
          {t('home.addFriend.action')}
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
        title={t('home.requests.pendingSent')}
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
