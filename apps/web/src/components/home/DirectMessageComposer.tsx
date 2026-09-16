import type { FormEvent } from 'react';
import { Reply, X } from 'lucide-react';
import type { DirectMessage } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, IconButton, TextField } from '@/components/ui';
import styles from './HomePanel.module.css';

type DirectMessageComposerProps = {
  placeholderName: string;
  draft: string;
  pendingAction: string | null;
  replyingTo: DirectMessage | null;
  replyingToName: string | null;
  onCancelReply: () => void;
  onSendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onDraftChange: (value: string) => void;
};

export function DirectMessageComposer({
  placeholderName,
  draft,
  pendingAction,
  replyingTo,
  replyingToName,
  onCancelReply,
  onSendDirectMessage,
  onDraftChange,
}: DirectMessageComposerProps) {
  const t = useTranslation();

  return (
    <div className={styles.composerArea}>
      {replyingTo ? (
        <div className={styles.composerReply} data-testid="direct-composer-reply">
          <Reply size={14} aria-hidden="true" />
          <span>
            {t('composer.replyingTo')}{' '}
            <strong>{replyingToName ?? t('dm.composer.replyFallback')}</strong>
          </span>
          <IconButton label={t('composer.cancelReply')} size="sm" onClick={onCancelReply}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <form className={styles.composer} onSubmit={(event) => void onSendDirectMessage(event)}>
        <TextField
          className={styles.composerInput}
          name="content"
          value={draft}
          placeholder={t('dm.composer.placeholder', { name: placeholderName })}
          autoComplete="off"
          aria-label={t('dm.composer.placeholder', { name: placeholderName })}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && replyingTo) onCancelReply();
          }}
        />
        <Button type="submit" disabled={pendingAction === 'direct-message'}>
          {t('common.send')}
        </Button>
      </form>
    </div>
  );
}
