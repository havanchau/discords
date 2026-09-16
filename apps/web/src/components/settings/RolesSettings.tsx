import { useState } from 'react';
import { ChevronRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { assetUrl } from '../../api';
import { accentClass, initials, PERMISSION_VALUES } from '../../helpers';
import { useTranslation } from '../../i18n/LocaleProvider';
import { Avatar, Badge, Button, IconButton, TextField } from '../ui';
import { buildMemberPermissionPreview, buildRolePermissionPreview } from '../../utils/permissionPreview';
import { CheckRow } from './SettingsRows';
import type { SettingsModalFields } from './types';
import styles from '../SettingsModal.module.css';
import { cn } from '../../utils/cn';

type RolesSettingsProps = Pick<
  SettingsModalFields,
  | 'createRole'
  | 'deleteRole'
  | 'openMemberRoleEditor'
  | 'pendingAction'
  | 'selectedMember'
  | 'server'
  | 'toggleRolePermission'
>;

export function RolesSettings({
  createRole,
  deleteRole,
  openMemberRoleEditor,
  pendingAction,
  selectedMember,
  server,
  toggleRolePermission,
}: RolesSettingsProps) {
  const t = useTranslation();
  const [previewRoleId, setPreviewRoleId] = useState<string | null>(null);
  const [previewMemberId, setPreviewMemberId] = useState<string | null>(null);
  const [previewChannelFilter, setPreviewChannelFilter] = useState('');

  if (!server) return null;

  const previewRole = server.roles.find((role) => role.id === (previewRoleId ?? server.roles[0]?.id));
  const previewMember = server.members.find((member) => member.id === previewMemberId);
  const filteredPreviewChannels = server.channels.filter((channel) =>
    channel.name.toLowerCase().includes(previewChannelFilter.trim().toLowerCase()),
  );
  const previewRows = previewMember
    ? buildMemberPermissionPreview(previewMember, filteredPreviewChannels, t)
    : previewRole
      ? buildRolePermissionPreview(previewRole, filteredPreviewChannels, t)
      : [];

  const members = [...server.members].sort((left, right) => {
    if (left.kind === 'OWNER' && right.kind !== 'OWNER') return -1;
    if (left.kind !== 'OWNER' && right.kind === 'OWNER') return 1;
    return left.user.displayName.localeCompare(right.user.displayName);
  });

  return (
    <div className={cn(styles.settingsForm, styles.rolesShell)}>
      <form className={styles.roleCreateForm} onSubmit={createRole}>
        <div className={styles.roleCreateHeader}>
          <span className={styles.roleCreateIcon}>
            <Plus size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>{t('roles.create.title')}</strong>
            <span>{t('roles.create.permissionsAvailable', { count: PERMISSION_VALUES.length })}</span>
          </div>
        </div>
        <div className={styles.roleCreateFields}>
          <TextField
            label={t('roles.field.name')}
            name="name"
            placeholder={t('roles.field.namePlaceholder')}
            maxLength={50}
            required
          />
          <TextField label={t('roles.field.color')} name="color" placeholder="#5865F2" maxLength={24} />
        </div>
        <div className={cn(styles.permissionGrid, styles.rolePermissionPalette)}>
          {PERMISSION_VALUES.map((permission) => (
            <CheckRow
              key={permission}
              className={cn(styles.checkRow, styles.permissionTile)}
              name="permissions"
              value={permission}
              label={t(`permission.${permission}`)}
            >
              <span>{t(`permission.${permission}`)}</span>
            </CheckRow>
          ))}
        </div>
        <Button type="submit" fullWidth disabled={pendingAction === 'role-create'}>
          {t('roles.action.create')}
        </Button>
      </form>

      <section className={cn(styles.settingsSection, 'permission-preview-section')}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('roles.preview.title')}</strong>
          <span>{t('roles.preview.hint')}</span>
        </div>
        <div className={styles.permissionPreviewControls}>
          <label>
            {t('roles.preview.role')}
            <select value={previewRole?.id ?? ''} onChange={(event) => { setPreviewMemberId(null); setPreviewRoleId(event.target.value); }}>
              {server.roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('roles.preview.member')}
            <select value={previewMemberId ?? ''} onChange={(event) => setPreviewMemberId(event.target.value || null)}>
              <option value="">{t('roles.preview.roleOnly')}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.user.displayName}</option>
              ))}
            </select>
          </label>
          <TextField
            label={t('roles.preview.filterChannels')}
            value={previewChannelFilter}
            onChange={(event) => setPreviewChannelFilter(event.target.value)}
            placeholder={t('roles.preview.filterPlaceholder')}
          />
        </div>
        <div className={styles.permissionPreviewGrid} role="table" aria-label={t('roles.preview.tableLabel')}>
          {previewRows.map((row) => (
            <div className={styles.permissionPreviewRow} key={row.channel.id} role="row">
              <strong role="cell">#{row.channel.name}</strong>
              <span className={row.canView ? styles.permissionAllowed : styles.permissionDenied} role="cell">
                {row.canView ? t('roles.preview.canView') : t('roles.preview.hidden')}
              </span>
              <div role="cell">
                {row.actions.slice(0, 6).map((action) => (
                  <small key={action.value} className={action.allowed ? styles.permissionChipAllowed : styles.permissionChipDenied}>
                    {action.label}
                  </small>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.roleList}>
        {server.roles.map((role) => {
          const isEveryone = role.name === '@everyone';
          const assignedMembers = server.members.filter((member) =>
            member.roles?.some((item) => item.role.id === role.id),
          );
          return (
            <section key={role.id} className={styles.roleEditor}>
              <div className={styles.roleEditorHeader}>
                <div className={styles.roleIdentity}>
                  <span
                    className={styles.roleColorDot}
                    style={{ backgroundColor: role.color || undefined }}
                  >
                    {!role.color ? <ShieldCheck size={14} aria-hidden="true" /> : null}
                  </span>
                  <div>
                    <strong style={{ color: role.color || undefined }}>{role.name}</strong>
                    <div className={styles.roleMeta}>
                      <span>
                        {isEveryone
                          ? t('roles.defaultServerRole')
                          : t('roles.permissionCount', { count: role.permissions.length })}
                      </span>
                      <Badge variant="neutral" className={styles.roleMetaBadge}>
                        {assignedMembers.length === 1
                          ? t('roles.memberCountOne')
                          : t('roles.memberCount', { count: assignedMembers.length })}
                      </Badge>
                    </div>
                  </div>
                </div>
                {!isEveryone ? (
                  <IconButton
                    label={t('roles.action.delete')}
                    variant="danger"
                    size="sm"
                    onClick={() => void deleteRole(role)}
                    disabled={pendingAction === `role-${role.id}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                ) : null}
              </div>
              <div className={styles.permissionGrid}>
                {PERMISSION_VALUES.map((permission) => (
                  <CheckRow
                    key={permission}
                    className={cn(styles.checkRow, styles.permissionToggle)}
                    label={t('roles.permissionFor', {
                      permission: t(`permission.${permission}`),
                      role: role.name,
                    })}
                    checked={role.permissions.includes(permission)}
                    disabled={isEveryone || pendingAction === `role-${role.id}`}
                    onCheckedChange={(checked) => void toggleRolePermission(role, permission, checked)}
                  >
                    <span>{t(`permission.${permission}`)}</span>
                  </CheckRow>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className={cn(styles.settingsSection, styles.roleMembersSection)}>
        <div className={styles.settingsSectionHeading}>
          <strong>{t('roles.assignments.title')}</strong>
          <span>{t('roles.assignments.hint')}</span>
        </div>
        <div className={styles.memberRoleEntryList}>
          {members.map((member) => {
            const memberRoles = member.roles?.map(({ role }) => role).filter((role) => role.name !== '@everyone') ?? [];
            const topRole = memberRoles.find((role) => role.color) ?? memberRoles[0];
            const isSelected = selectedMember?.id === member.id;

            return (
              <Button
                key={member.id}
                variant={isSelected ? 'secondary' : 'ghost'}
                className={styles.memberRoleEntry}
                onClick={() => openMemberRoleEditor(member.id)}
              >
                <div className={styles.memberRoleEntryIdentity}>
                  <Avatar
                    src={member.user.avatarUrl ? assetUrl(member.user.avatarUrl) : null}
                    alt={member.user.displayName}
                    fallback={initials(member.user.displayName)}
                    size="md"
                    className={accentClass(member.user.id)}
                  />
                  <div className={styles.memberRoleEntryText}>
                    <strong style={topRole?.color ? { color: topRole.color } : undefined}>
                      {member.user.displayName}
                    </strong>
                    <span>{member.kind === 'OWNER' ? t('roles.owner') : member.user.status || t('roles.member')}</span>
                  </div>
                </div>
                <div className={styles.memberRoleEntryMeta}>
                  <div className={styles.memberRoleChipRow}>
                    {memberRoles.length ? (
                      memberRoles.slice(0, 3).map((role) => (
                        <small key={role.id} className={styles.memberRoleChip} style={role.color ? { color: role.color } : undefined}>
                          {role.name}
                        </small>
                      ))
                    ) : (
                      <small className={cn(styles.memberRoleChip, styles.memberRoleChipMuted)}>
                        {t('roles.noExtraRoles')}
                      </small>
                    )}
                  </div>
                  <span className={styles.memberRoleEntryAction}>
                    {t('roles.editRoles')}
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
