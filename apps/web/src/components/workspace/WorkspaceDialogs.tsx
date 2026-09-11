import { Loader2, Plus, UserPlus } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button, DialogContent, DialogRoot, TextField } from '../ui';
import styles from './WorkspaceDialogs.module.css';
import type { ChannelCreateType, ServerAction } from './types';

interface WorkspaceDialogsProps {
  serverAction: ServerAction | null;
  setServerAction: (action: ServerAction | null) => void;
  channelCreateType: ChannelCreateType | null;
  setChannelCreateType: (type: ChannelCreateType | null) => void;
  pendingAction: string | null;
  createServer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  joinInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  createChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function WorkspaceDialogs({
  serverAction,
  setServerAction,
  channelCreateType,
  setChannelCreateType,
  pendingAction,
  createServer,
  joinInvite,
  createChannel,
}: WorkspaceDialogsProps) {
  async function submitCreateServer(event: FormEvent<HTMLFormElement>) {
    await createServer(event);
    setServerAction(null);
  }

  async function submitJoinInvite(event: FormEvent<HTMLFormElement>) {
    await joinInvite(event);
    setServerAction(null);
  }

  async function submitCreateChannel(event: FormEvent<HTMLFormElement>) {
    await createChannel(event);
    setChannelCreateType(null);
  }

  return (
    <>
      <DialogRoot open={Boolean(serverAction)} onOpenChange={(open) => !open && setServerAction(null)}>
        <DialogContent title={serverAction === 'join' ? 'Join a server' : 'Create a server'}>
          <div className={styles.tabs} role="group" aria-label="Server action">
            <Button
              variant={serverAction === 'create' ? 'primary' : 'secondary'}
              aria-pressed={serverAction === 'create'}
              onClick={() => setServerAction('create')}
            >
              <Plus size={16} aria-hidden="true" />
              Create
            </Button>
            <Button
              variant={serverAction === 'join' ? 'primary' : 'secondary'}
              aria-pressed={serverAction === 'join'}
              onClick={() => setServerAction('join')}
            >
              <UserPlus size={16} aria-hidden="true" />
              Join
            </Button>
          </div>

          {serverAction === 'join' ? (
            <form onSubmit={submitJoinInvite} className={styles.form}>
              <TextField name="code" label="Invite code" placeholder="Paste invite code" required />
              <Button
                type="submit"
                fullWidth
                data-testid="join-invite-button"
                disabled={pendingAction === 'join-invite'}
              >
                {pendingAction === 'join-invite' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  'Join server'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCreateServer} className={styles.form}>
              <TextField name="name" label="Server name" placeholder="New server" required />
              <TextField name="description" label="Description" placeholder="Optional description" />
              <Button
                type="submit"
                fullWidth
                data-testid="create-server-button"
                disabled={pendingAction === 'create-server'}
              >
                {pendingAction === 'create-server' ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  'Create server'
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </DialogRoot>

      <DialogRoot
        open={Boolean(channelCreateType)}
        onOpenChange={(open) => !open && setChannelCreateType(null)}
      >
        <DialogContent title={`Create ${channelCreateType === 'VOICE' ? 'voice' : 'text'} channel`}>
          <form onSubmit={submitCreateChannel} className={styles.form}>
            <TextField
              data-testid={channelCreateType === 'VOICE' ? 'create-voice-input' : 'create-channel-input'}
              name="name"
              label="Channel name"
              placeholder={channelCreateType === 'VOICE' ? 'New voice' : 'new-channel'}
              required
            />
            <input name="type" type="hidden" value={channelCreateType ?? 'TEXT'} readOnly />
            <Button
              type="submit"
              fullWidth
              data-testid={channelCreateType === 'VOICE' ? 'create-voice-button' : 'create-channel-button'}
              disabled={pendingAction === 'create-channel'}
            >
              {pendingAction === 'create-channel' ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                'Create channel'
              )}
            </Button>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
