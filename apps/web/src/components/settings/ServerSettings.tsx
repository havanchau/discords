import { Button, TextField } from '../ui';
import type { SettingsModalFields } from './types';

type ServerSettingsProps = Pick<
  SettingsModalFields,
  'auditLogs' | 'pendingAction' | 'server' | 'setActiveDialog' | 'updateServerSettings'
>;

export function ServerSettings({
  auditLogs,
  pendingAction,
  server,
  setActiveDialog,
  updateServerSettings,
}: ServerSettingsProps) {
  if (!server) return null;

  return (
    <form className="settings-form" onSubmit={updateServerSettings}>
      <Button type="button" variant="secondary" fullWidth onClick={() => setActiveDialog('roles')}>
        Manage roles and permissions
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
      <section className="settings-section audit-section">
        <div className="settings-section-heading">
          <strong>Audit log</strong>
          <span>Recent moderation and configuration changes.</span>
        </div>
        <div className="audit-log-list">
          {auditLogs.length ? (
            auditLogs.slice(0, 8).map((log) => (
              <div className="audit-log-row" key={log.id}>
                <span>{log.action.replaceAll('_', ' ').toLowerCase()}</span>
                <small>
                  {log.actor?.displayName ?? 'System'} - {new Date(log.createdAt).toLocaleString()}
                </small>
              </div>
            ))
          ) : (
            <p className="empty-note">No audit events yet.</p>
          )}
        </div>
      </section>
    </form>
  );
}
