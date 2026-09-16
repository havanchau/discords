import { useState } from 'react';
import { useTranslation, type Translate } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
import { Button, TextField } from '../ui';
import { SettingsSelect } from './SettingsSelect';
import type { SettingsModalFields, SettingsSelectOption } from './types';
import styles from '../SettingsModal.module.css';

type TimeoutOption = '1' | '5' | '10' | '60' | '1440' | '10080';

function timeoutOptions(t: Translate): SettingsSelectOption<TimeoutOption>[] {
  return [
    { value: '1', label: t('moderation.timeout.60s') },
    { value: '5', label: t('moderation.timeout.5m') },
    { value: '10', label: t('moderation.timeout.10m') },
    { value: '60', label: t('moderation.timeout.1h') },
    { value: '1440', label: t('moderation.timeout.1d') },
    { value: '10080', label: t('moderation.timeout.1w') },
  ];
}

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
  const t = useTranslation();
  const dates = useDateFormat();
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
        <strong id="member-moderation-title">{t('moderation.section.title')}</strong>
        <span>
          {isTimedOut && timeoutUntil
            ? t('moderation.timedOutUntil', { name, date: dates.absolute(timeoutUntil) })
            : t('moderation.hint', { name })}
        </span>
      </div>

      {canKick ? (
        <div className={styles.moderationRow}>
          <SettingsSelect
            name="timeoutMinutes"
            label={t('moderation.field.timeoutDuration')}
            defaultValue={timeoutMinutes}
            options={timeoutOptions(t)}
            onValueChange={setTimeoutMinutes}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pendingAction === `member-timeout-${selectedMember.id}`}
            onClick={() => void timeoutMember(selectedMember.id, Number(timeoutMinutes))}
          >
            {t('moderation.action.timeout')}
          </Button>
          {isTimedOut ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pendingAction === `member-timeout-${selectedMember.id}`}
              onClick={() => void timeoutMember(selectedMember.id, 0)}
            >
              {t('moderation.action.removeTimeout')}
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
            label={t('moderation.field.banReason', { name })}
            value={banReason}
            maxLength={512}
            placeholder={t('moderation.field.banReasonPlaceholder')}
            onChange={(event) => setBanReason(event.target.value)}
            autoFocus
          />
          <Button
            type="submit"
            variant="danger"
            disabled={pendingAction === `member-ban-${selectedMember.user.id}`}
          >
            {t('moderation.action.confirmBan')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setIsConfirmingBan(false)}>
            {t('common.cancel')}
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
              {t('moderation.action.kick')}
            </Button>
          ) : null}
          {canBan ? (
            <Button type="button" variant="danger" onClick={() => setIsConfirmingBan(true)}>
              {t('moderation.action.ban')}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
