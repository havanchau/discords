import { useState } from 'react';
import { Loader2, Megaphone, Trash2 } from 'lucide-react';
import type { ChannelFollowEndpoint } from '@discord-clone/shared';
import type { ChannelFollow } from '@/api';
import { Button, IconButton } from '@/components/ui';
import { useChannelFollowers, useFollowedChannels } from '@/hooks/useChannelFollows';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ChannelFollowsSection.module.css';

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function FollowIdentity({
  endpoint,
  createdAt,
}: {
  endpoint: ChannelFollowEndpoint;
  createdAt: string;
}) {
  const t = useTranslation();
  const dates = useDateFormat();
  return (
    <span className={styles.identity}>
      <Megaphone size={16} aria-hidden="true" />
      <span className={styles.identityText}>
        <strong>
          {t('announcement.endpoint', {
            server: endpoint.serverName,
            channel: endpoint.channelName,
          })}
        </strong>
        <small>{t('announcement.followedAt', { date: dates.absolute(createdAt) })}</small>
      </span>
    </span>
  );
}

/**
 * Source side, in an ANNOUNCEMENT channel's settings: which channels receive its published messages.
 * Read-only here, because unfollowing is decided by whoever manages the receiving channel.
 */
export function ChannelFollowersSection({ channelId }: { channelId: string }) {
  const t = useTranslation();
  const { followers, isLoading, error } = useChannelFollowers(channelId);

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="channel-followers-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="channel-followers-title">
          {t('announcement.followers.title', { count: followers.length })}
        </strong>
        <span>{t('announcement.followers.hint')}</span>
      </div>
      <div className={settingsStyles.inviteList}>
        {isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('announcement.loading')}
          </p>
        ) : error ? (
          <p className="empty-note" role="alert">
            {errorText(error, t('error.fallback.cannot-load-followers'))}
          </p>
        ) : followers.length ? (
          followers.map((follow) => (
            <div className={settingsStyles.inviteRow} key={follow.id}>
              <FollowIdentity endpoint={follow.target} createdAt={follow.createdAt} />
            </div>
          ))
        ) : (
          <p className="empty-note">{t('announcement.followers.empty')}</p>
        )}
      </div>
    </section>
  );
}

/**
 * Target side, in a text or announcement channel's settings: the announcement channels it follows,
 * each with an unfollow that asks for an inline confirmation first.
 */
export function FollowedChannelsSection({ channelId }: { channelId: string }) {
  const t = useTranslation();
  const followed = useFollowedChannels(channelId);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unfollow(follow: ChannelFollow) {
    setConfirmId(null);
    setError(null);
    try {
      await followed.unfollow(follow);
    } catch (err) {
      setError(errorText(err, t('error.fallback.cannot-unfollow-channel')));
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="channel-followed-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="channel-followed-title">
          {t('announcement.followed.title', { count: followed.follows.length })}
        </strong>
        <span>{t('announcement.followed.hint')}</span>
      </div>
      {error ? (
        <p className="empty-note" role="alert">
          {error}
        </p>
      ) : null}
      <div className={settingsStyles.inviteList}>
        {followed.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('announcement.loading')}
          </p>
        ) : followed.error ? (
          <p className="empty-note" role="alert">
            {errorText(followed.error, t('error.fallback.cannot-load-followed-channels'))}
          </p>
        ) : followed.follows.length ? (
          followed.follows.map((follow) => {
            const name = t('announcement.endpoint', {
              server: follow.source.serverName,
              channel: follow.source.channelName,
            });
            return (
              <div className={settingsStyles.inviteRow} key={follow.id}>
                <FollowIdentity endpoint={follow.source} createdAt={follow.createdAt} />
                {confirmId === follow.id ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={followed.isBusy}
                      onClick={() => void unfollow(follow)}
                    >
                      {t('announcement.followed.confirmUnfollow')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <IconButton
                    label={t('announcement.followed.unfollow', { name })}
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmId(follow.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                )}
              </div>
            );
          })
        ) : (
          <p className="empty-note">{t('announcement.followed.empty')}</p>
        )}
      </div>
    </section>
  );
}
