import { useState } from 'react';
import { Button, TextField } from '../ui';
import { SettingsSelect } from './SettingsSelect';
import type { SettingsModalFields, SettingsSelectOption } from './types';
import styles from '../SettingsModal.module.css';

type TimeoutOption = '1' | '5' | '10' | '60' | '1440' | '10080';

const TIMEOUT_OPTIONS: SettingsSelectOption<TimeoutOption>[] = [
  { value: '1', label: '60 seconds' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '60', label: '1 hour' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '1 week' },
];

type MemberModerationSectionProps = Pick<
  SettingsModalFields,
  'selectedMember' | 'pendingAction' | 'removeMember' | 'banMember' | 'timeoutMember'
> & {
  canKick: boolean;
  canBan: boolean;
};

export function MemberModerationSection({
  selectedMember,
  pendingAction,
  removeMember,
  banMember,
  timeoutMember,
  canKick,
  canBan,
}: MemberModerationSectionProps) {
  const [timeoutMinutes, setTimeoutMinutes] = useState<TimeoutOption>('10');
  const [isConfirmingBan, setIsConfirmingBan] = useState(false);
  const [banReason, setBanReason] = useState('');

  if (!selectedMember || selectedMember.kind === 'OWNER' || (!canKick && !canBan)) return null;

  const timeoutUntil = selectedMember.timeoutUntil ? new Date(selectedMember.timeoutUntil) : null;
  const isTimedOut = Boolean(timeoutUntil && timeoutUntil.getTime() > Date.now());
  const name = selectedMember.user.displayName;

  return (
    <section className={styles.settingsSection} aria-labelledby="member-moderation-title">
      <div className={styles.settingsSectionHeading}>
        <strong id="member-moderation-title">Moderation</strong>
        <span>
          {isTimedOut && timeoutUntil
            ? `${name} is timed out until ${timeoutUntil.toLocaleString()}.`
            : `Time out, kick, or ban ${name}.`}
        </span>
      </div>

      {canKick ? (
        <div className={styles.moderationRow}>
          <SettingsSelect
            name="timeoutMinutes"
            label="Timeout duration"
            defaultValue={timeoutMinutes}
            options={TIMEOUT_OPTIONS}
            onValueChange={setTimeoutMinutes}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pendingAction === `member-timeout-${selectedMember.id}`}
            onClick={() => void timeoutMember(selectedMember.id, Number(timeoutMinutes))}
          >
            Time out
          </Button>
          {isTimedOut ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pendingAction === `member-timeout-${selectedMember.id}`}
              onClick={() => void timeoutMember(selectedMember.id, 0)}
            >
              Remove timeout
            </Button>
          ) : null}
        </div>
      ) : null}

      {isConfirmingBan ? (
        <form
          className={styles.moderationRow}
          onSubmit={(event) => {
            event.preventDefault();
            void banMember(selectedMember.user.id, banReason).then((banned) => {
              if (banned) setIsConfirmingBan(false);
            });
          }}
        >
          <TextField
            label={`Reason for banning ${name}`}
            value={banReason}
            maxLength={512}
            placeholder="Optional"
            onChange={(event) => setBanReason(event.target.value)}
            autoFocus
          />
          <Button
            type="submit"
            variant="danger"
            disabled={pendingAction === `member-ban-${selectedMember.user.id}`}
          >
            Confirm ban
          </Button>
          <Button type="button" variant="ghost" onClick={() => setIsConfirmingBan(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className={styles.settingsModalFooter}>
          {canKick ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pendingAction === `member-remove-${selectedMember.id}`}
              onClick={() => void removeMember(selectedMember.id)}
            >
              Kick member
            </Button>
          ) : null}
          {canBan ? (
            <Button type="button" variant="danger" onClick={() => setIsConfirmingBan(true)}>
              Ban member
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
