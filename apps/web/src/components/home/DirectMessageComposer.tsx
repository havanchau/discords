import type { FormEvent } from 'react';
import { Reply, X } from 'lucide-react';
import type { DirectMessage } from '../../api';
import { Button, IconButton, TextField } from '../ui';
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
  return (
    <div className={styles.composerArea}>
      {replyingTo ? (
        <div className={styles.composerReply} data-testid="direct-composer-reply">
          <Reply size={14} aria-hidden="true" />
          <span>
            Replying to <strong>{replyingToName ?? 'message'}</strong>
          </span>
          <IconButton label="Cancel reply" size="sm" onClick={onCancelReply}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <form className={styles.composer} onSubmit={onSendDirectMessage}>
        <TextField
          className={styles.composerInput}
          name="content"
          value={draft}
          placeholder={`Message ${placeholderName}`}
          autoComplete="off"
          aria-label={`Message ${placeholderName}`}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && replyingTo) onCancelReply();
          }}
        />
        <Button type="submit" disabled={pendingAction === 'direct-message'}>
          Send
        </Button>
      </form>
    </div>
  );
}
