import { Hash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { assetUrl } from '../../api';
import { Button, TextArea, TextField } from '../ui';
import { CheckRow, SwitchRow } from './SettingsRows';
import { SettingsSelect } from './SettingsSelect';
import type { SettingsModalFields, SettingsSelectOption } from './types';
import styles from '../SettingsModal.module.css';
import { cn } from '../../utils/cn';

type SlowmodeOption =
  | '0' | '5' | '10' | '15' | '30' | '60' | '120' | '300' | '600' | '900' | '1800' | '3600' | '7200' | '21600';

const SLOWMODE_OPTIONS: SettingsSelectOption<SlowmodeOption>[] = [
  { value: '0', label: 'Off' },
  { value: '5', label: '5 seconds' },
  { value: '10', label: '10 seconds' },
  { value: '15', label: '15 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
  { value: '900', label: '15 minutes' },
  { value: '1800', label: '30 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '7200', label: '2 hours' },
  { value: '21600', label: '6 hours' },
];

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
    <form className={styles.settingsForm} onSubmit={updateChannelSettings}>
      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>Overview</strong>
          <span>Basic channel identity and placement.</span>
        </div>
        <div className={styles.settingsAvatarRow}>
          <Button
            type="button"
            variant="ghost"
            className={cn('channel-avatar-button', styles.modalAvatar)}
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
        <div className={styles.settingsGrid}>
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
        {server?.categories?.length ? (
          <SettingsSelect
            name="categoryId"
            label="Category"
            defaultValue={channel.categoryId ?? ''}
            options={[
              { value: '', label: 'No category' },
              ...server.categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
        ) : null}
        <TextArea label="Topic" name="topic" defaultValue={channel.topic ?? ''} maxLength={200} />
        {channel.type === 'TEXT' ? (
          <SettingsSelect
            name="slowmodeSeconds"
            label="Slowmode"
            defaultValue={String(channel.slowmodeSeconds ?? 0) as SlowmodeOption}
            options={SLOWMODE_OPTIONS}
          />
        ) : null}
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
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
          className={styles.readonlyInput}
        />
      </section>

      {server ? (
        <section className={styles.settingsSection}>
          <div className={styles.settingsSectionHeading}>
            <strong>Role overrides</strong>
            <span>Grant specific roles access to private or restricted channels.</span>
          </div>
          <div className={styles.permissionOverrideList}>
            {server.roles.map((role) => {
              const override = channelOverrides.find((item) => item.roleId === role.id);
              const canView = Boolean(override?.allow.includes('VIEW_CHANNEL'));
              const canSend = Boolean(override?.allow.includes('SEND_MESSAGES'));
              const disabled = pendingAction?.startsWith(`channel-override-${role.id}`);

              return (
                <div className={styles.permissionOverrideRow} key={role.id}>
                  <div>
                    <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                    <span>{role.name === '@everyone' ? 'Default role' : 'Role access'}</span>
                  </div>
                  <CheckRow
                    className={styles.miniCheck}
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
                    className={styles.miniCheck}
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

          <div className={cn(styles.settingsSectionHeading, styles.memberOverrideHeading)}>
            <strong>Member overrides</strong>
            <span>
              Allow or deny channel access for one member. Member rules take priority over role
              rules.
            </span>
          </div>
          {members.length ? (
            <div className={styles.memberOverridePanel}>
              <SettingsSelect
                name="channelOverrideMemberId"
                label="Select member"
                defaultValue={selectedMember?.id ?? members[0].id}
                options={members.map((member) => ({
                  value: member.id,
                  label: member.user.displayName || member.user.username,
                }))}
                onValueChange={setSelectedMemberId}
              />
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
                      <div className={styles.memberOverrideCard}>
                        <div className={styles.memberOverrideSummary}>
                          <strong>{memberName}</strong>
                          <span>
                            {override?.allow.length || override?.deny.length
                              ? 'Custom channel permissions configured'
                              : 'Using role permissions'}
                          </span>
                        </div>
                        <div
                          className={styles.memberOverrideGrid}
                          role="group"
                          aria-label={`Member overrides for ${memberName}`}
                        >
                          <span className={styles.memberOverridePermission}>Permission</span>
                          <span className={styles.memberOverrideChoice}>Allow</span>
                          <span className={styles.memberOverrideChoice}>Deny</span>
                          <span className={styles.memberOverridePermission}>View channel</span>
                          <CheckRow
                            className={styles.miniCheck}
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
                            className={styles.miniCheck}
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
                          <span className={styles.memberOverridePermission}>Send messages</span>
                          <CheckRow
                            className={styles.miniCheck}
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
                            className={styles.miniCheck}
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
            <p className={styles.settingsEmptyCopy}>
              No server members are available for channel overrides.
            </p>
          )}
        </section>
      ) : null}
      <footer className={styles.settingsModalFooter}>
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
