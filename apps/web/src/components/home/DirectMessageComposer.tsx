import type { FormEvent } from 'react';
import { Button, TextField } from '../ui';
import styles from './HomePanel.module.css';

type DirectMessageComposerProps = {
  username: string;
  pendingAction: string | null;
  onSendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function DirectMessageComposer({ username, pendingAction, onSendDirectMessage }: DirectMessageComposerProps) {
  return (
    <form className={styles.composer} onSubmit={onSendDirectMessage}>
      <TextField
        className={styles.composerInput}
        name="content"
        placeholder={`Message @${username}`}
        autoComplete="off"
        aria-label={`Message @${username}`}
      />
      <Button type="submit" disabled={pendingAction === 'direct-message'}>
        Send
      </Button>
    </form>
  );
}
