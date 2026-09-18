import type { StageMember } from '@discord-clone/shared';
import { accentClass, initials } from '@/helpers';
import { Avatar, Button } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './Stage.module.css';

interface StageModeratorQueueProps {
  requests: StageMember[];
  speakers: StageMember[];
  viewerId: string;
  disabled: boolean;
  onSetSpeaker: (userId: string, isSpeaker: boolean) => void;
}

/** Shown to members holding `MUTE_MEMBERS`; the API re-checks every action. */
export function StageModeratorQueue({
  requests,
  speakers,
  viewerId,
  disabled,
  onSetSpeaker,
}: StageModeratorQueueProps) {
  const t = useTranslation();
  const otherSpeakers = speakers.filter((member) => member.userId !== viewerId);

  return (
    <section className={styles.queue} aria-label={t('stage.moderation')}>
      <h3 className={styles.sectionTitle}>{t('stage.requests', { count: requests.length })}</h3>
      {requests.length ? (
        <ul className={styles.memberList}>
          {requests.map((member) => (
            <li key={member.userId} className={styles.memberRow}>
              <Avatar
                alt={member.displayName}
                fallback={initials(member.displayName)}
                size="sm"
                className={accentClass(member.userId)}
              />
              <span className={styles.memberName}>{member.displayName}</span>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => onSetSpeaker(member.userId, true)}
              >
                {t('stage.approve')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">{t('stage.noRequests')}</p>
      )}

      {otherSpeakers.length ? (
        <>
          <h3 className={styles.sectionTitle}>{t('stage.manageSpeakers')}</h3>
          <ul className={styles.memberList}>
            {otherSpeakers.map((member) => (
              <li key={member.userId} className={styles.memberRow}>
                <Avatar
                  alt={member.displayName}
                  fallback={initials(member.displayName)}
                  size="sm"
                  className={accentClass(member.userId)}
                />
                <span className={styles.memberName}>{member.displayName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onSetSpeaker(member.userId, false)}
                >
                  {t('stage.removeFromStage')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
