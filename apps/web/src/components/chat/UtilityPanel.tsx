import { FormEvent } from 'react';
import { Pin } from 'lucide-react';
import { Message } from '../../api';
import { previewText } from '../../helpers';
import { Button, TextField } from '../ui';
import type { ActivePanel } from './types';
import styles from './UtilityPanel.module.css';

interface UtilityPanelProps {
  activePanel: ActivePanel;
  searchQuery: string;
  pinnedMessages: Message[];
  isChannelEncrypted: boolean;
  setSearchQuery: (value: string) => void;
  configureChannelEncryption: (passphrase: string) => Promise<void>;
  clearChannelEncryption: () => void;
}

export function UtilityPanel({
  activePanel,
  searchQuery,
  pinnedMessages,
  isChannelEncrypted,
  setSearchQuery,
  configureChannelEncryption,
  clearChannelEncryption,
}: UtilityPanelProps) {
  if (!activePanel) return null;

  function handleEncryptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void configureChannelEncryption(String(form.get('passphrase') || ''));
    event.currentTarget.reset();
  }

  return (
    <div className={`${styles.utilityPanel} ${styles.utilityPanelOpen}`}>
      {activePanel === 'search' && (
        <TextField
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          label="Search messages"
          placeholder="Keyword in current channel"
          data-testid="search-input"
        />
      )}

      {activePanel === 'notifications' && (
        <div className={styles.notificationPanel}>
          <strong>Pinned messages</strong>
          {pinnedMessages.length ? (
            pinnedMessages.map((message) => (
              <Button
                variant="ghost"
                key={message.id}
                className={styles.pinButton}
                onClick={() =>
                  document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                <Pin size={13} aria-hidden="true" />
                <span>{previewText(message)}</span>
              </Button>
            ))
          ) : (
            <div className={styles.notificationEmpty}>No pinned messages in this channel.</div>
          )}
        </div>
      )}

      {activePanel === 'encryption' && (
        <form className={styles.encryptionPanel} onSubmit={handleEncryptionSubmit}>
          <strong>{isChannelEncrypted ? 'Encrypted channel session' : 'Enable E2EE'}</strong>
          <span>
            Messages are encrypted in this browser before they are sent. Share the passphrase
            out-of-band with trusted members.
          </span>
          <TextField
            name="passphrase"
            type="password"
            minLength={8}
            placeholder="Channel passphrase"
            autoComplete="off"
            required
          />
          <div className={styles.encryptionActions}>
            <Button size="sm" type="submit">
              {isChannelEncrypted ? 'Update key' : 'Enable'}
            </Button>
            {isChannelEncrypted && (
              <Button size="sm" variant="ghost" onClick={clearChannelEncryption}>
                Forget key
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
