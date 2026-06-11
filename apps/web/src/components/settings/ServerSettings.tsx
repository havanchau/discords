import { Clipboard, Trash2 } from 'lucide-react';
import { Button, IconButton, TextField } from '../ui';
import type { SettingsModalFields } from './types';

type ServerSettingsProps = Pick<
  SettingsModalFields,
  | 'auditLogs'
  | 'createInviteFromSettings'
  | 'invites'
  | 'pendingAction'
  | 'revokeInvite'
  | 'server'
  | 'setActiveDialog'
  | 'updateServerSettings'
>;

export function ServerSettings({
  auditLogs,
  createInviteFromSettings,
  invites,
  pendingAction,
  revokeInvite,
  server,
  setActiveDialog,
  updateServerSettings,
}: ServerSettingsProps) {
  if (!server) return null;

  return (
    <div className="settings-form">
      <form className="settings-section" onSubmit={updateServerSettings}>
        <Button type="button" variant="secondary" fullWidth onClick={() => setActiveDialog('roles')}>
          Manage roles, permissions, and member assignments
        </Button>
        <TextField
          label="Server name"
          name="name"
          defaultValue={server.name}
          minLength={2}
          maxLength={80}
          required
        />
        <TextField
          label="Description"
          name="description"
          defaultValue={server.description ?? ''}
          maxLength={200}
        />
        <footer className="settings-modal-footer">
          <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pendingAction === 'server-update'}>
            Save changes
          </Button>
        </footer>
      </form>

      <section className="settings-section invite-section">
        <div className="settings-section-heading">
          <strong>Invite links</strong>
          <span>Create expiring invite codes and revoke active links.</span>
        </div>
        <form className="invite-create-grid" onSubmit={createInviteFromSettings}>
          <TextField label="Expires in hours" name="expiresInHours" type="number" min={1} max={168} defaultValue="24" />
          <TextField label="Max uses" name="maxUses" type="number" min={1} max={100} placeholder="100" />
          <Button type="submit" disabled={pendingAction === 'invite-settings-create'}>
            Create invite
          </Button>
        </form>
        <div className="invite-list">
          {invites.length ? (
            invites.map((invite) => (
              <div className="invite-row" key={invite.id}>
                <div>
                  <strong>{invite.code}</strong>
                  <small>
                    {invite.usedCount}/{invite.maxUses ?? '∞'} uses · expires{' '}
                    {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'never'}
                  </small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(invite.code)}
                >
                  <Clipboard size={14} aria-hidden="true" />
                  Copy
                </Button>
                <IconButton
                  label={`Revoke invite ${invite.code}`}
                  variant="danger"
                  size="sm"
                  disabled={pendingAction === `invite-${invite.id}`}
                  onClick={() => void revokeInvite(invite.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            ))
          ) : (
            <p className="empty-note">No active invites.</p>
          )}
        </div>
      </section>

      <section className="settings-section audit-section">
        <div className="settings-section-heading">
          <strong>Audit log</strong>
          <span>Recent moderation and configuration changes.</span>
        </div>
        <div className="audit-log-list">
          {auditLogs.length ? (
            auditLogs.slice(0, 12).map((log) => (
              <details className="audit-log-row" key={log.id}>
                <summary>
                  <span>{log.action.replaceAll('_', ' ').toLowerCase()}</span>
                  <small>
                    {log.actor?.displayName ?? 'System'} - {new Date(log.createdAt).toLocaleString()}
                  </small>
                </summary>
                {log.metadata ? <pre>{JSON.stringify(log.metadata, null, 2)}</pre> : null}
              </details>
            ))
          ) : (
            <p className="empty-note">No audit events yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
