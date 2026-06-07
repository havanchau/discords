import { Hash } from 'lucide-react';
import { assetUrl } from '../../api';
import { Button, TextArea, TextField } from '../ui';
import { CheckRow, SwitchRow } from './SettingsRows';
import type { SettingsModalFields } from './types';

type ChannelSettingsProps = Pick<
  SettingsModalFields,
  | 'channel'
  | 'channelAvatarInputRef'
  | 'channelOverrides'
  | 'pendingAction'
  | 'server'
  | 'setActiveDialog'
  | 'toggleChannelRoleOverride'
  | 'updateChannelSettings'
>;

export function ChannelSettings({
  channel,
  channelAvatarInputRef,
  channelOverrides,
  pendingAction,
  server,
  setActiveDialog,
  toggleChannelRoleOverride,
  updateChannelSettings,
}: ChannelSettingsProps) {
  if (!channel) return null;

  return (
    <form className="settings-form" onSubmit={updateChannelSettings}>
      <section className="settings-section">
        <div className="settings-section-heading">
          <strong>Overview</strong>
          <span>Basic channel identity and placement.</span>
        </div>
        <div className="settings-avatar-row">
          <Button
            type="button"
            variant="ghost"
            className="channel-avatar-button modal-avatar"
            onClick={() => channelAvatarInputRef.current?.click()}
          >
            {channel.avatarUrl ? (
              <img src={assetUrl(channel.avatarUrl)} alt={channel.name} />
            ) : (
              <Hash size={24} />
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => channelAvatarInputRef.current?.click()}
          >
            Change channel avatar
          </Button>
        </div>
        <div className="settings-grid">
          <TextField
            label="Channel name"
            name="name"
            defaultValue={channel.name}
            maxLength={80}
            required
          />
          <TextField
            label="Position"
            name="position"
            type="number"
            min={0}
            defaultValue={channel.position ?? 0}
          />
        </div>
        <TextArea label="Topic" name="topic" defaultValue={channel.topic ?? ''} maxLength={200} />
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <strong>Access</strong>
          <span>Control channel visibility for regular members.</span>
        </div>
        <SwitchRow
          name="isPrivate"
          title="Private channel"
          description="Hide this channel from members without view permission."
          defaultChecked={Boolean(channel.isPrivate)}
        />
        <TextField
          label="Channel type"
          value={channel.type === 'VOICE' ? 'Voice channel' : 'Text channel'}
          readOnly
          className="readonly-input"
        />
      </section>

      {server ? (
        <section className="settings-section">
          <div className="settings-section-heading">
            <strong>Role overrides</strong>
            <span>Grant specific roles access to private or restricted channels.</span>
          </div>
          <div className="permission-override-list">
            {server.roles.map((role) => {
              const override = channelOverrides.find((item) => item.roleId === role.id);
              const canView = Boolean(override?.allow.includes('VIEW_CHANNEL'));
              const canSend = Boolean(override?.allow.includes('SEND_MESSAGES'));
              const disabled = pendingAction?.startsWith(`channel-override-${role.id}`);

              return (
                <div className="permission-override-row" key={role.id}>
                  <div>
                    <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                    <span>{role.name === '@everyone' ? 'Default role' : 'Role access'}</span>
                  </div>
                  <CheckRow
                    className="mini-check"
                    label={`Allow ${role.name} to view channel`}
                    checked={canView}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      void toggleChannelRoleOverride(role.id, 'VIEW_CHANNEL', checked)
                    }
                  >
                    View
                  </CheckRow>
                  <CheckRow
                    className="mini-check"
                    label={`Allow ${role.name} to send messages`}
                    checked={canSend}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      void toggleChannelRoleOverride(role.id, 'SEND_MESSAGES', checked)
                    }
                  >
                    Send
                  </CheckRow>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <footer className="settings-modal-footer">
        <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pendingAction === 'channel-update'}>
          Save changes
        </Button>
      </footer>
    </form>
  );
}
