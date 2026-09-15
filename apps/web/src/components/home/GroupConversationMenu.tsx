import { useState, type FormEvent } from 'react';
import { Crown, LogOut, UserMinus, UserPlus, Users } from 'lucide-react';
import type { DirectConversation, FriendEntry, PublicUser } from '../../api';
import { Button, IconButton, PopoverContent, PopoverRoot, PopoverTrigger, TextField } from '../ui';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';

const MAX_GROUP_MEMBERS = 10;

type GroupConversationMenuProps = {
  conversation: DirectConversation;
  viewer: PublicUser;
  partners: PublicUser[];
  friends: FriendEntry[];
  pendingAction: string | null;
  onRename: (conversationId: string, name: string) => Promise<boolean>;
  onAddMember: (conversationId: string, userId: string) => Promise<void>;
  onRemoveMember: (conversationId: string, userId: string) => Promise<void>;
};

export function GroupConversationMenu({
  conversation,
  viewer,
  partners,
  friends,
  pendingAction,
  onRename,
  onAddMember,
  onRemoveMember,
}: GroupConversationMenuProps) {
  const [name, setName] = useState(conversation.name ?? '');
  const isOwner = conversation.ownerId === viewer.id;
  const members = [viewer, ...partners];
  const memberIds = new Set(members.map((member) => member.id));
  const addableFriends = friends.filter((friend) => !memberIds.has(friend.user.id));
  const isFull = members.length >= MAX_GROUP_MEMBERS;

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRename(conversation.id, name);
  }

  return (
    <PopoverRoot onOpenChange={(open) => open && setName(conversation.name ?? '')}>
      <PopoverTrigger asChild>
        <IconButton label="Group settings">
          <Users size={18} aria-hidden="true" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom">
        <div className={styles.groupMenu}>
          <form className={styles.groupRename} onSubmit={submitRename}>
            <TextField
              label="Group name"
              value={name}
              maxLength={100}
              placeholder="Unnamed group"
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={pendingAction === `group-rename-${conversation.id}`}
            >
              Save
            </Button>
          </form>

          <section aria-labelledby="group-members-title">
            <h3 id="group-members-title" className={styles.sectionTitle}>
              Members — {members.length}/{MAX_GROUP_MEMBERS}
            </h3>
            <ul className={styles.groupMemberList}>
              {members.map((member) => (
                <li key={member.id}>
                  <UserAvatar user={member} />
                  <span>
                    {member.id === viewer.id ? `${member.displayName} (you)` : member.displayName}
                  </span>
                  {conversation.ownerId === member.id ? (
                    <Crown size={14} aria-label="Group owner" className={styles.ownerIcon} />
                  ) : null}
                  {isOwner && member.id !== viewer.id ? (
                    <IconButton
                      label={`Remove ${member.displayName}`}
                      size="sm"
                      variant="danger"
                      disabled={pendingAction === `group-remove-${member.id}`}
                      onClick={() => void onRemoveMember(conversation.id, member.id)}
                    >
                      <UserMinus size={14} aria-hidden="true" />
                    </IconButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {addableFriends.length && !isFull ? (
            <section aria-labelledby="group-add-title">
              <h3 id="group-add-title" className={styles.sectionTitle}>
                Add friends
              </h3>
              <ul className={styles.groupMemberList}>
                {addableFriends.map((friend) => (
                  <li key={friend.user.id}>
                    <UserAvatar user={friend.user} />
                    <span>{friend.user.displayName}</span>
                    <IconButton
                      label={`Add ${friend.user.displayName}`}
                      size="sm"
                      disabled={pendingAction === `group-add-${friend.user.id}`}
                      onClick={() => void onAddMember(conversation.id, friend.user.id)}
                    >
                      <UserPlus size={14} aria-hidden="true" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pendingAction === `group-remove-${viewer.id}`}
            onClick={() => void onRemoveMember(conversation.id, viewer.id)}
          >
            <LogOut size={14} aria-hidden="true" />
            Leave group
          </Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
