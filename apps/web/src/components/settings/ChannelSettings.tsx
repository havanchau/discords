import { Hash } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  | 'toggleChannelMemberOverride'
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
  toggleChannelMemberOverride,
  updateChannelSettings,
}: ChannelSettingsProps) {
  const members = server?.members ?? [];
  const [selectedMemberId, setSelectedMemberId] = useState(() => members[0]?.id ?? '');
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? members[0] ?? null,
    [members, selectedMemberId],
  );

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

          <div className="settings-section-heading member-override-heading">
            <strong>Member overrides</strong>
            <span>
              Allow or deny channel access for one member. Member rules take priority over role
              rules.
            </span>
          </div>
          {members.length ? (
            <div className="member-override-panel">
              <label className="settings-field member-override-picker">
                <span>Select member</span>
                <select
                  value={selectedMember?.id ?? ''}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  aria-label="Select member for channel overrides"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.user.displayName || member.user.username}
                    </option>
                  ))}
                </select>
              </label>
              {selectedMember
                ? (() => {
                    const override = channelOverrides.find(
                      (item) => item.memberId === selectedMember.id,
                    );
                    const viewAllow = Boolean(override?.allow.includes('VIEW_CHANNEL'));
                    const viewDeny = Boolean(override?.deny.includes('VIEW_CHANNEL'));
                    const sendAllow = Boolean(override?.allow.includes('SEND_MESSAGES'));
                    const sendDeny = Boolean(override?.deny.includes('SEND_MESSAGES'));
                    const memberName =
                      selectedMember.user.displayName || selectedMember.user.username;
                    const memberPendingPrefix = `channel-member-override-${selectedMember.id}`;
                    const disabled = Boolean(pendingAction?.startsWith(memberPendingPrefix));

                    return (
                      <div className="member-override-card">
                        <div className="member-override-summary">
                          <strong>{memberName}</strong>
                          <span>
                            {override?.allow.length || override?.deny.length
                              ? 'Custom channel permissions configured'
                              : 'Using role permissions'}
                          </span>
                        </div>
                        <div
                          className="member-override-grid"
                          role="group"
                          aria-label={`Member overrides for ${memberName}`}
                        >
                          <span className="member-override-permission">Permission</span>
                          <span className="member-override-choice">Allow</span>
                          <span className="member-override-choice">Deny</span>
                          <span className="member-override-permission">View channel</span>
                          <CheckRow
                            className="mini-check"
                            label={`Allow ${memberName} to view channel`}
                            checked={viewAllow}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              void toggleChannelMemberOverride(
                                selectedMember.id,
                                'VIEW_CHANNEL',
                                'allow',
                                checked,
                              )
                            }
                          >
                            Allow
                          </CheckRow>
                          <CheckRow
                            className="mini-check"
                            label={`Deny ${memberName} from viewing channel`}
                            checked={viewDeny}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              void toggleChannelMemberOverride(
                                selectedMember.id,
                                'VIEW_CHANNEL',
                                'deny',
                                checked,
                              )
                            }
                          >
                            Deny
                          </CheckRow>
                          <span className="member-override-permission">Send messages</span>
                          <CheckRow
                            className="mini-check"
                            label={`Allow ${memberName} to send messages`}
                            checked={sendAllow}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              void toggleChannelMemberOverride(
                                selectedMember.id,
                                'SEND_MESSAGES',
                                'allow',
                                checked,
                              )
                            }
                          >
                            Allow
                          </CheckRow>
                          <CheckRow
                            className="mini-check"
                            label={`Deny ${memberName} from sending messages`}
                            checked={sendDeny}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              void toggleChannelMemberOverride(
                                selectedMember.id,
                                'SEND_MESSAGES',
                                'deny',
                                checked,
                              )
                            }
                          >
                            Deny
                          </CheckRow>
                        </div>
                      </div>
                    );
                  })()
                : null}
            </div>
          ) : (
            <p className="settings-empty-copy">
              No server members are available for channel overrides.
            </p>
          )}
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
