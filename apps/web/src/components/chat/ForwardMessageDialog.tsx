import { useMemo, useState, type FormEvent } from 'react';
import { Hash, Loader2, MessageSquare } from 'lucide-react';
import { useAuthContext } from '@/contexts/appContexts';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { conversationDisplayName } from '@/components/home/conversationDisplay';
import { type ForwardSourceType, useForwardMessage } from '@/hooks/useForwardMessage';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import { Button, DialogContent, DialogRoot, TextArea, TextField } from '@/components/ui';
import styles from './ForwardMessageDialog.module.css';

const MAX_COMMENT_LENGTH = 2000;

interface Destination {
  type: 'channel' | 'conversation';
  id: string;
  label: string;
  group: string;
}

interface ForwardMessageDialogProps {
  sourceType: ForwardSourceType;
  messageId: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Destination picker for "Forward". Lists the text channels and conversations already loaded for the
 * sidebar; the server re-checks read and write access when the forward is sent.
 */
export function ForwardMessageDialog({
  sourceType,
  messageId,
  onOpenChange,
}: ForwardMessageDialogProps) {
  const t = useTranslation();
  const { auth } = useAuthContext();
  const { servers, directConversations, isChannelEncrypted } = useWorkspace();
  const forward = useForwardMessage(sourceType, messageId);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Destination | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const viewerId = auth?.user.id ?? '';

  const destinations = useMemo<Destination[]>(
    () => [
      ...servers.flatMap((server) =>
        server.channels
          // A forward is stored as plaintext, so it is not offered into a channel this client encrypts.
          .filter(
            (channel) =>
              (channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT') &&
              !isChannelEncrypted(channel.id),
          )
          .map((channel) => ({
            type: 'channel' as const,
            id: channel.id,
            label: channel.name,
            group: server.name,
          })),
      ),
      ...directConversations.map((conversation) => ({
        type: 'conversation' as const,
        id: conversation.id,
        label: conversationDisplayName(conversation, viewerId),
        group: t('forward.directMessagesGroup'),
      })),
    ],
    [servers, directConversations, isChannelEncrypted, viewerId, t],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? destinations.filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.group.toLowerCase().includes(normalizedQuery),
      )
    : destinations;
  const groups = [...new Set(visible.map((item) => item.group))];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || forward.isPending) return;
    setError(null);
    try {
      await forward.mutateAsync({
        destinationType: selected.type,
        destinationId: selected.id,
        comment: comment.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-forward-message'));
    }
  }

  return (
    <DialogRoot open onOpenChange={onOpenChange}>
      <DialogContent title={t('forward.title')} description={t('forward.description')}>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <TextField
            value={query}
            placeholder={t('forward.searchPlaceholder')}
            aria-label={t('forward.searchPlaceholder')}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.list} role="group" aria-label={t('forward.destinationsLabel')}>
            {groups.length ? (
              groups.map((group) => (
                <div key={group} className={styles.group}>
                  <span className={styles.groupName}>{group}</span>
                  {visible
                    .filter((item) => item.group === group)
                    .map((item) => {
                      const isSelected = selected?.type === item.type && selected.id === item.id;
                      const Icon = item.type === 'channel' ? Hash : MessageSquare;
                      return (
                        <button
                          key={`${item.type}:${item.id}`}
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
              <p className="empty-note">{t('forward.noDestinations')}</p>
            )}
          </div>
          <TextArea
            label={t('forward.commentLabel')}
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
            placeholder={t('forward.commentPlaceholder')}
            onChange={(event) => setComment(event.target.value)}
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={!selected || forward.isPending}>
            {forward.isPending ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
            {selected
              ? t('forward.sendTo', {
                  destination: selected.type === 'channel' ? `#${selected.label}` : selected.label,
                })
              : t('forward.send')}
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
