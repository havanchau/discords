import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DirectConversation, SavedMessage } from '@/api';
import { conversationDisplayName } from '@/components/home/conversationDisplay';
import { useAuthContext } from '@/contexts/appContexts';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { useTranslation } from '@/i18n/LocaleProvider';
import { DialogContent, DialogRoot } from '@/components/ui';
import { SavedMessageRow } from './SavedMessageRow';
import styles from './SavedMessagesPanel.module.css';

interface SavedMessagesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: DirectConversation[];
  onOpenChannel: (serverId: string, channelId: string) => void;
  onOpenConversation: (conversation: DirectConversation) => void;
}

export function SavedMessagesPanel({
  open,
  onOpenChange,
  conversations,
  onOpenChannel,
  onOpenConversation,
}: SavedMessagesPanelProps) {
  const t = useTranslation();
  const { auth } = useAuthContext();
  const { savedMessages, isLoading, error, refetch, remove } = useSavedMessages({ enabled: open });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Access is recomputed by the API on every read, so opening the list always asks again.
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const conversationsById = new Map(conversations.map((item) => [item.id, item]));

  function sourceLabel(savedMessage: SavedMessage) {
    if (savedMessage.sourceType === 'CHANNEL') {
      return savedMessage.channelName
        ? t('saved.source.channel', {
            channel: savedMessage.channelName,
            server: savedMessage.serverName ?? '',
          })
        : t('saved.source.unknownChannel');
    }
    const conversation = savedMessage.conversationId
      ? conversationsById.get(savedMessage.conversationId)
      : undefined;
    return conversation && auth
      ? conversationDisplayName(conversation, auth.user.id)
      : t('saved.source.directMessage');
  }

  function jump(savedMessage: SavedMessage) {
    if (savedMessage.sourceType === 'CHANNEL') {
      if (!savedMessage.serverId || !savedMessage.channelId) return;
      onOpenChannel(savedMessage.serverId, savedMessage.channelId);
    } else {
      const conversation = savedMessage.conversationId
        ? conversationsById.get(savedMessage.conversationId)
        : undefined;
      if (!conversation) {
        setActionError(t('saved.conversationNotLoaded'));
        return;
      }
      onOpenConversation(conversation);
    }
    onOpenChange(false);
  }

  async function removeSaved(savedMessageId: string) {
    setRemovingId(savedMessageId);
    setActionError(null);
    try {
      await remove(savedMessageId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t('error.fallback.cannot-remove-saved-message'),
      );
    } finally {
      setRemovingId(null);
    }
  }

  const loadError = error
    ? error instanceof Error
      ? error.message
      : t('error.fallback.cannot-load-saved-messages')
    : null;

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('saved.title')} description={t('saved.description')}>
        <div className={styles.body}>
          {loadError || actionError ? (
            <p className="empty-note" role="alert">
              {actionError ?? loadError}
            </p>
          ) : null}
          {isLoading && !savedMessages.length ? (
            <p className="empty-note" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" /> {t('saved.loading')}
            </p>
          ) : savedMessages.length ? (
            <ul className={styles.list} aria-label={t('saved.listLabel')}>
              {savedMessages.map((savedMessage) => (
                <SavedMessageRow
                  key={savedMessage.id}
                  savedMessage={savedMessage}
                  sourceLabel={sourceLabel(savedMessage)}
                  isRemoving={removingId === savedMessage.id}
                  onJump={jump}
                  onRemove={(savedMessageId) => void removeSaved(savedMessageId)}
                />
              ))}
            </ul>
          ) : loadError ? null : (
            <p className="empty-note">{t('saved.empty')}</p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
