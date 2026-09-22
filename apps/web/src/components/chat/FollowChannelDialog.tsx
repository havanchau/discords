import { useMemo, useState, type FormEvent } from 'react';
import { Hash, Loader2, Megaphone } from 'lucide-react';
import type { Channel } from '@/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFollowChannel } from '@/hooks/useChannelFollows';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { Button, DialogContent, DialogRoot, TextField } from '@/components/ui';
// Same destination list as the forward picker, so both pickers look and behave alike.
import styles from './ForwardMessageDialog.module.css';

interface Target {
  id: string;
  label: string;
  group: string;
  type: Channel['type'];
}

interface FollowChannelDialogProps {
  source: Channel;
  onOpenChange: (open: boolean) => void;
}

/**
 * Picks the channel that will receive copies of what `source` publishes. Lists the text and
 * announcement channels already loaded for the sidebar; the API checks MANAGE_CHANNELS on the chosen
 * channel, since the sidebar data does not carry per-server permissions.
 */
export function FollowChannelDialog({ source, onOpenChange }: FollowChannelDialogProps) {
  const t = useTranslation();
  const { servers } = useWorkspace();
  const followChannel = useFollowChannel(source.id);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followedLabel, setFollowedLabel] = useState<string | null>(null);

  const targets = useMemo<Target[]>(
    () =>
      servers.flatMap((server) =>
        server.channels
          .filter(
            (channel) =>
              channel.id !== source.id &&
              (channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT') &&
              // Copies of an age-restricted channel may only land in another age-restricted channel.
              (!source.isAgeRestricted || channel.isAgeRestricted),
          )
          .map((channel) => ({
            id: channel.id,
            label: channel.name,
            group: server.name,
            type: channel.type,
          })),
      ),
    [servers, source.id, source.isAgeRestricted],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? targets.filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.group.toLowerCase().includes(normalizedQuery),
      )
    : targets;
  const groups = [...new Set(visible.map((item) => item.group))];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || followChannel.isPending) return;
    setError(null);
    try {
      await followChannel.mutateAsync({ targetChannelId: selected.id });
      setFollowedLabel(
        t('announcement.endpoint', { server: selected.group, channel: selected.label }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-follow-channel'));
    }
  }

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent
        title={t('announcement.follow.title', { channel: source.name })}
        description={t('announcement.follow.description')}
      >
        {followedLabel ? (
          <div className={styles.form}>
            <p role="status">{t('announcement.follow.done', { target: followedLabel })}</p>
            <Button fullWidth onClick={() => onOpenChange(false)}>
              {t('announcement.follow.close')}
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <TextField
              value={query}
              placeholder={t('announcement.follow.searchPlaceholder')}
              aria-label={t('announcement.follow.searchPlaceholder')}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className={styles.list}
              role="group"
              aria-label={t('announcement.follow.targetsLabel')}
            >
              {groups.length ? (
                groups.map((group) => (
                  <div key={group} className={styles.group}>
                    <span className={styles.groupName}>{group}</span>
                    {visible
                      .filter((item) => item.group === group)
                      .map((item) => {
                        const isSelected = selected?.id === item.id;
                        const Icon = item.type === 'ANNOUNCEMENT' ? Megaphone : Hash;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(styles.destination, isSelected && styles.selected)}
                            aria-pressed={isSelected}
                            onClick={() => setSelected(item)}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                  </div>
                ))
              ) : (
                <p className="empty-note">{t('announcement.follow.noTargets')}</p>
              )}
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" fullWidth disabled={!selected || followChannel.isPending}>
              {followChannel.isPending ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : null}
              {selected
                ? t('announcement.follow.submitTo', { target: `#${selected.label}` })
                : t('announcement.follow.submit')}
            </Button>
          </form>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
