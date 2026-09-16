import { Hash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { assetUrl } from '@/api';
import { useTranslation, type Translate } from '@/i18n/LocaleProvider';
import { Button, TextArea, TextField } from '@/components/ui';
import { CheckRow, SwitchRow } from './SettingsRows';
import { SettingsSelect } from './SettingsSelect';
import type { SettingsModalFields, SettingsSelectOption } from './types';
import styles from '@/components/SettingsModal.module.css';
import { cn } from '@/utils/cn';

type SlowmodeOption =
  | '0'
  | '5'
  | '10'
  | '15'
  | '30'
  | '60'
  | '120'
  | '300'
  | '600'
  | '900'
  | '1800'
  | '3600'
  | '7200'
  | '21600';

function slowmodeOptions(t: Translate): SettingsSelectOption<SlowmodeOption>[] {
  return [
    { value: '0', label: t('channel.slowmode.off') },
    { value: '5', label: t('channel.slowmode.5s') },
    { value: '10', label: t('channel.slowmode.10s') },
    { value: '15', label: t('channel.slowmode.15s') },
    { value: '30', label: t('channel.slowmode.30s') },
    { value: '60', label: t('channel.slowmode.1m') },
    { value: '120', label: t('channel.slowmode.2m') },
    { value: '300', label: t('channel.slowmode.5m') },
    { value: '600', label: t('channel.slowmode.10m') },
    { value: '900', label: t('channel.slowmode.15m') },
    { value: '1800', label: t('channel.slowmode.30m') },
    { value: '3600', label: t('channel.slowmode.1h') },
    { value: '7200', label: t('channel.slowmode.2h') },
    { value: '21600', label: t('channel.slowmode.6h') },
  ];
}

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
  const t = useTranslation();
  const members = useMemo(() => server?.members ?? [], [server?.members]);
  const [selectedMemberId, setSelectedMemberId] = useState(() => members[0]?.id ?? '');
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? members[0] ?? null,
    [members, selectedMemberId],
  );

  if (!channel) return null;

  return (
    <form className={styles.settingsForm} onSubmit={(event) => void updateChannelSettings(event)}>
      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('channel.section.overview')}</strong>
          <span>{t('channel.section.overviewHint')}</span>
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
            {t('channel.changeAvatar')}
          </Button>
        </div>
        <div className={styles.settingsGrid}>
          <TextField
            label={t('channel.field.name')}
            name="name"
            defaultValue={channel.name}
            maxLength={80}
            required
          />
          <TextField
            label={t('channel.field.position')}
            name="position"
            type="number"
            min={0}
            defaultValue={channel.position ?? 0}
          />
        </div>
        {server?.categories?.length ? (
          <SettingsSelect
            name="categoryId"
            label={t('channel.field.category')}
            defaultValue={channel.categoryId ?? ''}
            options={[
              { value: '', label: t('channel.field.noCategory') },
              ...server.categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
        ) : null}
        <TextArea
          label={t('channel.field.topic')}
          name="topic"
          defaultValue={channel.topic ?? ''}
          maxLength={200}
        />
        {channel.type === 'TEXT' ? (
          <SettingsSelect
            name="slowmodeSeconds"
            label={t('channel.field.slowmode')}
            defaultValue={String(channel.slowmodeSeconds ?? 0) as SlowmodeOption}
            options={slowmodeOptions(t)}
          />
        ) : null}
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('channel.section.access')}</strong>
          <span>{t('channel.section.accessHint')}</span>
        </div>
        <SwitchRow
          name="isPrivate"
          title={t('channel.private.title')}
          description={t('channel.private.hint')}
          defaultChecked={Boolean(channel.isPrivate)}
        />
        <TextField
          label={t('channel.field.type')}
          value={channel.type === 'VOICE' ? t('channel.type.voice') : t('channel.type.text')}
          readOnly
          className={styles.readonlyInput}
        />
      </section>

      {server ? (
        <section className={styles.settingsSection}>
          <div className={styles.settingsSectionHeading}>
            <strong>{t('channel.roleOverrides.title')}</strong>
            <span>{t('channel.roleOverrides.hint')}</span>
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
                    <span>
                      {role.name === '@everyone'
                        ? t('channel.role.default')
                        : t('channel.role.access')}
                    </span>
                  </div>
                  <CheckRow
                    className={styles.miniCheck}
                    label={t('channel.override.allowView', { name: role.name })}
                    checked={canView}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      void toggleChannelRoleOverride(role.id, 'VIEW_CHANNEL', checked)
                    }
                  >
                    {t('channel.override.view')}
                  </CheckRow>
                  <CheckRow
                    className={styles.miniCheck}
                    label={t('channel.override.allowSend', { name: role.name })}
                    checked={canSend}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      void toggleChannelRoleOverride(role.id, 'SEND_MESSAGES', checked)
                    }
                  >
                    {t('channel.override.send')}
                  </CheckRow>
                </div>
              );
            })}
          </div>

          <div className={cn(styles.settingsSectionHeading, styles.memberOverrideHeading)}>
            <strong>{t('channel.memberOverrides.title')}</strong>
            <span>{t('channel.memberOverrides.hint')}</span>
          </div>
          {members.length ? (
            <div className={styles.memberOverridePanel}>
              <SettingsSelect
                name="channelOverrideMemberId"
                label={t('channel.memberOverrides.select')}
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
                              ? t('channel.memberOverrides.custom')
                              : t('channel.memberOverrides.inherited')}
                          </span>
                        </div>
                        <div
                          className={styles.memberOverrideGrid}
                          role="group"
                          aria-label={t('channel.memberOverrides.gridLabel', { name: memberName })}
                        >
                          <span className={styles.memberOverridePermission}>
                            {t('channel.memberOverrides.permission')}
                          </span>
                          <span className={styles.memberOverrideChoice}>
                            {t('channel.memberOverrides.allow')}
                          </span>
                          <span className={styles.memberOverrideChoice}>
                            {t('channel.memberOverrides.deny')}
                          </span>
                          <span className={styles.memberOverridePermission}>
                            {t('channel.memberOverrides.viewChannel')}
                          </span>
                          <CheckRow
                            className={styles.miniCheck}
                            label={t('channel.override.allowView', { name: memberName })}
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
                            {t('channel.memberOverrides.allow')}
                          </CheckRow>
                          <CheckRow
                            className={styles.miniCheck}
                            label={t('channel.override.denyView', { name: memberName })}
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
                            {t('channel.memberOverrides.deny')}
                          </CheckRow>
                          <span className={styles.memberOverridePermission}>
                            {t('channel.memberOverrides.sendMessages')}
                          </span>
                          <CheckRow
                            className={styles.miniCheck}
                            label={t('channel.override.allowSend', { name: memberName })}
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
                            {t('channel.memberOverrides.allow')}
                          </CheckRow>
                          <CheckRow
                            className={styles.miniCheck}
                            label={t('channel.override.denySend', { name: memberName })}
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
                            {t('channel.memberOverrides.deny')}
                          </CheckRow>
                        </div>
                      </div>
                    );
                  })()
                : null}
            </div>
          ) : (
            <p className={styles.settingsEmptyCopy}>{t('channel.memberOverrides.empty')}</p>
          )}
        </section>
      ) : null}
      <footer className={styles.settingsModalFooter}>
        <Button type="button" variant="ghost" onClick={() => setActiveDialog(null)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pendingAction === 'channel-update'}>
          {t('common.saveChanges')}
        </Button>
      </footer>
    </form>
  );
}
