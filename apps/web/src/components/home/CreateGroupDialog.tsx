import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { FriendEntry } from '../../api';
import { Button, Checkbox, DialogContent, DialogRoot, TextField } from '../ui';
import { UserAvatar } from './UserAvatar';
import styles from './HomePanel.module.css';

const MIN_OTHER_MEMBERS = 2;
const MAX_OTHER_MEMBERS = 9;

type CreateGroupDialogProps = {
  open: boolean;
  friends: FriendEntry[];
  pendingAction: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (userIds: string[], name: string) => Promise<boolean>;
};

export function CreateGroupDialog({
  open,
  friends,
  pendingAction,
  onOpenChange,
  onCreate,
}: CreateGroupDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const isCreating = pendingAction === 'group-create';
  const canSubmit = selectedIds.length >= MIN_OTHER_MEMBERS && !isCreating;

  function toggle(userId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...current, userId].slice(0, MAX_OTHER_MEMBERS)
        : current.filter((id) => id !== userId),
    );
  }

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedIds([]);
      setName('');
    }
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const created = await onCreate(selectedIds, name);
    if (created) close(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={close}>
      <DialogContent
        title="New group DM"
        description={`Pick ${MIN_OTHER_MEMBERS} to ${MAX_OTHER_MEMBERS} friends.`}
      >
        <form className={styles.groupForm} onSubmit={submit}>
          <TextField
            label="Group name"
            value={name}
            maxLength={100}
            placeholder="Optional"
            onChange={(event) => setName(event.target.value)}
          />
          {friends.length ? (
            <div className={styles.groupFriendList} role="group" aria-label="Friends">
              {friends.map((friend) => {
                const checked = selectedIds.includes(friend.user.id);
                const limitReached = !checked && selectedIds.length >= MAX_OTHER_MEMBERS;
                return (
                  <label key={friend.user.id} className={styles.groupFriendRow}>
                    <Checkbox
                      checked={checked}
                      disabled={limitReached}
                      aria-label={`Add ${friend.user.displayName}`}
                      onCheckedChange={(next) => toggle(friend.user.id, next === true)}
                    />
                    <UserAvatar user={friend.user} />
                    <span>{friend.user.displayName}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="empty-note">Add friends before creating a group.</p>
          )}
          <Button type="submit" fullWidth disabled={!canSubmit}>
            {isCreating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
            Create group ({selectedIds.length} selected)
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
