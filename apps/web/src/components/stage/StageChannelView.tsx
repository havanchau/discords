import { useState } from 'react';
import { Hand, Loader2, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import type { StageMember } from '@discord-clone/shared';
import type { AuthState, Channel } from '@/api';
import { accentClass, initials, type CallParticipant } from '@/helpers';
import { RemoteVideoTile } from '@/components/RemoteVideoTile';
import { Avatar, Button, IconButton } from '@/components/ui';
import type { ChatPanelCall } from '@/components/chat/types';
import { useStageRoster } from '@/hooks/useStageRoster';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { StageModeratorQueue } from './StageModeratorQueue';
import styles from './Stage.module.css';

interface StageChannelViewProps {
  auth: AuthState;
  channel: Channel;
  call: ChatPanelCall;
}

/** Replaces the message list and composer for a STAGE channel (`stage-channels.md`). */
export function StageChannelView({ auth, channel, call }: StageChannelViewProps) {
  const t = useTranslation();
  const stage = useStageRoster(channel.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const viewerId = auth.user.id;
  const state = call.state?.channelId === channel.id ? call.state : null;
  const isInOtherCall = Boolean(call.state && !state);

  const speakerIds = new Set(stage.roster?.speakers.map((member) => member.userId) ?? []);
  const hasRequested = Boolean(stage.roster?.requests.some((member) => member.userId === viewerId));
  const isSpeaker = state?.stageRole === 'speaker';
  const canModerate = Boolean(stage.roster?.canModerate);
  const liveSpeakers = state ? call.remoteMedia.filter((item) => speakerIds.has(item.userId)) : [];
  const audience = state ? call.remoteMedia.filter((item) => !speakerIds.has(item.userId)) : [];

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.stage-action'));
    }
  }

  return (
    <div className={styles.stage} data-testid="stage-channel-view">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <Radio size={18} aria-hidden="true" />
          <strong>{channel.topic || t('stage.title')}</strong>
        </div>
        {state ? (
          <div className={styles.controls}>
            {isSpeaker ? (
              <>
                <IconButton
                  label={state.isMuted ? t('stage.unmute') : t('stage.mute')}
                  variant={state.isMuted ? 'danger' : 'ghost'}
                  onClick={call.toggleMute}
                >
                  {state.isMuted ? (
                    <MicOff size={17} aria-hidden="true" />
                  ) : (
                    <Mic size={17} aria-hidden="true" />
                  )}
                </IconButton>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stage.isUpdating}
                  onClick={() =>
                    void run(() => stage.setSpeaker({ userId: viewerId, isSpeaker: false }))
                  }
                >
                  {t('stage.moveToAudience')}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={hasRequested ? 'secondary' : 'primary'}
                disabled={stage.isUpdating}
                aria-pressed={hasRequested}
                onClick={() => void run(() => stage.setRequested(!hasRequested))}
              >
                <Hand size={16} aria-hidden="true" />
                {hasRequested ? t('stage.withdrawRequest') : t('stage.requestToSpeak')}
              </Button>
            )}
            <IconButton label={t('call.leave')} variant="danger" onClick={call.end}>
              <PhoneOff size={17} aria-hidden="true" />
            </IconButton>
          </div>
        ) : (
          <Button
            size="sm"
            disabled={isInOtherCall}
            title={isInOtherCall ? t('call.leaveCurrentFirst') : undefined}
            onClick={() => void call.start('voice', { receiveOnly: true })}
            data-testid="stage-join-button"
          >
            {t('stage.join')}
          </Button>
        )}
      </div>

      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={styles.body}>
        {stage.isLoading ? (
          <p className="empty-note">
            <Loader2 className="spin" size={16} aria-hidden="true" /> {t('stage.loading')}
          </p>
        ) : stage.error ? (
          <p className="empty-note" role="alert">
            {stage.error instanceof Error
              ? stage.error.message
              : t('error.fallback.cannot-load-stage')}
          </p>
        ) : (
          <>
            <section aria-label={t('stage.speakers')}>
              <h3 className={styles.sectionTitle}>{t('stage.speakers')}</h3>
              {state ? (
                <div className={styles.speakerGrid}>
                  {isSpeaker ? (
                    <div className={cn(styles.selfTile, 'call-tile')}>
                      <Avatar
                        alt={auth.user.displayName}
                        fallback={initials(auth.user.displayName)}
                        className={accentClass(viewerId)}
                      />
                      <strong>{auth.user.displayName}</strong>
                      <span>{state.isMuted ? t('call.muted') : t('call.you')}</span>
                    </div>
                  ) : null}
                  {liveSpeakers.map((participant) => (
                    <RemoteVideoTile key={participant.socketId} participant={participant} />
                  ))}
                  {!isSpeaker && liveSpeakers.length === 0 ? (
                    <p className="empty-note">{t('stage.noSpeakers')}</p>
                  ) : null}
                </div>
              ) : (
                <MemberList
                  members={stage.roster?.speakers ?? []}
                  emptyLabel={t('stage.noSpeakers')}
                />
              )}
            </section>

            {state ? (
              <section aria-label={t('stage.audience')}>
                <h3 className={styles.sectionTitle}>
                  {t('stage.audienceCount', { count: audience.length + (isSpeaker ? 0 : 1) })}
                </h3>
                <ul className={styles.memberList}>
                  {isSpeaker ? null : (
                    <li className={styles.memberRow}>
                      <Avatar
                        alt={auth.user.displayName}
                        fallback={initials(auth.user.displayName)}
                        size="sm"
                        className={accentClass(viewerId)}
                      />
                      <span className={styles.memberName}>
                        {t('stage.youListening', { name: auth.user.displayName })}
                      </span>
                    </li>
                  )}
                  {audience.map((participant) => (
                    <AudienceRow
                      key={participant.socketId}
                      participant={participant}
                      canInvite={canModerate}
                      disabled={stage.isUpdating}
                      onInvite={() =>
                        void run(() =>
                          stage.setSpeaker({ userId: participant.userId, isSpeaker: true }),
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {state && canModerate ? (
              <StageModeratorQueue
                requests={stage.roster?.requests ?? []}
                speakers={stage.roster?.speakers ?? []}
                viewerId={viewerId}
                disabled={stage.isUpdating}
                onSetSpeaker={(userId, isSpeaker) =>
                  void run(() => stage.setSpeaker({ userId, isSpeaker }))
                }
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MemberList({ members, emptyLabel }: { members: StageMember[]; emptyLabel: string }) {
  if (!members.length) return <p className="empty-note">{emptyLabel}</p>;
  return (
    <ul className={styles.memberList}>
      {members.map((member) => (
        <li key={member.userId} className={styles.memberRow}>
          <Avatar
            alt={member.displayName}
            fallback={initials(member.displayName)}
            size="sm"
            className={accentClass(member.userId)}
          />
          <span className={styles.memberName}>{member.displayName}</span>
        </li>
      ))}
    </ul>
  );
}

function AudienceRow({
  participant,
  canInvite,
  disabled,
  onInvite,
}: {
  participant: CallParticipant;
  canInvite: boolean;
  disabled: boolean;
  onInvite: () => void;
}) {
  const t = useTranslation();
  return (
    <li className={styles.memberRow}>
      <Avatar
        alt={participant.displayName}
        fallback={initials(participant.displayName)}
        size="sm"
        className={accentClass(participant.userId)}
      />
      <span className={styles.memberName}>{participant.displayName}</span>
      {canInvite ? (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onInvite}>
          {t('stage.inviteToSpeak')}
        </Button>
      ) : null}
    </li>
  );
}
