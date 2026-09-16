import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { FriendEntry } from '../../api';
import { useTranslation } from '../../i18n/LocaleProvider';
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
  const t = useTranslation();
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
        title={t('group.create.title')}
        description={t('group.create.description', {
          min: MIN_OTHER_MEMBERS,
          max: MAX_OTHER_MEMBERS,
        })}
      >
        <form className={styles.groupForm} onSubmit={submit}>
          <TextField
            label={t('group.field.name')}
            value={name}
            maxLength={100}
            placeholder={t('group.field.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
          {friends.length ? (
            <div className={styles.groupFriendList} role="group" aria-label={t('group.friendsLabel')}>
              {friends.map((friend) => {
                const checked = selectedIds.includes(friend.user.id);
                const limitReached = !checked && selectedIds.length >= MAX_OTHER_MEMBERS;
                return (
                  <label key={friend.user.id} className={styles.groupFriendRow}>
                    <Checkbox
                      checked={checked}
                      disabled={limitReached}
                      aria-label={t('group.addFriend', { name: friend.user.displayName })}
                      onCheckedChange={(next) => toggle(friend.user.id, next === true)}
                    />
                    <UserAvatar user={friend.user} />
                    <span>{friend.user.displayName}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="empty-note">{t('group.needFriends')}</p>
          )}
          <Button type="submit" fullWidth disabled={!canSubmit}>
            {isCreating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
            {t('group.create.action', { count: selectedIds.length })}
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
