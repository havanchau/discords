import type { FormEvent } from 'react';
import { Button, TextField } from '../ui';
import styles from './HomePanel.module.css';

type DirectMessageComposerProps = {
  username: string;
  draft: string;
  pendingAction: string | null;
  onSendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onDraftChange: (value: string) => void;
};

export function DirectMessageComposer({
  username,
  draft,
  pendingAction,
  onSendDirectMessage,
  onDraftChange,
}: DirectMessageComposerProps) {
  return (
    <form className={styles.composer} onSubmit={onSendDirectMessage}>
      <TextField
        className={styles.composerInput}
        name="content"
        value={draft}
        placeholder={`Message @${username}`}
        autoComplete="off"
        aria-label={`Message @${username}`}
        onChange={(event) => onDraftChange(event.target.value)}
      />
      <Button type="submit" disabled={pendingAction === 'direct-message'}>
        Send
      </Button>
    </form>
  );
}
